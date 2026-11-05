package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
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
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
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
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.application.name=chorong-email-verify-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class, EmailSenderTestConfig::class)
class EmailVerifyApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var sender: TestEmailSender

    @Autowired lateinit var decoder: JwtDecoder

    @MockitoSpyBean lateinit var tokens: TokenService

    @MockitoBean lateinit var clock: Clock
    private lateinit var now: Instant

    data class Fixture(
        val userId: Long,
        val access: String,
        val email: String,
        val id: String,
        val code: String,
    )

    @BeforeEach fun reset() {
        sender.sent.clear()
        sender.fail = false
        now = Instant.now().truncatedTo(ChronoUnit.SECONDS)
        `when`(clock.zone).thenReturn(ZoneOffset.UTC)
        `when`(clock.instant()).thenReturn(now)
    }

    private fun guest(): Pair<Long, String> {
        val id = checkNotNull(users.saveAndFlush(UserEntity(nickname = "guest")).id)
        val device = UUID.randomUUID().toString()
        auths.saveAndFlush(UserAuthEntity(id, AuthProvider.GUEST, device))
        return id to tokens.issue(id, device).accessToken
    }

    private fun fixture(password: String = "password123"): Fixture {
        val (id, access) = guest()
        val email = "test-${UUID.randomUUID()}@example.com"
        val result = post("/api/v1/auth/email/signup", access, mapOf("email" to email, "password" to password))
        return Fixture(id, access, email, result["data"]["verificationId"].asText(), sender.sent.last().second)
    }

    private fun post(
        path: String,
        access: String?,
        fields: Map<String, Any>,
        expected: Int = 200,
    ): JsonNode {
        val response =
            mvc
                .post(path) {
                    if (access != null) header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(fields)
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
                .response
        return mapper.readTree(response.contentAsByteArray)
    }

    private fun verify(
        f: Fixture,
        code: String = f.code,
        access: String = f.access,
        expected: Int = 200,
    ): JsonNode = post("/api/v1/auth/email/verify", access, mapOf("verificationId" to f.id, "code" to code), expected)

    private fun row(f: Fixture): Map<String, Any> =
        jdbc.queryForMap(
            "SELECT failed_attempts,invalidated_at,consumed_at FROM chorong_dev.email_signup_verification WHERE verification_id=?",
            UUID.fromString(f.id),
        )

    private fun wrong(f: Fixture) = if (f.code == "000000") "111111" else "000000"

    @Test fun `verification converts same account preserves assets and supports legacy login`() {
        val password = "abc123" + "가".repeat(30)
        val f = fixture(password)
        jdbc.update("INSERT INTO chorong_dev.user_wallet(user_id,coin) VALUES (?,123)", f.userId)
        jdbc.update("INSERT INTO chorong_dev.housing_profile(user_id) VALUES (?)", f.userId)
        val data = verify(f)["data"]
        assertEquals(f.userId, data["user"]["userId"].asLong())
        assertEquals("ACTIVE", data["user"]["status"].asText())
        assertFalse(data["isNew"].asBoolean())
        assertEquals("MEMBER", decoder.decode(data["accessToken"].asText()).getClaimAsString("role"))
        assertEquals(123L, jdbc.queryForObject("SELECT coin FROM chorong_dev.user_wallet WHERE user_id=?", Long::class.java, f.userId))
        assertEquals(
            1L,
            jdbc.queryForObject("SELECT count(*) FROM chorong_dev.housing_profile WHERE user_id=?", Long::class.java, f.userId),
        )
        assertEquals(
            1L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_auth WHERE user_id=? AND provider='GUEST'",
                Long::class.java,
                f.userId,
            ),
        )
        assertTrue(row(f)["consumed_at"] != null)
        mvc
            .get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${f.access}") }
            .andExpect { status { isOk() } }
        val login = post("/api/auth/password/login", null, mapOf("email" to f.email, "password" to password))
        assertEquals(f.userId.toString(), decoder.decode(login["accessToken"].asText()).subject)
        val v1 =
            post(
                "/api/v1/auth/email/login",
                null,
                mapOf("email" to f.email, "password" to password, "deviceUuid" to UUID.randomUUID().toString()),
            )
        assertEquals(f.userId, v1["data"]["user"]["userId"].asLong())
        assertEquals("VERIFICATION_INVALID", verify(f, expected = 400)["error"]["code"].asText())
    }

    @Test fun `five wrong codes commit attempts and invalidate session`() {
        val f = fixture()
        repeat(5) { attempt ->
            assertEquals("VERIFICATION_INVALID", verify(f, wrong(f), expected = 400)["error"]["code"].asText())
            assertEquals(attempt + 1, row(f)["failed_attempts"])
        }
        assertTrue(row(f)["invalidated_at"] != null)
        assertEquals("VERIFICATION_INVALID", verify(f, expected = 400)["error"]["code"].asText())
        assertEquals(UserStatus.GUEST, users.findById(f.userId).orElseThrow().status)
    }

    @Test fun `other guest cannot use session or increment its failure count`() {
        val f = fixture()
        val (_, other) = guest()
        assertEquals("VERIFICATION_INVALID", verify(f, wrong(f), other, 400)["error"]["code"].asText())
        assertEquals(0, row(f)["failed_attempts"])
        verify(f)
    }

    @Test fun `expired and resent sessions cannot be consumed`() {
        val f = fixture()
        `when`(clock.instant()).thenReturn(now.plusSeconds(600))
        assertEquals("VERIFICATION_INVALID", verify(f, expected = 400)["error"]["code"].asText())
        assertNull(row(f)["consumed_at"])
        val newer = post("/api/v1/auth/email/signup", f.access, mapOf("email" to f.email, "password" to "password123"))
        assertNotEquals(f.id, newer["data"]["verificationId"].asText())
        assertTrue(row(f)["invalidated_at"] != null)
        assertEquals("VERIFICATION_INVALID", verify(f, expected = 400)["error"]["code"].asText())
    }

    @Test fun `registered email after sending returns conflict without consuming session`() {
        val f = fixture()
        post("/api/auth/password/signup", null, mapOf("email" to f.email, "password" to "password123"), 201)
        assertEquals("ACCOUNT_EXISTS_FOR_PROVIDER", verify(f, expected = 409)["error"]["code"].asText())
        assertNull(row(f)["consumed_at"])
        assertEquals(UserStatus.GUEST, users.findById(f.userId).orElseThrow().status)
    }

    @Test fun `simultaneous correct codes convert once`() {
        val f = fixture()
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val jobs =
                (1..2).map {
                    pool.submit<Int> {
                        barrier.await(15, TimeUnit.SECONDS)
                        mvc
                            .post("/api/v1/auth/email/verify") {
                                header(HttpHeaders.AUTHORIZATION, "Bearer ${f.access}")
                                contentType = MediaType.APPLICATION_JSON
                                content = mapper.writeValueAsString(mapOf("verificationId" to f.id, "code" to f.code))
                            }.andReturn()
                            .response.status
                    }
                }
            assertEquals(listOf(200, 400), jobs.map { it.get(45, TimeUnit.SECONDS) }.sorted())
            assertEquals(
                1L,
                jdbc.queryForObject(
                    "SELECT count(*) FROM chorong_dev.user_auth WHERE user_id=? AND provider='PASSWORD'",
                    Long::class.java,
                    f.userId,
                ),
            )
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `legacy signup racing verification creates only one email account`() {
        val f = fixture()
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val verify =
                pool.submit<Int> {
                    barrier.await(15, TimeUnit.SECONDS)
                    mvc
                        .post("/api/v1/auth/email/verify") {
                            header(HttpHeaders.AUTHORIZATION, "Bearer ${f.access}")
                            contentType = MediaType.APPLICATION_JSON
                            content = mapper.writeValueAsString(mapOf("verificationId" to f.id, "code" to f.code))
                        }.andReturn()
                        .response.status
                }
            val legacy =
                pool.submit<Int> {
                    barrier.await(15, TimeUnit.SECONDS)
                    mvc
                        .post("/api/auth/password/signup") {
                            contentType = MediaType.APPLICATION_JSON
                            content = mapper.writeValueAsString(mapOf("email" to f.email, "password" to "password123"))
                        }.andReturn()
                        .response.status
                }
            val statuses = verify.get(45, TimeUnit.SECONDS) to legacy.get(45, TimeUnit.SECONDS)
            assertTrue(statuses == (200 to 409) || statuses == (409 to 201))
            assertEquals(
                1L,
                jdbc.queryForObject(
                    "SELECT count(*) FROM chorong_dev.user_auth WHERE provider='PASSWORD' AND provider_uid=?",
                    Long::class.java,
                    f.email,
                ),
            )
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `late token failure rolls back code consumption account conversion and auth`() {
        val f = fixture()
        doThrow(IllegalStateException("planned failure")).`when`(tokens).issue(anyLong(), anyString(), anyBoolean())
        assertEquals("INTERNAL", verify(f, expected = 500)["error"]["code"].asText())
        assertNull(row(f)["consumed_at"])
        assertEquals(UserStatus.GUEST, users.findById(f.userId).orElseThrow().status)
        assertEquals(
            0L,
            jdbc.queryForObject(
                "SELECT count(*) FROM chorong_dev.user_auth WHERE user_id=? AND provider='PASSWORD'",
                Long::class.java,
                f.userId,
            ),
        )
    }

    @Test fun `invalid request and missing bearer are rejected`() {
        val f = fixture()
        post("/api/v1/auth/email/verify", null, mapOf("verificationId" to f.id, "code" to f.code), 401)
        post("/api/v1/auth/email/verify", f.access, mapOf("verificationId" to f.id, "code" to "12345"), 400)
        post("/api/v1/auth/email/verify", f.access, mapOf("verificationId" to "bad", "code" to f.code), 400)
        assertEquals(0, row(f)["failed_attempts"])
    }
}
