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
    private val artworks: LearningArtworkService,
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
                    "SELECT l.course_id, c.is_onboarding, l.artwork_image_url FROM lesson l JOIN course c ON c.course_id=l.course_id WHERE l.lesson_id=?",
                    { rs, _ -> LessonRow(rs.getLong("course_id"), rs.getBoolean("is_onboarding"), rs.getString("artwork_image_url")) },
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        if (lesson.onboarding) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        val progress =
            jdbc
                .query(
                    "SELECT status,last_content_id,energy_spent FROM lesson_progress WHERE user_id=? AND lesson_id=? FOR UPDATE",
                    { rs, _ ->
                        ProgressRow(
                            rs.getString("status"),
                            rs.getObject("last_content_id", java.lang.Long::class.java)?.toLong(),
                            rs.getBoolean("energy_spent"),
                        )
                    },
                    userId,
                    lessonId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.LESSON_LOCKED)
        if (progress.status == "COMPLETED") return response(emptyList(), courseCompleted(userId, lesson.courseId), userId, lessonId)
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
        val completedAt = clock.instant()
        jdbc.update(
            "UPDATE lesson_progress SET status='COMPLETED',completed_at=?,modified_at=now() WHERE user_id=? AND lesson_id=?",
            Timestamp.from(completedAt),
            userId,
            lessonId,
        )
        studyStreak.recordCompletedStudy(userId)
        return grantRewards(userId, lessonId, lesson.courseId, lesson.artworkImageUrl, completedAt, progress.energySpent)
    }

    private fun grantRewards(
        userId: Long,
        lessonId: Long,
        courseId: Long,
        artworkImageUrl: String?,
        completedAt: java.time.Instant,
        energySpent: Boolean,
    ): LessonCompleteResponse {
        val rewards = mutableListOf<LearningReward>()
        val stardustSkipped = !grantStardust(userId, lessonId, energySpent, rewards)

        if (artworkImageUrl != null) artworks.grant(userId, lessonId, completedAt)?.let(rewards::add)

        val constellationId =
            jdbc
                .query(
                    "SELECT constellation_id FROM course WHERE course_id=? FOR UPDATE",
                    { rs, _ -> rs.getLong("constellation_id").let { if (rs.wasNull()) null else it } },
                    courseId,
                ).firstOrNull()
        val courseCompleted = courseCompleted(userId, courseId)
        if (constellationId != null && insertStarBadgeReward(userId, lessonId, constellationId)) {
            rewards += LearningReward(type = "CONSTELLATION", badge = LearningRewardBadge("STAR", constellationId, lessonId))
        }
        if (courseCompleted && constellationId != null && insertBadgeReward(userId, courseId, constellationId)) {
            rewards +=
                LearningReward(
                    type = "CONSTELLATION",
                    badge = LearningRewardBadge("CONSTELLATION", constellationId),
                )
        }
        log.info(
            "learning.lesson.completed userId={} lessonId={} courseId={} courseCompleted={} rewards={} energySpent={}",
            userId,
            lessonId,
            courseId,
            courseCompleted,
            rewards.size,
            energySpent,
        )
        return response(rewards, courseCompleted, userId, lessonId, stardustSkipped)
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

    /**
     * 다시 보기를 마쳤을 때 호출한다. 처음 학습 때 에너지가 없어 별가루를 못 받은 레슨은
     * 에너지를 쓰고 다시 학습하면 이때 받는다. 이미 별가루를 받은 레슨이면 null.
     */
    @Transactional
    fun completeReplay(
        userId: Long,
        lessonId: Long,
    ): LessonCompleteResponse? {
        if (stardustGranted(userId, lessonId)) return null
        val courseId =
            jdbc.queryForObject("SELECT course_id FROM lesson WHERE lesson_id=?", Long::class.java, lessonId)
                ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val energySpent =
            jdbc.queryForObject(
                "SELECT energy_spent FROM lesson_replay_progress WHERE user_id=? AND lesson_id=? FOR UPDATE",
                Boolean::class.java,
                userId,
                lessonId,
            ) ?: false
        val rewards = mutableListOf<LearningReward>()
        val granted = grantStardust(userId, lessonId, energySpent, rewards)
        if (granted) log.info("learning.lesson.replay_rewarded userId={} lessonId={}", userId, lessonId)
        return response(rewards, courseCompleted(userId, courseId), userId, lessonId, stardustSkipped = !granted)
    }

    /** 에너지를 썼으면 레슨 별가루를 한 번만 준다. 이미 받았거나 지금 받으면 true. */
    private fun grantStardust(
        userId: Long,
        lessonId: Long,
        energySpent: Boolean,
        rewards: MutableList<LearningReward>,
    ): Boolean {
        if (stardustGranted(userId, lessonId)) return true
        if (!energySpent) return false
        if (insertWalletReward(userId, "LESSON", lessonId, stardustSource(lessonId), "STARDUST", LESSON_STARDUST_REWARD)) {
            wallets.credit(userId, WalletCurrency.STARDUST, LESSON_STARDUST_REWARD)
            rewards += LearningReward("WALLET", "STARDUST", LESSON_STARDUST_REWARD)
        }
        return true
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
        courseCompleted: Boolean,
        userId: Long,
        lessonId: Long,
        stardustSkipped: Boolean = false,
    ): LessonCompleteResponse {
        val wallet = wallets.ensureWallet(userId)
        val summary =
            jdbc.queryForObject(
                """SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE attempt.correct)::int AS correct
               FROM lesson_content lc
               JOIN quiz_item qi ON qi.quiz_id=lc.quiz_id AND qi.explanation IS NOT NULL
               JOIN lesson_progress lp ON lp.lesson_id=lc.lesson_id AND lp.user_id=?
               JOIN LATERAL (
                   SELECT qa.correct FROM quiz_attempt qa
                   WHERE qa.quiz_id=lc.quiz_id AND qa.user_id=lp.user_id AND qa.graded AND qa.completed
                     AND NOT qa.replay AND qa.submitted_at <= lp.completed_at
                   ORDER BY qa.submitted_at DESC, qa.attempt_id DESC LIMIT 1
               ) attempt ON true
               WHERE lc.lesson_id=? AND lc.content_type='QUIZ'""",
                { rs, _ -> QuizSummary(rs.getInt("correct"), rs.getInt("total")) },
                userId,
                lessonId,
            ) ?: QuizSummary(0, 0)
        return LessonCompleteResponse(rewards, wallets.balances(wallet), courseCompleted, summary, stardustSkipped)
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
        val artworkImageUrl: String?,
    )

    private data class ProgressRow(
        val status: String,
        val lastContentId: Long?,
        val energySpent: Boolean,
    )

    companion object {
        private const val LESSON_STARDUST_REWARD = 1L
    }
}
