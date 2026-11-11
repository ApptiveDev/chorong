package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.config.ApiExceptionHandler
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptRequest
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.entity.QuizJsonConverter
import com.bawibase.chorong.domain.quiz.model.ChosungUserResponse
import com.bawibase.chorong.domain.quiz.model.IndexUserResponse
import com.bawibase.chorong.domain.quiz.model.OxConfig
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows
import org.springframework.mock.web.MockHttpServletRequest
import java.math.BigDecimal
import kotlin.test.assertEquals
import kotlin.test.assertIs

class QuizModelConverterTest {
    private val mapper = jacksonObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
    private val converter = QuizModelConverter(mapper)
    private val database = QuizJsonConverter()
    private val mapType = object : TypeReference<Map<String, Any?>>() {}
    private val fixtures =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { mapper.readTree(it).toList() }

    private fun fixture(caseId: String): JsonNode = fixtures.first { it["caseId"].asText() == caseId }

    private fun jsonMap(node: JsonNode): Map<String, Any?> = mapper.convertValue(node, mapType)

    private fun entity(fixture: JsonNode): QuizItemEntity =
        QuizItemEntity(
            lessonId = 101L,
            question = fixture["question"].asText(),
            instruction = fixture["instruction"].asText(),
            interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
            config = jsonMap(fixture["config"]),
            answer = fixture["answer"].takeUnless { it.isNull }?.let(::jsonMap),
            explanation = fixture["explanation"].asText(),
            difficulty = fixture["difficulty"].asText(),
            quizOrder = fixture["quizOrder"].asInt(),
        )

    private fun assertJson(
        expected: JsonNode,
        actual: JsonNode,
    ) {
        when {
            expected.isNumber && actual.isNumber -> {
                assertEquals(0, expected.decimalValue().compareTo(actual.decimalValue()))
            }

            expected.isObject && actual.isObject -> {
                assertEquals(expected.fieldNames().asSequence().toSet(), actual.fieldNames().asSequence().toSet())
                expected.fields().forEachRemaining { (key, value) -> assertJson(value, actual[key]) }
            }

            expected.isArray && actual.isArray -> {
                assertEquals(expected.size(), actual.size())
                expected.forEachIndexed { index, value -> assertJson(value, actual[index]) }
            }

            else -> {
                assertEquals(expected, actual)
            }
        }
    }

    @Test
    fun `fixtures cover the seven simulator types`() {
        assertEquals(QuizInteractionType.entries.map { it.name }.toSet(), fixtures.map { it["interactionType"].asText() }.toSet())
    }

    @TestFactory
    fun `all fixtures retain their JSON fields and values through typed and database conversion`() =
        fixtures.map { fixture ->
            dynamicTest(fixture["caseId"].asText()) {
                val quiz = entity(fixture)
                val definition = converter.readDefinition(quiz)
                assertEquals(quiz.interactionType, definition.interactionType)
                val config = converter.writeConfig(definition.config)
                val answer = converter.writeAnswer(definition.answer)
                assertJson(fixture["config"], mapper.valueToTree(config))
                assertJson(fixture["answer"], mapper.valueToTree(answer))
                quiz.config = checkNotNull(database.convertToEntityAttribute(database.convertToDatabaseColumn(config)))
                quiz.answer = database.convertToEntityAttribute(database.convertToDatabaseColumn(answer))
                assertEquals(definition, converter.readDefinition(quiz))
                val response = converter.readResponse(definition, fixture["correctResponse"])
                assertJson(fixture["correctResponse"], mapper.valueToTree(converter.writeResponse(response)))
            }
        }

    @Test
    fun `ox config serializes as an empty object through the application mapper`() {
        assertEquals("{}", jacksonObjectMapper().writeValueAsString(OxConfig()))
        assertEquals(emptyMap(), converter.writeConfig(OxConfig()))
    }

    @TestFactory
    fun `unknown missing and explicit null stored fields are rejected`() =
        listOf(
            Triple("ox", """{"extra":true}""", null),
            Triple("single", """{}""", null),
            Triple("single", """{"options":["a","b"],"shuffle":true}""", null),
            Triple("single", """{"options":["a",null]}""", null),
            Triple("single", null, """{"answer":"1"}"""),
            Triple("single", null, """{"answer":1.0}"""),
            Triple("blank", """{"before":"앞","options":["a","b"]}""", null),
            Triple("slider", """{"ticks":["a","b"],"hint":null}""", null),
            Triple("slider", null, """{"answer":0.28}"""),
            Triple("chosung", null, """{"answer":"울트라마린"}"""),
            Triple("match", null, """{"pairs":[]}"""),
            Triple("match", """{"pairs":[["a",1],["b","c"]]}""", null),
        ).map { (caseId, config, answer) ->
            dynamicTest("$caseId $config $answer") {
                val quiz = entity(fixture(caseId))
                config?.let { quiz.config = jsonMap(mapper.readTree(it)) }
                answer?.let { quiz.answer = jsonMap(mapper.readTree(it)) }
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { converter.readDefinition(quiz) }.code)
            }
        }

    @Test
    fun `missing stored answer is rejected except for match`() {
        val single = entity(fixture("single")).apply { answer = null }
        assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { converter.readDefinition(single) }.code)
        converter.readDefinition(entity(fixture("match")))
    }

    @TestFactory
    fun `malformed responses do not coerce values or accept unknown fields`() =
        listOf(
            "ox" to """{"answer":"true"}""",
            "ox" to """{"answer":null}""",
            "single" to """{"answer":"1"}""",
            "single" to """{"answer":true}""",
            "single" to """{"answer":1,"extra":1}""",
            "multi" to """{"answers":1}""",
            "multi" to """{"answers":["1"]}""",
            "slider" to """{"answer":"0.3"}""",
            "slider" to """{"answer":true}""",
            "chosung" to """{"answer":1}""",
            "chosung" to """{"answer":null}""",
            "match" to """{"pairs":[["a",null]]}""",
            "match" to """{"pairs":"a"}""",
            "ox" to "[]",
            "ox" to "true",
        ).map { (caseId, response) ->
            dynamicTest("$caseId $response") {
                val definition = converter.readDefinition(entity(fixture(caseId)))
                assertEquals(
                    ErrorCode.INVALID_QUIZ_RESPONSE,
                    assertThrows<ApiException> { converter.readResponse(definition, mapper.readTree(response)) }.code,
                )
            }
        }

    @Test
    fun `high precision slider positions survive request and database conversions`() {
        val value = BigDecimal("0.12345678901234567890123456789")
        val definition = assertIs<SliderQuizDefinition>(converter.readDefinition(entity(fixture("slider"))))
        val request = mapper.readValue<QuizAttemptRequest>("{\"response\":{\"answer\":$value}}")
        val response = assertIs<SliderUserResponse>(converter.readResponse(definition, request.response))
        assertEquals(value, response.answer)
        val stored = database.convertToEntityAttribute(database.convertToDatabaseColumn(converter.writeResponse(response)))
        assertEquals(value, stored?.get("answer"))
        assertEquals(value, assertIs<SliderUserResponse>(converter.readStoredResponse(definition, checkNotNull(stored))).answer)
    }

    @Test
    fun `request type hints cannot override the database quiz type`() {
        val request = mapper.readValue<QuizAttemptRequest>("{\"interactionType\":\"CHOSUNG\",\"userId\":123,\"response\":{\"answer\":1}}")
        val single = converter.readDefinition(entity(fixture("single")))
        assertIs<IndexUserResponse>(converter.readResponse(single, request.response))
        val chosung = converter.readDefinition(entity(fixture("chosung")))
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, assertThrows<ApiException> { converter.readResponse(chosung, request.response) }.code)
    }

    @Test
    fun `strict converter settings do not mutate the application mapper or hide null map entries`() {
        val applicationMapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        applicationMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL)
        val isolated = QuizModelConverter(applicationMapper)
        assertEquals("1", applicationMapper.readValue<ChosungUserResponse>("{\"answer\":1,\"extra\":true}").answer)
        val quiz = entity(fixture("chosung"))
        val definition = isolated.readDefinition(quiz)
        assertEquals(
            ErrorCode.INVALID_QUIZ_RESPONSE,
            assertThrows<ApiException> { isolated.readResponse(definition, mapper.readTree("{\"answer\":1}")) }.code,
        )
        quiz.config = quiz.config + ("extra" to null)
        assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { isolated.readDefinition(quiz) }.code)
    }

    @Test
    fun `conversion errors use the existing 400 and 409 handler without exposing raw values`() {
        val quiz = entity(fixture("single"))
        val definition = converter.readDefinition(quiz)
        val submitted = assertThrows<ApiException> { converter.readResponse(definition, mapper.readTree("{\"answer\":\"wrong\"}")) }
        quiz.answer = mapOf("answer" to "wrong")
        val stored = assertThrows<ApiException> { converter.readDefinition(quiz) }
        val handler = ApiExceptionHandler()
        for ((error, status) in listOf(submitted to 400, stored to 409)) {
            val response = handler.handleApi(error, MockHttpServletRequest())
            assertEquals(status, response.statusCode.value())
            assertEquals(error.code.name, response.body?.get("code"))
            assertEquals(emptyMap<String, Any?>(), response.body?.get("details"))
        }
    }

    @TestFactory
    fun `malformed envelopes and duplicate keys fail in the existing request parser`() =
        listOf(
            "{",
            "[]",
            "{}",
            "{\"response\":{\"answer\":1,\"answer\":2}}",
            "{\"response\":{\"answer\":1},\"response\":{\"answer\":2}}",
        ).map { json ->
            dynamicTest(json) {
                assertThrows<JsonProcessingException> { mapper.readValue<QuizAttemptRequest>(json) }
            }
        }
}
