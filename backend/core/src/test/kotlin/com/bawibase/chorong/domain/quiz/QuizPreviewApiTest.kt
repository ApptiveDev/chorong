package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.repository.QuizAttemptRepository
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@SpringBootTest(properties = ["spring.profiles.active=prod"])
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class QuizPreviewApiTest {
    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var quizzes: QuizItemRepository

    @Autowired lateinit var attempts: QuizAttemptRepository

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var objectMapper: ObjectMapper

    private fun fixtures(): List<JsonNode> =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { objectMapper.readTree(it).toList() }

    private fun seed(
        fixture: JsonNode = fixtures().first(),
        lessonId: Long = 101,
        order: Int = fixture["quizOrder"].asInt(),
    ): QuizItemEntity =
        quizzes.saveAndFlush(
            QuizItemEntity(
                lessonId = lessonId,
                question = fixture["question"].asText(),
                instruction = fixture["instruction"].asText(),
                interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
                config = objectMapper.convertValue(fixture["config"], object : TypeReference<Map<String, Any?>>() {}),
                answer =
                    fixture["answer"].takeUnless { it.isNull }?.let {
                        objectMapper.convertValue(
                            it,
                            object : TypeReference<Map<String, Any?>>() {},
                        )
                    },
                explanation = fixture["explanation"].asText(),
                difficulty = fixture["difficulty"].asText(),
                quizOrder = order,
            ),
        )

    private fun check(
        id: Long,
        response: JsonNode,
        status: Int = 200,
    ): JsonNode {
        val result =
            mockMvc
                .post("/api/dev/quizzes/$id/check") {
                    contentType = MediaType.APPLICATION_JSON
                    content = objectMapper.writeValueAsString(mapOf("response" to response))
                }.andExpect { status { isEqualTo(status) } }
                .andReturn()
        return objectMapper.readTree(result.response.contentAsString)
    }

    @Test
    fun `anonymous reads filter lessons sort questions and hide answer and explanation`() {
        val later = seed(order = 20)
        val first = seed(order = 10)
        seed(lessonId = 202)
        val result = mockMvc.get("/api/dev/quizzes?lessonId=101").andExpect { status { isOk() } }.andReturn()
        val data = objectMapper.readTree(result.response.contentAsString)
        assertEquals(listOf(first.id, later.id), data.map { it["quizId"].asLong() })
        for (item in data) {
            assertFalse(item.has("answer"))
            assertFalse(item.has("explanation"))
        }
        mockMvc.get("/api/dev/quizzes/${first.id}").andExpect {
            status { isOk() }
            jsonPath("$.answer") { doesNotExist() }
            jsonPath("$.explanation") { doesNotExist() }
        }
    }

    @Test
    fun `all eight types can be checked anonymously without creating users or attempts`() {
        val beforeUsers = users.count()
        val beforeAttempts = attempts.count()
        val examples = fixtures()
        assertEquals(8, examples.map { it["interactionType"].asText() }.toSet().size)
        for (fixture in examples) {
            val quiz = seed(fixture)
            val result = check(checkNotNull(quiz.id), fixture["correctResponse"])
            assertEquals(setOf("graded", "correct", "completed", "explanation"), result.fieldNames().asSequence().toSet())
            assertTrue(result["completed"].asBoolean())
            if (quiz.interactionType == QuizInteractionType.FLIP_CARD) {
                assertFalse(result["graded"].asBoolean())
                assertTrue(result["correct"].isNull)
            } else {
                assertTrue(result["graded"].asBoolean())
                assertTrue(result["correct"].asBoolean())
            }
            assertEquals(quiz.explanation, result["explanation"].asText())
        }
        assertEquals(beforeUsers, users.count())
        assertEquals(beforeAttempts, attempts.count())
    }

    @Test
    fun `a valid wrong answer returns 200 and remains unsaved after repeated checks`() {
        val quiz = seed()
        val before = attempts.count()
        repeat(2) { assertFalse(check(checkNotNull(quiz.id), objectMapper.readTree("""{"value":1700}"""))["correct"].asBoolean()) }
        assertEquals(before, attempts.count())
    }

    @Test
    fun `invalid responses return 400 and create no attempts`() {
        val quiz = seed()
        val before = attempts.count()
        for (response in listOf("""{"value":1761}""", """{"value":"1760"}""", """{"value":1760,"extra":true}""", "null")) {
            assertEquals("INVALID_QUIZ_RESPONSE", check(checkNotNull(quiz.id), objectMapper.readTree(response), 400)["code"].asText())
        }
        mockMvc
            .post("/api/dev/quizzes/${quiz.id}/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"response":{"value":1700,"value":1760}}"""
            }.andExpect { status { isBadRequest() } }
        assertEquals(before, attempts.count())
    }

    @Test
    fun `nonpositive ids and missing quizzes keep existing API errors`() {
        mockMvc.get("/api/dev/quizzes?lessonId=0").andExpect { status { isBadRequest() } }
        mockMvc.get("/api/dev/quizzes/${Long.MAX_VALUE}").andExpect { status { isNotFound() } }
        check(Long.MAX_VALUE, objectMapper.readTree("""{"value":1760}"""), 404)
    }

    @Test
    fun `preview access never opens the authenticated submission API`() {
        val quiz = seed()
        mockMvc.get("/api/quizzes?lessonId=101").andExpect { status { isUnauthorized() } }
        mockMvc
            .post("/api/quizzes/${quiz.id}/attempts") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"response":{"value":1760}}"""
            }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `unusable stored data returns 409 without exposing answers`() {
        val quiz = seed()
        quiz.config = mapOf("min" to 1, "max" to 0, "step" to 1)
        quizzes.saveAndFlush(quiz)
        mockMvc.get("/api/dev/quizzes?lessonId=101").andExpect {
            status { isConflict() }
            jsonPath("$.code") { value("QUIZ_DATA_INVALID") }
            jsonPath("$.answer") { doesNotExist() }
        }
        check(checkNotNull(quiz.id), objectMapper.readTree("""{"value":1760}"""), 409)
    }

    @Test
    fun `preview openapi has no bearer requirement or attempt id`() {
        val response = mockMvc.get("/api-docs").andExpect { status { isOk() } }.andReturn()
        val docs = objectMapper.readTree(response.response.contentAsString)
        val operation = docs["paths"]["/api/dev/quizzes/{quizId}/check"]["post"]
        assertTrue(!operation.has("security") || operation["security"].isEmpty)
        val result = docs["components"]["schemas"]["QuizPreviewResponse"]["properties"]
        assertFalse(result.has("attemptId"))
    }

    @Test
    fun `preview validates stored types and values before converting a response`() {
        val quiz = seed()
        val original = quiz.config
        val beforeUsers = users.count()
        val beforeAttempts = attempts.count()
        for (change in listOf(mapOf("step" to 0), mapOf("showValue" to null), mapOf("min" to "1700"))) {
            quiz.config = original + change
            quizzes.saveAndFlush(quiz)
            val error = check(checkNotNull(quiz.id), objectMapper.readTree("""{"value":"1760"}"""), 409)
            assertEquals("QUIZ_DATA_INVALID", error["code"].asText())
        }
        quiz.config = original
        quizzes.saveAndFlush(quiz)
        val error = check(checkNotNull(quiz.id), objectMapper.readTree("""{"value":"1760"}"""), 400)
        assertEquals("INVALID_QUIZ_RESPONSE", error["code"].asText())
        assertEquals(beforeUsers, users.count())
        assertEquals(beforeAttempts, attempts.count())
    }
}
