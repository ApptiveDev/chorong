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
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.DynamicTest.dynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull

class QuizGraderTest {
    private val mapper = jacksonObjectMapper()
    private val grader = QuizGrader()
    private val converter = QuizModelConverter(mapper)

    private fun validate(quiz: QuizItemEntity) = grader.validate(converter.readDefinition(quiz))

    private fun grade(
        quiz: QuizItemEntity,
        response: String,
    ): QuizGrade {
        val definition = converter.readDefinition(quiz)
        val prepared = grader.prepare(definition)
        return prepared(converter.readResponse(definition, mapper.readTree(response)))
    }

    private fun fixture(caseId: String): JsonNode =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { stream ->
            mapper.readTree(stream).first { it["caseId"].asText() == caseId }
        }

    private fun map(node: JsonNode): Map<String, Any?> = mapper.convertValue(node, object : TypeReference<Map<String, Any?>>() {})

    private fun quiz(
        caseId: String,
        config: String? = null,
        answer: String? = null,
    ): QuizItemEntity {
        val fixture = fixture(caseId)
        return QuizItemEntity(
            lessonId = 101L,
            question = fixture["question"].asText(),
            instruction = fixture["instruction"].asText(),
            interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
            config = map(config?.let(mapper::readTree) ?: fixture["config"]),
            answer = (answer?.let(mapper::readTree) ?: fixture["answer"]).takeUnless { it.isNull }?.let(::map),
            explanation = fixture["explanation"].asText(),
            difficulty = fixture["difficulty"].asText(),
            quizOrder = fixture["quizOrder"].asInt(),
        )
    }

    @TestFactory
    fun `every fixture grades its correct and wrong response`() =
        listOf(
            "ox",
            "single",
            "multi",
            "blank",
            "slider",
            "match",
            "chosung",
            "single-audio",
            "single-tile",
            "single-zoom",
            "single-sharpen",
            "single-inline",
        ).flatMap { caseId ->
            val fixture = fixture(caseId)
            listOf(
                dynamicTest("$caseId correct") {
                    val result = grade(quiz(caseId), fixture["correctResponse"].toString())
                    assertEquals(QuizGrade(graded = true, correct = true, completed = true, closeness = result.closeness), result)
                },
                dynamicTest("$caseId wrong") {
                    val result = grade(quiz(caseId), fixture["wrongResponse"].toString())
                    assertEquals(false, result.correct)
                    assertEquals(true, result.completed)
                },
            )
        }

    @TestFactory
    fun `valid answers are graded by type rules`() =
        listOf(
            Triple("ox", """{"answer":false}""", false),
            Triple("multi", """{"answers":[2,1]}""", true),
            Triple("multi", """{"answers":[1]}""", false),
            Triple("multi", """{"answers":[0,1,2]}""", false),
            Triple("slider", """{"answer":0.20}""", true),
            Triple("slider", """{"answer":0.36}""", true),
            Triple("slider", """{"answer":0.19}""", false),
            Triple("slider", """{"answer":0.37}""", false),
            Triple("chosung", """{"answer":"울트라 마린"}""", true),
            Triple("chosung", """{"answer":" 울트라마린 "}""", true),
            Triple("chosung", """{"answer":"울트라마"}""", false),
            Triple(
                "match",
                """{"pairs":[["1828년","인공 물감에 상금"],["마리아의 옷","가장 귀한 색"],["울트라마린","바다 건너"],["청금석","아프가니스탄"]]}""",
                true,
            ),
        ).map { (caseId, response, correct) ->
            dynamicTest("$caseId $response => $correct") {
                assertEquals(correct, grade(quiz(caseId), response).correct)
            }
        }

    @Test
    fun `slider closeness follows the simulator formula`() {
        assertEquals(100, grade(quiz("slider"), """{"answer":0.28}""").closeness)
        assertEquals(78, grade(quiz("slider"), """{"answer":0.5}""").closeness)
        assertEquals(28, grade(quiz("slider"), """{"answer":1}""").closeness)
        assertNull(grade(quiz("ox"), """{"answer":true}""").closeness)
    }

    @Test
    fun `chosung accepts any stored alternative`() {
        val quiz = quiz("chosung", answer = """{"answer":["울트라마린","울트라 마린 블루"]}""")
        assertEquals(true, grade(quiz, """{"answer":"울트라마린블루"}""").correct)
    }

    @TestFactory
    fun `malformed submissions are rejected rather than graded wrong`() =
        listOf(
            "ox" to """{"answer":"true"}""",
            "ox" to """{"answer":1}""",
            "ox" to """{}""",
            "ox" to """{"answer":true,"isCorrect":true}""",
            "single" to """{"answer":3}""",
            "single" to """{"answer":-1}""",
            "single" to """{"answer":"1"}""",
            "single" to """{"answer":1.0}""",
            "single" to """{"answers":[1]}""",
            "blank" to """{"answer":3}""",
            "multi" to """{"answers":[]}""",
            "multi" to """{"answers":[1,1]}""",
            "multi" to """{"answers":[3]}""",
            "multi" to """{"answer":1}""",
            "slider" to """{"answer":-0.01}""",
            "slider" to """{"answer":1.01}""",
            "slider" to """{"answer":"0.28"}""",
            "chosung" to """{"answer":""}""",
            "chosung" to """{"answer":"   "}""",
            "chosung" to """{"answer":["울트라마린"]}""",
            "match" to """{"pairs":[["청금석","아프가니스탄"]]}""",
            "match" to """{"pairs":[["청금석","아프가니스탄","x"],["울트라마린","바다 건너"],["마리아의 옷","가장 귀한 색"],["1828년","인공 물감에 상금"]]}""",
            "match" to """{"pairs":[["청금석","없는 짝"],["울트라마린","바다 건너"],["마리아의 옷","가장 귀한 색"],["1828년","인공 물감에 상금"]]}""",
            "match" to """{"pairs":[["청금석","아프가니스탄"],["청금석","바다 건너"],["마리아의 옷","가장 귀한 색"],["1828년","인공 물감에 상금"]]}""",
        ).map { (caseId, response) ->
            dynamicTest("$caseId $response") {
                val error = assertThrows<ApiException> { grade(quiz(caseId), response) }
                assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
            }
        }

    @TestFactory
    fun `unusable stored data has a separate error`(): List<DynamicTest> =
        listOf(
            Triple("single", """{"options":["하나"]}""", null),
            Triple("single", """{"options":["하나"," "]}""", null),
            Triple("single", null, """{"answer":3}"""),
            Triple("single", """{"options":["a","b"],"presentation":{"type":"AUDIO","mediaUrl":""}}""", null),
            Triple("single", """{"options":["a","b"],"presentation":{"type":"AUDIO","mediaUrl":"ftp://example.com/sound.mp3"}}""", null),
            Triple(
                "single",
                """{"options":["a","b"],"presentation":{"type":"TILE","mediaUrl":"https://example.com/a.png","rows":3,"columns":4,"stages":[1,11]}}""",
                null,
            ),
            Triple(
                "single",
                """{"options":["a","b"],"presentation":{"type":"ZOOM_OUT","mediaUrl":"https://example.com/a.png","stages":[1,3]}}""",
                null,
            ),
            Triple(
                "single",
                """{"options":["a","b"],"presentation":{"type":"SHARPEN","mediaUrl":"https://example.com/a.png","stages":[3,-1]}}""",
                null,
            ),
            Triple(
                "single",
                """{"options":["a","b"],"presentation":{"type":"INLINE_WORD","mediaUrl":"https://example.com/a.png"}}""",
                null,
            ),
            Triple("blank", """{"before":" ","after":"뒤","options":["a","b"]}""", """{"answer":0}"""),
            Triple("multi", null, """{"answers":[]}"""),
            Triple("multi", null, """{"answers":[1,1]}"""),
            Triple("slider", """{"ticks":["하나"]}""", null),
            Triple("slider", null, """{"answer":1.2,"tolerance":0.08}"""),
            Triple("slider", null, """{"answer":0.5,"tolerance":-0.1}"""),
            Triple("match", """{"pairs":[["a","b"]]}""", null),
            Triple("match", """{"pairs":[["a","b"],["a","c"]]}""", null),
            Triple("match", """{"pairs":[["a","b"],["c","b"]]}""", null),
            Triple("match", """{"pairs":[["a","b","c"],["d","e"]]}""", null),
            Triple("chosung", """{"hint":" "}""", null),
            Triple("chosung", null, """{"answer":[]}"""),
            Triple("chosung", null, """{"answer":[" "]}"""),
        ).map { (caseId, config, answer) ->
            dynamicTest("$caseId $config $answer") {
                val error = assertThrows<ApiException> { validate(quiz(caseId, config, answer)) }
                assertEquals(ErrorCode.QUIZ_DATA_INVALID, error.code)
            }
        }

    @Test
    fun `a response of another type is a request error`() {
        val definition = converter.readDefinition(quiz("ox"))
        val other = converter.readResponse(converter.readDefinition(quiz("single")), mapper.readTree("""{"answer":1}"""))
        val error = assertThrows<ApiException> { grader.prepare(definition)(other) }
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, error.code)
    }
}
