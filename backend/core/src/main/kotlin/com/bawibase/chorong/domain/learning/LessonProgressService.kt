package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class LessonProgressService(
    private val jdbc: JdbcTemplate,
    private val learning: LearningService,
    private val lessonCompletion: LessonCompletionService,
    private val lessonReplay: LessonReplayService,
    private val wallets: UserWalletService,
    private val unlocks: LessonUnlockService,
    private val mapper: ObjectMapper,
) {
    @Transactional
    fun start(
        userId: Long,
        lessonId: Long,
        replay: Boolean,
        restart: Boolean = false,
    ): LessonStartResponse {
        requireId(userId)
        requireId(lessonId)
        ensureUser(userId)
        lessonCourse(lessonId)
        if (!unlocks.ensureProgress(userId, lessonId)) throw locked()
        val row = progress(userId, lessonId, true) ?: throw locked()
        if (row.status == "COMPLETED" && !replay) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (row.status != "COMPLETED" && replay) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (row.status !in setOf("UNLOCKED", "IN_PROGRESS", "COMPLETED")) throw locked()
        if (row.status == "UNLOCKED") {
            jdbc.update(
                "UPDATE lesson_progress SET status='IN_PROGRESS', modified_at=now() WHERE user_id=? AND lesson_id=?",
                userId,
                lessonId,
            )
        }
        val detail = learning.getLesson(lessonId)
        val status = if (row.status == "UNLOCKED") "IN_PROGRESS" else row.status
        val progress =
            if (replay) {
                if (restart) {
                    jdbc.update(
                        "UPDATE lesson_replay_progress SET last_content_id=NULL WHERE user_id=? AND lesson_id=? AND completed_at IS NULL",
                        userId,
                        lessonId,
                    )
                }
                val lastContentId = lessonReplay.start(userId, lessonId)
                LessonProgressState(status, lastContentId, nextContentId(lessonId, lastContentId), contentVersion = detail.version)
            } else {
                resume(userId, lessonId, status, if (restart) null else row.lastContentId, restart, detail.version)
            }
        return LessonStartResponse(
            progress = progress,
            energyNotice = energyNotice(userId, lessonId),
            contents = detail.contents,
            segments = detail.segments,
        )
    }

    /**
     * 이어하기 상태를 만든다. 저장한 버전이 현재 레슨 버전과 다르면 저장 위치와 입력을 버리고
     * 마지막 완료 화면 다음부터 시작한다. restart면 완료 위치까지 지우고 첫 화면부터 시작한다.
     */
    private fun resume(
        userId: Long,
        lessonId: Long,
        status: String,
        lastContentId: Long?,
        restart: Boolean,
        version: Int,
    ): LessonProgressState {
        val saved =
            jdbc
                .query(
                    "SELECT current_content_id, draft, content_version FROM lesson_progress WHERE user_id=? AND lesson_id=?",
                    { rs, _ ->
                        SavedProgress(
                            rs.getObject("current_content_id", java.lang.Long::class.java)?.toLong(),
                            rs.getString("draft"),
                            rs.getObject("content_version", Integer::class.java)?.toInt(),
                        )
                    },
                    userId,
                    lessonId,
                ).first()
        val stale = saved.version != null && saved.version != version
        if (restart || stale) {
            jdbc.update(
                """UPDATE lesson_progress SET current_content_id=NULL, draft=NULL, content_version=NULL,
                          last_content_id=CASE WHEN ? THEN NULL ELSE last_content_id END, modified_at=now()
                   WHERE user_id=? AND lesson_id=?""",
                restart,
                userId,
                lessonId,
            )
            return LessonProgressState(status, lastContentId, nextContentId(lessonId, lastContentId), contentVersion = version)
        }
        val position = saved.contentId
        val draft =
            if (position != null && saved.draft != null) {
                LessonDraft(position, mapper.readValue(saved.draft, object : TypeReference<Map<String, Any?>>() {}))
            } else {
                null
            }
        return LessonProgressState(status, lastContentId, position ?: nextContentId(lessonId, lastContentId), draft, version)
    }

    /** API-409. 도중 나가기에서 보고 있던 화면과 미제출 입력을 저장한다. 아직 도달하지 않은 화면은 저장할 수 없다. */
    @Transactional
    fun save(
        userId: Long,
        lessonId: Long,
        request: LessonProgressSaveRequest,
    ): LessonProgressState {
        requireId(userId)
        requireId(lessonId)
        ensureUser(userId)
        lessonCourse(lessonId)
        val contentId = request.contentId ?: throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val draft = request.draft
        if (draft != null && draft.contentId != contentId) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val input = draft?.let { mapper.writeValueAsString(it.input) }
        if (input != null && input.toByteArray().size > MAX_DRAFT_BYTES) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val row = progress(userId, lessonId, true) ?: throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (row.status != "IN_PROGRESS") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val order =
            jdbc
                .query(
                    "SELECT content_order FROM lesson_content WHERE content_id=? AND lesson_id=?",
                    { rs, _ -> rs.getInt(1) },
                    contentId,
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val reachable =
            nextContentId(lessonId, row.lastContentId)?.let { next ->
                jdbc.queryForObject("SELECT content_order FROM lesson_content WHERE content_id=?", Int::class.java, next)
            }
        if (reachable == null || order > reachable) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val version =
            checkNotNull(
                jdbc.queryForObject(
                    """UPDATE lesson_progress SET current_content_id=?, draft=?::jsonb,
                              content_version=(SELECT content_version FROM lesson WHERE lesson_id=?), modified_at=now()
                       WHERE user_id=? AND lesson_id=? RETURNING content_version""",
                    Int::class.java,
                    contentId,
                    input,
                    lessonId,
                    userId,
                    lessonId,
                ),
            )
        return LessonProgressState("IN_PROGRESS", row.lastContentId, contentId, draft, version)
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
        val row = progress(userId, content.lessonId, true) ?: throw locked()
        if (row.status == "COMPLETED") {
            if (!lessonReplay.isActive(userId, content.lessonId)) {
                if (row.lastContentId != contentId) throw ApiV1Exception(ApiErrorCode.CONFLICT)
                return ContentCompletionResult(
                    LessonProgressState("COMPLETED", row.lastContentId, null),
                    lessonCompleted = true,
                    completion = lessonCompletion.completeFromProgress(userId, content.lessonId),
                )
            }
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
        if (row.status !in setOf("UNLOCKED", "IN_PROGRESS")) throw locked()
        if (nextContentId(content.lessonId, row.lastContentId) != contentId) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (content.type == "QUIZ" && !hasCompletedAttempt(userId, content.quizId)) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        jdbc.update(
            """UPDATE lesson_progress SET status='IN_PROGRESS', last_content_id=?, current_content_id=NULL, draft=NULL, modified_at=now()
               WHERE user_id=? AND lesson_id=?""",
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
        // 중단 지점(last_content_id)이 있으면 이어하기로 표시한다.
        val current =
            unlocks.map(userId).current()?.let {
                CurrentLessonProgress(it.lessonId, it.courseId, it.title, it.status, it.status == "IN_PROGRESS" && it.lastContentId != null)
            }
        return LearningProgressSummary(courses, current)
    }

    /** 에너지는 보상을 받는 완료 때 쓴다. 보상을 아직 받지 않은 레슨에 에너지 0으로 들어가면 앱이 안내를 띄운다. */
    private fun energyNotice(
        userId: Long,
        lessonId: Long,
    ): Boolean {
        val onboarding =
            jdbc.queryForObject(
                "SELECT c.is_onboarding FROM lesson l JOIN course c ON c.course_id=l.course_id WHERE l.lesson_id=?",
                Boolean::class.java,
                lessonId,
            ) ?: false
        if (onboarding || lessonCompletion.stardustGranted(userId, lessonId)) return false
        return wallets.energy(wallets.ensureWallet(userId)) == 0
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

    private fun locked() = ApiV1Exception(ApiErrorCode.LESSON_LOCKED)

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    private data class SavedProgress(
        val contentId: Long?,
        val draft: String?,
        val version: Int?,
    )

    private data class ProgressRow(
        val status: String,
        val lastContentId: Long?,
    )

    private data class ContentRow(
        val lessonId: Long,
        val type: String,
        val quizId: Long?,
    )

    companion object {
        private const val MAX_DRAFT_BYTES = 4096
    }
}
