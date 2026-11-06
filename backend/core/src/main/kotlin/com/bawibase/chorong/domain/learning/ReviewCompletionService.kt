package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.idempotency.IdempotencyService
import com.bawibase.chorong.domain.idempotency.IdempotentResponse
import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.bawibase.chorong.domain.user.service.WalletCurrency
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date
import java.sql.Timestamp
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

data class ReviewCompleteRequest(
    val reviewItemIds: List<Long>,
)

data class ReviewCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
)

@Service
class ReviewCompletionService(
    private val jdbc: JdbcTemplate,
    private val wallets: UserWalletService,
    private val idempotency: IdempotencyService,
    private val studyStreak: StudyStreakService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun complete(
        userId: Long,
        reviewItemIds: List<Long>,
        key: String,
    ): IdempotentResponse<ReviewCompleteResponse> =
        idempotency
            .execute(
                userId,
                "API-503",
                key,
                mapOf("reviewItemIds" to reviewItemIds),
                ReviewCompleteResponse::class.java,
            ) { IdempotentResponse(200, completeOnce(userId, reviewItemIds)) }
            .let { result -> result.copy(body = result.body.copy(rewards = result.body.rewards.filterNot { it.currency == "STAR" })) }

    private fun completeOnce(
        userId: Long,
        reviewItemIds: List<Long>,
    ): ReviewCompleteResponse {
        validateIds(userId, reviewItemIds)
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val userExists =
            jdbc
                .query(
                    "SELECT user_id FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> rs.getLong(1) },
                    userId,
                ).firstOrNull()
        if (userExists == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)

        val placeholders = List(SESSION_SIZE) { "?" }.joinToString(",")
        val parameters = arrayOf<Any>(userId, *reviewItemIds.toTypedArray())
        val items =
            jdbc.query(
                """SELECT s.review_session_id, s.review_date, s.status,
                      i.review_item_id, i.completed, i.answered_at
               FROM review_session s JOIN review_session_item i ON i.review_session_id=s.review_session_id
               WHERE s.user_id=? AND i.review_item_id IN ($placeholders)
               ORDER BY i.review_item_id
               FOR UPDATE OF s, i""",
                { rs, _ ->
                    ReviewItemState(
                        rs.getLong("review_session_id"),
                        rs.getDate("review_date").toLocalDate(),
                        rs.getString("status"),
                        rs.getLong("review_item_id"),
                        rs.getBoolean("completed"),
                        rs.getTimestamp("answered_at")?.toInstant(),
                    )
                },
                *parameters,
            )
        if (items.size != SESSION_SIZE) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (items.map { it.sessionId }.distinct().size != 1) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val session = items.first()
        if (items.map { it.itemId }.toSet() != reviewItemIds.toSet()) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (session.reviewDate != today) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (session.status == "COMPLETED") return response(emptyList(), userId)
        if (session.status != "OPEN" ||
            items.any { !it.completed || it.answeredAt?.let { answeredAt -> LocalDate.ofInstant(answeredAt, kst) } != today }
        ) {
            throw ApiV1Exception(ApiErrorCode.CONFLICT)
        }

        val paidSessions =
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_session WHERE user_id=? AND review_date=? AND reward_granted",
                Int::class.java,
                userId,
                Date.valueOf(today),
            ) ?: 0
        val granted = paidSessions < DAILY_REWARD_LIMIT
        val rewards = mutableListOf<LearningReward>()
        if (granted) {
            val inserted =
                jdbc.update(
                    """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
                   VALUES (?, 'REVIEW', ?, ?, 'WALLET', 'STARDUST', ?)
                   ON CONFLICT (user_id,source_key) DO NOTHING""",
                    userId,
                    session.sessionId,
                    "REVIEW:${session.sessionId}:WALLET:STARDUST",
                    REVIEW_STARDUST_REWARD,
                )
            if (inserted == 1) {
                wallets.credit(userId, WalletCurrency.STARDUST, REVIEW_STARDUST_REWARD)
                rewards += LearningReward("WALLET", "STARDUST", REVIEW_STARDUST_REWARD)
            }
        }
        jdbc.update(
            "UPDATE review_session SET status='COMPLETED', reward_granted=?, completed_at=? WHERE review_session_id=?",
            granted && rewards.isNotEmpty(),
            Timestamp.from(clock.instant()),
            session.sessionId,
        )
        studyStreak.recordCompletedStudy(userId)
        if (rewards.isNotEmpty()) {
            log.info(
                "learning.review.reward_granted userId={} reviewSessionId={} currency=STARDUST amount={}",
                userId,
                session.sessionId,
                REVIEW_STARDUST_REWARD,
            )
        }
        return response(rewards, userId)
    }

    private fun response(
        rewards: List<LearningReward>,
        userId: Long,
    ): ReviewCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        return ReviewCompleteResponse(rewards, WalletBalancesResponse(wallet.stardust))
    }

    private fun validateIds(
        userId: Long,
        reviewItemIds: List<Long>,
    ) {
        if (userId <= 0 || reviewItemIds.size != SESSION_SIZE || reviewItemIds.any { it <= 0 } ||
            reviewItemIds.distinct().size != SESSION_SIZE
        ) {
            throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }
    }

    private data class ReviewItemState(
        val sessionId: Long,
        val reviewDate: LocalDate,
        val status: String,
        val itemId: Long,
        val completed: Boolean,
        val answeredAt: java.time.Instant?,
    )

    companion object {
        private const val SESSION_SIZE = 5
        private const val DAILY_REWARD_LIMIT = 3
        private const val REVIEW_STARDUST_REWARD = 1L
    }
}
