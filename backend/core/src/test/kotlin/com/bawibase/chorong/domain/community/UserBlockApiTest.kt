package com.bawibase.chorong.domain.community

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(properties = ["spring.application.name=chorong-user-block-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class UserBlockApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    private fun activeUser(nickname: String? = null): Pair<Long, String> {
        val user = UserEntity(nickname = nickname).apply { status = UserStatus.ACTIVE }
        val userId = checkNotNull(users.saveAndFlush(user).id)
        val token = tokens.issue(userId, UUID.randomUUID().toString()).accessToken
        return userId to token
    }

    @Test
    fun `API-808 returns a display nickname for blocked users without one`() {
        val (_, ownerToken) = activeUser("owner")
        val (blockedId, _) = activeUser()

        mvc
            .post("/api/v1/blocks/$blockedId") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $ownerToken")
            }.andExpect { status { isNoContent() } }

        mvc
            .get("/api/v1/blocks") {
                header(HttpHeaders.AUTHORIZATION, "Bearer $ownerToken")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.users.length()") { value(1) }
                jsonPath("$.data.users[0].userId") { value(blockedId) }
                jsonPath("$.data.users[0].nickname") { value("사용자") }
            }
    }
}
