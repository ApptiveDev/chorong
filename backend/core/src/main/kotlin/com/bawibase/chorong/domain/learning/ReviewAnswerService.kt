package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.service.QuizService
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date
import java.sql.Timestamp
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class ReviewAnswerResponse(
    val attemptId: Long,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val isCorrect: Boolean,
    val explanation: String,
    val streakDays: Int,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val excludedUntil: Instant?,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val correctAnswer: JsonNode,
)

@Service
class ReviewAnswerService(
    private val jdbc: JdbcTemplate,
    private val quizzes: QuizService,
    private val clock: Clock,
    private val mapper: ObjectMapper,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun submit(
        userId: Long,
        reviewItemId: Long,
        answer: JsonNode,
    ): ReviewAnswerResponse {
        if (userId <= 0 || reviewItemId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val now = clock.instant()
        val today = LocalDate.ofInstant(now, kst)
        val userExists =
            jdbc
                .query(
                    "SELECT user_id FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> rs.getLong(1) },
                    userId,
                ).firstOrNull()
        if (userExists == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)

        val item =
            jdbc
                .query(
                    """SELECT i.quiz_id, i.completed, i.attempt_id, i.answered_at, i.answer_result
               FROM review_session_item i
               JOIN review_session s ON s.review_session_id=i.review_session_id
               WHERE i.review_item_id=? AND s.user_id=? AND s.review_date=? AND s.status='OPEN'
               FOR UPDATE OF s, i""",
                    { rs, _ ->
                        ReviewItemRow(
                            rs.getLong("quiz_id"),
                            rs.getBoolean("completed"),
                            rs.getLong("attempt_id").let { if (rs.wasNull()) null else it },
                            rs.getTimestamp("answered_at")?.toInstant(),
                            rs.getString("answer_result"),
                        )
                    },
                    reviewItemId,
                    userId,
                    Date.valueOf(today),
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (item.completed) return previousAnswer(userId, reviewItemId, item)

        val result = quizzes.submitPublic(userId, item.quizId, answer)
        var excludedUntil: Instant? = null
        if (result.completed) {
            val answeredAt = Timestamp.from(now)
            val correct = result.correct == true
            val availableOn = if (correct) today.plusDays(1) else today
            jdbc.update(
                "UPDATE review_session_item SET completed=true, correct=?, answered_at=?, attempt_id=? WHERE review_item_id=?",
                correct,
                answeredAt,
                result.attemptId,
                reviewItemId,
            )
            jdbc.update(
                """INSERT INTO quiz_review_pool(user_id, quiz_id, status, available_on, last_submitted_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (user_id, quiz_id) DO UPDATE SET status=EXCLUDED.status,
                     available_on=EXCLUDED.available_on, last_submitted_at=EXCLUDED.last_submitted_at, modified_at=now()""",
                userId,
                item.quizId,
                if (correct) "CORRECT" else "WRONG",
                Date.valueOf(availableOn),
                answeredAt,
            )
            if (correct) excludedUntil = today.plusDays(1).atStartOfDay(kst).toInstant()
        }
        val streakDays = jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId) ?: 0
        val response =
            ReviewAnswerResponse(
                result.attemptId,
                checkNotNull(result.correct),
                result.explanation,
                streakDays,
                excludedUntil,
                checkNotNull(result.correctAnswer),
            )
        saveAnswer(reviewItemId, response)
        return response
    }

    private fun previousAnswer(
        userId: Long,
        reviewItemId: Long,
        item: ReviewItemRow,
    ): ReviewAnswerResponse {
        item.answerResult?.let { return mapper.readValue(it, ReviewAnswerResponse::class.java) }
        val result = quizzes.getPublicAttempt(userId, item.quizId, checkNotNull(item.attemptId))
        val excludedUntil =
            if (result.correct == true) {
                LocalDate
                    .ofInstant(checkNotNull(item.answeredAt), kst)
                    .plusDays(1)
                    .atStartOfDay(kst)
                    .toInstant()
            } else {
                null
            }
        val streakDays = jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId) ?: 0
        val response =
            ReviewAnswerResponse(
                result.attemptId,
                checkNotNull(result.correct),
                result.explanation,
                streakDays,
                excludedUntil,
                checkNotNull(result.correctAnswer),
            )
        saveAnswer(reviewItemId, response)
        return response
    }

    private fun saveAnswer(
        reviewItemId: Long,
        response: ReviewAnswerResponse,
    ) {
        jdbc.update(
            "UPDATE review_session_item SET answer_result=?::jsonb WHERE review_item_id=?",
            mapper.writeValueAsString(response),
            reviewItemId,
        )
    }

    private data class ReviewItemRow(
        val quizId: Long,
        val completed: Boolean,
        val attemptId: Long?,
        val answeredAt: Instant?,
        val answerResult: String?,
    )
}
