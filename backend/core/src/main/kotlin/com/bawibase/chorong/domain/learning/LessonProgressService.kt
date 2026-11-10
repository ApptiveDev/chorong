package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class LessonProgressService(
    private val jdbc: JdbcTemplate,
    private val learning: LearningService,
    private val reviewGate: ReviewGateService,
    private val lessonCompletion: LessonCompletionService,
    private val lessonReplay: LessonReplayService,
    private val wallets: UserWalletService,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun start(
        userId: Long,
        lessonId: Long,
        replay: Boolean,
    ): LessonStartResponse {
        requireId(userId)
        requireId(lessonId)
        ensureUser(userId)
        val courseId = lessonCourse(lessonId)
        val row = progress(userId, lessonId) ?: throw locked(userId, courseId)
        if (row.status == "COMPLETED" && !replay) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (row.status != "COMPLETED" && replay) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (row.status !in setOf("UNLOCKED", "IN_PROGRESS", "COMPLETED")) throw locked(userId, courseId)
        val requiredReview = reviewGate.requiredSet(userId, lessonId)
        if (requiredReview != null) {
            return LessonStartResponse(
                true,
                requiredReview,
                LessonProgressState(row.status, row.lastContentId, nextContentId(lessonId, row.lastContentId)),
                emptyList(),
                emptyList(),
            )
        }
        reviewGate.markPassed(userId, lessonId)
        if (row.status == "UNLOCKED") {
            jdbc.update(
                "UPDATE lesson_progress SET status='IN_PROGRESS', modified_at=now() WHERE user_id=? AND lesson_id=?",
                userId,
                lessonId,
            )
        }
        val detail = learning.getLesson(lessonId)
        val replayLastContentId = if (replay) lessonReplay.start(userId, lessonId) else null
        spendEnergy(userId, lessonId, replay)
        val lastContentId = if (replay) replayLastContentId else row.lastContentId
        val resumeId = nextContentId(lessonId, lastContentId)
        val status = if (row.status == "UNLOCKED") "IN_PROGRESS" else row.status
        return LessonStartResponse(false, null, LessonProgressState(status, lastContentId, resumeId), detail.contents, detail.segments)
    }

    @Transactional
    fun completeContent(
        userId: Long,
        contentId: Long,
    ): ContentCompletionResult {
        requireId(userId)
        requireId(contentId)
        ensureUser(userId)
        val content =
            jdbc
                .query(
                    "SELECT lesson_id, content_type, quiz_id FROM lesson_content WHERE content_id=?",
                    {
                        rs,
                        _,
                        ->
                        ContentRow(
                            rs.getLong("lesson_id"),
                            rs.getString("content_type"),
                            rs.getObject("quiz_id", java.lang.Long::class.java)?.toLong(),
                        )
                    },
                    contentId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val courseId = lessonCourse(content.lessonId)
        val row = progress(userId, content.lessonId, true) ?: throw locked(userId, courseId)
        if (row.status == "COMPLETED") {
            if (!lessonReplay.isActive(userId, content.lessonId)) {
                if (row.lastContentId != contentId) throw ApiV1Exception(ApiErrorCode.CONFLICT)
                return ContentCompletionResult(
                    LessonProgressState("COMPLETED", row.lastContentId, null),
                    lessonCompleted = true,
                    completion = lessonCompletion.completeFromProgress(userId, content.lessonId),
                )
            }
            reviewGate.enforce(userId, content.lessonId)
            val replayed =
                lessonReplay.completeContent(
                    userId,
                    content.lessonId,
                    contentId,
                    content.quizId,
                    nextContentId(content.lessonId, contentId),
                )
            if (!replayed.lessonCompleted) return replayed
            return replayed.copy(completion = lessonCompletion.completeReplay(userId, content.lessonId))
        }
        if (row.lastContentId == contentId) return result(content.lessonId, row)
        if (row.status !in setOf("UNLOCKED", "IN_PROGRESS")) throw locked(userId, courseId)
        reviewGate.enforce(userId, content.lessonId)
        if (nextContentId(content.lessonId, row.lastContentId) != contentId) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (content.type == "QUIZ" && !hasCompletedAttempt(userId, content.quizId)) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        jdbc.update(
            "UPDATE lesson_progress SET status='IN_PROGRESS', last_content_id=?, modified_at=now() WHERE user_id=? AND lesson_id=?",
            contentId,
            userId,
            content.lessonId,
        )
        val next = nextContentId(content.lessonId, contentId)
        if (next == null) {
            val completion = lessonCompletion.completeFromProgress(userId, content.lessonId)
            return ContentCompletionResult(
                LessonProgressState("COMPLETED", contentId, null),
                lessonCompleted = true,
                completion = completion,
            )
        }
        return ContentCompletionResult(LessonProgressState("IN_PROGRESS", contentId, next))
    }

    @Transactional(readOnly = true)
    fun getProgress(userId: Long): LearningProgressSummary {
        requireId(userId)
        ensureUser(userId)
        val courses =
            jdbc.query(
                """SELECT c.course_id, COUNT(l.lesson_id) FILTER (WHERE lp.status='COMPLETED')::int AS completed, COUNT(l.lesson_id)::int AS total
             FROM course c LEFT JOIN lesson l ON l.course_id=c.course_id
             LEFT JOIN lesson_progress lp ON lp.lesson_id=l.lesson_id AND lp.user_id=?
             WHERE NOT c.is_onboarding GROUP BY c.course_id ORDER BY c.course_order,c.course_id""",
                { rs, _ -> CourseProgressSummary(rs.getLong("course_id"), rs.getInt("completed"), rs.getInt("total")) },
                userId,
            )
        val current =
            jdbc
                .query(
                    """SELECT lp.lesson_id,lp.course_id,lp.status FROM lesson_progress lp
             JOIN course c ON c.course_id=lp.course_id
             WHERE lp.user_id=? AND lp.status IN ('UNLOCKED','IN_PROGRESS') AND NOT c.is_onboarding
             ORDER BY lp.modified_at DESC,lp.lesson_id LIMIT 1""",
                    { rs, _ -> CurrentLessonProgress(rs.getLong("lesson_id"), rs.getLong("course_id"), rs.getString("status")) },
                    userId,
                ).firstOrNull()
        return LearningProgressSummary(courses, current)
    }

    /**
     * 별가루를 받을 수 있는 학습을 시작하면 에너지 1개를 쓴다. 같은 학습을 이어서 시작할 때는 다시 쓰지 않는다.
     * 다시 보기는 별가루를 아직 받지 않은 레슨일 때만 쓴다. 에너지가 없으면 학습은 그대로 진행한다.
     */
    private fun spendEnergy(
        userId: Long,
        lessonId: Long,
        replay: Boolean,
    ) {
        val onboarding =
            jdbc.queryForObject(
                "SELECT c.is_onboarding FROM lesson l JOIN course c ON c.course_id=l.course_id WHERE l.lesson_id=?",
                Boolean::class.java,
                lessonId,
            ) ?: false
        if (onboarding) return
        if (replay && lessonCompletion.stardustGranted(userId, lessonId)) return
        val table = if (replay) "lesson_replay_progress" else "lesson_progress"
        val spent =
            jdbc.queryForObject(
                "SELECT energy_spent FROM $table WHERE user_id=? AND lesson_id=? FOR UPDATE",
                Boolean::class.java,
                userId,
                lessonId,
            ) ?: false
        if (spent || !wallets.spendEnergy(userId)) return
        jdbc.update("UPDATE $table SET energy_spent=TRUE WHERE user_id=? AND lesson_id=?", userId, lessonId)
    }

    private fun result(
        lessonId: Long,
        row: ProgressRow,
    ) = ContentCompletionResult(LessonProgressState(row.status, row.lastContentId, nextContentId(lessonId, row.lastContentId)))

    private fun nextContentId(
        lessonId: Long,
        lastContentId: Long?,
    ): Long? {
        val sql =
            if (lastContentId == null) {
                "SELECT content_id FROM lesson_content WHERE lesson_id=? ORDER BY content_order LIMIT 1"
            } else {
                """SELECT next.content_id FROM lesson_content last
             JOIN lesson_content next ON next.lesson_id=last.lesson_id AND next.content_order>last.content_order
             WHERE last.content_id=? ORDER BY next.content_order LIMIT 1"""
            }
        val argument = if (lastContentId == null) lessonId else lastContentId
        return jdbc.query(sql, { rs, _ -> rs.getLong(1) }, argument).firstOrNull()
    }

    private fun progress(
        userId: Long,
        lessonId: Long,
        lock: Boolean = false,
    ): ProgressRow? =
        jdbc
            .query(
                "SELECT status,last_content_id FROM lesson_progress WHERE user_id=? AND lesson_id=?${if (lock) " FOR UPDATE" else ""}",
                { rs, _ -> ProgressRow(rs.getString("status"), rs.getObject("last_content_id", java.lang.Long::class.java)?.toLong()) },
                userId,
                lessonId,
            ).firstOrNull()

    private fun hasCompletedAttempt(
        userId: Long,
        quizId: Long?,
    ): Boolean =
        quizId != null &&
            (
                jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM quiz_attempt WHERE user_id=? AND quiz_id=? AND completed)",
                    Boolean::class.java,
                    userId,
                    quizId,
                )
                    ?: false
            )

    private fun lessonCourse(lessonId: Long): Long =
        jdbc
            .query(
                "SELECT course_id FROM lesson WHERE lesson_id=?",
                { rs, _ -> rs.getLong(1) },
                lessonId,
            ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)

    private fun ensureUser(userId: Long) {
        val status = jdbc.query("SELECT status FROM app_user WHERE user_id=?", { rs, _ -> rs.getString(1) }, userId).firstOrNull()
        if (status == null || status == "WITHDRAWN") throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun locked(
        userId: Long,
        courseId: Long,
    ): ApiV1Exception {
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val used =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM course_daily_unlock WHERE user_id=? AND course_id=? AND unlock_date=?)",
                Boolean::class.java,
                userId,
                courseId,
                today,
            ) ?: false
        val unlocksAt = if (used) today.plusDays(1).atStartOfDay(kst).toInstant() else null
        return ApiV1Exception(ApiErrorCode.LESSON_LOCKED, unlocksAt = unlocksAt)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    private data class ProgressRow(
        val status: String,
        val lastContentId: Long?,
    )

    private data class ContentRow(
        val lessonId: Long,
        val type: String,
        val quizId: Long?,
    )
}
