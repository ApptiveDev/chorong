package com.bawibase.chorong.domain.auth

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.dto.DevicePlatform
import com.bawibase.chorong.domain.auth.repository.GuestDeviceRepository
import com.bawibase.chorong.domain.auth.service.AuthService
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.user.AuthProvider
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
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.application.name=chorong-guest-auth-test"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
class GuestAuthApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var devices: GuestDeviceRepository

    @Autowired lateinit var legacy: AuthService

    @Autowired lateinit var decoder: JwtDecoder

    @MockitoSpyBean lateinit var tokens: TokenService

    private val path = "/api/v1/auth/guest"
    private val tables =
        listOf(
            "app_user",
            "user_auth",
            "auth_guest",
            "user_refresh_token",
            "user_wallet",
            "housing_profile",
            "housing_owned_item",
            "housing_room_layout",
            "housing_layout_surface_skin",
        )

    @BeforeEach fun defaults() {
        for (table in listOf("housing_background", "housing_wall", "housing_floor", "housing_avatar", "housing_room")) {
            jdbc.update("UPDATE chorong_dev.$table SET is_default=false")
            jdbc.update(
                """INSERT INTO chorong_dev.$table(code,name,is_default,is_active) VALUES ('guest_default','기본',true,true)
                ON CONFLICT(code) DO UPDATE SET is_default=true,is_active=true""",
            )
        }
        jdbc.update("UPDATE chorong_dev.housing_furniture SET is_default=false")
        val room = jdbc.queryForObject("SELECT room_id FROM chorong_dev.housing_room WHERE code='guest_default'", Long::class.java)!!
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

    private fun body(
        uuid: String,
        platform: String = "IOS",
    ) = mapper.writeValueAsString(mapOf("deviceUuid" to uuid, "platform" to platform))

    private fun post(
        uuid: String,
        platform: String = "IOS",
        expected: Int = 200,
    ): JsonNode {
        val response =
            mvc
                .post(path) {
                    contentType = MediaType.APPLICATION_JSON
                    content = body(uuid, platform)
                }.andExpect { status { isEqualTo(expected) } }
                .andReturn()
                .response
        return mapper.readTree(response.contentAsByteArray)
    }

    private fun snapshot() = tables.associateWith { jdbc.queryForObject("SELECT count(*) FROM chorong_dev.$it", Long::class.java)!! }

    @Test fun `new guest initializes account metadata home avatar and wallet and returns usable tokens`() {
        val uuid = UUID.randomUUID().toString()
        val data = post(uuid)["data"]
        val id = data["user"]["userId"].asLong()
        assertTrue(data["isNew"].asBoolean())
        assertEquals("GUEST", data["user"]["status"].asText())
        assertEquals("게스트", data["user"]["nickname"].asText())
        assertFalse(data.has("created"))
        assertEquals(id.toString(), decoder.decode(data["accessToken"].asText()).subject)
        assertTrue(data["expiresIn"].asLong() > 0)
        val auth = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GUEST, uuid))
        assertEquals(DevicePlatform.IOS, devices.findById(checkNotNull(auth.id)).orElseThrow().platform)
        val profileSql = "SELECT count(*) FROM chorong_dev.housing_profile WHERE user_id=? AND active_room_id IS NOT NULL"
        val layoutSql = "SELECT count(*) FROM chorong_dev.housing_room_layout WHERE user_id=? AND avatar_id IS NOT NULL"
        assertEquals(1L, jdbc.queryForObject(profileSql, Long::class.java, id))
        assertEquals(1L, jdbc.queryForObject(layoutSql, Long::class.java, id))
        val skinsSql =
            """
            SELECT count(*) FROM chorong_dev.housing_layout_surface_skin s
            JOIN chorong_dev.housing_room_layout l ON l.layout_id=s.layout_id
            WHERE l.user_id=?
            """.trimIndent()
        assertEquals(2L, jdbc.queryForObject(skinsSql, Long::class.java, id))
        assertEquals(5L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.housing_owned_item WHERE user_id=?", Long::class.java, id))
        assertEquals(0L, jdbc.queryForObject("SELECT coin FROM chorong_dev.user_wallet WHERE user_id=?", Long::class.java, id))
        assertEquals(
            uuid,
            jdbc.queryForObject("SELECT device_uuid FROM chorong_dev.user_refresh_token WHERE user_id=?", String::class.java, id),
        )
        mvc
            .get("/api/auth/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${data["accessToken"].asText()}") }
            .andExpect {
                status { isOk() }
                jsonPath("$.userId") { value(id) }
                jsonPath("$.nickname") { value("게스트") }
            }
        mvc
            .get("/api/v1/users/me") { header(HttpHeaders.AUTHORIZATION, "Bearer ${data["accessToken"].asText()}") }
            .andExpect {
                status { isOk() }
                jsonPath("$.data.nickname") { value("게스트") }
            }
    }

    @Test fun `repeat login canonicalizes UUID and updates platform without resetting assets`() {
        val uuid = UUID.randomUUID().toString()
        val first = post(uuid)["data"]
        val id = first["user"]["userId"].asLong()
        jdbc.update("UPDATE chorong_dev.user_wallet SET coin=321 WHERE user_id=?", id)
        val before = snapshot()
        val layout = jdbc.queryForList("SELECT * FROM chorong_dev.housing_room_layout WHERE user_id=?", id)
        val second = post(uuid.uppercase(), "ANDROID")["data"]
        assertFalse(second["isNew"].asBoolean())
        assertEquals(id, second["user"]["userId"].asLong())
        assertNotEquals(first["refreshToken"].asText(), second["refreshToken"].asText())
        assertEquals(before + ("user_refresh_token" to before.getValue("user_refresh_token") + 1), snapshot())
        assertEquals(layout, jdbc.queryForList("SELECT * FROM chorong_dev.housing_room_layout WHERE user_id=?", id))
        assertEquals(321L, jdbc.queryForObject("SELECT coin FROM chorong_dev.user_wallet WHERE user_id=?", Long::class.java, id))
        val auth = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GUEST, uuid))
        assertEquals(DevicePlatform.ANDROID, devices.findById(checkNotNull(auth.id)).orElseThrow().platform)
    }

    @Test fun `existing legacy guest is reused and missing starter assets are initialized`() {
        val uuid = UUID.randomUUID().toString()
        val old = legacy.guestSignUp(uuid)
        val oldId = decoder.decode(old.accessToken).subject.toLong()
        val data = post(uuid)["data"]
        assertFalse(data["isNew"].asBoolean())
        assertEquals(oldId, data["user"]["userId"].asLong())
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.housing_profile WHERE user_id=?", Long::class.java, oldId))
        mvc
            .post("/api/auth/guest/signup") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    mapper.writeValueAsString(mapOf("deviceUuid" to uuid.uppercase()))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("DEVICE_ALREADY_REGISTERED") }
            }
    }

    @Test fun `malformed UUID missing fields unsupported platform and malformed JSON do not create accounts`() {
        val before = snapshot()
        val invalid =
            listOf(
                body("not-a-uuid"),
                body("1-2-3-4-5"),
                body(" " + UUID.randomUUID()),
                body(UUID.randomUUID().toString(), "WEB"),
                body(UUID.randomUUID().toString(), "ios"),
                "{}",
                "{",
                "[]",
                mapper.writeValueAsString(mapOf("deviceUuid" to UUID.randomUUID().toString())),
                mapper.writeValueAsString(mapOf("platform" to "IOS")),
                mapper.writeValueAsString(mapOf("deviceUuid" to null, "platform" to "IOS")),
            )
        for (input in invalid) {
            mvc
                .post(path) {
                    contentType = MediaType.APPLICATION_JSON
                    content = input
                }.andExpect {
                    status { isBadRequest() }
                    jsonPath("$.error.code") { value("VALIDATION_FAILED") }
                }
        }
        assertEquals(before, snapshot())
    }

    @Test fun `missing each required default rolls back user auth metadata and all assets`() {
        for (table in listOf("housing_room", "housing_background", "housing_avatar", "housing_wall", "housing_floor")) {
            val before = snapshot()
            jdbc.update("UPDATE chorong_dev.$table SET is_default=false")
            try {
                val error = post(UUID.randomUUID().toString(), expected = 409)
                assertEquals("CONFLICT", error["error"]["code"].asText())
                assertEquals(before, snapshot())
            } finally {
                jdbc.update("UPDATE chorong_dev.$table SET is_default=true WHERE code='guest_default'")
            }
        }
    }

    @Test fun `failed initialization preserves an existing legacy account and old tokens`() {
        val uuid = UUID.randomUUID().toString()
        legacy.guestSignUp(uuid)
        val before = snapshot()
        jdbc.update("UPDATE chorong_dev.housing_avatar SET is_default=false")
        assertEquals("CONFLICT", post(uuid, expected = 409)["error"]["code"].asText())
        assertEquals(before, snapshot())
    }

    @Test fun `late token issuance failure rolls back initialized home and wallet too`() {
        val before = snapshot()
        doThrow(IllegalStateException("planned token failure")).`when`(tokens).issue(anyLong(), anyString(), anyBoolean())
        val response = post(UUID.randomUUID().toString(), expected = 500)
        assertEquals("INTERNAL", response["error"]["code"].asText())
        assertEquals(before, snapshot())
    }

    @Test fun `initialized guest can log in even if current default catalog is missing`() {
        val uuid = UUID.randomUUID().toString()
        val first = post(uuid)["data"]
        jdbc.update("UPDATE chorong_dev.housing_avatar SET is_default=false")
        assertEquals(first["user"]["userId"], post(uuid)["data"]["user"]["userId"])
    }

    @Test fun `withdrawn guest is not recreated and metadata and tokens stay unchanged`() {
        val uuid = UUID.randomUUID().toString()
        val id = post(uuid)["data"]["user"]["userId"].asLong()
        jdbc.update("UPDATE chorong_dev.app_user SET status='WITHDRAWN' WHERE user_id=?", id)
        val before = snapshot()
        assertEquals("UNAUTHORIZED", post(uuid, "ANDROID", 401)["error"]["code"].asText())
        assertEquals(before, snapshot())
        val auth = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.GUEST, uuid))
        assertEquals(DevicePlatform.IOS, devices.findById(checkNotNull(auth.id)).orElseThrow().platform)
    }

    @Test fun `ambiguous historical UUID casing is rejected without choosing an account`() {
        val uuid = "a" + UUID.randomUUID().toString().drop(1)
        post(uuid)
        val extra = users.saveAndFlush(UserEntity())
        auths.saveAndFlush(UserAuthEntity(checkNotNull(extra.id), AuthProvider.GUEST, uuid.uppercase()))
        val before = snapshot()
        assertEquals("CONFLICT", post(uuid, expected = 409)["error"]["code"].asText())
        assertEquals(before, snapshot())
    }

    @Test fun `six concurrent requests create exactly one account and starter asset set`() {
        val uuid = UUID.randomUUID().toString()
        val before = snapshot()
        val pool = Executors.newFixedThreadPool(6)
        val barrier = CyclicBarrier(6)
        try {
            val futures =
                (1..6).map {
                    pool.submit<JsonNode> {
                        barrier.await(15, TimeUnit.SECONDS)
                        post(uuid)["data"]
                    }
                }
            val results = futures.map { it.get(45, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it["isNew"].asBoolean() })
            assertEquals(1, results.map { it["user"]["userId"].asLong() }.toSet().size)
            val after = snapshot()
            for (table in listOf("app_user", "user_auth", "auth_guest", "user_wallet", "housing_profile", "housing_room_layout")) {
                assertEquals(before.getValue(table) + 1, after.getValue(table), table)
            }
            assertEquals(before.getValue("user_refresh_token") + 6, after.getValue("user_refresh_token"))
        } finally {
            pool.shutdownNow()
        }
    }

    @Test fun `legacy and v1 concurrent signup share the same device lock`() {
        val uuid = UUID.randomUUID().toString()
        val before = snapshot()
        val pool = Executors.newFixedThreadPool(2)
        val barrier = CyclicBarrier(2)
        try {
            val old =
                pool.submit<Int> {
                    barrier.await(15, TimeUnit.SECONDS)
                    mvc
                        .post("/api/auth/guest/signup") {
                            contentType = MediaType.APPLICATION_JSON
                            content =
                                mapper.writeValueAsString(mapOf("deviceUuid" to uuid.uppercase()))
                        }.andReturn()
                        .response.status
                }
            val newer =
                pool.submit<JsonNode> {
                    barrier.await(15, TimeUnit.SECONDS)
                    post(uuid)["data"]
                }
            assertTrue(old.get(45, TimeUnit.SECONDS) in listOf(201, 409))
            val id = newer.get(45, TimeUnit.SECONDS)["user"]["userId"].asLong()
            assertEquals(before.getValue("app_user") + 1, snapshot().getValue("app_user"))
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM chorong_dev.housing_profile WHERE user_id=?", Long::class.java, id))
        } finally {
            pool.shutdownNow()
        }
    }
}
