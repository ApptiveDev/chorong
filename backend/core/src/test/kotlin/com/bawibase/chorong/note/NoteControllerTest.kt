package com.bawibase.chorong.note

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
    fun `create then list then delete`() {
        val location = mockMvc.post("/api/notes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"첫 메모","body":"내용"}"""
        }.andExpect {
            status { isCreated() }
            jsonPath("$.title") { value("첫 메모") }
        }.andReturn().response.contentAsString

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
        mockMvc.post("/api/notes") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":""}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.fields.title") { exists() }
        }
    }
}
