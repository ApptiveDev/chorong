package com.bawibase.chorong.domain.community

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.UserStatus
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
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import kotlin.test.assertEquals

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class HousingReportApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var mapper: ObjectMapper

    private fun activeUser(): Pair<Long, String> {
        val userId = checkNotNull(users.saveAndFlush(UserEntity().apply { status = UserStatus.ACTIVE }).id)
        return userId to tokens.issue(userId, UUID.randomUUID().toString()).accessToken
    }

    private fun report(
        token: String,
        body: Map<String, Any?>,
    ) = mvc.post("/api/v1/reports") {
        header(HttpHeaders.AUTHORIZATION, "Bearer $token")
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsString(body)
    }

    private fun stored(reportId: Long): Map<String, Any?> =
        jdbc.queryForMap("SELECT reason, detail FROM housing_report WHERE report_id=?", reportId)

    @Test
    fun `free text detail is required and reason defaults to OTHER`() {
        val (targetId, _) = activeUser()
        val (_, reporter) = activeUser()

        for (detail in listOf(null, "", "   ", "가".repeat(256))) {
            report(reporter, mapOf("housingId" to targetId, "detail" to detail)).andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("VALIDATION_FAILED") }
                jsonPath("$.error.fields[0].field") { value("detail") }
            }
        }
        report(reporter, mapOf("housingId" to targetId, "reason" to "UNKNOWN", "detail" to "사유")).andExpect {
            status { isBadRequest() }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM housing_report WHERE housing_user_id=?", Int::class.java, targetId))

        val response =
            report(reporter, mapOf("housingId" to targetId, "detail" to "  이름이 불쾌해요  "))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val reportId = mapper.readTree(response)["data"]["reportId"].asLong()
        assertEquals(mapOf("reason" to "OTHER", "detail" to "이름이 불쾌해요"), stored(reportId))
    }

    @Test
    fun `reason is kept when sent and detail may be exactly 255 characters`() {
        val (targetId, _) = activeUser()
        val (_, reporter) = activeUser()
        val detail = "가".repeat(255)

        val response =
            report(reporter, mapOf("housingId" to targetId, "reason" to "SPAM", "detail" to detail))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val reportId = mapper.readTree(response)["data"]["reportId"].asLong()
        assertEquals(mapOf("reason" to "SPAM", "detail" to detail), stored(reportId))
    }

    @Test
    fun `older reports without detail stay readable`() {
        val (targetId, _) = activeUser()
        val (reporterId, _) = activeUser()
        jdbc.update(
            "INSERT INTO housing_report(housing_user_id,reporter_user_id,reason,detail) VALUES (?,?,'ABUSE',NULL)",
            targetId,
            reporterId,
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM housing_report WHERE housing_user_id=? AND detail IS NULL",
                Int::class.java,
                targetId,
            ),
        )
    }
}
