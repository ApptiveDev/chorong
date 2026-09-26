package com.bawibase.chorong.config

import com.bawibase.chorong.TestcontainersConfig
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig::class)
class RequestIdFilterTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `echoes client request id`() {
        val result =
            mockMvc
                .get("/api/health") { header(RequestIdFilter.HEADER, "abc-123") }
                .andExpect { status { isOk() } }
                .andReturn()
        assertEquals("abc-123", result.response.getHeader(RequestIdFilter.HEADER))
    }

    @Test
    fun `generates request id when absent`() {
        val result = mockMvc.get("/api/health").andExpect { status { isOk() } }.andReturn()
        val id = result.response.getHeader(RequestIdFilter.HEADER)
        assertTrue(!id.isNullOrBlank(), "X-Request-Id 가 비어 있다")
    }
}
