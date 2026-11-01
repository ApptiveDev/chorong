package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Clock
import java.time.Instant

@Service
class LessonReplayService(
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
    private val studyStreak: StudyStreakService,
) {
    fun isActive(
        userId: Long,
        lessonId: Long,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM lesson_replay_progress WHERE user_id=? AND lesson_id=? AND completed_at IS NULL)",
            Boolean::class.java,
            userId,
            lessonId,
        ) ?: false

    @Transactional
    fun start(
        userId: Long,
        lessonId: Long,
    ): Long? {
        val now = Timestamp.from(clock.instant())
        jdbc.update(
            "INSERT INTO lesson_replay_progress(user_id, lesson_id, started_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
            userId,
            lessonId,
            now,
        )
        jdbc.update(
            "UPDATE lesson_replay_progress SET started_at=?, last_content_id=NULL, completed_at=NULL WHERE user_id=? AND lesson_id=? AND completed_at IS NOT NULL",
            now,
            userId,
            lessonId,
        )
        return state(userId, lessonId, lock = true).lastContentId
    }

    @Transactional
    fun completeContent(
        userId: Long,
        lessonId: Long,
        contentId: Long,
        quizId: Long?,
        nextContentId: Long?,
    ): ContentCompletionResult {
        val replay = state(userId, lessonId, lock = true)
        if (replay.completedAt != null) {
            if (replay.lastContentId == contentId) {
                return ContentCompletionResult(LessonProgressState("COMPLETED", contentId, null), lessonCompleted = true)
            }
            throw ApiV1Exception(ApiErrorCode.CONFLICT)
        }
        if (replay.lastContentId == contentId) {
            return ContentCompletionResult(LessonProgressState("COMPLETED", contentId, nextContentId))
        }
        val expected = nextReplayContentId(lessonId, replay.lastContentId)
        if (expected != contentId) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (quizId != null && !hasCompletedReplayAttempt(userId, quizId, replay.startedAt)) {
            throw ApiV1Exception(ApiErrorCode.CONFLICT)
        }

        jdbc.update(
            "UPDATE lesson_replay_progress SET last_content_id=? WHERE user_id=? AND lesson_id=?",
            contentId,
            userId,
            lessonId,
        )
        if (nextContentId == null) {
            jdbc.update(
                "UPDATE lesson_replay_progress SET completed_at=? WHERE user_id=? AND lesson_id=?",
                Timestamp.from(clock.instant()),
                userId,
                lessonId,
            )
            studyStreak.recordCompletedStudy(userId)
            return ContentCompletionResult(LessonProgressState("COMPLETED", contentId, null), lessonCompleted = true)
        }
        return ContentCompletionResult(LessonProgressState("COMPLETED", contentId, nextContentId))
    }

    @Transactional
    fun assertQuizIsCurrent(
        userId: Long,
        quizId: Long,
    ) {
        val content =
            jdbc
                .query(
                    "SELECT lesson_id, content_id FROM lesson_content WHERE quiz_id=?",
                    { rs, _ -> ReplayContent(rs.getLong("lesson_id"), rs.getLong("content_id")) },
                    quizId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val replay = state(userId, content.lessonId, lock = true)
        if (replay.completedAt != null || nextReplayContentId(content.lessonId, replay.lastContentId) != content.contentId) {
            throw ApiV1Exception(ApiErrorCode.CONFLICT)
        }
    }

    private fun state(
        userId: Long,
        lessonId: Long,
        lock: Boolean = false,
    ): ReplayState =
        jdbc
            .query(
                "SELECT started_at, last_content_id, completed_at FROM lesson_replay_progress WHERE user_id=? AND lesson_id=?${if (lock) " FOR UPDATE" else ""}",
                { rs, _ ->
                    ReplayState(
                        rs.getTimestamp("started_at").toInstant(),
                        rs.getObject("last_content_id", java.lang.Long::class.java)?.toLong(),
                        rs.getTimestamp("completed_at")?.toInstant(),
                    )
                },
                userId,
                lessonId,
            ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.CONFLICT)

    private fun nextReplayContentId(
        lessonId: Long,
        lastContentId: Long?,
    ): Long? {
        val sql =
            if (lastContentId == null) {
                "SELECT content_id FROM lesson_content WHERE lesson_id=? ORDER BY content_order LIMIT 1"
            } else {
                "SELECT next.content_id FROM lesson_content last JOIN lesson_content next ON next.lesson_id=last.lesson_id AND next.content_order>last.content_order WHERE last.content_id=? ORDER BY next.content_order LIMIT 1"
            }
        return jdbc.query(sql, { rs, _ -> rs.getLong(1) }, lastContentId ?: lessonId).firstOrNull()
    }

    private fun hasCompletedReplayAttempt(
        userId: Long,
        quizId: Long,
        startedAt: Instant,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM quiz_attempt WHERE user_id=? AND quiz_id=? AND replay AND completed AND submitted_at>=?)",
            Boolean::class.java,
            userId,
            quizId,
            Timestamp.from(startedAt),
        ) ?: false

    private data class ReplayState(
        val startedAt: Instant,
        val lastContentId: Long?,
        val completedAt: Instant?,
    )

    private data class ReplayContent(
        val lessonId: Long,
        val contentId: Long,
    )
}
