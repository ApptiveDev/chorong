package com.bawibase.chorong.domain.user.service

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

@Service
class AccountRetentionService(
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
) {
    @Transactional
    fun anonymizeDueAccounts(batchSize: Int): Int {
        require(batchSize in 1..MAX_BATCH_SIZE)
        val locked =
            jdbc.queryForObject(
                "SELECT pg_try_advisory_xact_lock(hashtext(current_schema()), ?)",
                Boolean::class.java,
                ADVISORY_LOCK_KEY,
            ) ?: false
        if (!locked) return 0

        val now = OffsetDateTime.now(clock)
        val userIds =
            jdbc.query(
                """SELECT user_id FROM app_user
                   WHERE status='WITHDRAWN' AND deletion_after<=? AND retention_processed_at IS NULL
                   ORDER BY deletion_after,user_id
                   LIMIT ? FOR UPDATE SKIP LOCKED""",
                { rs, _ -> rs.getLong("user_id") },
                now,
                batchSize,
            )
        userIds.forEach { anonymize(it, now) }
        return userIds.size
    }

    private fun anonymize(
        userId: Long,
        processedAt: OffsetDateTime,
    ) {
        jdbc.update(
            """UPDATE housing_report SET detail=NULL,reporter_user_id=NULL
               WHERE reporter_user_id=? OR housing_user_id=?""",
            userId,
            userId,
        )
        jdbc.update("DELETE FROM housing_like WHERE housing_user_id=? OR liker_user_id=?", userId, userId)
        jdbc.update("DELETE FROM user_block WHERE user_id=? OR blocked_user_id=?", userId, userId)
        jdbc.update("DELETE FROM idempotency_record WHERE user_id=?", userId)
        jdbc.update("DELETE FROM user_refresh_token WHERE user_id=?", userId)
        jdbc.update("DELETE FROM email_signup_verification WHERE user_id=?", userId)
        jdbc.update("DELETE FROM push_device WHERE user_id=?", userId)
        jdbc.update("DELETE FROM quiz_attempt WHERE user_id=?", userId)
        jdbc.update("DELETE FROM lesson_progress WHERE user_id=?", userId)
        jdbc.update("DELETE FROM course_unlock_mutex WHERE user_id=?", userId)
        jdbc.update("DELETE FROM course_daily_unlock WHERE user_id=?", userId)
        jdbc.update("DELETE FROM quiz_review_pool WHERE user_id=?", userId)
        jdbc.update("DELETE FROM review_session WHERE user_id=?", userId)
        jdbc.update("DELETE FROM lesson_replay_progress WHERE user_id=?", userId)
        jdbc.update("DELETE FROM lesson_review_gate WHERE user_id=?", userId)
        jdbc.update("DELETE FROM housing_moderation_hide WHERE housing_user_id=?", userId)
        jdbc.update("DELETE FROM housing_room_layout WHERE user_id=?", userId)
        jdbc.update("DELETE FROM housing_owned_item WHERE user_id=?", userId)
        jdbc.update(
            """UPDATE housing_profile
               SET name='나의 우주',is_public=FALSE,active_room_id=NULL,modified_at=?
               WHERE user_id=?""",
            processedAt,
            userId,
        )
        jdbc.update(
            """UPDATE app_user
               SET nickname=NULL,email=NULL,withdrawal_reason=NULL,withdrawn_at=NULL,
                   push_enabled=FALSE,onboarding_completed=FALSE,last_study_date=NULL,streak_days=0,
                   retention_processed_at=?,modified_at=?
               WHERE user_id=? AND status='WITHDRAWN' AND deletion_after<=?
                   AND retention_processed_at IS NULL""",
            processedAt,
            processedAt,
            userId,
            processedAt,
        )
    }

    companion object {
        private const val MAX_BATCH_SIZE = 500
        private const val ADVISORY_LOCK_KEY = 731_804_203
    }
}
