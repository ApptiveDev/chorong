package com.bawibase.chorong.domain.notification

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.AuthService
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class NotificationApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var auth: AuthService

    @Autowired lateinit var decoder: JwtDecoder

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var mapper: ObjectMapper

    private data class Member(
        val id: Long,
        val token: String,
    )

    /** 공개 우주선을 가진 회원. 닉네임을 정해 둔다. */
    private fun member(nickname: String): Member {
        val token = auth.passwordSignUp("n-${UUID.randomUUID()}@example.com", "password-1234!", null).accessToken
        val id = decoder.decode(token).subject.toLong()
        jdbc.update("UPDATE app_user SET nickname=? WHERE user_id=?", nickname, id)
        jdbc.update("INSERT INTO housing_profile(user_id) VALUES (?) ON CONFLICT DO NOTHING", id)
        return Member(id, token)
    }

    private fun like(
        from: Member,
        to: Member,
    ) = mvc
        .post("/api/v1/housings/${to.id}/like") { header(HttpHeaders.AUTHORIZATION, "Bearer ${from.token}") }
        .andExpect { status { isOk() } }

    private fun unlike(
        from: Member,
        to: Member,
    ) = mvc
        .delete("/api/v1/housings/${to.id}/like") { header(HttpHeaders.AUTHORIZATION, "Bearer ${from.token}") }
        .andExpect { status { isOk() } }

    private fun list(
        owner: Member,
        query: String = "",
    ): JsonNode =
        mapper.readTree(
            mvc
                .get("/api/v1/notifications$query") { header(HttpHeaders.AUTHORIZATION, "Bearer ${owner.token}") }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString,
        )

    private fun hasUnread(owner: Member): Boolean =
        mapper
            .readTree(
                mvc
                    .get("/api/v1/users/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${owner.token}") }
                    .andReturn()
                    .response.contentAsString,
            )["data"]["hasUnreadNotifications"]
            .asBoolean()

    @Test fun `like creates one notification that survives unlike and can be read`() {
        val owner = member("주인")
        val fan = member("팬")
        assertFalse(hasUnread(owner))

        like(fan, owner)
        unlike(fan, owner)
        like(fan, owner)
        unlike(fan, owner)

        val items = list(owner)["data"]["notifications"]
        assertEquals(1, items.size())
        val item = items[0]
        assertEquals("HOUSING_LIKE", item["type"].asText())
        assertEquals(fan.id, item["actor"]["userId"].asLong())
        assertEquals("팬", item["actor"]["nickname"].asText())
        assertFalse(item["read"].asBoolean())
        assertTrue(hasUnread(owner))

        val id = item["notificationId"].asLong()
        repeat(2) {
            mvc
                .post("/api/v1/notifications/$id/read") { header(HttpHeaders.AUTHORIZATION, "Bearer ${owner.token}") }
                .andExpect { status { isNoContent() } }
        }
        assertTrue(list(owner)["data"]["notifications"][0]["read"].asBoolean())
        assertFalse(hasUnread(owner))
        // 좋아요를 누른 쪽에는 알림이 없다.
        assertEquals(0, list(fan)["data"]["notifications"].size())
    }

    @Test fun `others cannot read my notification and guests cannot open the inbox`() {
        val owner = member("주인")
        val fan = member("팬")
        like(fan, owner)
        val id = list(owner)["data"]["notifications"][0]["notificationId"].asLong()

        mvc
            .post("/api/v1/notifications/$id/read") { header(HttpHeaders.AUTHORIZATION, "Bearer ${fan.token}") }
            .andExpect {
                status { isNotFound() }
                jsonPath("$.error.code") { value("NOT_FOUND") }
            }
        val guest = auth.guestSignUp(UUID.randomUUID().toString()).accessToken
        mvc.get("/api/v1/notifications") { header(HttpHeaders.AUTHORIZATION, "Bearer $guest") }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("MEMBER_ONLY") }
        }
    }

    @Test fun `old blocked and withdrawn senders are hidden from list and dot`() {
        val owner = member("주인")
        val old = member("오래됨")
        val blocked = member("차단")
        val gone = member("탈퇴")
        listOf(old, blocked, gone).forEach { like(it, owner) }
        jdbc.update(
            "UPDATE user_notification SET created_at=now() - interval '31 days' WHERE user_id=? AND actor_user_id=?",
            owner.id,
            old.id,
        )
        jdbc.update("INSERT INTO user_block(user_id,blocked_user_id) VALUES (?,?)", blocked.id, owner.id)
        jdbc.update("UPDATE app_user SET status='WITHDRAWN' WHERE user_id=?", gone.id)

        assertEquals(0, list(owner)["data"]["notifications"].size())
        assertFalse(hasUnread(owner))
    }

    @Test fun `list is newest first with cursor pages`() {
        val owner = member("주인")
        val fans = (1..3).map { member("팬$it") }
        fans.forEachIndexed { i, fan ->
            like(fan, owner)
            jdbc.update(
                "UPDATE user_notification SET created_at=now() - make_interval(mins => ?) WHERE actor_user_id=?",
                10 - i,
                fan.id,
            )
        }

        val first = list(owner, "?size=2")
        assertEquals(listOf("팬3", "팬2"), first["data"]["notifications"].map { it["actor"]["nickname"].asText() })
        val cursor = first["meta"]["nextCursor"].asText()
        val second = list(owner, "?size=2&cursor=$cursor")
        assertEquals(listOf("팬1"), second["data"]["notifications"].map { it["actor"]["nickname"].asText() })
        assertTrue(second["meta"]["nextCursor"].isNull)
    }
}
