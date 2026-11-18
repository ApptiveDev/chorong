package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.domain.quiz.model.MultiQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SingleAnswer
import com.bawibase.chorong.domain.quiz.model.SinglePresentationType
import com.bawibase.chorong.domain.quiz.model.SingleQuizDefinition
import com.bawibase.chorong.domain.quiz.service.QuizGrader
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ContentParserTest {
    private val mapper = jacksonObjectMapper()
    private val parser = ContentParser(QuizGrader(), "https://media.example.com")
    private val folder: Path = Path.of(checkNotNull(javaClass.getResource("/content/example")).toURI())

    private fun example(): ObjectNode = mapper.readTree(folder.resolve("example.json").toFile()) as ObjectNode

    private fun ObjectNode.lesson(): ObjectNode = this["lessons"][0] as ObjectNode

    private fun ObjectNode.screen(index: Int): ObjectNode = lesson()["screens"][index] as ObjectNode

    private fun ObjectNode.review(index: Int): ObjectNode = lesson()["reviewQuizzes"][index] as ObjectNode

    private fun parse(
        root: ObjectNode,
        fileName: String = "example.json",
        mediaRoot: Path? = folder,
    ) = parser.parse(mapper.writeValueAsBytes(root), fileName, mediaRoot)

    private fun issues(root: ObjectNode) = parse(root).issues.map { Triple(it.screen, it.field, it.lesson) }

    @Test
    fun `the all types example parses into every screen and quiz type`() {
        val result = parse(example())
        assertEquals(emptyList(), result.issues)
        val course = assertNotNull(result.course)
        assertEquals("example", course.slug)
        assertEquals(99, course.order)
        val lesson = course.lessons.single()
        assertEquals(listOf("QuizScreen", "NarrationScreen", "ConceptScreen"), lesson.screens.take(3).map { it::class.simpleName })
        assertEquals(8, lesson.screens.count { it is QuizScreen })
        assertEquals(5, lesson.reviewQuizzes.size)

        val concept = lesson.screens[2] as ConceptScreen
        assertEquals("https://media.example.com/quiz/images/example/all-types/lapis.svg", concept.imageUrl)
        val sound = (lesson.screens.last() as QuizScreen).quiz.definition as SingleQuizDefinition
        assertEquals(SinglePresentationType.AUDIO, sound.config.presentation?.type)
        assertEquals("https://media.example.com/quiz/audio/example/all-types/oboe.mp3", sound.config.presentation?.mediaUrl)
        val multi = (lesson.screens[4] as QuizScreen).quiz.definition as MultiQuizDefinition
        assertEquals(listOf(1, 2), multi.answer.answers)

        val types = lesson.reviewQuizzes.map { (it.definition as? SingleQuizDefinition)?.config?.presentation?.type }
        assertEquals(
            listOf(
                SinglePresentationType.TILE,
                SinglePresentationType.ZOOM_OUT,
                SinglePresentationType.SHARPEN,
                SinglePresentationType.INLINE_WORD,
                null,
            ),
            types,
        )
    }

    @Test
    fun `wrongword splits the sentence into words and keeps the correct word with the answer`() {
        val quiz = parse(example()).course!!.lessons[0].reviewQuizzes[3]
        val definition = quiz.definition as SingleQuizDefinition
        assertEquals(listOf("태양", "한가운데서", "수소", "원자핵", "넷이", "합쳐져", "산소", "하나가", "돼요."), definition.config.options)
        assertEquals(SingleAnswer(6, "헬륨"), definition.answer)
    }

    @Test
    fun `memo, key order and whitespace do not change the lesson hash`() {
        val original = parse(example()).course!!.lessons[0].hash
        val edited = example()
        edited.screen(0).put("memo", "새 메모")
        val reordered = mapper.readTree(mapper.writerWithDefaultPrettyPrinter().writeValueAsString(edited)) as ObjectNode
        assertEquals(original, parse(reordered).course!!.lessons[0].hash)

        edited.screen(0).put("question", "바뀐 질문")
        assertNotEquals(original, parse(edited).course!!.lessons[0].hash)
    }

    @Test
    fun `invalid input is reported with lesson, screen and field`() {
        val root = example()
        root.lesson().remove("title")
        root.screen(0).put("answer", 3)
        root.screen(3).put("answer", "true")
        root.screen(4).put("answer", 1)
        (root.lesson()["screens"] as ArrayNode).add(root.review(0).deepCopy().put("section", "복습"))
        root.review(3).put("sentence", "틀린 [낱말]이 [두 개]")
        root.review(1).set<ArrayNode>("stages", mapper.createArrayNode().add(3).add(2))

        val found = issues(root)
        assertTrue(Triple(null, "title", "all-types") in found, found.toString())
        assertTrue(Triple("screens 1번", "answer", "all-types") in found, found.toString())
        assertTrue(Triple("screens 4번", "answer", "all-types") in found, found.toString())
        assertTrue(Triple("screens 5번", "answer", "all-types") in found, "multi uses answers, not answer: $found")
        assertTrue(Triple("screens 11번", "kind", "all-types") in found, "review-only kind in screens: $found")
        assertTrue(Triple("reviewQuizzes 4번", "sentence", "all-types") in found, found.toString())
        assertTrue(Triple("reviewQuizzes 2번", "stages", "all-types") in found, found.toString())
        assertNull(parse(root).course)
    }

    @Test
    fun `wrongword needs exactly one bracketed word`() {
        listOf("괄호가 없는 문장", "[두] [개]", "[띄어 쓴] 낱말", "빈 [] 괄호").forEach { sentence ->
            val root = example()
            root.review(3).put("sentence", sentence)
            assertEquals(listOf(Triple("reviewQuizzes 4번", "sentence", "all-types")), issues(root), sentence)
        }
    }

    @Test
    fun `chosung answers must have as many letters as the hint without spaces`() {
        val spaced = example()
        spaced.screen(8).put("hint", "ㅇㅌㄹ ㅁㄹ").set<ArrayNode>("answer", mapper.createArrayNode().add("울트라 마린").add("울트라마린"))
        assertEquals(emptyList(), issues(spaced))

        val longer = example()
        longer.screen(8).set<ArrayNode>("answer", mapper.createArrayNode().add("울트라마린").add("울트라마린블루"))
        val found = parse(longer).issues.map { it.toString() }
        assertEquals(1, found.size, found.toString())
        assertTrue(found.single().startsWith("레슨 all-types · screens 9번 · answer: 정답 글자 수가 초성 힌트(5 글자)와 다릅니다: 울트라마린블루"), found.toString())
        assertNull(parse(longer).course)
    }

    @Test
    fun `missing media files, file name mismatch and duplicate lesson ids are reported`() {
        val root = example()
        root.screen(2).put("image", "missing.svg")
        root.withArray("lessons").add(root.lesson().deepCopy())
        val found = parse(root, fileName = "other.json").issues.map { it.toString() }
        assertTrue("레슨 all-types · screens 3번 · image: all-types 레슨 폴더에 missing.svg 파일이 없습니다" in found, found.toString())
        assertTrue("별자리 · id: 파일 이름(other.json)과 별자리 id(example)가 다릅니다" in found, found.toString())
        assertTrue("레슨 all-types · id: 같은 레슨 id가 두 번 나옵니다" in found, found.toString())

        assertEquals(emptyList(), parse(example().put("memo", "x"), mediaRoot = null).issues)
    }

    @Test
    fun `unknown fields and JSON syntax errors are reported`() {
        val root = example()
        root.screen(1).put("speakr", "오타")
        assertEquals(listOf(Triple("screens 2번", "speakr", "all-types")), issues(root))

        val broken = parser.parse("{\n  \"id\": \"example\",\n}".toByteArray())
        assertEquals(1, broken.issues.size)
        assertTrue(broken.issues[0].reason.startsWith("JSON 문법 오류(3번째 줄"), broken.issues[0].reason)
    }
}
