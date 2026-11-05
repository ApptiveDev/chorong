package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserPasswordRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyBoolean
import org.mockito.ArgumentMatchers.anyLong
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.application.name=chorong-email-login-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class EmailLoginApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var passwords: UserPasswordRepository

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var decoder: JwtDecoder

    @MockitoBean lateinit var clock: Clock

    @MockitoSpyBean lateinit var tokens: TokenService
    private lateinit var now: Instant

    @BeforeEach fun resetClock() {
        now = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        `when`(clock.zone).thenReturn(ZoneOffset.UTC)
        `when`(clock.instant()).thenReturn(now)
    }

    private fun signup(): String {
        val email = "login-${UUID.randomUUID()}@example.com"
        post("/api/auth/password/signup", mapOf("email" to email, "password" to "password123"), 201)
        return email
    }

    private fun post(
        path: String,
        body: Map<String, Any>,
        expected: Int = 200,
    ): JsonNode {
        val response =
            mvc
                .post(path) {
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(body)
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
                .response
        return mapper.readTree(response.contentAsByteArray)
    }

    private fun login(
        email: String,
        password: String = "password123",
        device: String = UUID.randomUUID().toString(),
        expected: Int = 200,
    ): JsonNode = post("/api/v1/auth/email/login", mapOf("email" to email, "password" to password, "deviceUuid" to device), expected)

    private fun credential(email: String) =
        passwords
            .findById(
                checkNotNull(checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).id),
            ).orElseThrow()

    private fun legacy(
        email: String,
        password: String = "wrong-pass",
        expected: Int = 401,
    ): JsonNode = post("/api/auth/password/login", mapOf("email" to email, "password" to password), expected)

    @Test fun `member logs in case insensitively with a device bound token`() {
        val email = signup()
        val device = UUID.randomUUID().toString()
        val data = login(email.uppercase(), device = device.uppercase())["data"]
        val jwt = decoder.decode(data["accessToken"].asText())
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        assertEquals(userId.toString(), jwt.subject)
        assertEquals("MEMBER", jwt.getClaimAsString("role"))
        assertEquals("ACTIVE", data["user"]["status"].asText())
        assertEquals(userId, data["user"]["userId"].asLong())
        assertEquals(false, data["isNew"].asBoolean())
        assertEquals(
            device,
            jdbc.queryForObject(
                "SELECT device_uuid FROM chorong_dev.user_refresh_token WHERE token_hash=?",
                String::class.java,
                tokens.hash(data["refreshToken"].asText()),
            ),
        )
    }

    @Test fun `five failures commit and lock for fifteen minutes with ceiling retry after`() {
        val email = signup()
        repeat(4) { n ->
            assertEquals("UNAUTHORIZED", login(email, "wrong-pass", expected = 401)["error"]["code"].asText())
            assertEquals(n + 1, credential(email).failedCount)
        }
        val locked = login(email, "wrong-pass", expected = 423)
        assertEquals("ACCOUNT_LOCKED", locked["error"]["code"].asText())
        assertEquals(900, locked["error"]["retryAfter"].asInt())
        assertEquals(now.plusSeconds(900), assertNotNull(credential(email).lockedUntil).toInstant())
        `when`(clock.instant()).thenReturn(now.plusSeconds(899).plusMillis(500))
        assertEquals(1, login(email, expected = 423)["error"]["retryAfter"].asInt())
        `when`(clock.instant()).thenReturn(now.plusSeconds(900))
        login(email)
        assertEquals(0, credential(email).failedCount)
        assertNull(credential(email).lockedUntil)
    }

    @Test fun `success resets earlier failures`() {
        val email = signup()
        repeat(2) { login(email, "wrong-pass", expected = 401) }
        assertEquals(2, credential(email).failedCount)
        login(email)
        assertEquals(0, credential(email).failedCount)
        assertNull(credential(email).lockedUntil)
    }

    @Test fun `unknown invalid and withdrawn accounts cannot log in`() {
        val email = signup()
        assertEquals("UNAUTHORIZED", login("unknown-${UUID.randomUUID()}@example.com", expected = 401)["error"]["code"].asText())
        assertEquals("VALIDATION_FAILED", login(email, device = "bad", expected = 400)["error"]["code"].asText())
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        users.saveAndFlush(users.findById(userId).orElseThrow().apply { status = UserStatus.WITHDRAWN })
        assertEquals("UNAUTHORIZED", login(email, expected = 401)["error"]["code"].asText())
        assertEquals("LOGIN_FAILED", legacy(email)["code"].asText())
        assertEquals("USER_WITHDRAWN", legacy(email, "password123")["code"].asText())
        assertEquals(0, credential(email).failedCount)
    }

    @Test fun `simultaneous failures are counted once each`() {
        val email = signup()
        val pool = Executors.newFixedThreadPool(5)
        val barrier = CyclicBarrier(5)
        try {
            val jobs =
                (1..5).map {
                    pool.submit<Int> {
                        barrier.await(15, TimeUnit.SECONDS)
                        mvc
                            .post("/api/v1/auth/email/login") {
                                contentType = MediaType.APPLICATION_JSON
                                content =
                                    mapper.writeValueAsString(
                                        mapOf(
                                            "email" to email,
                                            "password" to "wrong-pass",
                                            "deviceUuid" to UUID.randomUUID().toString(),
                                        ),
                                    )
                            }.andReturn()
                            .response.status
                    }
                }
            assertEquals(listOf(401, 401, 401, 401, 423), jobs.map { it.get(45, TimeUnit.SECONDS) }.sorted())
            assertEquals(now.plusSeconds(900), assertNotNull(credential(email).lockedUntil).toInstant())
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `legacy and v1 failures share lock while legacy response remains compatible`() {
        val email = signup()
        repeat(2) { assertEquals("LOGIN_FAILED", legacy(email)["code"].asText()) }
        repeat(2) { login(email, "wrong-pass", expected = 401) }
        assertEquals("LOGIN_FAILED", legacy(email)["code"].asText())
        assertEquals("ACCOUNT_LOCKED", legacy(email, "password123")["code"].asText())
        assertEquals(900, login(email, expected = 423)["error"]["retryAfter"].asInt())
    }

    @Test fun `token failure rolls back successful login reset`() {
        val email = signup()
        repeat(2) { login(email, "wrong-pass", expected = 401) }
        doThrow(IllegalStateException("planned failure")).`when`(tokens).issue(anyLong(), anyString(), anyBoolean())
        assertEquals("INTERNAL", login(email, expected = 500)["error"]["code"].asText())
        assertEquals(2, credential(email).failedCount)
    }

    @Test fun `expired lock with wrong password starts a new failure count`() {
        val email = signup()
        repeat(4) { login(email, "wrong-pass", expected = 401) }
        login(email, "wrong-pass", expected = 423)
        `when`(clock.instant()).thenReturn(now.plusSeconds(900))
        login(email, "wrong-pass", expected = 401)
        assertEquals(1, credential(email).failedCount)
        assertNull(credential(email).lockedUntil)
    }
}
