package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.bawibase.chorong.domain.quiz.service.QuizGrade
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
    private val grader = QuizGrader()
    private val converter = QuizModelConverter(mapper)

    private fun validate(quiz: QuizItemEntity) = grader.validate(converter.readDefinition(quiz))

    private fun grade(
        quiz: QuizItemEntity,
        response: JsonNode,
    ): QuizGrade {
        val definition = converter.readDefinition(quiz)
        val prepared = grader.prepare(definition)
        return prepared(converter.readResponse(definition, response))
    }

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
                val result = grade(quiz(caseId), mapper.readTree(response))
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
                val error = assertThrows<ApiException> { grade(quiz(caseId), mapper.readTree(response)) }
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
                assertEquals(
                    ErrorCode.QUIZ_DATA_INVALID,
                    assertThrows<ApiException> { validate(item) }.code,
                )
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { grade(item, mapper.readTree("{}")) }.code)
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
        assertEquals(true, grade(item, mapper.readTree("""{"selectedItemIds":["perspective","humanism"]}""")).correct)
        assertEquals(false, grade(item, mapper.readTree("""{"selectedItemIds":["realism"]}""")).correct)
        val error =
            assertThrows<ApiException> {
                grade(item, mapper.readTree("""{"selectedItemIds":["humanism","perspective","realism"]}"""))
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
            assertEquals(true, grade(item, mapper.readTree("""{"value":$value}""")).correct)
        }
        assertEquals(false, grade(item, mapper.readTree("""{"value":0.4}""")).correct)
        assertEquals(
            ErrorCode.INVALID_QUIZ_RESPONSE,
            assertThrows<ApiException> { grade(item, mapper.readTree("""{"value":0.35}""")) }.code,
        )
    }

    @Test
    fun `flip pairs are unordered and completion requires every correct pair`() {
        val item = quiz("flip_card")
        assertEquals(QuizGrade(true, true, false), grade(item, mapper.readTree("""{"pairs":[{"firstCardId":"c5","secondCardId":"c1"}]}""")))
        assertEquals(
            QuizGrade(true, false, false),
            grade(item, mapper.readTree("""{"pairs":[{"firstCardId":"c1","secondCardId":"c2"}]}""")),
        )
        val full = """
{
  "pairs": [
    {
      "firstCardId": "c3",
      "secondCardId": "c6"
    },
    {
      "firstCardId": "c2",
      "secondCardId": "c4"
    },
    {
      "firstCardId": "c5",
      "secondCardId": "c1"
    }
  ]
}
        """
        assertEquals(QuizGrade(true, true, true), grade(item, mapper.readTree(full)))
    }

    @TestFactory
    fun `flip pair submissions reject repeated missing and unknown cards`() =
        listOf(
            """{"pairs":[]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c1"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"missing"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c5"},{"firstCardId":"c1","secondCardId":"c2"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c5"},{"firstCardId":"c5","secondCardId":"c1"}]}""",
        ).map { json ->
            dynamicTest(json) {
                assertEquals(
                    ErrorCode.INVALID_QUIZ_RESPONSE,
                    assertThrows<ApiException> { grade(quiz("flip_card"), mapper.readTree(json)) }.code,
                )
            }
        }

    @TestFactory
    fun `flip stored answers cover every card exactly once`() =
        listOf(
            """{"pairs":[]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c5"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"c1"},{"firstCardId":"c2","secondCardId":"c3"},{"firstCardId":"c4","secondCardId":"c5"}]}""",
            """{"pairs":[{"firstCardId":"c1","secondCardId":"unknown"},{"firstCardId":"c2","secondCardId":"c4"},{"firstCardId":"c3","secondCardId":"c6"}]}""",
        ).map { json ->
            dynamicTest(json) {
                val item =
                    quiz("flip_card").apply {
                        answer =
                            mapper.convertValue(mapper.readTree(json), object : TypeReference<Map<String, Any?>>() {})
                    }
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { validate(item) }.code)
            }
        }

    @TestFactory
    fun `mismatched typed responses return a request error rather than a cast failure`() =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { stream ->
            val fixtures = mapper.readTree(stream).toList().distinctBy { it["interactionType"].asText() }
            fixtures.flatMap { target ->
                val definition = converter.readDefinition(quiz(target["caseId"].asText()))
                val prepared = grader.prepare(definition)
                fixtures.filter { it["interactionType"] != target["interactionType"] }.map { other ->
                    dynamicTest("${target["caseId"].asText()} rejects ${other["caseId"].asText()}") {
                        val otherDefinition = converter.readDefinition(quiz(other["caseId"].asText()))
                        val response = converter.readResponse(otherDefinition, other["correctResponse"])
                        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, assertThrows<ApiException> { prepared(response) }.code)
                    }
                }
            }
        }

    @TestFactory
    fun `typed value validation rejects unusable strings references and limits`(): List<org.junit.jupiter.api.DynamicTest> {
        val changes: List<Triple<String, String, (QuizItemEntity) -> Unit>> =
            listOf(
                Triple("swipe", "blank choice label") { it.config += "left" to mapOf("value" to "FALSE", "label" to " ") },
                Triple("swipe", "blank choice value") { it.config += "left" to mapOf("value" to " ", "label" to "아니다") },
                Triple("tap_multiple", "blank item id") { it.config += "items" to listOf(mapOf("id" to " ", "text" to "A")) },
                Triple("tap_multiple", "blank text with valid image") {
                    it.config += "items" to listOf(mapOf("id" to "humanism", "text" to " ", "imageUrl" to "/a.png"))
                },
                Triple("tap_multiple", "blank image with valid text") {
                    it.config += "items" to listOf(mapOf("id" to "humanism", "text" to "A", "imageUrl" to " "))
                },
                Triple("tap_multiple", "empty correct ids") { it.answer = mapOf("correctItemIds" to emptyList<String>()) },
                Triple("tap_multiple", "blank correct id") { it.answer = mapOf("correctItemIds" to listOf(" ")) },
                Triple("tap_multiple", "negative limit") { it.config += "maxSelections" to -1 },
                Triple("multiple_choice_single", "single limit of two") { it.config += "maxSelections" to 2 },
                Triple("sort", "duplicate correct order") {
                    it.answer = mapOf("correctOrder" to listOf("renaissance", "industrial", "industrial"))
                },
                Triple("matching", "unequal side sizes") {
                    it.config += "leftItems" to listOf(mapOf("id" to "newton", "text" to "뉴턴"))
                },
                Triple("drag_drop", "unknown correct target") {
                    it.answer = mapOf("placements" to mapOf("aristotle" to "ancient", "newton" to "unknown", "einstein" to "contemporary"))
                },
                Triple("flip_card", "blank title beside valid text") { it.config += "back" to mapOf("title" to " ", "text" to "내용") },
                Triple("flip_card", "blank image beside valid text") { it.config += "front" to mapOf("text" to "내용", "imageUrl" to " ") },
            )
        return changes.map { (caseId, name, change) ->
            dynamicTest("$caseId $name") {
                val item = quiz(caseId).also(change)
                assertEquals(
                    ErrorCode.QUIZ_DATA_INVALID,
                    assertThrows<ApiException> { validate(item) }.code,
                )
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, assertThrows<ApiException> { grade(item, mapper.readTree("{}")) }.code)
            }
        }
    }

    @TestFactory
    fun `retry restrictions and hints remain unsupported for every quiz type`() =
        listOf(
            "slider_exact",
            "swipe",
            "tap_multiple",
            "multiple_choice_single",
            "drag_drop",
            "sort",
            "matching",
            "flip_card",
        ).flatMap { caseId ->
            listOf("allowRetry" to false, "showHint" to true).map { (option, value) ->
                dynamicTest("$caseId $option") {
                    val item = quiz(caseId).apply { config += option to value }
                    assertEquals(
                        ErrorCode.QUIZ_DATA_INVALID,
                        assertThrows<ApiException> { validate(item) }.code,
                    )
                }
            }
        }

    @Test
    fun `slider allows off-grid range endpoints and an off-grid upper configuration bound`() {
        val item =
            quiz("slider_range").apply {
                config = mapOf("min" to 0, "max" to 1, "step" to 0.3)
                answer = mapOf("min" to 0.2, "max" to 0.8)
            }
        assertEquals(true, grade(item, mapper.readTree("""{"value":0.3}""")).correct)
        assertEquals(true, grade(item, mapper.readTree("""{"value":0.6}""")).correct)
        assertEquals(false, grade(item, mapper.readTree("""{"value":0.9}""")).correct)
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, assertThrows<ApiException> { grade(item, mapper.readTree("""{"value":1}""")) }.code)
        item.answer = mapOf("value" to 0.30)
        assertEquals(true, grade(item, mapper.readTree("""{"value":0.3}""")).correct)
    }

    @Test
    fun `a slider step greater than its range still allows the minimum`() {
        val item =
            quiz("slider_exact").apply {
                config = mapOf("min" to 0, "max" to 1, "step" to 2)
                answer = mapOf("value" to 0)
            }
        assertEquals(true, grade(item, mapper.readTree("""{"value":0}""")).correct)
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, assertThrows<ApiException> { grade(item, mapper.readTree("""{"value":1}""")) }.code)
        item.answer = mapOf("min" to 0, "max" to 0)
        assertEquals(true, grade(item, mapper.readTree("""{"value":0}""")).correct)
    }

    @Test
    fun `multiple selections allow a limit above the item count`() {
        val item = quiz("tap_multiple").apply { config += "maxSelections" to Int.MAX_VALUE }
        assertEquals(true, grade(item, mapper.readTree("""{"selectedItemIds":["realism","perspective","humanism"]}""")).correct)
        assertEquals(false, grade(item, mapper.readTree("""{"selectedItemIds":["realism","perspective","humanism","abstract"]}""")).correct)
    }

    @Test
    fun `drag drop allows repeated correct targets and unused targets`() {
        val item =
            quiz("drag_drop").apply {
                answer = mapOf("placements" to mapOf("aristotle" to "ancient", "newton" to "ancient", "einstein" to "ancient"))
            }
        val response = mapper.readTree("""{"placements":{"aristotle":"ancient","newton":"ancient","einstein":"ancient"}}""")
        assertEquals(true, grade(item, response).correct)
    }

    @Test
    fun `matching allows the same id on opposite sides`() {
        val item =
            quiz("matching").apply {
                config =
                    mapOf(
                        "leftItems" to listOf(mapOf("id" to "same", "text" to "왼쪽")),
                        "rightItems" to listOf(mapOf("id" to "same", "text" to "오른쪽")),
                    )
                answer = mapOf("matches" to mapOf("same" to "same"))
            }
        assertEquals(true, grade(item, mapper.readTree("""{"matches":{"same":"same"}}""")).correct)
    }

    @Test
    fun `swipe values are compared without trimming`() {
        val item =
            quiz("swipe").apply {
                config = mapOf("left" to mapOf("value" to "yes ", "label" to "예"), "right" to mapOf("value" to "no", "label" to "아니오"))
                answer = mapOf("correctValue" to "yes ")
            }
        assertEquals(true, grade(item, mapper.readTree("""{"value":"yes "}""")).correct)
        val error = assertThrows<ApiException> { grade(item, mapper.readTree("""{"value":"yes"}""")) }
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
    }

    @Test
    fun `legacy flip card faces remain readable as one pair`() {
        val item =
            quiz("flip_card").apply {
                config = mapOf("front" to mapOf("title" to "앞"), "back" to mapOf("title" to "뒤"))
                answer =
                    null
            }
        assertEquals(
            QuizGrade(true, true, true),
            grade(item, mapper.readTree("""{"pairs":[{"firstCardId":"legacy-front","secondCardId":"legacy-back"}]}""")),
        )
    }
}
