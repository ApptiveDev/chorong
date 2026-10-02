package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.config.ApiExceptionHandler
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptRequest
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.entity.QuizJsonConverter
import com.bawibase.chorong.domain.quiz.model.ExactSliderAnswer
import com.bawibase.chorong.domain.quiz.model.FlipCardQuizDefinition
import com.bawibase.chorong.domain.quiz.model.FlipCardUserResponse
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeUserResponse
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows
import org.springframework.mock.web.MockHttpServletRequest
import java.math.BigDecimal
import kotlin.test.assertEquals
import kotlin.test.assertFalse
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

    @TestFactory
    fun `malformed responses do not coerce values or accept unknown fields`() =
        listOf(
            "slider_exact" to "null",
            "slider_exact" to "[]",
            "slider_exact" to "true",
            "slider_exact" to "{}",
            "slider_exact" to "{\"value\":null}",
            "slider_exact" to "{\"value\":\"1760\"}",
            "slider_exact" to "{\"value\":\"\"}",
            "slider_exact" to "{\"value\":true}",
            "slider_exact" to "{\"value\":[1760]}",
            "slider_exact" to "{\"value\":1760,\"extra\":true}",
            "swipe" to "{}",
            "swipe" to "{\"value\":null}",
            "swipe" to "{\"value\":1}",
            "swipe" to "{\"value\":1.5}",
            "swipe" to "{\"value\":true}",
            "tap_multiple" to "{\"selectedItemIds\":\"humanism\"}",
            "tap_multiple" to "{\"selectedItemIds\":[1]}",
            "tap_multiple" to "{\"selectedItemIds\":[true]}",
            "tap_multiple" to "{\"selectedItemIds\":[null]}",
            "tap_multiple" to "{\"selectedItemIds\":[[]]}",
            "tap_multiple" to "{\"selectedOptionIds\":[\"humanism\"]}",
            "multiple_choice_single" to "{\"selectedOptionIds\":null}",
            "multiple_choice_single" to "{\"selectedOptionIds\":[{},\"italy\"]}",
            "sort" to "{\"order\":\"renaissance\"}",
            "sort" to "{\"order\":[false]}",
            "matching" to "{\"matches\":[]}",
            "matching" to "{\"matches\":{\"newton\":null}}",
            "matching" to "{\"matches\":{\"newton\":1}}",
            "matching" to "{\"matches\":{\"newton\":true}}",
            "drag_drop" to "{\"placements\":{\"newton\":[]}}",
            "drag_drop" to "{\"placements\":{\"newton\":{}}}",
            "flip_card" to "{}",
            "flip_card" to "{\"flipped\":null}",
            "flip_card" to "{\"flipped\":\"true\"}",
            "flip_card" to "{\"flipped\":1}",
            "flip_card" to "{\"flipped\":0.0}",
            "flip_card" to "{\"flipped\":true,\"isCorrect\":true}",
        ).map { (caseId, json) ->
            dynamicTest("$caseId rejects $json") {
                val quiz = converter.readDefinition(entity(fixture(caseId)))
                val error = assertThrows<ApiException> { converter.readResponse(quiz, mapper.readTree(json)) }
                assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
            }
        }

    private fun objectPaths(
        node: JsonNode,
        path: String = "",
    ): List<String> =
        when {
            node.isObject -> {
                listOf(path) +
                    node
                        .fields()
                        .asSequence()
                        .flatMap { (key, value) -> objectPaths(value, "$path/$key") }
                        .toList()
            }

            node.isArray -> {
                node.flatMapIndexed { index, value -> objectPaths(value, "$path/$index") }
            }

            else -> {
                emptyList()
            }
        }

    @TestFactory
    fun `unknown and explicit null config fields are rejected at every nesting level`() =
        fixtures.flatMap { fixture ->
            objectPaths(fixture["config"]).flatMap { path ->
                val fields =
                    fixture["config"]
                        .at(path)
                        .fieldNames()
                        .asSequence()
                        .toList()
                (fields + "unexpected").map { field ->
                    dynamicTest("${fixture["caseId"].asText()} $path/$field") {
                        val changed = fixture.deepCopy<ObjectNode>()
                        val target = changed["config"].at(path) as ObjectNode
                        if (field == "unexpected") target.put(field, true) else target.putNull(field)
                        val error = assertThrows<ApiException> { converter.readDefinition(entity(changed)) }
                        assertEquals(ErrorCode.QUIZ_DATA_INVALID, error.code)
                    }
                }
            }
        }

    @TestFactory
    fun `missing required config and answer fields are rejected`() =
        fixtures.flatMap { fixture ->
            listOf("config", "answer").flatMap { part ->
                val optional = setOf("initialValue", "unit", "showValue", "shuffle", "allowRetry", "showHint", "maxSelections")
                fixture[part]
                    .fieldNames()
                    .asSequence()
                    .filter { it !in optional }
                    .map { field ->
                        dynamicTest("${fixture["caseId"].asText()} missing $part/$field") {
                            val changed = fixture.deepCopy<ObjectNode>()
                            (changed[part] as ObjectNode).remove(field)
                            assertEquals(
                                ErrorCode.QUIZ_DATA_INVALID,
                                assertThrows<ApiException> { converter.readDefinition(entity(changed)) }.code,
                            )
                        }
                    }.toList()
            }
        }

    @TestFactory
    fun `omitted optional settings stay omitted but explicit null is rejected`() =
        fixtures.flatMap { fixture ->
            val specific =
                when (fixture["interactionType"].asText()) {
                    "SLIDER" -> listOf("initialValue", "unit", "showValue")
                    "TAP", "MULTIPLE_CHOICE" -> listOf("maxSelections")
                    else -> emptyList()
                }
            (listOf("shuffle", "allowRetry", "showHint") + specific).map { field ->
                dynamicTest("${fixture["caseId"].asText()} optional $field") {
                    val changed = fixture.deepCopy<ObjectNode>()
                    (changed["config"] as ObjectNode).remove(field)
                    val definition = converter.readDefinition(entity(changed))
                    assertFalse(converter.writeConfig(definition.config).containsKey(field))
                    (changed["config"] as ObjectNode).putNull(field)
                    assertEquals(
                        ErrorCode.QUIZ_DATA_INVALID,
                        assertThrows<ApiException> { converter.readDefinition(entity(changed)) }.code,
                    )
                }
            }
        }

    @TestFactory
    fun `stored fields reject scalar coercion enum normalization and integer overflow`() =
        listOf(
            Triple("slider_exact", "min", "\"1700\""),
            Triple("slider_exact", "step", "true"),
            Triple("slider_exact", "unit", "1"),
            Triple("slider_exact", "unit", "true"),
            Triple("slider_exact", "showValue", "\"true\""),
            Triple("slider_exact", "showValue", "1"),
            Triple("slider_exact", "shuffle", "0"),
            Triple("slider_exact", "allowRetry", "\"true\""),
            Triple("slider_exact", "showHint", "\"false\""),
            Triple("slider_exact", "maxSelections", "1"),
            Triple("tap_multiple", "selectionType", "0"),
            Triple("tap_multiple", "selectionType", "\"multiple\""),
            Triple("tap_multiple", "selectionType", "\" MULTIPLE \""),
            Triple("tap_multiple", "selectionType", "\"UNKNOWN\""),
            Triple("tap_multiple", "maxSelections", "1.0"),
            Triple("tap_multiple", "maxSelections", "1e0"),
            Triple("tap_multiple", "maxSelections", "2147483648"),
            Triple("tap_multiple", "maxSelections", "\"1\""),
            Triple("tap_multiple", "maxSelections", "true"),
            Triple("swipe", "left", "\"FALSE\""),
            Triple("sort", "items", "{\"id\":\"a\",\"text\":\"A\"}"),
            Triple("flip_card", "front", "[]"),
        ).map { (caseId, field, json) ->
            dynamicTest("$caseId $field=$json") {
                val quiz = entity(fixture(caseId))
                quiz.config = quiz.config + (field to mapper.convertValue(mapper.readTree(json), Any::class.java))
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { converter.readDefinition(quiz) }.code)
            }
        }

    @TestFactory
    fun `answers cannot mix slider shapes use response fields or replace SQL null with an object`() =
        listOf(
            "slider_exact" to "{\"value\":1760,\"min\":1750,\"max\":1780}",
            "slider_exact" to "{\"value\":null}",
            "slider_exact" to "{\"value\":\"1760\"}",
            "slider_range" to "{\"min\":1750}",
            "swipe" to "{\"correctValue\":true}",
            "tap_multiple" to "{\"correctItemIds\":[1]}",
            "tap_multiple" to "{\"correctItemIds\":[null]}",
            "multiple_choice_single" to "{\"selectedOptionIds\":[\"italy\"]}",
            "sort" to "{\"correctOrder\":null}",
            "matching" to "{\"matches\":{\"newton\":true}}",
            "drag_drop" to "{\"placements\":{\"newton\":null}}",
            "flip_card" to "{}",
            "slider_exact" to "null",
        ).map { (caseId, json) ->
            dynamicTest("$caseId rejects answer $json") {
                val quiz = entity(fixture(caseId))
                quiz.answer = mapper.readTree(json).takeUnless { it.isNull }?.let(::jsonMap)
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { converter.readDefinition(quiz) }.code)
            }
        }

    @Test
    fun `high precision decimals survive request object map and database conversions`() {
        val value = BigDecimal("0.12345678901234567890123456789")
        val quiz = entity(fixture("slider_exact"))
        quiz.config = mapOf("min" to BigDecimal.ZERO, "max" to BigDecimal.ONE, "step" to BigDecimal("1e-29"))
        quiz.answer = mapOf("value" to value)
        val definition = assertIs<SliderQuizDefinition>(converter.readDefinition(quiz))
        assertEquals(value, assertIs<ExactSliderAnswer>(definition.answer).value)
        val request = mapper.readValue<QuizAttemptRequest>("{\"response\":{\"value\":$value}}")
        val response = assertIs<SliderUserResponse>(converter.readResponse(definition, request.response))
        assertEquals(value, response.value)
        val stored = database.convertToEntityAttribute(database.convertToDatabaseColumn(converter.writeResponse(response)))
        assertEquals(value, stored?.get("value"))
        assertIs<BigDecimal>(stored?.get("value"))
        quiz.config =
            checkNotNull(database.convertToEntityAttribute(database.convertToDatabaseColumn(converter.writeConfig(definition.config))))
        quiz.answer = database.convertToEntityAttribute(database.convertToDatabaseColumn(converter.writeAnswer(definition.answer)))
        val reloaded = assertIs<SliderQuizDefinition>(converter.readDefinition(quiz))
        assertEquals(0, definition.config.step.compareTo(reloaded.config.step))
        assertEquals(value, assertIs<ExactSliderAnswer>(reloaded.answer).value)
    }

    @Test
    fun `conversion preserves duplicate ids order repeated targets blanks and explicit false for semantic validation`() {
        val examples =
            listOf(
                "sort" to "{\"order\":[\"industrial\",\"renaissance\",\"industrial\"]}",
                "tap_multiple" to "{\"selectedItemIds\":[\"humanism\",\"humanism\"]}",
                "drag_drop" to "{\"placements\":{\"newton\":\"ancient\",\"einstein\":\"ancient\"}}",
                "swipe" to "{\"value\":\"  TRUE  \"}",
                "flip_card" to "{\"pairs\":[{\"firstCardId\":\"c1\",\"secondCardId\":\"c1\"}]}",
            )
        for ((caseId, json) in examples) {
            val original = mapper.readTree(json)
            val result = converter.readResponse(converter.readDefinition(entity(fixture(caseId))), original)
            assertJson(original, mapper.valueToTree(converter.writeResponse(result)))
        }
        val quiz = entity(fixture("slider_exact"))
        quiz.config =
            quiz.config + mapOf("unit" to " ", "showValue" to false, "shuffle" to false, "allowRetry" to true, "showHint" to false)
        val config = converter.writeConfig(converter.readDefinition(quiz).config)
        assertEquals(quiz.config.keys, config.keys)
        assertEquals(" ", config["unit"])
        assertEquals(false, config["showValue"])
        assertEquals(false, config["shuffle"])
        assertEquals(true, config["allowRetry"])
        assertEquals(false, config["showHint"])
    }

    @Test
    fun `maxSelections retains full Int range rather than limiting to the item count`() {
        for (caseId in listOf("tap_multiple", "multiple_choice_multiple")) {
            val quiz = entity(fixture(caseId))
            quiz.config = quiz.config + ("maxSelections" to Int.MAX_VALUE)
            val definition = converter.readDefinition(quiz)
            val limit =
                when (definition) {
                    is TapQuizDefinition -> definition.config.maxSelections
                    is MultipleChoiceQuizDefinition -> definition.config.maxSelections
                    else -> error("Unexpected fixture type")
                }
            assertEquals(Int.MAX_VALUE, limit)
            assertIs<Int>(converter.writeConfig(definition.config)["maxSelections"])
        }
    }

    @Test
    fun `flip card stores typed pairs and never serializes them into public config`() {
        val definition = assertIs<FlipCardQuizDefinition>(converter.readDefinition(entity(fixture("flip_card"))))
        assertEquals(3, definition.answer.pairs.size)
        assertFalse(converter.writeConfig(definition.config).containsKey("pairs"))
        val response = assertIs<FlipCardUserResponse>(converter.readResponse(definition, fixture("flip_card")["correctResponse"]))
        assertEquals(definition.answer.pairs, response.pairs)
    }

    @TestFactory
    fun `flip pair fields reject missing null scalar and extra values`() =
        listOf(
            """{"pairs":null}""",
            """{"pairs":{}}""",
            """{"pairs":[null]}""",
            """{"pairs":[{"firstCardId":"c1"}]}""",
            """{"pairs":[{"firstCardId":1,"secondCardId":"c2"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":null}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c2","correct":true}]}""",
            """{"pairs":[],"completed":true}""",
        ).map { json ->
            dynamicTest(json) {
                val definition = converter.readDefinition(entity(fixture("flip_card")))
                assertEquals(
                    ErrorCode.INVALID_QUIZ_RESPONSE,
                    assertThrows<ApiException> { converter.readResponse(definition, mapper.readTree(json)) }.code,
                )
            }
        }

    @Test
    fun `request type hints cannot override the database quiz type`() {
        val request = mapper.readValue<QuizAttemptRequest>("{\"interactionType\":\"SWIPE\",\"userId\":123,\"response\":{\"value\":1760}}")
        val slider = converter.readDefinition(entity(fixture("slider_exact")))
        assertIs<SliderUserResponse>(converter.readResponse(slider, request.response))
        val swipe = converter.readDefinition(entity(fixture("swipe")))
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, assertThrows<ApiException> { converter.readResponse(swipe, request.response) }.code)
    }

    @Test
    fun `strict converter settings do not mutate the application mapper or hide null map entries`() {
        val applicationMapper = jacksonObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        applicationMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL)
        val isolated = QuizModelConverter(applicationMapper)
        assertEquals("123", applicationMapper.readValue<SwipeUserResponse>("{\"value\":123,\"extra\":true}").value)
        val quiz = entity(fixture("swipe"))
        val definition = isolated.readDefinition(quiz)
        assertEquals(
            ErrorCode.INVALID_QUIZ_RESPONSE,
            assertThrows<ApiException> { isolated.readResponse(definition, mapper.readTree("{\"value\":123}")) }.code,
        )
        quiz.config = quiz.config + ("shuffle" to null)
        assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { isolated.readDefinition(quiz) }.code)
    }

    @Test
    fun `conversion errors use the existing 400 and 409 handler without exposing raw values`() {
        val quiz = entity(fixture("slider_exact"))
        val definition = converter.readDefinition(quiz)
        val submitted = assertThrows<ApiException> { converter.readResponse(definition, mapper.readTree("{\"value\":\"wrong\"}")) }
        quiz.answer = mapOf("value" to "wrong")
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
            "{\"response\":{\"value\":1,\"value\":2}}",
            "{\"response\":{\"value\":1},\"response\":{\"value\":2}}",
            "{\"response\":{\"placements\":{\"newton\":\"a\",\"newton\":\"b\"}}}",
        ).map { json ->
            dynamicTest(json) {
                assertThrows<JsonProcessingException> { mapper.readValue<QuizAttemptRequest>(json) }
            }
        }
}
