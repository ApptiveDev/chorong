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
    // 복습 문제는 항상 채점한다. 기본값은 0.4.1 전에 저장한 답안을 다시 읽을 때 쓴다.
    val graded: Boolean = true,
    val completed: Boolean,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val explanation: String?,
    val streakDays: Int,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val excludedUntil: Instant?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correctAnswer: JsonNode?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val closeness: Int? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val source: String? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correctWord: String? = null,
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
            // 정답·오답 모두 다음 날 00:00 KST부터 다시 후보가 된다. 레슨에서 틀렸다는 표시는 바꾸지 않는다.
            val availableOn = today.plusDays(1)
            jdbc.update(
                "UPDATE review_session_item SET completed=true, correct=?, answered_at=?, attempt_id=? WHERE review_item_id=?",
                correct,
                answeredAt,
                result.attemptId,
                reviewItemId,
            )
            jdbc.update(
                """INSERT INTO quiz_review_pool(user_id, quiz_id, available_on, last_submitted_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT (user_id, quiz_id) DO UPDATE SET
                     available_on=EXCLUDED.available_on, last_submitted_at=EXCLUDED.last_submitted_at, modified_at=now()""",
                userId,
                item.quizId,
                Date.valueOf(availableOn),
                answeredAt,
            )
            excludedUntil = availableOn.atStartOfDay(kst).toInstant()
        }
        val streakDays = jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId) ?: 0
        val response =
            ReviewAnswerResponse(
                result.attemptId,
                checkNotNull(result.correct),
                true,
                result.completed,
                result.explanation,
                streakDays,
                excludedUntil,
                result.correctAnswer,
                result.closeness,
                result.source,
                result.correctWord,
            )
        saveAnswer(reviewItemId, response)
        return response
    }

    private fun previousAnswer(
        userId: Long,
        reviewItemId: Long,
        item: ReviewItemRow,
    ): ReviewAnswerResponse {
        val saved = item.answerResult?.let(mapper::readTree)
        if (saved?.has("completed") == true) return mapper.treeToValue(saved, ReviewAnswerResponse::class.java)
        val result = quizzes.getPublicAttempt(userId, item.quizId, checkNotNull(item.attemptId))
        val excludedUntil =
            LocalDate
                .ofInstant(checkNotNull(item.answeredAt), kst)
                .plusDays(1)
                .atStartOfDay(kst)
                .toInstant()
        val streakDays =
            saved?.get("streakDays")?.asInt()
                ?: jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId)
                ?: 0
        val response =
            ReviewAnswerResponse(
                result.attemptId,
                checkNotNull(result.correct),
                true,
                result.completed,
                result.explanation,
                streakDays,
                excludedUntil,
                result.correctAnswer,
                result.closeness,
                result.source,
                result.correctWord,
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
