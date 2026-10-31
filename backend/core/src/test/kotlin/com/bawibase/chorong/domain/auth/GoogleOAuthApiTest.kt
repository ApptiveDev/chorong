package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.service.GoogleTokenVerifier
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
import org.springframework.test.web.servlet.post
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.application.name=chorong-google-oauth-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class GoogleOAuthApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var decoder: JwtDecoder

    @MockitoBean lateinit var verifier: GoogleTokenVerifier

    @MockitoSpyBean lateinit var tokens: TokenService

    @BeforeEach fun defaults() {
        for (table in listOf("housing_background", "housing_wall", "housing_floor", "housing_avatar", "housing_room")) {
            jdbc.update("UPDATE chorong_dev.$table SET is_default=false")
            jdbc.update(
                """INSERT INTO chorong_dev.$table(code,name,is_default,is_active) VALUES ('google_default','기본',true,true)
                ON CONFLICT(code) DO UPDATE SET is_default=true,is_active=true""",
            )
        }
        jdbc.update("UPDATE chorong_dev.housing_furniture SET is_default=false")
        val room = jdbc.queryForObject("SELECT room_id FROM chorong_dev.housing_room WHERE code='google_default'", Long::class.java)!!
        for ((code, kind) in listOf("wall" to "WALL", "floor" to "FLOOR")) {
            jdbc.update(
                """INSERT INTO chorong_dev.housing_room_surface(room_id,code,kind) VALUES (?,?,?)
                ON CONFLICT(room_id,code) DO NOTHING""",
                room,
                code,
                kind,
            )
        }
    }

    private fun subject(): String = "google-${UUID.randomUUID()}".also { `when`(verifier.verify("valid-token")).thenReturn(it) }

    private fun request(
        access: String? = null,
        expected: Int = 200,
        token: String = "valid-token",
    ): JsonNode {
        val response =
            mvc
                .post("/api/v1/auth/oauth/google") {
                    if (access != null) header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsString(mapOf("idToken" to token, "deviceUuid" to UUID.randomUUID().toString()))
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
                .response
        return mapper.readTree(response.contentAsByteArray)
    }

    private fun guest(): Pair<Long, String> {
        val user = users.saveAndFlush(UserEntity(nickname = "guest"))
        val id = checkNotNull(user.id)
        val device = UUID.randomUUID().toString()
        auths.saveAndFlush(UserAuthEntity(id, AuthProvider.GUEST, device))
        return id to tokens.issue(id, device).accessToken
    }

    private fun count(table: String): Long = jdbc.queryForObject("SELECT count(*) FROM chorong_dev.$table", Long::class.java)!!

    @Test fun `new google account has starter assets and subsequent login reuses same account`() {
        val sub = subject()
        val first = request()["data"]
        val id = first["user"]["userId"].asLong()
        assertTrue(first["isNew"].asBoolean())
        assertEquals("ACTIVE", first["user"]["status"].asText())
        assertEquals(id.toString(), decoder.decode(first["accessToken"].asText()).subject)
        assertEquals(id, checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GOOGLE, sub)).userId)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.housing_profile WHERE user_id=?", Long::class.java, id))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.user_wallet WHERE user_id=?", Long::class.java, id))
        val second = request()["data"]
        assertFalse(second["isNew"].asBoolean())
        assertEquals(id, second["user"]["userId"].asLong())
    }

    @Test fun `guest conversion keeps same account and assets and rejects other guest`() {
        subject()
        val (id, access) = guest()
        jdbc.update("INSERT INTO chorong_dev.user_wallet(user_id,coin) VALUES (?,321)", id)
        val data = request(access)["data"]
        assertEquals(id, data["user"]["userId"].asLong())
        assertEquals("ACTIVE", data["user"]["status"].asText())
        assertFalse(data["isNew"].asBoolean())
        assertEquals(321L, jdbc.queryForObject("SELECT coin FROM chorong_dev.user_wallet WHERE user_id=?", Long::class.java, id))
        assertEquals(
            1L,
            jdbc.queryForObject("SELECT count(*) FROM chorong_dev.user_auth WHERE user_id=? AND provider='GUEST'", Long::class.java, id),
        )
        val (_, otherAccess) = guest()
        assertEquals("ACCOUNT_EXISTS_FOR_PROVIDER", request(otherAccess, 409)["error"]["code"].asText())
        assertEquals("FORBIDDEN", request(data["accessToken"].asText(), 403)["error"]["code"].asText())
    }

    @Test fun `missing defaults and late token failure roll back the new account`() {
        subject()
        val before = listOf("app_user", "user_auth", "housing_profile", "user_wallet").associateWith { count(it) }
        jdbc.update("UPDATE chorong_dev.housing_avatar SET is_default=false")
        assertEquals("CONFLICT", request(expected = 409)["error"]["code"].asText())
        assertEquals(before, before.keys.associateWith { count(it) })
        jdbc.update("UPDATE chorong_dev.housing_avatar SET is_default=true WHERE code='google_default'")
        doThrow(IllegalStateException("planned failure")).`when`(tokens).issue(anyLong(), anyString(), anyBoolean())
        assertEquals("INTERNAL", request(expected = 500)["error"]["code"].asText())
        assertEquals(before, before.keys.associateWith { count(it) })
    }

    @Test fun `withdrawn user cannot be recreated and invalid token is rejected`() {
        subject()
        val id = request()["data"]["user"]["userId"].asLong()
        users.saveAndFlush(users.findById(id).orElseThrow().apply { status = UserStatus.WITHDRAWN })
        val before = count("app_user")
        assertEquals("UNAUTHORIZED", request(expected = 401)["error"]["code"].asText())
        assertEquals(before, count("app_user"))
        `when`(verifier.verify("invalid-token")).thenThrow(ApiV1Exception(ApiErrorCode.UNAUTHORIZED))
        assertEquals("UNAUTHORIZED", request(expected = 401, token = "invalid-token")["error"]["code"].asText())
    }

    @Test fun `same google identity concurrently requested by two guests links only one`() {
        val sub = subject()
        val (firstId, firstAccess) = guest()
        val (secondId, secondAccess) = guest()
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val jobs =
                listOf(firstAccess, secondAccess).map { access ->
                    pool.submit<Int> {
                        barrier.await(15, TimeUnit.SECONDS)
                        mvc
                            .post("/api/v1/auth/oauth/google") {
                                header(HttpHeaders.AUTHORIZATION, "Bearer $access")
                                contentType = MediaType.APPLICATION_JSON
                                val body = mapOf("idToken" to "valid-token", "deviceUuid" to UUID.randomUUID().toString())
                                content = mapper.writeValueAsString(body)
                            }.andReturn()
                            .response.status
                    }
                }
            assertEquals(listOf(200, 409), jobs.map { it.get(45, TimeUnit.SECONDS) }.sorted())
            val owner = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GOOGLE, sub)).userId
            assertTrue(owner in listOf(firstId, secondId))
            assertEquals(1, listOf(firstId, secondId).count { users.findById(it).orElseThrow().status == UserStatus.ACTIVE })
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `simultaneous first logins create exactly one google account`() {
        val sub = subject()
        val before = count("app_user")
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val jobs =
                (1..2).map {
                    pool.submit<JsonNode> {
                        barrier.await(15, TimeUnit.SECONDS)
                        request()["data"]
                    }
                }
            val results = jobs.map { it.get(45, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it["isNew"].asBoolean() })
            assertEquals(1, results.map { it["user"]["userId"].asLong() }.toSet().size)
            assertEquals(before + 1, count("app_user"))
            assertEquals(
                1L,
                jdbc.queryForObject(
                    "SELECT count(*) FROM chorong_dev.user_auth WHERE provider='GOOGLE' AND provider_uid=?",
                    Long::class.java,
                    sub,
                ),
            )
        } finally {
            pool.shutdownNow()
        }
    }
}
