package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig::class)
class AuthApiTest {
    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var objectMapper: ObjectMapper

    private fun post(
        path: String,
        body: String,
        expected: Int = 200,
    ): JsonNode {
        val result =
            mockMvc
                .post(path) {
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
        return objectMapper.readTree(result.response.contentAsString.ifEmpty { "{}" })
    }

    private fun signUp(): JsonNode =
        post("/api/auth/password/signup", """{"email":"u-${UUID.randomUUID()}@test.local","password":"password123"}""", 201)

    @Test
    fun `guest signup then login and duplicate device conflicts`() {
        val device = UUID.randomUUID().toString()
        post("/api/auth/guest/login", """{"deviceUuid":"$device"}""", 401)

        val created = post("/api/auth/guest/signup", """{"deviceUuid":"$device"}""", 201)
        assertEquals(true, created["created"].asBoolean())
        post("/api/auth/guest/signup", """{"deviceUuid":"$device"}""", 409)

        val tokens = post("/api/auth/guest/login", """{"deviceUuid":"$device"}""")
        assertEquals(false, tokens["created"].asBoolean())
        mockMvc
            .get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${tokens["accessToken"].asText()}") }
            .andExpect {
                status { isOk() }
                jsonPath("$.providers[0]") { value("GUEST") }
            }
    }

    @Test
    fun `password signup then login and duplicate email conflicts`() {
        val email = "u-${UUID.randomUUID()}@test.local"
        val created = post("/api/auth/password/signup", """{"email":"$email","password":"password123"}""", 201)
        assertEquals(true, created["created"].asBoolean())
        post("/api/auth/password/signup", """{"email":"$email","password":"password123"}""", 409)
        post("/api/auth/password/login", """{"email":"$email","password":"wrong-pass"}""", 401)
        val tokens = post("/api/auth/password/login", """{"email":"${email.uppercase()}","password":"password123"}""")

        mockMvc
            .get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${tokens["accessToken"].asText()}") }
            .andExpect {
                status { isOk() }
                jsonPath("$.email") { value(email) }
                jsonPath("$.providers[0]") { value("PASSWORD") }
            }
    }

    @Test
    fun `refresh rotates token and old one is rejected`() {
        val first = signUp()
        val refresh = first["refreshToken"].asText()

        val rotated = post("/api/auth/refresh", """{"refreshToken":"$refresh"}""")
        assertNotEquals(refresh, rotated["refreshToken"].asText())

        val reused = post("/api/auth/refresh", """{"refreshToken":"$refresh"}""", 401)
        assertEquals("REFRESH_TOKEN_INVALID", reused["code"].asText())
    }

    @Test
    fun `logout revokes refresh token`() {
        val tokens = signUp()

        mockMvc
            .post("/api/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${tokens["accessToken"].asText()}")
                contentType = MediaType.APPLICATION_JSON
                content = """{"refreshToken":"${tokens["refreshToken"].asText()}"}"""
            }.andExpect { status { isNoContent() } }

        post("/api/auth/refresh", """{"refreshToken":"${tokens["refreshToken"].asText()}"}""", 401)
    }

    @Test
    fun `garbage bearer token is rejected`() {
        mockMvc
            .get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt") }
            .andExpect {
                status { isUnauthorized() }
                jsonPath("$.code") { value("UNAUTHORIZED") }
            }
    }
}
