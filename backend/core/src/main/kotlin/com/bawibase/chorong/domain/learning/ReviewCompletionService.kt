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
import java.sql.Timestamp
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

data class ReviewCompleteRequest(
    val reviewSessionId: Long?,
)

data class ReviewSessionRequest(
    val reviewSessionId: Long?,
)

enum class ReviewRewardStatus { GRANTED, ALREADY_GRANTED }

/** 기본값은 0.4.1 이전에 저장한 멱등 응답을 다시 읽을 때만 쓰인다. */
data class ReviewCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
    val correctCount: Int = 0,
    val totalCount: Int = 0,
    val rewardStatus: ReviewRewardStatus = ReviewRewardStatus.ALREADY_GRANTED,
)

data class ReviewStatusResponse(
    val available: Boolean,
    val candidateCount: Int,
    val rewardEligible: Boolean,
    val rewardAmount: Long,
)

/**
 * 복습 보상은 완료 시각 기준 한국 날짜마다 한 번이다. 시작한 날과 관계없다.
 * 날짜별 source_key 로 같은 날 두 번째 지급을 막는다.
 */
@Service
class ReviewRewardRule(
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    fun today(): LocalDate = LocalDate.ofInstant(clock.instant(), kst)

    fun sourceKey(date: LocalDate) = "REVIEW:DAY:$date:WALLET:STARDUST"

    fun eligible(userId: Long): Boolean =
        !(
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM reward_ledger WHERE user_id=? AND source_key=?)",
                Boolean::class.java,
                userId,
                sourceKey(today()),
            ) ?: false
        )

    companion object {
        const val REVIEW_STARDUST_REWARD = 5L
    }
}

@Service
class ReviewCompletionService(
    private val jdbc: JdbcTemplate,
    private val wallets: UserWalletService,
    private val idempotency: IdempotencyService,
    private val studyStreak: StudyStreakService,
    private val rewardRule: ReviewRewardRule,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun complete(
        userId: Long,
        reviewSessionId: Long?,
        key: String,
    ): IdempotentResponse<ReviewCompleteResponse> {
        if (userId <= 0 || reviewSessionId == null || reviewSessionId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        return idempotency
            .execute(
                userId,
                "API-503",
                key,
                mapOf("reviewSessionId" to reviewSessionId),
                ReviewCompleteResponse::class.java,
            ) { IdempotentResponse(200, completeOnce(userId, reviewSessionId)) }
            .let { result -> result.copy(body = result.body.copy(rewards = result.body.rewards.filterNot { it.currency == "STAR" })) }
    }

    /** API-505. 열린 회차를 닫는다. 이미 제출한 답안의 재출제 반영은 그대로 둔다. */
    @Transactional
    fun abandon(
        userId: Long,
        reviewSessionId: Long?,
    ) {
        if (userId <= 0 || reviewSessionId == null || reviewSessionId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        lockUser(userId)
        val status = sessionStatus(userId, reviewSessionId) ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (status == "OPEN") {
            jdbc.update("UPDATE review_session SET status='ABANDONED' WHERE review_session_id=?", reviewSessionId)
        }
    }

    private fun completeOnce(
        userId: Long,
        sessionId: Long,
    ): ReviewCompleteResponse {
        lockUser(userId)
        val status = sessionStatus(userId, sessionId) ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (status == "ABANDONED") throw ApiV1Exception(ApiErrorCode.REVIEW_SESSION_CLOSED)
        val items =
            jdbc.query(
                "SELECT completed, correct FROM review_session_item WHERE review_session_id=? ORDER BY item_order FOR UPDATE",
                { rs, _ -> rs.getBoolean("completed") to rs.getBoolean("correct") },
                sessionId,
            )
        val correctCount = items.count { it.second }
        if (status == "COMPLETED") return response(emptyList(), userId, correctCount, items.size, ReviewRewardStatus.ALREADY_GRANTED)
        if (items.size != SESSION_SIZE || items.any { !it.first }) throw ApiV1Exception(ApiErrorCode.CONFLICT)

        val rewards = mutableListOf<LearningReward>()
        val inserted =
            jdbc.update(
                """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
                   VALUES (?, 'REVIEW', ?, ?, 'WALLET', 'STARDUST', ?)
                   ON CONFLICT (user_id,source_key) DO NOTHING""",
                userId,
                sessionId,
                rewardRule.sourceKey(rewardRule.today()),
                ReviewRewardRule.REVIEW_STARDUST_REWARD,
            ) == 1
        if (inserted) {
            wallets.credit(userId, WalletCurrency.STARDUST, ReviewRewardRule.REVIEW_STARDUST_REWARD)
            rewards += LearningReward("WALLET", "STARDUST", ReviewRewardRule.REVIEW_STARDUST_REWARD)
        }
        jdbc.update(
            "UPDATE review_session SET status='COMPLETED', reward_granted=?, completed_at=? WHERE review_session_id=?",
            inserted,
            Timestamp.from(clock.instant()),
            sessionId,
        )
        studyStreak.recordCompletedStudy(userId)
        log.info("learning.review.completed userId={} reviewSessionId={} rewardGranted={}", userId, sessionId, inserted)
        val rewardStatus = if (inserted) ReviewRewardStatus.GRANTED else ReviewRewardStatus.ALREADY_GRANTED
        return response(rewards, userId, correctCount, items.size, rewardStatus)
    }

    private fun lockUser(userId: Long) {
        jdbc
            .query(
                "SELECT user_id FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                { rs, _ -> rs.getLong(1) },
                userId,
            ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun sessionStatus(
        userId: Long,
        sessionId: Long,
    ): String? =
        jdbc
            .query(
                "SELECT status FROM review_session WHERE review_session_id=? AND user_id=? FOR UPDATE",
                { rs, _ -> rs.getString(1) },
                sessionId,
                userId,
            ).firstOrNull()

    private fun response(
        rewards: List<LearningReward>,
        userId: Long,
        correctCount: Int,
        totalCount: Int,
        rewardStatus: ReviewRewardStatus,
    ): ReviewCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        return ReviewCompleteResponse(rewards, wallets.balances(wallet), correctCount, totalCount, rewardStatus)
    }

    companion object {
        private const val SESSION_SIZE = 5
    }
}
