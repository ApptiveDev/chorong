package com.bawibase.chorong.domain.note.controller

import com.bawibase.chorong.TestcontainersConfig
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.yaml.snakeyaml.Yaml
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig::class)
class NoteControllerTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `health responds ok`() {
        mockMvc.get("/api/health").andExpect {
            status { isOk() }
            jsonPath("$.status") { value("ok") }
        }
    }

    @Test
    fun `api docs and scalar page are served`() {
        mockMvc.get("/api-docs").andExpect {
            status { isOk() }
            jsonPath("$.paths['/api/housing/me']") { exists() }
            jsonPath("$.components.securitySchemes.bearer.scheme") { value("bearer") }
        }
        mockMvc.get("/docs").andExpect {
            status { isFound() }
            redirectedUrl("/docs/index.html")
        }
        mockMvc.get("/docs/index.html").andExpect {
            status { isOk() }
            content { string(org.hamcrest.Matchers.containsString("createApiReference")) }
            content { string(org.hamcrest.Matchers.containsString("0.4.0")) }
            content { string(org.hamcrest.Matchers.containsString("/docs/openapi.yaml")) }
        }
    }

    @Test
    fun `v1 target contract preserves operation ids methods and paths and is served unchanged`() {
        val root =
            generateSequence(File(System.getProperty("user.dir")).absoluteFile) { it.parentFile }
                .firstOrNull { File(it, "docs/openapi2.yaml").isFile }
        assertNotNull(root, "docs/openapi2.yaml을 찾을 수 없습니다")
        val expectedBytes = File(root, "docs/openapi2.yaml").readBytes()
        val served =
            mockMvc
                .get("/docs/openapi.yaml")
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsByteArray
        assertTrue(expectedBytes.contentEquals(served), "런타임 명세가 docs/openapi2.yaml과 다릅니다")

        val document = Yaml().load<Map<String, Any>>(expectedBytes.inputStream())
        assertEquals("0.4.0", (document["info"] as Map<*, *>)["version"])
        val paths = document["paths"] as Map<*, *>
        val operations = mutableListOf<Triple<String, String, String>>()
        for ((path, pathItem) in paths) {
            for ((method, value) in pathItem as Map<*, *>) {
                if (method !in setOf("get", "post", "put", "patch", "delete", "options", "head", "trace")) continue
                val operationId = (value as Map<*, *>)["operationId"] as? String
                assertNotNull(operationId, "$method $path operationId 누락")
                operations += Triple(operationId, (method as String).uppercase(), path as String)
            }
        }
        assertEquals(47, operations.size)
        assertEquals(operations.size, operations.map { it.first }.toSet().size, "operationId 중복")
        val expected =
            """
            API-101 POST /auth/guest
            API-102 POST /auth/email/signup
            API-103 POST /auth/email/verify
            API-104 POST /auth/email/login
            API-105 POST /auth/oauth/{provider}
            API-106 POST /auth/token/refresh
            API-107 POST /auth/logout
            API-108 POST /auth/link/{provider}
            API-109 DELETE /auth/link/{provider}
            API-110 DELETE /users/me
            API-201 GET /users/me
            API-202 PATCH /users/me
            API-301 PUT /push/devices
            API-302 DELETE /push/devices/{deviceUuid}
            API-401 GET /courses
            API-402 GET /courses/{courseId}
            API-403 GET /lessons/{lessonId}
            API-404 POST /lessons/{lessonId}/start
            API-405 POST /contents/{contentId}/complete
            API-406 POST /quizzes/{quizId}/answer
            API-407 POST /lessons/{lessonId}/complete
            API-408 GET /users/me/progress
            API-501 GET /reviews/next
            API-502 POST /reviews/{reviewItemId}/answer
            API-503 POST /reviews/complete
            API-601 GET /onboarding
            API-602 POST /onboarding/complete
            API-701 GET /housings/me
            API-702 PUT /housings/me/placements
            API-703 PATCH /housings/me
            API-704 PATCH /housings/me/avatar
            API-801 GET /housings/explore
            API-802 GET /housings/{housingId}
            API-803 POST /housings/{housingId}/like
            API-804 DELETE /housings/{housingId}/like
            API-805 POST /reports
            API-806 POST /blocks/{userId}
            API-807 DELETE /blocks/{userId}
            API-808 GET /blocks
            API-901 GET /shop/items
            API-902 GET /shop/items/{itemId}
            API-903 POST /shop/purchases
            API-904 GET /users/me/wallet
            API-905 GET /users/me/rewards
            API-906 GET /constellations
            API-907 GET /users/me/inventory
            API-908 GET /users/me/artworks
            """.trimIndent()
                .lines()
                .map { line ->
                    val (id, method, path) = line.split(" ")
                    Triple(id, method, path)
                }.toSet()
        assertEquals(expected, operations.toSet())
    }

    @Test
    fun `create then list then delete`() {
        val location =
            mockMvc
                .post("/api/notes") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"title":"첫 메모","body":"내용"}"""
                }.andExpect {
                    status { isCreated() }
                    jsonPath("$.title") { value("첫 메모") }
                }.andReturn()
                .response.contentAsString

        val id = Regex("\"id\":(\\d+)").find(location)!!.groupValues[1]

        mockMvc.get("/api/notes").andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(id.toInt()) }
        }

        mockMvc.delete("/api/notes/$id").andExpect { status { isNoContent() } }
        mockMvc.get("/api/notes/$id").andExpect { status { isNotFound() } }
    }

    @Test
    fun `blank title is rejected`() {
        mockMvc
            .post("/api/notes") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"title":""}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.fields.title") { exists() }
            }
    }
}
