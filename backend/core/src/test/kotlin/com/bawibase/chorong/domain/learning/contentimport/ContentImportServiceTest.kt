package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.quiz.service.QuizGrader
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertFalse

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class ContentImportServiceTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var importer: ContentImportService

    @Autowired lateinit var grader: QuizGrader

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    private lateinit var auth: String
    private var userId = 0L
    private val folder: Path = Path.of(checkNotNull(javaClass.getResource("/content/example")).toURI())

    @BeforeEach
    fun setup() {
        userId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "가져오기 테스트")).id)
        auth = "Bearer " + tokens.issue(userId, null).accessToken
    }

    private fun example(): ObjectNode = mapper.readTree(folder.resolve("example.json").toFile()) as ObjectNode

    private fun ObjectNode.lesson(): ObjectNode = this["lessons"][0] as ObjectNode

    private fun import(
        root: ObjectNode,
        mediaRoot: Path? = folder,
    ): ContentImportResult {
        val result = ContentParser(grader, "https://media.example.com/").parse(mapper.writeValueAsBytes(root), "example.json", mediaRoot)
        assertEquals(emptyList(), result.issues)
        return importer.import(checkNotNull(result.course))
    }

    private fun quizIds(
        lessonId: Long,
        reviewOnly: Boolean,
    ): List<Long> =
        jdbc.queryForList(
            "SELECT quiz_id FROM quiz_item WHERE lesson_id = ? AND review_only = ? ORDER BY quiz_order",
            Long::class.java,
            lessonId,
            reviewOnly,
        )

    @Test
    fun `the all types example is served by the lesson API`() {
        val result = import(example())
        val lesson = result.lessons.single()
        assertEquals(LessonImportStatus.NEW, lesson.status)

        mvc.get("/api/v1/courses/${result.courseId}") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.slug") { value("example") }
            jsonPath("$.data.description") { value("예시") }
            jsonPath("$.data.order") { value(99) }
            jsonPath("$.data.lessons[0].slug") { value("example/all-types") }
        }
        mvc.get("/api/v1/lessons/${lesson.lessonId}") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.keyword") { value("예시") }
            jsonPath("$.data.version") { value(1) }
            jsonPath("$.data.ending.text") { value("별에 불 들어왔다냥!") }
            jsonPath("$.data.contents.length()") { value(10) }
            jsonPath("$.data.segments.length()") { value(10) }
            jsonPath("$.data.segments[0].title") { value("질문") }
            jsonPath("$.data.contents[0].quiz.interactionType") { value("SINGLE") }
            jsonPath("$.data.contents[0].quiz.graded") { value(false) }
            jsonPath("$.data.contents[1].contentType") { value("TEXT") }
            jsonPath("$.data.contents[1].dialogue[0].speaker") { value("초롱이") }
            jsonPath(
                "$.data.contents[1].source",
            ) { value("National Gallery, Sassoferrato 'The Virgin in Prayer' · Journey through colour") }
            jsonPath("$.data.contents[2].contentType") { value("IMAGE") }
            jsonPath("$.data.contents[2].keyword") { value("청금석") }
            jsonPath("$.data.contents[2].mediaUrl") { value("https://media.example.com/quiz/images/example/all-types/lapis.svg") }
            jsonPath("$.data.contents[2].dialogue.length()") { value(2) }
            jsonPath("$.data.contents[3].quiz.interactionType") { value("OX") }
            jsonPath("$.data.contents[3].quiz.graded") { value(true) }
            jsonPath("$.data.contents[4].quiz.config.answers[1]") { value(2) }
            jsonPath("$.data.contents[5].quiz.config.before") { value("너무 비싸서, 밑칠은") }
            jsonPath("$.data.contents[6].quiz.config.ticks.length()") { value(3) }
            jsonPath("$.data.contents[7].quiz.config.pairs.length()") { value(4) }
            jsonPath("$.data.contents[8].quiz.config.hint") { value("ㅇㅌㄹㅁㄹ") }
            jsonPath("$.data.contents[9].quiz.config.presentation.type") { value("AUDIO") }
            jsonPath("$.data.contents[9].quiz.config.presentation.mediaUrl") {
                value("https://media.example.com/quiz/audio/example/all-types/oboe.mp3")
            }
        }

        val reviews = quizIds(lesson.lessonId, reviewOnly = true)
        assertEquals(5, reviews.size)
        val types = listOf("TILE", "ZOOM_OUT", "SHARPEN", "INLINE_WORD")
        reviews.take(4).zip(types).forEach { (quizId, type) ->
            mvc.get("/api/quizzes/$quizId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
                status { isOk() }
                jsonPath("$.config.presentation.type") { value(type) }
            }
        }
        val wrongWord =
            mvc
                .get(
                    "/api/quizzes/${reviews[3]}",
                ) { header(HttpHeaders.AUTHORIZATION, auth) }
                .andReturn()
                .response.contentAsString
        assertFalse("헬륨" in wrongWord, "correct word must not be exposed: $wrongWord")
        assertEquals(
            """{"answer": 6, "correctWord": "헬륨"}""",
            jdbc.queryForObject("SELECT answer::text FROM quiz_item WHERE quiz_id = ?", String::class.java, reviews[3]),
        )
    }

    @Test
    fun `importing again keeps ids and bumps the version only when the lesson changed`() {
        val first = import(example())
        val lessonId = first.lessons.single().lessonId
        val lessonQuizzes = quizIds(lessonId, reviewOnly = false)
        val reviewQuizzes = quizIds(lessonId, reviewOnly = true)

        val same = import(example())
        assertEquals(first.courseId, same.courseId)
        assertEquals(LessonImportResult("all-types", lessonId, LessonImportStatus.UNCHANGED, 1), same.lessons.single())

        // 마지막 레슨 퀴즈(sound)를 빼고 첫 퀴즈 문장을 바꾼다. 빠진 퀴즈는 풀이 기록과 함께 지워진다.
        val removed = lessonQuizzes.last()
        jdbc.update(
            "INSERT INTO quiz_attempt (quiz_id, user_id, response, graded, correct, completed) VALUES (?, ?, '{\"answer\":0}', true, true, true)",
            removed,
            userId,
        )
        val edited = example()
        (edited.lesson()["screens"] as ArrayNode).remove(9)
        (edited.lesson()["screens"][0] as ObjectNode).put("question", "바뀐 질문")
        val changed = import(edited)
        assertEquals(LessonImportResult("all-types", lessonId, LessonImportStatus.CHANGED, 2), changed.lessons.single())
        assertEquals(lessonQuizzes.dropLast(1), quizIds(lessonId, reviewOnly = false))
        assertEquals(reviewQuizzes, quizIds(lessonId, reviewOnly = true))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM quiz_item WHERE quiz_id = ?", Int::class.java, removed))
        assertEquals(
            "바뀐 질문",
            jdbc.queryForObject("SELECT question FROM quiz_item WHERE quiz_id = ?", String::class.java, lessonQuizzes.first()),
        )
        mvc.get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            jsonPath("$.data.version") { value(2) }
            jsonPath("$.data.contents.length()") { value(9) }
        }
    }

    @Test
    fun `lessons missing from the file stay but move to the end`() {
        val root = example()
        val second = root.lesson().deepCopy().put("id", "second")
        root.withArray("lessons").add(second)
        val first = import(root, mediaRoot = null)
        val secondId = first.lessons[1].lessonId

        val result = import(example())
        assertEquals(listOf("example/second"), result.missingLessons)
        assertEquals(2, jdbc.queryForObject("SELECT lesson_order FROM lesson WHERE lesson_id = ?", Int::class.java, secondId))
    }
}
