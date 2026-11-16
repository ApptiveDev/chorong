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

@Service
class LessonCompletionService(
    private val jdbc: JdbcTemplate,
    private val wallets: UserWalletService,
    private val idempotency: IdempotencyService,
    private val studyStreak: StudyStreakService,
    private val unlocks: LessonUnlockService,
    private val bonuses: ConstellationBonusService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun complete(
        userId: Long,
        lessonId: Long,
        key: String,
    ): IdempotentResponse<LessonCompleteResponse> =
        idempotency
            .execute(
                userId,
                "API-407",
                key,
                mapOf("lessonId" to lessonId),
                LessonCompleteResponse::class.java,
            ) {
                IdempotentResponse(200, completeOnce(userId, lessonId))
            }.let { result -> result.copy(body = result.body.copy(rewards = result.body.rewards.filterNot { it.currency == "STAR" })) }

    @Transactional
    fun completeFromProgress(
        userId: Long,
        lessonId: Long,
    ): LessonCompleteResponse = completeOnce(userId, lessonId)

    private fun completeOnce(
        userId: Long,
        lessonId: Long,
    ): LessonCompleteResponse {
        requireId(userId)
        requireId(lessonId)
        ensureUser(userId)
        val lesson =
            jdbc
                .query(
                    "SELECT l.course_id, c.is_onboarding FROM lesson l JOIN course c ON c.course_id=l.course_id WHERE l.lesson_id=?",
                    { rs, _ -> LessonRow(rs.getLong("course_id"), rs.getBoolean("is_onboarding")) },
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (lesson.onboarding) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val progress =
            jdbc
                .query(
                    "SELECT status,last_content_id FROM lesson_progress WHERE user_id=? AND lesson_id=? FOR UPDATE",
                    { rs, _ -> ProgressRow(rs.getString("status"), rs.getObject("last_content_id", java.lang.Long::class.java)?.toLong()) },
                    userId,
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.LESSON_LOCKED)
        // API-405 재시도처럼 이미 완료한 레슨이면 지급·차감 없이 현재 상태만 돌려준다.
        if (progress.status == "COMPLETED") {
            val status = if (stardustGranted(userId, lessonId)) LessonRewardStatus.ALREADY_GRANTED else LessonRewardStatus.NO_ENERGY
            return response(emptyList(), status, userId, firstCompletion = false, courseCompleted = false)
        }
        if (progress.status != "IN_PROGRESS") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val lastContentId =
            jdbc
                .query(
                    "SELECT content_id FROM lesson_content WHERE lesson_id=? ORDER BY content_order DESC LIMIT 1",
                    { rs, _ -> rs.getLong(1) },
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (progress.lastContentId != lastContentId || hasIncompleteQuiz(userId, lessonId)) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        jdbc.update(
            "UPDATE lesson_progress SET status='COMPLETED',completed_at=?,modified_at=now() WHERE user_id=? AND lesson_id=?",
            Timestamp.from(clock.instant()),
            userId,
            lessonId,
        )
        studyStreak.recordCompletedStudy(userId)
        return grantRewards(userId, lessonId, lesson.courseId, firstCompletion = true)
    }

    /**
     * 별(STAR) 뱃지는 레슨마다 한 번 기록한다. 별가루는 레슨마다 한 번, 에너지가 있을 때만 준다.
     * 별자리 뱃지는 코스의 모든 레슨을 처음 완료했을 때 준다.
     */
    private fun grantRewards(
        userId: Long,
        lessonId: Long,
        courseId: Long,
        firstCompletion: Boolean,
    ): LessonCompleteResponse {
        val rewards = mutableListOf<LearningReward>()
        val rewardStatus = grantStardust(userId, lessonId, rewards)
        val constellationId =
            jdbc
                .query(
                    "SELECT constellation_id FROM course WHERE course_id=? FOR UPDATE",
                    { rs, _ -> rs.getLong("constellation_id").let { if (rs.wasNull()) null else it } },
                    courseId,
                ).firstOrNull()
        val courseCompleted = firstCompletion && courseCompleted(userId, courseId)
        if (constellationId != null && insertStarBadgeReward(userId, lessonId, constellationId)) {
            rewards += LearningReward(type = "CONSTELLATION", badge = LearningRewardBadge("STAR", constellationId, lessonId))
        }
        if (courseCompleted && constellationId != null && insertBadgeReward(userId, courseId, constellationId)) {
            rewards += LearningReward(type = "CONSTELLATION", badge = LearningRewardBadge("CONSTELLATION", constellationId))
        }
        if (courseCompleted) rewards += bonuses.grant(userId, courseId)
        log.info(
            "learning.lesson.completed userId={} lessonId={} courseId={} rewardStatus={} firstCompletion={} courseCompleted={}",
            userId,
            lessonId,
            courseId,
            rewardStatus,
            firstCompletion,
            courseCompleted,
        )
        return response(rewards, rewardStatus, userId, firstCompletion, courseCompleted)
    }

    fun stardustGranted(
        userId: Long,
        lessonId: Long,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM reward_ledger WHERE user_id=? AND source_key=?)",
            Boolean::class.java,
            userId,
            stardustSource(lessonId),
        ) ?: false

    /** 다시 하기를 마쳤을 때 호출한다. 보상을 아직 받지 않은 레슨이면 이때 에너지를 써서 받는다. */
    @Transactional
    fun completeReplay(
        userId: Long,
        lessonId: Long,
    ): LessonCompleteResponse {
        val courseId =
            jdbc.queryForObject("SELECT course_id FROM lesson WHERE lesson_id=?", Long::class.java, lessonId)
                ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        jdbc.query("SELECT 1 FROM lesson_progress WHERE user_id=? AND lesson_id=? FOR UPDATE", { _, _ -> }, userId, lessonId)
        return grantRewards(userId, lessonId, courseId, firstCompletion = false)
    }

    /** 레슨 별가루는 한 번만 준다. 에너지가 없으면 주지 않고 다음 완료 때 다시 확인한다. 호출 전에 lesson_progress 행을 잠근다. */
    private fun grantStardust(
        userId: Long,
        lessonId: Long,
        rewards: MutableList<LearningReward>,
    ): LessonRewardStatus {
        if (stardustGranted(userId, lessonId)) return LessonRewardStatus.ALREADY_GRANTED
        if (!wallets.spendEnergy(userId)) return LessonRewardStatus.NO_ENERGY
        check(insertWalletReward(userId, "LESSON", lessonId, stardustSource(lessonId), "STARDUST", LESSON_STARDUST_REWARD))
        wallets.credit(userId, WalletCurrency.STARDUST, LESSON_STARDUST_REWARD)
        rewards += LearningReward("WALLET", "STARDUST", LESSON_STARDUST_REWARD)
        return LessonRewardStatus.GRANTED
    }

    private fun stardustSource(lessonId: Long) = "LESSON:$lessonId:WALLET:STARDUST"

    private fun insertWalletReward(
        userId: Long,
        sourceType: String,
        sourceId: Long,
        sourceKey: String,
        currency: String,
        amount: Long,
    ): Boolean =
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
             VALUES (?,?,?,?, 'WALLET',?,?) ON CONFLICT (user_id,source_key) DO NOTHING""",
            userId,
            sourceType,
            sourceId,
            sourceKey,
            currency,
            amount,
        ) == 1

    private fun insertBadgeReward(
        userId: Long,
        courseId: Long,
        constellationId: Long,
    ): Boolean =
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,constellation_id,badge_type)
             VALUES (?, 'COURSE', ?, ?, 'CONSTELLATION', ?, 'CONSTELLATION') ON CONFLICT (user_id,source_key) DO NOTHING""",
            userId,
            courseId,
            "COURSE:$courseId:CONSTELLATION",
            constellationId,
        ) == 1

    private fun insertStarBadgeReward(
        userId: Long,
        lessonId: Long,
        constellationId: Long,
    ): Boolean =
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,constellation_id,badge_type)
               VALUES (?, 'LESSON', ?, ?, 'CONSTELLATION', ?, 'STAR') ON CONFLICT (user_id,source_key) DO NOTHING""",
            userId,
            lessonId,
            "LESSON:$lessonId:BADGE:STAR",
            constellationId,
        ) == 1

    private fun hasIncompleteQuiz(
        userId: Long,
        lessonId: Long,
    ): Boolean =
        jdbc.queryForObject(
            """SELECT EXISTS (
                 SELECT 1 FROM lesson_content lc WHERE lc.lesson_id=? AND lc.content_type='QUIZ'
                   AND NOT EXISTS (SELECT 1 FROM quiz_attempt qa WHERE qa.user_id=? AND qa.quiz_id=lc.quiz_id AND qa.completed)
             )""",
            Boolean::class.java,
            lessonId,
            userId,
        ) ?: true

    private fun courseCompleted(
        userId: Long,
        courseId: Long,
    ): Boolean =
        jdbc.queryForObject(
            """SELECT COUNT(*) > 0 AND COUNT(*) FILTER (WHERE lp.status='COMPLETED') = COUNT(*)
             FROM lesson l LEFT JOIN lesson_progress lp ON lp.lesson_id=l.lesson_id AND lp.course_id=l.course_id AND lp.user_id=?
             WHERE l.course_id=?""",
            Boolean::class.java,
            userId,
            courseId,
        ) ?: false

    private fun response(
        rewards: List<LearningReward>,
        rewardStatus: LessonRewardStatus,
        userId: Long,
        firstCompletion: Boolean,
        courseCompleted: Boolean,
    ): LessonCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        val completedLessons =
            jdbc.queryForObject(
                """SELECT COUNT(*) FROM lesson_progress lp JOIN course c ON c.course_id=lp.course_id
                   WHERE lp.user_id=? AND lp.status='COMPLETED' AND NOT c.is_onboarding""",
                Int::class.java,
                userId,
            ) ?: 0
        val next = unlocks.map(userId).current()?.let { NextLesson(it.lessonId, it.courseId, it.title) }
        return LessonCompleteResponse(
            rewards = rewards,
            wallet = wallets.balances(wallet),
            rewardStatus = rewardStatus,
            firstLesson = firstCompletion && completedLessons == 1,
            firstCompletion = firstCompletion,
            courseCompleted = courseCompleted,
            nextLesson = next,
        )
    }

    private fun ensureUser(userId: Long) {
        val status = jdbc.query("SELECT status FROM app_user WHERE user_id=?", { rs, _ -> rs.getString(1) }, userId).firstOrNull()
        if (status == null || status == "WITHDRAWN") throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    private data class LessonRow(
        val courseId: Long,
        val onboarding: Boolean,
    )

    private data class ProgressRow(
        val status: String,
        val lastContentId: Long?,
    )

    companion object {
        const val LESSON_STARDUST_REWARD = 10L
    }
}
