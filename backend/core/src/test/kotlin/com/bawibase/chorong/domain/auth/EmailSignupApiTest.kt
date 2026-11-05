package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.EmailVerificationSender
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.Collections
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.application.name=chorong-email-signup-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class, EmailSenderTestConfig::class)
class EmailSignupApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var codeEncoder: PasswordEncoder

    @Autowired lateinit var sender: TestEmailSender

    @MockitoBean lateinit var clock: Clock
    private lateinit var now: Instant

    @BeforeEach fun setTime() {
        sender.sent.clear()
        sender.fail = false
        now = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        `when`(clock.zone).thenReturn(ZoneOffset.UTC)
        `when`(clock.instant()).thenReturn(now)
    }

    private fun guest(): Pair<Long, String> {
        val id = checkNotNull(users.saveAndFlush(UserEntity()).id)
        return id to tokens.issue(id, UUID.randomUUID().toString()).accessToken
    }

    private fun email() = "test-${UUID.randomUUID()}@example.com"

    private fun count(email: String): Long =
        jdbc.queryForObject(
            "SELECT count(*) FROM chorong_dev.email_signup_verification WHERE email=?",
            Long::class.java,
            email.lowercase(),
        )!!

    private fun request(
        access: String?,
        email: String,
        password: String = "password123",
        expected: Int = 200,
    ): JsonNode {
        val response =
            mvc
                .post("/api/v1/auth/email/signup") {
                    if (access != null) header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(mapOf("email" to email, "password" to password))
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
                .response
        return mapper.readTree(response.contentAsByteArray)
    }

    @Test fun `successful signup stores owner and hashes and sends six digit code`() {
        val (id, access) = guest()
        val email = email()
        val password = "abc123" + "가".repeat(30)
        val data = request(access, email.uppercase(), password)["data"]
        UUID.fromString(data["verificationId"].asText())
        assertEquals(now.plusSeconds(600), Instant.parse(data["expiresAt"].asText()))
        val row =
            jdbc.queryForMap(
                "SELECT user_id,email,password_hash,code_hash FROM chorong_dev.email_signup_verification WHERE verification_id=?",
                UUID.fromString(data["verificationId"].asText()),
            )
        assertEquals(id, row["user_id"])
        assertEquals(email, row["email"])
        val passwordHash = row["password_hash"] as String
        assertTrue(passwordHash.startsWith("{pbkdf2-base64}"))
        val encoder = Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8().apply { setEncodeHashAsBase64(true) }
        assertTrue(encoder.matches(password, passwordHash.removePrefix("{pbkdf2-base64}")))
        val sent = sender.sent.single()
        assertEquals(email, sent.first)
        assertTrue(sent.second.matches(Regex("[0-9]{6}")))
        assertTrue(codeEncoder.matches(sent.second, row["code_hash"] as String))
        assertNotEquals(sent.second, row["code_hash"])
    }

    @Test fun `email rate limit applies across guests and resend invalidates old session at 60 seconds`() {
        val (_, first) = guest()
        val (_, second) = guest()
        val email = email()
        val before = request(first, email)["data"]["verificationId"].asText()
        val limited = request(second, email.uppercase(), expected = 429)
        assertEquals("RATE_LIMITED", limited["error"]["code"].asText())
        assertEquals(60, limited["error"]["retryAfter"].asInt())
        assertEquals(1L, count(email))
        `when`(clock.instant()).thenReturn(now.plusSeconds(60))
        val after = request(second, email)["data"]["verificationId"].asText()
        assertNotEquals(before, after)
        assertEquals(2L, count(email))
        val invalidated =
            jdbc.queryForObject(
                "SELECT invalidated_at IS NOT NULL FROM chorong_dev.email_signup_verification WHERE verification_id=?",
                Boolean::class.java,
                UUID.fromString(before),
            )
        assertEquals(true, invalidated)
    }

    @Test fun `duplicate email and unauthenticated or member requests are rejected`() {
        val (id, access) = guest()
        val email = email()
        auths.saveAndFlush(UserAuthEntity(id, AuthProvider.PASSWORD, email.uppercase()))
        assertEquals("EMAIL_ALREADY_REGISTERED", request(access, email, expected = 409)["error"]["code"].asText())
        request(null, email, expected = 401)
        val member = users.saveAndFlush(UserEntity().apply { status = UserStatus.ACTIVE })
        val memberAccess = tokens.issue(checkNotNull(member.id), UUID.randomUUID().toString()).accessToken
        request(memberAccess, email(), expected = 403)
        assertEquals(0L, count(email))
    }

    @Test fun `invalid email and passwords return validation errors`() {
        val (_, access) = guest()
        for ((address, password) in listOf(
            "bad address" to "password123",
            email() to "short1",
            email() to "abcdefgh",
            email() to "12345678",
            email() to "x1".repeat(33),
        )) {
            assertEquals("VALIDATION_FAILED", request(access, address, password, 400)["error"]["code"].asText())
        }
    }

    @Test fun `sender failure rolls back session and does not create cooldown`() {
        val (_, access) = guest()
        val email = email()
        sender.fail = true
        assertEquals("INTERNAL", request(access, email, expected = 500)["error"]["code"].asText())
        assertEquals(0L, count(email))
    }

    @Test fun `concurrent sends for the same email create one session`() {
        val (_, a) = guest()
        val (_, b) = guest()
        val email = email()
        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val jobs =
                listOf(a, b).map { access ->
                    pool.submit<Int> {
                        barrier.await(15, TimeUnit.SECONDS)
                        mvc
                            .post("/api/v1/auth/email/signup") {
                                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                                contentType = MediaType.APPLICATION_JSON
                                content = mapper.writeValueAsString(mapOf("email" to email, "password" to "password123"))
                            }.andReturn()
                            .response.status
                    }
                }
            assertEquals(listOf(200, 429), jobs.map { it.get(45, TimeUnit.SECONDS) }.sorted())
            assertEquals(1L, count(email))
        } finally {
            pool.shutdownNow()
        }
    }
}

class TestEmailSender : EmailVerificationSender {
    val sent = Collections.synchronizedList(mutableListOf<Pair<String, String>>())

    @Volatile var fail = false

    override fun send(
        email: String,
        code: String,
    ) {
        if (fail) throw IllegalStateException("provider failure")
        sent.add(email to code)
    }
}

@TestConfiguration(proxyBeanMethods = false)
class EmailSenderTestConfig {
    @Bean @Primary
    fun testEmailSender() = TestEmailSender()
}
