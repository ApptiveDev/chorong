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
    private val reviewGate: ReviewGateService,
    private val studyStreak: StudyStreakService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun complete(
        userId: Long,
        lessonId: Long,
        key: String,
    ): IdempotentResponse<LessonCompleteResponse> =
        idempotency.execute(
            userId,
            "API-407",
            key,
            mapOf("lessonId" to lessonId),
            LessonCompleteResponse::class.java,
        ) {
            IdempotentResponse(200, completeOnce(userId, lessonId))
        }

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
        if (progress.status == "COMPLETED") return response(emptyList(), courseCompleted(userId, lesson.courseId), userId)
        if (progress.status != "IN_PROGRESS") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        reviewGate.enforce(userId, lessonId)
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
        return grantRewards(userId, lessonId, lesson.courseId)
    }

    private fun grantRewards(
        userId: Long,
        lessonId: Long,
        courseId: Long,
    ): LessonCompleteResponse {
        val rewards = mutableListOf<LearningReward>()
        val lessonSource = "LESSON:$lessonId:WALLET:STAR"
        if (insertWalletReward(userId, "LESSON", lessonId, lessonSource, "STAR", LESSON_STAR_REWARD)) {
            wallets.credit(userId, WalletCurrency.STAR, LESSON_STAR_REWARD)
            rewards += LearningReward("WALLET", "STAR", LESSON_STAR_REWARD)
        }

        val constellationId =
            jdbc
                .query(
                    "SELECT constellation_id FROM course WHERE course_id=? FOR UPDATE",
                    { rs, _ -> rs.getLong("constellation_id").let { if (rs.wasNull()) null else it } },
                    courseId,
                ).firstOrNull()
        val courseCompleted = courseCompleted(userId, courseId)
        if (courseCompleted && constellationId != null && insertBadgeReward(userId, courseId, constellationId)) {
            rewards +=
                LearningReward(
                    type = "CONSTELLATION",
                    badge = LearningRewardBadge("CONSTELLATION", constellationId),
                )
        }
        log.info(
            "learning.lesson.completed userId={} lessonId={} courseId={} courseCompleted={} rewards={}",
            userId,
            lessonId,
            courseId,
            courseCompleted,
            rewards.size,
        )
        return response(rewards, courseCompleted, userId)
    }

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
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,constellation_id)
             VALUES (?, 'COURSE', ?, ?, 'CONSTELLATION', ?) ON CONFLICT (user_id,source_key) DO NOTHING""",
            userId,
            courseId,
            "COURSE:$courseId:CONSTELLATION",
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
        courseCompleted: Boolean,
        userId: Long,
    ): LessonCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        return LessonCompleteResponse(rewards, WalletBalancesResponse(wallet.star, wallet.stardust), courseCompleted)
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
        private const val LESSON_STAR_REWARD = 1L
    }
}
