package com.bawibase.chorong.domain.push

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.auth.service.TokenService
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
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID
import kotlin.test.assertEquals

@SpringBootTest(properties = ["spring.application.name=chorong-push-device-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class PushDeviceApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var jdbc: JdbcTemplate

    private fun user() = checkNotNull(users.saveAndFlush(UserEntity()).id)

    private fun uuid() = UUID.randomUUID().toString()

    private fun issue(
        userId: Long,
        device: String,
    ): TokenResponse = tokens.issue(userId, device)

    private fun register(
        token: TokenResponse,
        device: String,
        pushToken: String,
        expected: Int = 204,
    ) = mvc
        .put("/api/v1/push/devices") {
            header(HttpHeaders.AUTHORIZATION, "Bearer ${token.accessToken}")
            contentType = MediaType.APPLICATION_JSON
            content = mapper.writeValueAsString(mapOf("deviceUuid" to device, "platform" to "ANDROID", "pushToken" to pushToken))
        }.andExpect { status { isEqualTo(expected) } }

    private fun owner(device: String): Long? =
        jdbc
            .query("SELECT user_id FROM chorong_dev.push_device WHERE device_uuid=?", { rs, _ -> rs.getLong(1) }, device)
            .firstOrNull()

    @Test
    fun `device token upsert replaces token and platform`() {
        val userId = user()
        val device = uuid()
        val access = issue(userId, device)
        register(access, device, "push-token-first")
        mvc
            .put("/api/v1/push/devices") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${access.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content =
                    mapper.writeValueAsString(
                        mapOf("deviceUuid" to device.uppercase(), "platform" to "IOS", "pushToken" to "push-token-next"),
                    )
            }.andExpect { status { isNoContent() } }
        val row =
            jdbc.queryForMap(
                "SELECT user_id,device_uuid,platform,push_token FROM chorong_dev.push_device WHERE device_uuid=?",
                device,
            )
        assertEquals(userId, (row["user_id"] as Number).toLong())
        assertEquals("IOS", row["platform"])
        assertEquals("push-token-next", row["push_token"])
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.push_device WHERE device_uuid=?", Long::class.java, device))
    }

    @Test
    fun `session must own device and account switch transfers its push registration`() {
        val firstUser = user()
        val secondUser = user()
        val device = uuid()
        val first = issue(firstUser, device)
        val second = issue(secondUser, device)
        register(first, device, "first-account-token")
        register(first, uuid(), "wrong-device-token", expected = 401)
        register(second, device, "second-account-token")
        assertEquals(secondUser, owner(device))

        mvc
            .delete("/api/v1/push/devices/$device") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${first.accessToken}")
            }.andExpect { status { isNoContent() } }
        assertEquals(secondUser, owner(device))
        mvc
            .delete("/api/v1/push/devices/$device") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${second.accessToken}")
            }.andExpect { status { isNoContent() } }
        assertEquals(null, owner(device))
        mvc
            .delete("/api/v1/push/devices/$device") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${second.accessToken}")
            }.andExpect { status { isNoContent() } }
    }

    @Test
    fun `logout removes the current device push token and logout all removes all`() {
        val userId = user()
        val firstDevice = uuid()
        val secondDevice = uuid()
        val first = issue(userId, firstDevice)
        val second = issue(userId, secondDevice)
        register(first, firstDevice, "first-device-token")
        register(second, secondDevice, "second-device-token")

        mvc
            .post("/api/v1/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${first.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
            }.andExpect { status { isNoContent() } }
        assertEquals(null, owner(firstDevice))
        assertEquals(userId, owner(secondDevice))

        mvc
            .post("/api/v1/auth/logout") {
                header(HttpHeaders.AUTHORIZATION, "Bearer ${second.accessToken}")
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsString(mapOf("all" to true))
            }.andExpect { status { isNoContent() } }
        assertEquals(null, owner(secondDevice))
    }
}
