package com.bawibase.chorong.domain.user

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.entity.UserOauthEntity
import com.bawibase.chorong.domain.user.entity.UserPasswordEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserOauthRepository
import com.bawibase.chorong.domain.user.repository.UserPasswordRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.put
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull

@SpringBootTest(properties = ["spring.application.name=chorong-account-withdrawal-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class AccountWithdrawalApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var oauths: UserOauthRepository

    @Autowired lateinit var passwords: UserPasswordRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var profiles: HousingProfileRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    private fun activeUser(): Long {
        val user = UserEntity(nickname = "보존", email = "retained@example.com").apply { status = UserStatus.ACTIVE }
        return checkNotNull(users.saveAndFlush(user).id)
    }

    private fun token(
        userId: Long,
        device: String,
    ): TokenResponse = tokens.issue(userId, device)

    @Test
    fun `withdraw blocks access and atomically clears credentials push and visibility`() {
        val userId = activeUser()
        val device = UUID.randomUUID().toString()
        val token = token(userId, device)
        auths.saveAndFlush(UserAuthEntity(userId, AuthProvider.GUEST, device))
        val passwordAuth = auths.saveAndFlush(UserAuthEntity(userId, AuthProvider.PASSWORD, "withdrawal-test@example.com"))
        passwords.saveAndFlush(UserPasswordEntity(checkNotNull(passwordAuth.id), "password-hash", OffsetDateTime.now()))
        val googleAuth = auths.saveAndFlush(UserAuthEntity(userId, AuthProvider.GOOGLE, "google-subject"))
        oauths.saveAndFlush(UserOauthEntity(checkNotNull(googleAuth.id), email = "oauth@example.com"))
        profiles.saveAndFlush(HousingProfileEntity(userId, isPublic = true))
        mvc
            .put("/api/v1/push/devices") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content =
                    mapper.writeValueAsString(
                        mapOf("deviceUuid" to device, "platform" to "ANDROID", "pushToken" to "withdrawal-test-token"),
                    )
            }.andExpect { status { isNoContent() } }

        val now = OffsetDateTime.now()
        jdbc.update(
            """INSERT INTO chorong_dev.email_signup_verification
                (verification_id,user_id,email,password_hash,code_hash,created_at,expires_at)
                VALUES (?,?,?,?,?,?,?)""",
            UUID.randomUUID(),
            userId,
            "withdrawal-test@example.com",
            "password-hash",
            "code-hash",
            now,
            now.plusMinutes(10),
        )

        mvc
            .delete("/api/v1/users/me") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("reason" to "테스트 탈퇴 사유"))
            }.andExpect { status { isNoContent() } }

        val withdrawn = users.findById(userId).orElseThrow()
        assertEquals(UserStatus.WITHDRAWN, withdrawn.status)
        assertEquals("테스트 탈퇴 사유", withdrawn.withdrawalReason)
        assertEquals("보존", withdrawn.nickname)
        assertEquals("retained@example.com", withdrawn.email)
        assertNotNull(withdrawn.withdrawnAt)
        assertEquals(withdrawn.withdrawnAt!!.plusDays(90), withdrawn.deletionAfter)
        assertEquals(0, auths.findAllByUserId(userId).size)
        assertEquals(
            0L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_oauth WHERE auth_id=?",
                Long::class.java,
                googleAuth.id,
            ),
        )
        assertEquals(
            0L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_password WHERE auth_id=?",
                Long::class.java,
                passwordAuth.id,
            ),
        )
        assertEquals(
            0L,
            jdbc.queryForObject("SELECT count(*) FROM chorong_dev.email_signup_verification WHERE user_id=?", Long::class.java, userId),
        )
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.push_device WHERE user_id=?", Long::class.java, userId))
        assertEquals(
            0L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_refresh_token WHERE user_id=? AND revoked_at IS NULL",
                Long::class.java,
                userId,
            ),
        )
        assertFalse(checkNotNull(profiles.findById(userId).orElseThrow().isPublic))

        mvc
            .delete("/api/v1/push/devices/$device") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
            }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `guest cannot withdraw as a member`() {
        val userId = activeUser()
        val user = users.findById(userId).orElseThrow().apply { status = UserStatus.GUEST }
        users.saveAndFlush(user)
        val token = token(userId, UUID.randomUUID().toString())

        mvc
            .delete("/api/v1/users/me") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
            }.andExpect { status { isForbidden() } }

        assertEquals(UserStatus.GUEST, users.findById(userId).orElseThrow().status)
    }
}
