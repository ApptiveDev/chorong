package com.bawibase.chorong.domain.user

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.AuthService
import com.bawibase.chorong.domain.user.entity.UserEntity
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
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class UserCodeNicknameApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var decoder: JwtDecoder

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var mapper: ObjectMapper

    private fun guest(): Pair<Long, String> {
        val token = auth.guestSignUp(UUID.randomUUID().toString()).accessToken
        return decoder.decode(token).subject.toLong() to token
    }

    private fun patchNickname(
        token: String,
        nickname: String,
    ) = mvc.patch("/api/v1/users/me") {
        header(HttpHeaders.AUTHORIZATION, "Bearer $token")
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(mapOf("nickname" to nickname))
    }

    @Test fun `user codes follow creation order and appear in me`() {
        val (firstId, firstToken) = guest()
        val (secondId, _) = guest()
        val first = checkNotNull(users.findById(firstId).orElseThrow().userCode)
        val second = checkNotNull(users.findById(secondId).orElseThrow().userCode)
        assertTrue(first.matches(Regex("^42[0-9]{6}$")))
        assertTrue(first.toInt() >= 42001000)
        assertEquals(first.toInt() + 1, second.toInt())

        mvc.get("/api/v1/users/me") { header(HttpHeaders.AUTHORIZATION, "Bearer $firstToken") }.andExpect {
            status { isOk() }
            jsonPath("$.data.userCode") { value(first) }
            jsonPath("$.data.nickname") { value("게스트") }
        }
        assertEquals(
            0,
            jdbc.queryForObject("SELECT COUNT(*) - COUNT(DISTINCT user_code) FROM app_user", Int::class.java),
        )
    }

    @Test fun `nickname is trimmed limited to ten characters and unique`() {
        val (_, owner) = guest()
        val (_, other) = guest()
        val name = "별" + UUID.randomUUID().toString().take(8)

        patchNickname(owner, "  $name  ").andExpect {
            status { isOk() }
            jsonPath("$.data.nickname") { value(name) }
        }
        // 내 닉네임을 그대로 다시 저장하는 것은 중복이 아니다.
        patchNickname(owner, name).andExpect { status { isOk() } }
        patchNickname(other, name).andExpect {
            status { isConflict() }
            jsonPath("$.error.code") { value("NICKNAME_TAKEN") }
        }
        patchNickname(other, " $name ").andExpect {
            status { isConflict() }
            jsonPath("$.error.code") { value("NICKNAME_TAKEN") }
        }
        patchNickname(other, "가".repeat(11)).andExpect { status { isBadRequest() } }
        patchNickname(other, "   ").andExpect { status { isBadRequest() } }
        patchNickname(other, "가").andExpect { status { isOk() } }
    }

    @Test fun `legacy member signup gets a default nickname`() {
        val email = "code-${UUID.randomUUID()}@example.com"
        val token = auth.passwordSignUp(email, "password-1234!", null).accessToken
        val user = users.findById(decoder.decode(token).subject.toLong()).orElseThrow()
        assertTrue(checkNotNull(user.nickname).matches(Regex("^No\\. [0-9]{8}$")))
        assertEquals(UserStatus.ACTIVE, user.status)
    }

    @Test fun `stored entity without nickname keeps null for guests`() {
        val user = users.saveAndFlush(UserEntity())
        assertEquals(null, user.nickname)
        assertTrue(checkNotNull(user.userCode).startsWith("42"))
    }
}
