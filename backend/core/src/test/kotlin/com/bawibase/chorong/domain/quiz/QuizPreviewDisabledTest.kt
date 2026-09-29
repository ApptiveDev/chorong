package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.TestcontainersConfig
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
abstract class QuizPreviewUnavailableTest {
    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `unavailable preview cannot be opened anonymously or with an authorization header`() {
        for (path in listOf("/api/dev/quizzes?lessonId=101", "/api/dev/quizzes/1")) {
            mockMvc.get(path).andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("QUIZ_PREVIEW_DISABLED") }
            }
            mockMvc.get(path) { header(HttpHeaders.AUTHORIZATION, "Bearer invalid") }.andExpect { status { isNotFound() } }
        }
        mockMvc
            .post("/api/dev/quizzes/1/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"response":{"value":1760}}"""
            }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `disabled preview is absent from API documentation`() {
        mockMvc.get("/api-docs").andExpect {
            status { isOk() }
            jsonPath("$.paths['/api/dev/quizzes']") { doesNotExist() }
            jsonPath("$.paths['/api/dev/quizzes/{quizId}/check']") { doesNotExist() }
        }
    }
}

@SpringBootTest(properties = ["app.quiz-preview.enabled=false"])
class QuizPreviewDisabledTest : QuizPreviewUnavailableTest()

@SpringBootTest(
    properties = [
        "app.quiz-preview.enabled=true",
        "spring.jpa.properties.hibernate.default_schema=chorong_prod",
        "spring.flyway.schemas=chorong_prod",
        "spring.flyway.default-schema=chorong_prod",
    ],
)
class QuizPreviewProductionTest : QuizPreviewUnavailableTest()
