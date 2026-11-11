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
import java.time.Clock

data class OnboardingCompleteRequest(
    val skipped: Boolean,
)

data class OnboardingCompleteResponse(
    val rewards: List<LearningReward>,
    val wallet: WalletBalancesResponse,
    val onboardingCompleted: Boolean,
)

@Service
class OnboardingService(
    private val jdbc: JdbcTemplate,
    private val learning: LearningService,
    private val wallets: UserWalletService,
    private val idempotency: IdempotencyService,
    private val studyStreak: StudyStreakService,
    private val artworks: LearningArtworkService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional(readOnly = true)
    fun getLesson(userId: Long): LessonDetail {
        requireUserId(userId)
        val completed =
            jdbc
                .query(
                    "SELECT onboarding_completed FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN'",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (completed) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        return learning.getLesson(onboardingLessonId())
    }

    @Transactional
    fun complete(
        userId: Long,
        request: OnboardingCompleteRequest,
        key: String,
    ): IdempotentResponse<OnboardingCompleteResponse> =
        idempotency
            .execute(
                userId,
                "API-602",
                key,
                request,
                OnboardingCompleteResponse::class.java,
            ) {
                IdempotentResponse(200, completeOnce(userId, request.skipped))
            }.let { result -> result.copy(body = result.body.copy(rewards = result.body.rewards.filterNot { it.currency == "STAR" })) }

    private fun completeOnce(
        userId: Long,
        skipped: Boolean,
    ): OnboardingCompleteResponse {
        requireUserId(userId)
        val completed =
            jdbc
                .query(
                    "SELECT onboarding_completed FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)

        if (completed) return response(emptyList(), userId)

        val lessonId = onboardingLessonId()
        if (!skipped && !allQuizzesCompleted(userId, lessonId)) throw ApiV1Exception(ApiErrorCode.CONFLICT)

        jdbc.update("UPDATE app_user SET onboarding_completed=TRUE, modified_at=now() WHERE user_id=?", userId)
        if (skipped) {
            log.info("learning.onboarding.completed userId={} skipped=true rewards=0", userId)
            return response(emptyList(), userId)
        }

        val rewards = mutableListOf<LearningReward>()
        val sourceKey = "ONBOARDING:$lessonId:WALLET:STARDUST"
        val inserted =
            jdbc.update(
                """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
                   VALUES (?, 'ONBOARDING', ?, ?, 'WALLET', 'STARDUST', ?) ON CONFLICT (user_id,source_key) DO NOTHING""",
                userId,
                lessonId,
                sourceKey,
                ONBOARDING_REWARD,
            ) == 1
        if (inserted) {
            wallets.credit(userId, WalletCurrency.STARDUST, ONBOARDING_REWARD)
            rewards += LearningReward("WALLET", "STARDUST", ONBOARDING_REWARD)
        }
        artworks.grant(userId, lessonId, clock.instant())?.let(rewards::add)
        val streakDays = studyStreak.recordCompletedStudy(userId)
        log.info("learning.onboarding.completed userId={} skipped=false rewards={} streakDays={}", userId, rewards.size, streakDays)
        return response(rewards, userId)
    }

    private fun onboardingLessonId(): Long {
        val courses =
            jdbc.query(
                "SELECT course_id FROM course WHERE is_onboarding ORDER BY course_id",
                { rs, _ -> rs.getLong(1) },
            )
        if (courses.size != 1) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val lessons =
            jdbc.query(
                "SELECT lesson_id FROM lesson WHERE course_id=? ORDER BY lesson_order,lesson_id",
                { rs, _ -> rs.getLong(1) },
                courses.single(),
            )
        if (lessons.size != 1) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        return lessons.single()
    }

    private fun allQuizzesCompleted(
        userId: Long,
        lessonId: Long,
    ): Boolean =
        jdbc.queryForObject(
            """SELECT COUNT(*) > 0 AND NOT EXISTS (
                 SELECT 1 FROM lesson_content lc WHERE lc.lesson_id=? AND lc.content_type='QUIZ'
                   AND NOT EXISTS (SELECT 1 FROM quiz_attempt qa WHERE qa.user_id=? AND qa.quiz_id=lc.quiz_id AND qa.completed)
               ) FROM lesson_content WHERE lesson_id=? AND content_type='QUIZ'""",
            Boolean::class.java,
            lessonId,
            userId,
            lessonId,
        ) ?: false

    private fun response(
        rewards: List<LearningReward>,
        userId: Long,
    ): OnboardingCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        return OnboardingCompleteResponse(rewards, wallets.balances(wallet), true)
    }

    private fun requireUserId(userId: Long) {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    companion object {
        private const val ONBOARDING_REWARD = 50L
    }
}
