package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse
import com.bawibase.chorong.domain.quiz.service.QuizService
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

@Service
class ReviewSetService(
    private val jdbc: JdbcTemplate,
    private val quizzes: QuizService,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun next(
        userId: Long,
        lessonId: Long?,
    ): ReviewSetResponse {
        if (userId <= 0 || (lessonId != null && lessonId <= 0)) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val validUser =
            jdbc
                .query(
                    "SELECT user_id FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> rs.getLong(1) },
                    userId,
                ).firstOrNull()
        if (validUser == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (lessonId != null && !lessonExists(lessonId)) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)

        val existing = findOpenSession(userId, today, lessonId)
        if (existing != null) return sessionResponse(existing, userId, today)

        val available = candidates(userId, today)
        if (available.size < SESSION_SIZE) {
            return ReviewSetResponse(emptyList(), EMPTY_MESSAGE, rewardEligible(userId, today))
        }

        val sessionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO review_session(user_id, lesson_id, review_date) VALUES (?, ?, ?) RETURNING review_session_id",
                    Long::class.java,
                    userId,
                    lessonId,
                    Date.valueOf(today),
                ),
            )
        select(available).forEachIndexed { index, candidate ->
            jdbc.update(
                "INSERT INTO review_session_item(review_session_id, quiz_id, item_order, source_status) VALUES (?, ?, ?, ?)",
                sessionId,
                candidate.quizId,
                index,
                candidate.status,
            )
        }
        return sessionResponse(sessionId, userId, today)
    }

    private fun findOpenSession(
        userId: Long,
        today: LocalDate,
        lessonId: Long?,
    ): Long? =
        jdbc
            .query(
                "SELECT review_session_id FROM review_session WHERE user_id=? AND review_date=? AND lesson_id IS NOT DISTINCT FROM ? AND status='OPEN'",
                { rs, _ -> rs.getLong(1) },
                userId,
                Date.valueOf(today),
                lessonId,
            ).firstOrNull()

    private fun sessionResponse(
        sessionId: Long,
        userId: Long,
        today: LocalDate,
    ): ReviewSetResponse {
        val items =
            jdbc
                .query(
                    "SELECT review_item_id, quiz_id FROM review_session_item WHERE review_session_id=? ORDER BY item_order",
                    { rs, _ -> ItemRow(rs.getLong("review_item_id"), rs.getLong("quiz_id")) },
                    sessionId,
                ).map { ReviewItemResponse(it.reviewItemId, quizzes.get(it.quizId)) }
        return ReviewSetResponse(items, rewardEligible = rewardEligible(userId, today))
    }

    private fun candidates(
        userId: Long,
        today: LocalDate,
    ): List<Candidate> =
        jdbc.query(
            """SELECT quiz_id, status FROM quiz_review_pool
               WHERE user_id=? AND available_on<=?
               ORDER BY last_submitted_at, quiz_id""",
            { rs, _ -> Candidate(rs.getLong("quiz_id"), rs.getString("status")) },
            userId,
            Date.valueOf(today),
        )

    private fun select(available: List<Candidate>): List<Candidate> {
        val wrong = available.filter { it.status == "WRONG" }
        val correct = available.filter { it.status == "CORRECT" }
        return (wrong.take(WRONG_TARGET) + correct.take(CORRECT_TARGET) + wrong.drop(WRONG_TARGET) + correct.drop(CORRECT_TARGET))
            .take(SESSION_SIZE)
    }

    private fun rewardEligible(
        userId: Long,
        today: LocalDate,
    ): Boolean =
        (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_session WHERE user_id=? AND review_date=? AND reward_granted",
                Int::class.java,
                userId,
                Date.valueOf(today),
            ) ?: 0
        ) < DAILY_REWARD_LIMIT

    private fun lessonExists(lessonId: Long): Boolean =
        jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM lesson WHERE lesson_id=?)", Boolean::class.java, lessonId) ?: false

    private data class Candidate(
        val quizId: Long,
        val status: String,
    )

    private data class ItemRow(
        val reviewItemId: Long,
        val quizId: Long,
    )

    companion object {
        private const val SESSION_SIZE = 5
        private const val WRONG_TARGET = 4
        private const val CORRECT_TARGET = 1
        private const val DAILY_REWARD_LIMIT = 3
        private const val EMPTY_MESSAGE = "더 이상 복습할 문제가 없어요"
    }
}
