package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.service.QuizGrader
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class QuizGraderTest {
    private val mapper = jacksonObjectMapper()
    private val grader = QuizGrader(mapper)

    private fun quiz(caseId: String): QuizItemEntity {
        val fixture =
            checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { stream ->
                mapper.readTree(stream).first { it["caseId"].asText() == caseId }
            }

        fun map(node: JsonNode): Map<String, Any?> = mapper.convertValue(node, object : TypeReference<Map<String, Any?>>() {})
        return QuizItemEntity(
            lessonId = 101L,
            question = fixture["question"].asText(),
            instruction = fixture["instruction"].asText(),
            interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
            config = map(fixture["config"]),
            answer = fixture["answer"].takeUnless { it.isNull }?.let(::map),
            explanation = fixture["explanation"].asText(),
            difficulty = fixture["difficulty"].asText(),
            quizOrder = fixture["quizOrder"].asInt(),
        )
    }

    @TestFactory
    fun `correct responses and valid wrong answers`() =
        listOf(
            Triple("slider_range", """{"value":1750}""", true),
            Triple("slider_range", """{"value":1780}""", true),
            Triple("slider_range", """{"value":1740}""", false),
            Triple("slider_range", """{"value":1790}""", false),
            Triple("slider_range", """{"value":1700}""", false),
            Triple("slider_range", """{"value":1900}""", false),
            Triple("slider_exact", """{"value":1760}""", true),
            Triple("slider_exact", """{"value":1750}""", false),
            Triple("swipe", """{"value":"TRUE"}""", true),
            Triple("swipe", """{"value":"FALSE"}""", false),
            Triple("tap_multiple", """{"selectedItemIds":["realism","humanism","perspective"]}""", true),
            Triple("tap_multiple", """{"selectedItemIds":["humanism","perspective"]}""", false),
            Triple("tap_multiple", """{"selectedItemIds":["humanism","perspective","realism","abstract"]}""", false),
            Triple("tap_image_single", """{"selectedItemIds":["monalisa"]}""", true),
            Triple("tap_image_single", """{"selectedItemIds":["starrynight"]}""", false),
            Triple("multiple_choice_single", """{"selectedOptionIds":["italy"]}""", true),
            Triple("multiple_choice_single", """{"selectedOptionIds":["france"]}""", false),
            Triple("multiple_choice_multiple", """{"selectedOptionIds":["realism","perspective","humanism"]}""", true),
            Triple("multiple_choice_multiple", """{"selectedOptionIds":["cubism"]}""", false),
            Triple("sort", """{"order":["renaissance","industrial","french_revolution"]}""", true),
            Triple("sort", """{"order":["industrial","renaissance","french_revolution"]}""", false),
            Triple("drag_drop", """{"placements":{"aristotle":"ancient","newton":"modern","einstein":"contemporary"}}""", true),
            Triple("drag_drop", """{"placements":{"aristotle":"ancient","newton":"ancient","einstein":"ancient"}}""", false),
            Triple("matching", """{"matches":{"newton":"gravity","einstein":"relativity","darwin":"evolution"}}""", true),
            Triple("matching", """{"matches":{"newton":"relativity","einstein":"gravity","darwin":"evolution"}}""", false),
        ).map { (caseId, response, correct) ->
            dynamicTest("$caseId $response => $correct") {
                val result = grader.grade(quiz(caseId), mapper.readTree(response))
                assertEquals(true, result.graded)
                assertEquals(correct, result.correct)
                assertEquals(true, result.completed)
            }
        }

    @TestFactory
    fun `malformed submissions are rejected rather than graded wrong`() =
        listOf(
            "multiple_choice_single" to "null",
            "multiple_choice_single" to "[]",
            "multiple_choice_single" to "true",
            "multiple_choice_single" to "{}",
            "multiple_choice_single" to """{"selectedOptionIds":null}""",
            "multiple_choice_single" to """{"selectedOptionIds":"italy"}""",
            "multiple_choice_single" to """{"selectedOptionIds":[]}""",
            "multiple_choice_single" to """{"selectedOptionIds":["italy","france"]}""",
            "multiple_choice_single" to """{"selectedOptionIds":["italy"],"isCorrect":true}""",
            "multiple_choice_multiple" to """{"selectedOptionIds":["humanism","humanism"]}""",
            "slider_range" to """{"value":"1760"}""",
            "slider_range" to """{"value":true}""",
            "slider_range" to """{"value":null}""",
            "slider_range" to """{"value":1761}""",
            "slider_range" to """{"value":1690}""",
            "slider_range" to """{"value":1910}""",
            "swipe" to """{"value":true}""",
            "swipe" to """{"value":"unknown"}""",
            "tap_multiple" to """{"selectedItemIds":["humanism","humanism"]}""",
            "tap_multiple" to """{"selectedItemIds":["unknown"]}""",
            "tap_multiple" to """{"selectedItemIds":["humanism",1]}""",
            "tap_image_single" to """{"selectedItemIds":["monalisa","starrynight"]}""",
            "sort" to """{"order":["renaissance","industrial"]}""",
            "sort" to """{"order":["renaissance","industrial","industrial"]}""",
            "sort" to """{"order":["renaissance","industrial","unknown"]}""",
            "drag_drop" to """{"placements":{"newton":"modern"}}""",
            "drag_drop" to """{"placements":{"aristotle":"ancient","newton":"unknown","einstein":"contemporary"}}""",
            "drag_drop" to """{"placements":{"aristotle":"ancient","newton":1,"einstein":"contemporary"}}""",
            "matching" to """{"matches":{"newton":"gravity","einstein":"gravity","darwin":"evolution"}}""",
            "matching" to """{"matches":{"newton":"gravity","einstein":"relativity"}}""",
            "flip_card" to """{"flipped":"true"}""",
            "flip_card" to "{}",
        ).map { (caseId, response) ->
            dynamicTest("$caseId rejects $response") {
                val error = assertThrows<ApiException> { grader.grade(quiz(caseId), mapper.readTree(response)) }
                assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
            }
        }

    @TestFactory
    fun `bad stored data and unsupported active options have a separate error`(): List<org.junit.jupiter.api.DynamicTest> {
        val changes: List<Triple<String, String, (QuizItemEntity) -> Unit>> =
            listOf(
                Triple("slider_range", "zero step") {
                    it.config += "step" to 0
                },
                Triple("slider_range", "negative step") {
                    it.config += "step" to -10
                },
                Triple("slider_range", "reversed bounds") {
                    it.config += "max" to 1600
                },
                Triple("slider_range", "string number") {
                    it.config += "min" to "1700"
                },
                Triple("slider_range", "off-grid initial value") {
                    it.config += "initialValue" to 1761
                },
                Triple("slider_range", "reversed answer") {
                    it.answer = mapOf("min" to 1780, "max" to 1750)
                },
                Triple("slider_range", "unreachable range") {
                    it.answer = mapOf("min" to 1751, "max" to 1759)
                },
                Triple("slider_range", "outside answer") {
                    it.answer = mapOf("min" to 1600, "max" to 1760)
                },
                Triple("slider_exact", "mixed answer forms") {
                    it.answer = mapOf("value" to 1760, "min" to 1750, "max" to 1780)
                },
                Triple("slider_exact", "off-grid answer") {
                    it.answer = mapOf("value" to 1761)
                },
                Triple("swipe", "unknown answer") {
                    it.answer = mapOf("correctValue" to "unknown")
                },
                Triple("swipe", "identical choices") {
                    it.config += "left" to it.config["right"]
                },
                Triple("tap_multiple", "unknown selection type") {
                    it.config += "selectionType" to "ANY"
                },
                Triple("tap_multiple", "duplicate item ids") {
                    it.config += "items" to listOf(mapOf("id" to "same", "text" to "a"), mapOf("id" to "same", "text" to "b"))
                },
                Triple("tap_multiple", "empty items") {
                    it.config += "items" to emptyList<Any>()
                },
                Triple("tap_multiple", "missing item label") {
                    it.config += "items" to listOf(mapOf("id" to "humanism"))
                },
                Triple("tap_multiple", "unknown answer id") {
                    it.answer = mapOf("correctItemIds" to listOf("unknown"))
                },
                Triple("tap_multiple", "duplicate answer id") {
                    it.answer = mapOf("correctItemIds" to listOf("humanism", "humanism"))
                },
                Triple("tap_multiple", "impossible selection limit") {
                    it.config += "maxSelections" to 2
                },
                Triple("tap_multiple", "noninteger selection limit") {
                    it.config += "maxSelections" to 2.5
                },
                Triple("tap_multiple", "zero selection limit") {
                    it.config += "maxSelections" to 0
                },
                Triple("multiple_choice_single", "multiple correct ids") {
                    it.answer = mapOf("correctOptionIds" to listOf("italy", "france"))
                },
                Triple("sort", "missing answer ids") {
                    it.answer = mapOf("correctOrder" to listOf("renaissance"))
                },
                Triple("drag_drop", "missing placements") {
                    it.answer = mapOf("placements" to mapOf("newton" to "modern"))
                },
                Triple("matching", "duplicate right ids") {
                    it.answer = mapOf("matches" to mapOf("newton" to "gravity", "einstein" to "gravity", "darwin" to "evolution"))
                },
                Triple("flip_card", "non-null answer") {
                    it.answer = emptyMap()
                },
                Triple("flip_card", "empty back") {
                    it.config += "back" to emptyMap<String, String>()
                },
                Triple("multiple_choice_single", "null answer") {
                    it.answer = null
                },
                Triple("multiple_choice_single", "retry restriction") {
                    it.config += "allowRetry" to false
                },
                Triple("multiple_choice_single", "enabled hints") {
                    it.config += "showHint" to true
                },
                Triple("multiple_choice_single", "string shuffle") {
                    it.config += "shuffle" to "true"
                },
                Triple("multiple_choice_single", "unexpected config field") {
                    it.config += "answer" to "leak"
                },
                Triple("slider_range", "inapplicable selection limit") {
                    it.config += "maxSelections" to 1
                },
            )
        return changes.map { (caseId, name, change) ->
            dynamicTest("$caseId: $name") {
                val item = quiz(caseId).also(change)
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { grader.validate(item) }.code)
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { grader.grade(item, mapper.readTree("{}")) }.code)
            }
        }
    }

    @Test
    fun `selection limit and unordered ids are enforced independently`() {
        val item =
            quiz("tap_multiple").apply {
                config += mapOf("maxSelections" to 2, "shuffle" to true, "allowRetry" to true, "showHint" to false)
                answer = mapOf("correctItemIds" to listOf("humanism", "perspective"))
            }
        assertEquals(true, grader.grade(item, mapper.readTree("""{"selectedItemIds":["perspective","humanism"]}""")).correct)
        assertEquals(false, grader.grade(item, mapper.readTree("""{"selectedItemIds":["realism"]}""")).correct)
        val error =
            assertThrows<ApiException> {
                grader.grade(item, mapper.readTree("""{"selectedItemIds":["humanism","perspective","realism"]}"""))
            }
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
    }

    @Test
    fun `decimal slider uses decimal step and inclusive boundaries`() {
        val item =
            quiz("slider_range").apply {
                config = mapOf("min" to 0, "max" to 1, "step" to 0.1, "initialValue" to 0.3)
                answer = mapOf("min" to 0.2, "max" to 0.3)
            }
        for (value in listOf("0.2", "0.3", "0.30")) {
            assertEquals(true, grader.grade(item, mapper.readTree("""{"value":$value}""")).correct)
        }
        assertEquals(false, grader.grade(item, mapper.readTree("""{"value":0.4}""")).correct)
        assertEquals(
            ErrorCode.INVALID_QUIZ_RESPONSE,
            assertThrows<ApiException> { grader.grade(item, mapper.readTree("""{"value":0.35}""")) }.code,
        )
    }

    @Test
    fun `flip records completion without a correctness result`() {
        for (flipped in listOf(true, false)) {
            val result = grader.grade(quiz("flip_card"), mapper.readTree("""{"flipped":$flipped}"""))
            assertEquals(false, result.graded)
            assertEquals(null, result.correct)
            assertEquals(flipped, result.completed)
        }
    }
}
