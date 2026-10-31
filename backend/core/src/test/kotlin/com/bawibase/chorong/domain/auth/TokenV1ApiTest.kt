package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.JsonNode
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
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.time.Instant
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@SpringBootTest(properties = ["spring.application.name=chorong-token-v1-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class TokenV1ApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var encoder: JwtEncoder

    private fun user(): Long = checkNotNull(users.saveAndFlush(UserEntity()).id)

    private fun uuid() = UUID.randomUUID().toString()

    private fun issue(
        id: Long,
        device: String,
    ) = tokens.issue(id, device)

    private fun active(id: Long): Long =
        jdbc.queryForObject(
            "SELECT count(*) FROM chorong_dev.user_refresh_token WHERE user_id=? AND revoked_at IS NULL",
            Long::class.java,
            id,
        )!!

    private fun refresh(
        token: String,
        device: String,
        expected: Int = 200,
    ): JsonNode {
        val result =
            mvc
                .post("/api/v1/auth/token/refresh") {
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(mapOf("refreshToken" to token, "deviceUuid" to device))
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
        return mapper.readTree(result.response.contentAsByteArray)
    }

    private fun logout(
        token: TokenResponse,
        all: Boolean = false,
        expected: Int = 204,
    ) {
        mvc
            .post("/api/v1/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("all" to all))
            }.andExpect { status { isEqualTo(expected) } }
    }

    @Test fun `refresh rotates once and reuse commits revocation of all user devices`() {
        val id = user()
        val device = uuid()
        val first = issue(id, device)
        val other = issue(id, uuid())
        val rotated = refresh(first.refreshToken, device.uppercase())["data"]
        assertNotEquals(first.refreshToken, rotated["refreshToken"].asText())
        assertEquals(2L, active(id))
        assertEquals("AUTH_TOKEN_REUSED", refresh(first.refreshToken, device, 401)["error"]["code"].asText())
        assertEquals(0L, active(id))
        assertEquals("AUTH_TOKEN_REUSED", refresh(other.refreshToken, otherDevice(other), 401)["error"]["code"].asText())
    }

    private fun otherDevice(token: TokenResponse): String =
        jdbc.queryForObject(
            "SELECT device_uuid FROM chorong_dev.user_refresh_token WHERE token_hash=?",
            String::class.java,
            tokens.hash(token.refreshToken),
        )!!

    @Test fun `wrong device and unknown tokens do not revoke other sessions`() {
        val id = user()
        val device = uuid()
        val token = issue(id, device)
        assertEquals("UNAUTHORIZED", refresh(token.refreshToken, uuid(), 401)["error"]["code"].asText())
        assertEquals("UNAUTHORIZED", refresh("unknown", device, 401)["error"]["code"].asText())
        assertEquals(1L, active(id))
        refresh(token.refreshToken, device)
    }

    @Test fun `expired token is distinguished and does not revoke other sessions`() {
        val id = user()
        val device = uuid()
        val expired = issue(id, device)
        issue(id, uuid())
        jdbc.update(
            "UPDATE chorong_dev.user_refresh_token SET expires_at=now() - interval '1 second' WHERE token_hash=?",
            tokens.hash(expired.refreshToken),
        )
        assertEquals("AUTH_TOKEN_EXPIRED", refresh(expired.refreshToken, device, 401)["error"]["code"].asText())
        assertEquals(2L, active(id))
    }

    @Test fun `logout current device revokes all its sessions but not other device or user`() {
        val id = user()
        val device = uuid()
        val current = issue(id, device)
        issue(id, device.uppercase())
        val other = issue(id, uuid())
        val otherUser = user()
        issue(otherUser, device)
        logout(current)
        assertEquals(1L, active(id))
        assertEquals(1L, active(otherUser))
        refresh(other.refreshToken, otherDevice(other))
    }

    @Test fun `logout all revokes all devices and requires authentication`() {
        val id = user()
        val current = issue(id, uuid())
        issue(id, uuid())
        logout(current, all = true)
        assertEquals(0L, active(id))
        mvc.post("/api/v1/auth/logout").andExpect { status { isUnauthorized() } }
    }

    @Test fun `device without session identity cannot be used for current logout`() {
        val id = user()
        val token = tokens.issue(id, null)
        logout(token, expected = 401)
        assertEquals(1L, active(id))
        logout(token, all = true)
        assertEquals(0L, active(id))
    }

    @Test fun `legacy access token without sid only supports logout all`() {
        val id = user()
        issue(id, uuid())
        val now = Instant.now()
        val claims =
            JwtClaimsSet
                .builder()
                .issuer(TokenService.ISSUER)
                .subject(id.toString())
                .issuedAt(now)
                .expiresAt(now.plusSeconds(600))
                .build()
        val access = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).tokenValue
        mvc
            .post("/api/v1/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
            }.andExpect { status { isUnauthorized() } }
        assertEquals(1L, active(id))
        mvc
            .post("/api/v1/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("all" to true))
            }.andExpect { status { isNoContent() } }
        assertEquals(0L, active(id))
    }

    @Test fun `simultaneous rotation permits one success and reuse revokes its replacement`() {
        val id = user()
        val device = uuid()
        val first = issue(id, device)
        val barrier = CyclicBarrier(2)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val jobs =
                (1..2).map {
                    pool.submit<Int> {
                        barrier.await(15, TimeUnit.SECONDS)
                        mvc
                            .post("/api/v1/auth/token/refresh") {
                                contentType = MediaType.APPLICATION_JSON
                                content = mapper.writeValueAsString(mapOf("refreshToken" to first.refreshToken, "deviceUuid" to device))
                            }.andReturn()
                            .response.status
                    }
                }
            assertEquals(listOf(200, 401), jobs.map { it.get(45, TimeUnit.SECONDS) }.sorted())
            assertEquals(0L, active(id))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `refresh rejects invalid requests`() {
        for (body in listOf("{}", mapper.writeValueAsString(mapOf("refreshToken" to "x", "deviceUuid" to "bad")))) {
            mvc
                .post("/api/v1/auth/token/refresh") {
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect { status { isBadRequest() } }
        }
    }
}
