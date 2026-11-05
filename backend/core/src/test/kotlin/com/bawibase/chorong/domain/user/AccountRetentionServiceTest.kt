package com.bawibase.chorong.domain.user

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.service.AccountRetentionService
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import kotlin.test.assertEquals
import kotlin.test.assertNull

@SpringBootTest(properties = ["spring.application.name=chorong-account-retention-test"])
@Import(TestcontainersConfig::class)
class AccountRetentionServiceTest {
    @Autowired lateinit var retention: AccountRetentionService

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Test
    fun `anonymizes due accounts in batches and preserves minimal report and reward history`() {
        val due = withdrawnUser(OffsetDateTime.now().minusDays(91))
        val dueReporter = activeUser()
        val unrelated = activeUser()
        val notDue = withdrawnUser(OffsetDateTime.now().plusDays(1))

        jdbc.update("INSERT INTO housing_profile(user_id,is_public) VALUES (?,TRUE)", due)
        jdbc.update("INSERT INTO user_wallet(user_id,coin) VALUES (?,17)", due)
        jdbc.update(
            """INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount)
               VALUES (?,'LESSON',23,?,'WALLET','STAR',1)""",
            due,
            "retention-test-$due",
        )
        jdbc.update(
            """INSERT INTO housing_report(housing_user_id,reporter_user_id,reason,detail)
               VALUES (?,?,'SPAM','target report detail'),(?,?, 'OTHER','reporter report detail')""",
            due,
            dueReporter,
            unrelated,
            due,
        )

        assertEquals(1, retention.anonymizeDueAccounts(batchSize = 1))
        assertEquals(0, retention.anonymizeDueAccounts(batchSize = 1))

        val account = users.findById(due).orElseThrow()
        assertNull(account.nickname)
        assertNull(account.email)
        assertNull(account.withdrawalReason)
        assertNull(account.withdrawnAt)
        assertEquals(
            1L,
            jdbc.queryForObject(
                "SELECT count(*) FROM app_user WHERE user_id=? AND retention_processed_at IS NOT NULL",
                Long::class.java,
                due,
            ),
        )
        assertEquals(
            0L,
            jdbc.queryForObject(
                "SELECT count(*) FROM app_user WHERE user_id=? AND retention_processed_at IS NOT NULL",
                Long::class.java,
                notDue,
            ),
        )
        assertEquals(17L, jdbc.queryForObject("SELECT coin FROM user_wallet WHERE user_id=?", Long::class.java, due))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM reward_ledger WHERE user_id=?", Long::class.java, due))
        assertEquals(
            2L,
            jdbc.queryForObject(
                "SELECT count(*) FROM housing_report WHERE detail IS NULL AND reporter_user_id IS NULL AND reason IN ('SPAM','OTHER')",
                Long::class.java,
            ),
        )
        assertEquals(
            1L,
            jdbc.queryForObject(
                "SELECT count(*) FROM housing_profile WHERE user_id=? AND name='나의 우주' AND is_public=FALSE AND active_room_id IS NULL",
                Long::class.java,
                due,
            ),
        )
    }

    @Test
    fun `rejects invalid batch sizes`() {
        org.junit.jupiter.api
            .assertThrows<IllegalArgumentException> { retention.anonymizeDueAccounts(0) }
        org.junit.jupiter.api
            .assertThrows<IllegalArgumentException> { retention.anonymizeDueAccounts(501) }
    }

    private fun withdrawnUser(deletionAfter: OffsetDateTime): Long =
        users
            .saveAndFlush(
                UserEntity(nickname = "retention-${System.nanoTime()}", email = "${System.nanoTime()}@example.com").apply {
                    status = UserStatus.WITHDRAWN
                    withdrawnAt = deletionAfter.minusDays(90)
                    withdrawalReason = "retention test reason"
                    this.deletionAfter = deletionAfter
                    pushEnabled = true
                    onboardingCompleted = true
                    streakDays = 5
                },
            ).id!!

    private fun activeUser(): Long =
        users
            .saveAndFlush(UserEntity(nickname = "active-${System.nanoTime()}").apply { status = UserStatus.ACTIVE })
            .id!!
}
