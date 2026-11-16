package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataAccessException
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class LearningApiTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var quizzes: QuizItemRepository

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokens: TokenService

    @Autowired lateinit var learning: LearningService

    @Autowired lateinit var learningQuizzes: LearningQuizService

    @Autowired lateinit var lessonCompletion: LessonCompletionService

    @Autowired lateinit var lessonProgress: LessonProgressService

    @Autowired lateinit var studyStreak: StudyStreakService

    @Autowired lateinit var entityManager: EntityManager

    @Autowired lateinit var mapper: ObjectMapper

    @MockitoBean lateinit var clock: Clock

    private lateinit var auth: String
    private var userId = 0L

    @BeforeEach
    fun setup() {
        `when`(clock.zone).thenReturn(ZoneOffset.UTC)
        `when`(clock.instant()).thenReturn(Instant.now().truncatedTo(ChronoUnit.SECONDS))
        userId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "학습 조회 테스트")).id)
        auth = "Bearer " + tokens.issue(userId, null).accessToken
    }

    @Test
    fun `lesson detail start and onboarding return the same ordered segments and contents`() {
        val (courseId, lessonId) = createUnlockedLesson("segments")
        jdbc.update("UPDATE course SET is_onboarding=true WHERE course_id=?", courseId)
        jdbc.update("INSERT INTO lesson_segment(lesson_id,segment_id,title,segment_order) VALUES (?,?,?,?)", lessonId, "second", "두 번째", 2)
        jdbc.update("INSERT INTO lesson_segment(lesson_id,segment_id,title,segment_order) VALUES (?,?,?,?)", lessonId, "first", "첫 번째", 1)
        jdbc.update(
            """INSERT INTO lesson_content(lesson_id,content_order,content_type,segment_id,dialogue,source)
               VALUES (?,1,'TEXT','first','[{"speaker":"초롱","text":"안녕"},{"speaker":"별","text":"반가워"}]'::jsonb,'책')""",
            lessonId,
        )
        jdbc.update(
            "INSERT INTO lesson_content(lesson_id,content_order,content_type,segment_id,media_url) VALUES (?,2,'IMAGE','second','/image.png')",
            lessonId,
        )
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,3,'TEXT','기존 본문')", lessonId)
        val detail =
            mvc
                .get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let { mapper.readTree(it)["data"] }
        val started =
            mvc
                .post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let { mapper.readTree(it)["data"] }
        val onboarding =
            mvc
                .get("/api/v1/onboarding") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let { mapper.readTree(it)["data"]["lesson"] }
        assertEquals(detail["contents"], started["contents"])
        assertEquals(detail["segments"], started["segments"])
        assertEquals(detail["contents"], onboarding["contents"])
        assertEquals(detail["segments"], onboarding["segments"])
        val contents = detail["contents"]
        val segments = detail["segments"]
        assertEquals(listOf("first", "second", "legacy-$lessonId"), segments.map { it["segmentId"].asText() })
        assertEquals(listOf(1, 2, 3), segments.map { it["order"].asInt() })
        assertEquals(listOf("first", "second", "legacy-$lessonId"), contents.map { it["segmentId"].asText() })
        assertEquals(listOf("초롱", "별"), contents[0]["dialogue"].map { it["speaker"].asText() })
        assertEquals("책", contents[0]["source"].asText())
        assertEquals("기존 본문", contents[2]["body"].asText())
        assertEquals(false, contents[2].has("source"))
        assertEquals(contents.map { it["contentId"].asLong() }, segments.flatMap { it["contentIds"].map(JsonNode::asLong) })
    }

    @Test
    fun `course listing filters onboarding and content returns public quiz only`() {
        jdbc.update(
            "INSERT INTO course(slug,title,category,topic,description,course_order) VALUES ('firefly','일반 코스','SCIENCE','일반 코스','빛과 색',1)",
        )
        val courseId = jdbc.queryForObject("SELECT course_id FROM course WHERE title='일반 코스'", Long::class.java)
        jdbc.update("INSERT INTO course(slug,title,category,topic,is_onboarding) VALUES ('onboarding','온보딩','START','온보딩',true)")
        jdbc.update(
            """INSERT INTO lesson(course_id,slug,title,keyword,lesson_order,content_version,source,ending_text,ending_image_url)
               VALUES (?, 'firefly/blue-pigment', '레슨 1', '울트라마린', 1, 2, '출처 모음', '별에 불 들어왔다냥!', 'https://example.com/star.svg')""",
            courseId,
        )
        val lessonId = jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId)
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?, 0, 'TEXT', '학습 본문')", lessonId)
        val quiz =
            quizzes.saveAndFlush(
                QuizItemEntity(
                    lessonId = 23,
                    question = "질문",
                    instruction = "선택",
                    interactionType = QuizInteractionType.SINGLE,
                    config = mapOf("options" to listOf("선택지", "다른 선택지")),
                    answer = mapOf("answer" to 0),
                    explanation = "비공개 해설",
                    difficulty = "EASY",
                    quizOrder = 0,
                ),
            )
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, 1, 'QUIZ', ?)", lessonId, quiz.id)
        jdbc.update(
            """INSERT INTO lesson_content(lesson_id,content_order,content_type,media_url,keyword,dialogue)
               VALUES (?, 2, 'IMAGE', 'https://example.com/image.png', '청금석', '[{"text":"해설 대사"}]'::jsonb)""",
            lessonId,
        )
        entityManager.flush()

        mvc.get("/api/v1/courses") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.courses.length()") { value(1) }
            jsonPath("$.data.courses[0].title") { value("일반 코스") }
            jsonPath("$.data.courses[0].slug") { value("firefly") }
            jsonPath("$.data.courses[0].description") { value("빛과 색") }
            jsonPath("$.data.courses[0].order") { value(1) }
            jsonPath("$.data.courses[0].totalLessons") { value(1) }
        }
        mvc.get("/api/v1/courses/$courseId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.slug") { value("firefly") }
            jsonPath("$.data.order") { value(1) }
            jsonPath("$.data.lessons[0].lessonId") { value(lessonId) }
            jsonPath("$.data.lessons[0].slug") { value("firefly/blue-pigment") }
            jsonPath("$.data.lessons[0].keyword") { value("울트라마린") }
            jsonPath("$.data.lessons[0].status") { value("UNLOCKED") }
        }
        mvc.get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.slug") { value("firefly/blue-pigment") }
            jsonPath("$.data.keyword") { value("울트라마린") }
            jsonPath("$.data.version") { value(2) }
            jsonPath("$.data.source") { value("출처 모음") }
            jsonPath("$.data.ending.text") { value("별에 불 들어왔다냥!") }
            jsonPath("$.data.ending.imageUrl") { value("https://example.com/star.svg") }
            jsonPath("$.data.contents.length()") { value(3) }
            jsonPath("$.data.contents[0].contentType") { value("TEXT") }
            jsonPath("$.data.contents[0].body") { value("학습 본문") }
            jsonPath("$.data.contents[1].contentType") { value("QUIZ") }
            jsonPath("$.data.contents[1].quiz.quizId") { value(quiz.id) }
            jsonPath("$.data.contents[1].quiz.interactionType") { value("SINGLE") }
            jsonPath("$.data.contents[1].quiz.config.options[0]") { value("선택지") }
            jsonPath("$.data.contents[1].quiz.instruction") { value("선택") }
            jsonPath("$.data.contents[1].quiz.type") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.answer") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.explanation") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.graded") { value(false) }
            jsonPath("$.data.contents[2].contentType") { value("IMAGE") }
            jsonPath("$.data.contents[2].keyword") { value("청금석") }
            jsonPath("$.data.contents[2].dialogue[0].text") { value("해설 대사") }
            jsonPath("$.data.contents[2].dialogue[0].speaker") { doesNotExist() }
        }
        assertEquals(23L, quizzes.findById(checkNotNull(quiz.id)).orElseThrow().lessonId)
    }

    @Test
    fun `course listing returns all courses in order and ignores old category and topic filters`() {
        jdbc.update(
            """INSERT INTO course(slug,title,course_order) VALUES
               ('third','세 번째',3),
               ('first','첫 번째',1),
               ('second','두 번째',2)""",
        )

        mvc
            .get("/api/v1/courses") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("category", "SCIENCE")
                param("topic", "SPACE")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courses.length()") { value(3) }
                jsonPath("$.data.courses[0].slug") { value("first") }
                jsonPath("$.data.courses[1].slug") { value("second") }
                jsonPath("$.data.courses[2].slug") { value("third") }
            }
    }

    @Test
    fun `only the first quiz of a learning lesson is ungraded and onboarding quizzes are all graded`() {
        val courseId = createCourse("graded", 1)
        val lessonId = checkNotNull(jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId))
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?, 1, 'TEXT', '도입')", lessonId)
        listOf(2, 3).forEach { order ->
            jdbc.update(
                "INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, ?, 'QUIZ', ?)",
                lessonId,
                order,
                saveSingleQuiz(lessonId, order).id,
            )
        }

        fun gradedFlags() =
            mvc
                .get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let { mapper.readTree(it)["data"]["contents"] }
                .filter { it["contentType"].asText() == "QUIZ" }
                .map { it["quiz"]["graded"].asBoolean() }

        assertEquals(listOf(false, true), gradedFlags())
        jdbc.update("UPDATE course SET is_onboarding=true WHERE course_id=?", courseId)
        assertEquals(listOf(true, true), gradedFlags())
    }

    @Test
    fun `review only quiz cannot be linked as lesson content`() {
        val courseId = createCourse("review-only", 1)
        val lessonId = checkNotNull(jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId))
        val quizId = checkNotNull(saveSingleQuiz(lessonId, 1).id)
        jdbc.update("UPDATE quiz_item SET review_only=true WHERE quiz_id=?", quizId)

        mvc.get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.contents.length()") { value(0) }
        }
        assertFailsWith<DataAccessException> {
            jdbc.update(
                "INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, 1, 'QUIZ', ?)",
                lessonId,
                quizId,
            )
        }
    }

    @Test
    fun `lesson quiz cannot be turned into a review only quiz`() {
        val courseId = createCourse("linked", 1)
        val lessonId = checkNotNull(jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId))
        val quizId = checkNotNull(saveSingleQuiz(lessonId, 1).id)
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, 1, 'QUIZ', ?)", lessonId, quizId)

        assertFailsWith<DataAccessException> { jdbc.update("UPDATE quiz_item SET review_only=true WHERE quiz_id=?", quizId) }
    }

    @Test
    fun `video content type is no longer accepted`() {
        val courseId = createCourse("video", 1)
        val lessonId = checkNotNull(jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId))

        assertFailsWith<DataAccessException> {
            jdbc.update(
                "INSERT INTO lesson_content(lesson_id,content_order,content_type,media_url) VALUES (?, 1, 'VIDEO', 'https://example.com/v.mp4')",
                lessonId,
            )
        }
    }

    private fun saveSingleQuiz(
        lessonId: Long,
        order: Int,
    ): QuizItemEntity =
        quizzes.saveAndFlush(
            QuizItemEntity(
                lessonId = lessonId,
                question = "질문 $order",
                instruction = "선택",
                interactionType = QuizInteractionType.SINGLE,
                config = mapOf("options" to listOf("가", "나")),
                answer = mapOf("answer" to 0),
                explanation = "해설",
                difficulty = "EASY",
                quizOrder = order,
            ),
        )

    @Test
    fun `missing course and lesson return not found`() {
        mvc.get("/api/v1/courses/999999") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isNotFound() } }
        mvc.get("/api/v1/lessons/999999") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `lesson start resumes in order and requires completed quiz attempt`() {
        val (_, lessonId) = createUnlockedLesson("lesson progress")
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','intro')", lessonId)
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        val quizId = seedFixture(fixture, lessonId, 1)
        jdbc.update(
            "INSERT INTO lesson_content(lesson_id,content_order,content_type,media_url) VALUES (?,2,'IMAGE','https://example.com/x.png')",
            lessonId,
        )
        val contentIds =
            jdbc.query(
                "SELECT content_id FROM lesson_content WHERE lesson_id=? ORDER BY content_order",
                { rs, _ -> rs.getLong(1) },
                lessonId,
            )

        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.progress.status") { value("IN_PROGRESS") }
            jsonPath("$.data.progress.resumeContentId") { value(contentIds[0]) }
            jsonPath("$.data.contents[1].quiz.interactionType") { value("SINGLE") }
        }
        mvc.post("/api/v1/contents/${contentIds[0]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        mvc
            .post(
                "/api/v1/contents/${contentIds[2]}/complete",
            ) { header(HttpHeaders.AUTHORIZATION, auth) }
            .andExpect { status { isConflict() } }
        mvc
            .post(
                "/api/v1/contents/${contentIds[1]}/complete",
            ) { header(HttpHeaders.AUTHORIZATION, auth) }
            .andExpect { status { isConflict() } }
        postAnswer(quizId, mapper.readTree("""{"answer":1}""")).andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/${contentIds[1]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.progress.lastContentId") { value(contentIds[1]) }
            jsonPath("$.data.progress.resumeContentId") { value(contentIds[2]) }
            jsonPath("$.data.lessonCompleted") { value(false) }
        }
        mvc.post("/api/v1/contents/${contentIds[2]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.progress.resumeContentId") { doesNotExist() }
            jsonPath("$.data.lessonCompleted") { value(true) }
        }
        mvc.get("/api/v1/users/me/progress") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.current.lessonId") { doesNotExist() }
        }
        jdbc.update("UPDATE lesson_progress SET status='COMPLETED',completed_at=now() WHERE user_id=? AND lesson_id=?", userId, lessonId)
        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsBytes(mapOf("replay" to true))
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.progress.status") { value("COMPLETED") }
                jsonPath("$.data.progress.resumeContentId") { value(contentIds[0]) }
            }
        assertEquals(
            "COMPLETED",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
    }

    @Test
    fun `lesson completion validates final content and grants rewards once`() {
        val (courseId, lessonId) = createUnlockedLesson("reward completion")
        jdbc.update("UPDATE course SET constellation_id=778 WHERE course_id=?", courseId)
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','done')", lessonId)
        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        val key = UUID.randomUUID().toString()
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect { status { isConflict() } }
        val contentId = jdbc.queryForObject("SELECT content_id FROM lesson_content WHERE lesson_id=?", Long::class.java, lessonId)
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
            jsonPath("$.data.completion.courseCompleted") { value(true) }
            jsonPath("$.data.completion.rewardStatus") { value("GRANTED") }
            jsonPath("$.data.completion.firstCompletion") { value(true) }
            jsonPath("$.data.completion.firstLesson") { value(true) }
            jsonPath("$.data.completion.quizSummary") { doesNotExist() }
            jsonPath("$.data.completion.rewards.length()") { value(3) }
            jsonPath("$.data.completion.rewards[0].amount") { value(10) }
            jsonPath("$.data.completion.rewards[1].badge.constellationId") { value(778) }
            jsonPath("$.data.completion.rewards[1].badge.badgeType") { value("STAR") }
            jsonPath("$.data.completion.rewards[2].badge.badgeType") { value("CONSTELLATION") }
            jsonPath("$.data.completion.wallet.stardust") { value(10) }
        }

        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courseCompleted") { value(false) }
                jsonPath("$.data.rewardStatus") { value("ALREADY_GRANTED") }
                jsonPath("$.data.firstCompletion") { value(false) }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.stardust") { value(10) }
            }
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.stardust") { value(10) }
            }
        jdbc.update(
            "UPDATE idempotency_record SET response_body=? WHERE user_id=? AND operation_id='API-407' AND idempotency_key=?",
            """{"rewards":[{"type":"WALLET","currency":"STAR","amount":1}],"wallet":{"star":3,"stardust":10},"courseCompleted":true}""",
            userId,
            key,
        )
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.star") { doesNotExist() }
                jsonPath("$.data.wallet.stardust") { value(10) }
            }
        jdbc.update(
            "UPDATE idempotency_record SET expires_at=now()-interval '1 second' WHERE user_id=? AND operation_id='API-407' AND idempotency_key=?",
            userId,
            key,
        )
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.stardust") { value(10) }
            }
        assertEquals(
            2,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM reward_ledger WHERE user_id=? AND source_type='LESSON' AND source_id=?",
                Int::class.java,
                userId,
                lessonId,
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM reward_ledger WHERE user_id=? AND source_type='COURSE' AND source_id=?",
                Int::class.java,
                userId,
                courseId,
            ),
        )
    }

    @Test
    fun `lesson completion response has no artwork reward or quiz summary`() {
        val (_, lessonId) = createUnlockedLesson("no artwork")
        val contentId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','done') RETURNING content_id",
                    Long::class.java,
                    lessonId,
                ),
            )
        jdbc.update(
            "UPDATE lesson_progress SET status='IN_PROGRESS',last_content_id=? WHERE user_id=? AND lesson_id=?",
            contentId,
            userId,
            lessonId,
        )
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", UUID.randomUUID().toString())
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(1) }
                jsonPath("$.data.rewards[0].type") { value("WALLET") }
                jsonPath("$.data.rewards[0].artwork") { doesNotExist() }
                jsonPath("$.data.quizSummary") { doesNotExist() }
                jsonPath("$.data.stardustSkipped") { doesNotExist() }
            }
    }

    @Test
    fun `onboarding completion grants stardust once while skip grants none`() {
        val (courseId, lessonId) = createUnlockedLesson("onboarding artwork")
        jdbc.update("UPDATE course SET is_onboarding=true WHERE course_id=?", courseId)
        val quizId = seedFixture(quizFixtures().first { it["caseId"].asText() == "single" }, lessonId, 0)
        jdbc.update(
            "INSERT INTO quiz_attempt(quiz_id,user_id,response,graded,correct,completed) VALUES (?,?,'{}'::jsonb,true,true,true)",
            quizId,
            userId,
        )
        mvc
            .post("/api/v1/onboarding/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", UUID.randomUUID().toString())
                contentType = MediaType.APPLICATION_JSON
                content = """{"skipped":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(1) }
                jsonPath("$.data.rewards[0].currency") { value("STARDUST") }
            }
        mvc
            .post("/api/v1/onboarding/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", UUID.randomUUID().toString())
                contentType = MediaType.APPLICATION_JSON
                content = """{"skipped":false}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
            }
        val otherId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "온보딩 건너뛰기")).id)
        val otherAuth = "Bearer " + tokens.issue(otherId, null).accessToken
        mvc
            .post("/api/v1/onboarding/complete") {
                header(HttpHeaders.AUTHORIZATION, otherAuth)
                header("Idempotency-Key", UUID.randomUUID().toString())
                contentType = MediaType.APPLICATION_JSON
                content = """{"skipped":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
            }
    }

    @Test
    fun `review set selects four wrong and one correct and reuses open set`() {
        val (_, lessonId) = createUnlockedLesson("review set")
        val fixtureItems = supportedQuizFixtures()
        val quizIds = fixtureItems.mapIndexed { index, item -> seedFixture(item, lessonId, index) }
        val today = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        quizIds.forEachIndexed { index, quizId ->
            jdbc.update(
                "INSERT INTO quiz_review_pool(user_id,quiz_id,status,available_on,last_submitted_at) VALUES (?,?,?,?,?)",
                userId,
                quizId,
                if (index < 4) "WRONG" else "CORRECT",
                today,
                Timestamp.from(clock.instant()),
            )
        }

        val first =
            mvc
                .get("/api/v1/reviews/next") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.reviewItems.length()") { value(5) }
                    jsonPath("$.data.reviewItems[0].quiz.quizId") { value(quizIds[0].toInt()) }
                    jsonPath("$.data.reviewItems[4].quiz.quizId") { value(quizIds[4].toInt()) }
                    jsonPath("$.data.reviewItems[0].quiz.answer") { doesNotExist() }
                    jsonPath("$.data.reviewItems[0].quiz.interactionType") { value("SINGLE") }
                    jsonPath("$.data.reviewItems[1].quiz.interactionType") { value("SLIDER") }
                    jsonPath("$.data.reviewItems[2].quiz.interactionType") { value("MULTI") }
                    jsonPath("$.data.reviewItems[4].quiz.interactionType") { value("BLANK") }
                    jsonPath("$.data.rewardEligible") { value(true) }
                }.andReturn()
                .response.contentAsString
        val firstItemIds = mapper.readTree(first)["data"]["reviewItems"].map { it["reviewItemId"].asLong() }
        val second =
            mvc
                .get("/api/v1/reviews/next") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(firstItemIds, mapper.readTree(second)["data"]["reviewItems"].map { it["reviewItemId"].asLong() })

        // 열린 회차를 지우면 남은 후보 4개로는 새 회차를 만들지 않는다.
        jdbc.update("DELETE FROM review_session WHERE user_id=?", userId)
        jdbc.update(
            "UPDATE quiz_review_pool SET available_on=? WHERE user_id=? AND quiz_id=?",
            today.toLocalDate().plusDays(1),
            userId,
            quizIds[4],
        )
        mvc.get("/api/v1/reviews/next") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.reviewItems.length()") { value(0) }
            jsonPath("$.data.message") { value("더 이상 복습할 문제가 없어요") }
        }
    }

    @Test
    fun `review answers update pools and accept the public quiz response shapes`() {
        val (_, lessonId) = createUnlockedLesson("review answer")
        val fixtures = supportedQuizFixtures()
        val quizIds = fixtures.mapIndexed { index, fixture -> seedFixture(fixture, lessonId, index) }
        val today = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        quizIds.forEachIndexed { index, quizId ->
            jdbc.update(
                "INSERT INTO quiz_review_pool(user_id,quiz_id,status,available_on,last_submitted_at) VALUES (?,?,?,?,?)",
                userId,
                quizId,
                if (index < 4) "WRONG" else "CORRECT",
                today,
                Timestamp.from(clock.instant()),
            )
        }
        val setBody =
            mvc
                .get("/api/v1/reviews/next") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andReturn()
                .response.contentAsString
        val items = mapper.readTree(setBody)["data"]["reviewItems"]
        val correctItemId = items[0]["reviewItemId"].asLong()
        val correctQuizId = items[0]["quiz"]["quizId"].asLong()
        val correctReviewResponse =
            postReviewAnswer(correctItemId, mapper.readTree("""{"answer":1}"""))
                .andExpect {
                    status { isOk() }
                    jsonPath("$.data.isCorrect") { value(true) }
                    jsonPath("$.data.correctAnswer.answer") { value(1) }
                    jsonPath("$.data.graded") { doesNotExist() }
                    jsonPath("$.data.correct") { doesNotExist() }
                    jsonPath("$.data.completed") { value(true) }
                    jsonPath("$.data.excludedUntil") {
                        value(
                            java.time.LocalDate
                                .ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul"))
                                .plusDays(1)
                                .atStartOfDay(java.time.ZoneId.of("Asia/Seoul"))
                                .toInstant()
                                .toString(),
                        )
                    }
                }.andReturn()
                .response.contentAsString
        assertEquals(
            setOf("attemptId", "isCorrect", "completed", "correctAnswer", "explanation", "streakDays", "excludedUntil"),
            mapper
                .readTree(correctReviewResponse)["data"]
                .fieldNames()
                .asSequence()
                .toSet(),
        )
        assertEquals("CORRECT", reviewStatus(correctQuizId))
        assertEquals(
            java.time.LocalDate
                .ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul"))
                .plusDays(1),
            jdbc.queryForObject(
                "SELECT available_on FROM quiz_review_pool WHERE user_id=? AND quiz_id=?",
                java.time.LocalDate::class.java,
                userId,
                correctQuizId,
            ),
        )
        mvc.get("/api/v1/reviews/next") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        val repeated =
            postReviewAnswer(correctItemId, mapper.readTree("""{"answer":0}"""))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(mapper.readTree(correctReviewResponse)["data"], mapper.readTree(repeated)["data"])
        val oldResult = mapper.readTree(correctReviewResponse)["data"].deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        oldResult.remove("completed")
        oldResult.set<com.fasterxml.jackson.databind.JsonNode>("correctAnswer", mapper.readTree("""{"index":0}"""))
        jdbc.update("UPDATE review_session_item SET answer_result=?::jsonb WHERE review_item_id=?", oldResult.toString(), correctItemId)
        val upgraded =
            postReviewAnswer(correctItemId, mapper.readTree("""{"answer":0}"""))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(mapper.readTree(correctReviewResponse)["data"], mapper.readTree(upgraded)["data"])
        jdbc.update("UPDATE review_session_item SET answer_result=NULL WHERE review_item_id=?", correctItemId)
        val legacyRepeated =
            postReviewAnswer(correctItemId, mapper.readTree("""{"answer":0}"""))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(mapper.readTree(correctReviewResponse)["data"], mapper.readTree(legacyRepeated)["data"])
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=? AND quiz_id=?", Int::class.java, userId, correctQuizId),
        )

        val wrongItemId = items[1]["reviewItemId"].asLong()
        val wrongQuizId = items[1]["quiz"]["quizId"].asLong()
        postReviewAnswer(wrongItemId, mapper.readTree("""{"answer":0.5}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(false) }
            jsonPath("$.data.correctAnswer.answer") { value(0.28) }
            jsonPath("$.data.closeness") { value(78) }
            jsonPath("$.data.excludedUntil") { value(null) }
            jsonPath("$.data.completed") { value(true) }
        }
        assertEquals("WRONG", reviewStatus(wrongQuizId))
        assertEquals(
            today.toLocalDate(),
            jdbc.queryForObject(
                "SELECT available_on FROM quiz_review_pool WHERE user_id=? AND quiz_id=?",
                java.time.LocalDate::class.java,
                userId,
                wrongQuizId,
            ),
        )

        val fillBlankItemId = items[4]["reviewItemId"].asLong()
        val fillBlankQuizId = items[4]["quiz"]["quizId"].asLong()
        postReviewAnswer(fillBlankItemId, mapper.readTree("""{"answer":2}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(true) }
            jsonPath("$.data.correctAnswer.answer") { value(2) }
        }
        assertEquals(
            "CORRECT",
            reviewStatus(fillBlankQuizId),
        )
        assertEquals(0, jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `review answer cannot access another users session item`() {
        val otherUserId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "외부 복습 ${UUID.randomUUID().toString().take(8)}")).id)
        val (_, lessonId) = createUnlockedLesson("foreign review")
        val quizId = seedFixture(quizFixtures().first(), lessonId, 0)
        val today = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        val sessionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO review_session(user_id,review_date) VALUES (?,?) RETURNING review_session_id",
                    Long::class.java,
                    otherUserId,
                    today,
                ),
            )
        val reviewItemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO review_session_item(review_session_id,quiz_id,item_order,source_status) VALUES (?, ?, 0, 'WRONG') RETURNING review_item_id",
                    Long::class.java,
                    sessionId,
                    quizId,
                ),
            )
        postReviewAnswer(reviewItemId, mapper.readTree("""{"answer":1}""")).andExpect { status { isNotFound() } }
        assertEquals(
            0,
            jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=? AND quiz_id=?", Int::class.java, userId, quizId),
        )
    }

    @Test
    fun `review session completion grants at most three stars and is idempotent`() {
        val (_, lessonId) = createUnlockedLesson("review complete")
        val quizIds = quizFixtures().take(5).mapIndexed { index, fixture -> seedFixture(fixture, lessonId, index) }
        val firstItems = createReviewSessionItems(quizIds, completed = false)
        val firstKey = UUID.randomUUID().toString()
        postReviewComplete(firstItems, firstKey).andExpect { status { isConflict() } }
        val itemPlaceholders = List(5) { "?" }.joinToString(",")
        jdbc.update(
            "UPDATE review_session_item SET completed=true, correct=true, answered_at=?, attempt_id=review_item_id WHERE review_item_id IN ($itemPlaceholders)",
            Timestamp.from(clock.instant()),
            *firstItems.toTypedArray(),
        )
        postReviewComplete(firstItems, firstKey).andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(1) }
            jsonPath("$.data.rewards[0].currency") { value("STARDUST") }
            jsonPath("$.data.rewards[0].amount") { value(1) }
            jsonPath("$.data.wallet.stardust") { value(1) }
        }
        postReviewComplete(firstItems, firstKey).andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(1) }
            jsonPath("$.data.wallet.stardust") { value(1) }
        }
        mvc.get("/api/v1/users/me/rewards") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.rewards[0].source") { isMap() }
            jsonPath("$.data.rewards[0].source.lessonId") { doesNotExist() }
        }
        postReviewComplete(firstItems.reversed(), firstKey).andExpect { status { isConflict() } }
        postReviewComplete(firstItems, UUID.randomUUID().toString()).andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(0) }
            jsonPath("$.data.wallet.stardust") { value(1) }
        }

        repeat(3) { index ->
            val itemIds = createReviewSessionItems(quizIds, completed = true)
            postReviewComplete(itemIds, UUID.randomUUID().toString()).andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(if (index < 2) 1 else 0) }
                jsonPath("$.data.wallet.stardust") { value(minOf(index + 2, 3)) }
            }
        }
        val today = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        assertEquals(
            3,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_session WHERE user_id=? AND review_date=? AND reward_granted",
                Int::class.java,
                userId,
                today,
            ),
        )
    }

    @Test
    fun `lessons unlock in order and the next constellation waits for the previous one`() {
        val first = createCourse("순서 A", 2)
        val second = createCourse("순서 B", 1)
        onlyCourses(first, second)
        val (a1, a2) = lessonIds(first)
        val (b1) = lessonIds(second)

        assertEquals(listOf("UNLOCKED", "LOCKED"), learning.getCourse(userId, first).lessons.map { it.status })
        assertEquals(listOf("LOCKED"), learning.getCourse(userId, second).lessons.map { it.status })
        assertEquals(listOf(false, true), learning.listCourses(userId).map { it.locked })
        assertEquals(true, learning.getCourse(userId, second).locked)
        assertEquals(null, learning.getCourse(userId, first).lessons[1].unlocksAt)
        assertEquals(0, progressRows(), "viewing must not create progress")
        assertEquals(CurrentLessonProgress(a1, first, "레슨 1", "UNLOCKED", false), lessonProgress.getProgress(userId).current)

        mvc.post("/api/v1/lessons/$a2/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("LESSON_LOCKED") }
            jsonPath("$.error.unlocksAt") { doesNotExist() }
        }

        complete(a1, first)
        assertEquals(listOf("COMPLETED", "UNLOCKED"), learning.getCourse(userId, first).lessons.map { it.status })
        assertEquals(listOf("LOCKED"), learning.getCourse(userId, second).lessons.map { it.status })

        complete(a2, first)
        assertEquals(listOf("UNLOCKED"), learning.getCourse(userId, second).lessons.map { it.status })
        assertEquals(listOf(false, false), learning.listCourses(userId).map { it.locked })
        assertEquals(CurrentLessonProgress(b1, second, "레슨 1", "UNLOCKED", false), lessonProgress.getProgress(userId).current)

        val contentId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,1,'TEXT','본문') RETURNING content_id",
                    Long::class.java,
                    b1,
                ),
            )
        jdbc.update(
            "INSERT INTO lesson_progress(user_id,lesson_id,course_id,status,last_content_id) VALUES (?,?,?,'IN_PROGRESS',?)",
            userId,
            b1,
            second,
            contentId,
        )
        assertEquals(CurrentLessonProgress(b1, second, "레슨 1", "IN_PROGRESS", true), lessonProgress.getProgress(userId).current)

        jdbc.update("UPDATE lesson_progress SET status='COMPLETED', completed_at=now() WHERE user_id=? AND lesson_id=?", userId, b1)
        assertEquals(null, lessonProgress.getProgress(userId).current)
        assertEquals(3, learning.listCourses(userId).sumOf { it.completedLessons })
    }

    @Test
    fun `review candidates never block starting or finishing a lesson`() {
        val (_, reviewLessonId) = createUnlockedLesson("복습 후보")
        val today = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        supportedQuizFixtures().mapIndexed { index, item -> seedFixture(item, reviewLessonId, index) }.forEach { quizId ->
            jdbc.update(
                "INSERT INTO quiz_review_pool(user_id,quiz_id,status,available_on,last_submitted_at) VALUES (?,?,'WRONG',?,now())",
                userId,
                quizId,
                today,
            )
        }
        val (_, lessonId) = createUnlockedLesson("복습 없이 진행")
        val contentId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,1,'TEXT','본문') RETURNING content_id",
                    Long::class.java,
                    lessonId,
                ),
            )

        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.reviewRequired") { value(false) }
            jsonPath("$.data.review") { doesNotExist() }
            jsonPath("$.data.progress.status") { value("IN_PROGRESS") }
        }
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
        }
        assertEquals(
            "COMPLETED",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
    }

    @Test
    fun `leaving mid lesson saves the position and draft for resume`() {
        val (lessonId, contents) = draftLesson("도중 나가기")
        start(lessonId)
        mvc.post("/api/v1/contents/${contents[0]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }

        saveProgress(lessonId, """{"contentId":${contents[1]},"draft":{"contentId":${contents[1]},"input":{"text":"울트"}}}""").andExpect {
            status { isOk() }
            jsonPath("$.data.progress.status") { value("IN_PROGRESS") }
            jsonPath("$.data.progress.resumeContentId") { value(contents[1]) }
            jsonPath("$.data.progress.draft.input.text") { value("울트") }
            jsonPath("$.data.progress.contentVersion") { value(1) }
        }
        start(lessonId).andExpect {
            jsonPath("$.data.progress.lastContentId") { value(contents[0]) }
            jsonPath("$.data.progress.resumeContentId") { value(contents[1]) }
            jsonPath("$.data.progress.draft.contentId") { value(contents[1]) }
            jsonPath("$.data.progress.draft.input.text") { value("울트") }
            jsonPath("$.data.progress.contentVersion") { value(1) }
        }

        val (_, otherContents) = draftLesson("다른 레슨")
        saveProgress(lessonId, """{"contentId":${contents[2]}}""").andExpect { status { isConflict() } }
        saveProgress(lessonId, """{"contentId":${otherContents[0]}}""").andExpect { status { isBadRequest() } }
        saveProgress(lessonId, """{"contentId":${contents[1]},"draft":{"contentId":${contents[0]},"input":{}}}""").andExpect {
            status { isBadRequest() }
        }
        val large = "가".repeat(1500)
        saveProgress(
            lessonId,
            """{"contentId":${contents[1]},"draft":{"contentId":${contents[1]},"input":{"text":"$large"}}}""",
        ).andExpect {
            status { isBadRequest() }
        }

        mvc.post("/api/v1/contents/${contents[1]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        start(lessonId).andExpect {
            jsonPath("$.data.progress.resumeContentId") { value(contents[2]) }
            jsonPath("$.data.progress.draft") { doesNotExist() }
        }
    }

    @Test
    fun `restart clears the saved position and draft`() {
        val (lessonId, contents) = draftLesson("처음부터")
        onlyCourses(checkNotNull(jdbc.queryForObject("SELECT course_id FROM lesson WHERE lesson_id=?", Long::class.java, lessonId)))
        start(lessonId)
        assertEquals(false, lessonProgress.getProgress(userId).current?.resumable)
        // 완료한 화면이 없어도 도중 나가기로 저장한 화면이 있으면 이어하기로 표시한다.
        saveProgress(lessonId, """{"contentId":${contents[0]}}""").andExpect { status { isOk() } }
        assertEquals(true, lessonProgress.getProgress(userId).current?.resumable)
        mvc.post("/api/v1/contents/${contents[0]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        saveProgress(lessonId, """{"contentId":${contents[1]},"draft":{"contentId":${contents[1]},"input":{"answer":1}}}""")
            .andExpect { status { isOk() } }

        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = """{"restart":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.progress.status") { value("IN_PROGRESS") }
                jsonPath("$.data.progress.lastContentId") { doesNotExist() }
                jsonPath("$.data.progress.resumeContentId") { value(contents[0]) }
                jsonPath("$.data.progress.draft") { doesNotExist() }
            }
        assertEquals(
            listOf(null, null, null),
            jdbc
                .queryForMap(
                    "SELECT last_content_id, current_content_id, draft FROM lesson_progress WHERE user_id=? AND lesson_id=?",
                    userId,
                    lessonId,
                ).values
                .toList(),
        )
        assertEquals(false, lessonProgress.getProgress(userId).current?.resumable)
    }

    @Test
    fun `a new lesson version discards the saved draft`() {
        val (lessonId, contents) = draftLesson("버전 변경")
        start(lessonId)
        mvc.post("/api/v1/contents/${contents[0]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        saveProgress(lessonId, """{"contentId":${contents[0]},"draft":{"contentId":${contents[0]},"input":{"answer":2}}}""")
            .andExpect { status { isOk() } }

        jdbc.update("UPDATE lesson SET content_version = 2 WHERE lesson_id=?", lessonId)
        start(lessonId).andExpect {
            jsonPath("$.data.progress.lastContentId") { value(contents[0]) }
            jsonPath("$.data.progress.resumeContentId") { value(contents[1]) }
            jsonPath("$.data.progress.draft") { doesNotExist() }
            jsonPath("$.data.progress.contentVersion") { value(2) }
        }
        assertEquals(
            null,
            jdbc.queryForObject(
                "SELECT draft::text FROM lesson_progress WHERE user_id=? AND lesson_id=?",
                String::class.java,
                userId,
                lessonId,
            ),
        )
    }

    private fun draftLesson(title: String): Pair<Long, List<Long>> {
        val (_, lessonId) = createUnlockedLesson(title)
        val contents =
            (1..3).map { order ->
                checkNotNull(
                    jdbc.queryForObject(
                        "INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,?,'TEXT','본문') RETURNING content_id",
                        Long::class.java,
                        lessonId,
                        order,
                    ),
                )
            }
        return lessonId to contents
    }

    private fun start(lessonId: Long) =
        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }

    private fun saveProgress(
        lessonId: Long,
        body: String,
    ) = mvc.put("/api/v1/lessons/$lessonId/progress") {
        header(HttpHeaders.AUTHORIZATION, auth)
        contentType = MediaType.APPLICATION_JSON
        content = body
    }

    @Test
    fun `starting an unlocked lesson creates its progress`() {
        val courseId = createCourse("시작", 1)
        onlyCourses(courseId)
        val (lessonId) = lessonIds(courseId)

        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
        }
        assertEquals(
            "IN_PROGRESS",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun `concurrent lesson completions grant stardust and spend energy once`() {
        val (courseId, lessonId) = createUnlockedLesson("concurrent artwork")
        val contentId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','done') RETURNING content_id",
                    Long::class.java,
                    lessonId,
                ),
            )
        jdbc.update(
            "UPDATE lesson_progress SET status='IN_PROGRESS',last_content_id=? WHERE user_id=? AND lesson_id=?",
            contentId,
            userId,
            lessonId,
        )
        val pool = Executors.newFixedThreadPool(4)
        try {
            val results =
                (1..4)
                    .map {
                        pool.submit<LessonCompleteResponse> { lessonCompletion.completeFromProgress(userId, lessonId) }
                    }.map { it.get() }
            assertEquals(1, results.sumOf { result -> result.rewards.count { it.type == "WALLET" } })
            assertEquals(1, results.count { it.rewardStatus == LessonRewardStatus.GRANTED })
            assertEquals(
                1,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM reward_ledger WHERE user_id=? AND source_key=?",
                    Int::class.java,
                    userId,
                    "LESSON:$lessonId:WALLET:STARDUST",
                ),
            )
            assertEquals(4, jdbc.queryForObject("SELECT energy FROM user_wallet WHERE user_id=?", Int::class.java, userId))
        } finally {
            pool.shutdownNow()
            jdbc.update("DELETE FROM user_refresh_token WHERE user_id=?", userId)
            jdbc.update("DELETE FROM user_wallet WHERE user_id=?", userId)
            jdbc.update("DELETE FROM app_user WHERE user_id=?", userId)
            jdbc.update("DELETE FROM course WHERE course_id=?", courseId)
        }
    }

    @Test
    fun `supported public quiz answers submit through learning contract`() {
        val (courseId, lessonId) = createUnlockedLesson("public quiz fixture")
        val fixtureItems = supportedQuizFixtures()
        val quizIds = fixtureItems.mapIndexed { index, item -> seedFixture(item, lessonId, index) }

        val wrong = mapper.readTree("""{"answer":0}""")
        postAnswer(quizIds.first(), wrong).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(false) }
            jsonPath("$.data.correctAnswer.answer") { value(1) }
            jsonPath("$.data.streakDays") { value(0) }
        }
        assertEquals("WRONG", reviewStatus(quizIds.first()))

        val correctAnswers =
            listOf(
                mapper.readTree("""{"answer":1}"""),
                mapper.readTree("""{"answer":0.28}"""),
                mapper.readTree("""{"answers":[1,2]}"""),
                mapper.readTree("""{"answer":1}"""),
                mapper.readTree("""{"answer":2}"""),
            )
        fixtureItems.forEachIndexed { index, _ ->
            val submission =
                postAnswer(quizIds[index], correctAnswers[index])
                    .andExpect {
                        status { isOk() }
                        jsonPath("$.data.attemptId") { exists() }
                        jsonPath("$.data.isCorrect") { value(true) }
                        jsonPath("$.data.streakDays") { value(0) }
                        jsonPath("$.data.correctAnswer") { exists() }
                        jsonPath("$.data.graded") { doesNotExist() }
                        jsonPath("$.data.completed") { value(true) }
                    }.andReturn()
            assertEquals(
                setOf("attemptId", "isCorrect", "completed", "correctAnswer", "explanation", "streakDays") +
                    if (index == 1) setOf("closeness") else emptySet(),
                mapper
                    .readTree(submission.response.contentAsString)["data"]
                    .fieldNames()
                    .asSequence()
                    .toSet(),
            )
            val result = mapper.readTree(submission.response.contentAsString)["data"]
            assertEquals(correctAnswers[index], result["correctAnswer"])
        }
        assertEquals(6, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
        assertEquals(5, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=?", Int::class.java, userId))
        assertEquals(
            5,
            jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=? AND status='CORRECT'", Int::class.java, userId),
        )
        assertEquals(
            "IN_PROGRESS",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
        assertEquals(courseId, jdbc.queryForObject("SELECT course_id FROM lesson WHERE lesson_id=?", Long::class.java, lessonId))
    }

    @Test
    fun `all seven quiz types are visible and accept contract answers`() {
        val (_, lessonId) = createUnlockedLesson("seven quiz types")
        val fixtures = quizFixtures().distinctBy { it["interactionType"].asText() }
        assertEquals(7, fixtures.size)
        val ids = fixtures.mapIndexed { index, fixture -> seedFixture(fixture, lessonId, index) }
        val lesson =
            mvc
                .get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val quizzes = mapper.readTree(lesson)["data"]["contents"].map { it["quiz"] }
        assertEquals(fixtures.map { it["interactionType"].asText() }, quizzes.map { it["interactionType"].asText() })
        quizzes.forEach {
            assertEquals(false, it.has("answer"))
            assertEquals(false, it.has("explanation"))
            assertEquals(false, it.has("type"))
        }
        fixtures.forEachIndexed { index, fixture ->
            postAnswer(ids[index], mapper.readTree("""{"unexpected":true}""")).andExpect { status { isBadRequest() } }
            postAnswer(ids[index], fixture["wrongResponse"]).andExpect {
                status { isOk() }
                jsonPath("$.data.isCorrect") { value(false) }
            }
            postAnswer(ids[index], fixture["correctResponse"]).andExpect {
                status { isOk() }
                jsonPath("$.data.isCorrect") { value(true) }
                jsonPath("$.data.completed") { value(true) }
                jsonPath("$.data.correctAnswer") { exists() }
            }
        }
    }

    @Test
    fun `quizzes without explanation stay out of the review pool and quiz summary`() {
        val (_, lessonId) = createUnlockedLesson("unscored quiz")
        val single = quizFixtures().first { it["caseId"].asText() == "single" }
        val unscored = single.deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().apply { remove("explanation") }
        val unscoredId = seedFixture(unscored, lessonId, 0)
        val scoredId = seedFixture(single, lessonId, 1)
        postAnswer(unscoredId, mapper.readTree("""{"answer":0}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(false) }
            jsonPath("$.data.explanation") { doesNotExist() }
            jsonPath("$.data.correctAnswer.answer") { value(1) }
        }
        postAnswer(scoredId, mapper.readTree("""{"answer":1}""")).andExpect { status { isOk() } }
        jdbc.update(
            "UPDATE lesson_progress SET last_content_id=(SELECT MAX(content_id) FROM lesson_content WHERE lesson_id=?) WHERE user_id=? AND lesson_id=?",
            lessonId,
            userId,
            lessonId,
        )
        // 풀이 기록은 DB 시각으로 남으므로 완료 시각을 그 뒤로 둔다.
        `when`(clock.instant()).thenReturn(Instant.now().plusSeconds(60))
        assertEquals(
            listOf(scoredId),
            jdbc.queryForList("SELECT quiz_id FROM quiz_review_pool WHERE user_id=?", Long::class.java, userId),
        )
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header(
                    "Idempotency-Key",
                    java.util.UUID
                        .randomUUID()
                        .toString(),
                )
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.quizSummary") { doesNotExist() }
            }
    }

    @Test
    fun `public quiz answer rejects invalid shape and out of range index`() {
        val (_, lessonId) = createUnlockedLesson("invalid public answer")
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        val quizId = seedFixture(fixture, lessonId, 0)

        postAnswer(quizId, mapper.readTree("""{"response":{"answer":1}}""")).andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
        }
        postAnswer(quizId, mapper.readTree("""{"index":99}""")).andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
        }
        postAnswer(quizId, mapper.readTree("""{"index":0,"extra":true}""")).andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `locked lesson rejects submission without recording an attempt`() {
        // 앞 레슨을 끝내지 않은 두 번째 레슨은 잠겨 있다.
        val courseId = createCourse("locked quiz", 2)
        val lessonId = lessonIds(courseId)[1]
        val fixture = quizFixtures().first()
        val quizId = seedFixture(fixture, lessonId, 0)

        postAnswer(quizId, mapper.readTree("""{"answer":1}""")).andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("LESSON_LOCKED") }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `replay records answer but leaves completed progress review pool and streak unchanged`() {
        val (_, lessonId) = createUnlockedLesson("replay quiz")
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        val quizId = seedFixture(fixture, lessonId, 0)
        jdbc.update(
            "UPDATE lesson_progress SET status='COMPLETED', completed_at=? WHERE user_id=? AND lesson_id=?",
            java.sql.Timestamp.from(Instant.now()),
            userId,
            lessonId,
        )
        jdbc.update("UPDATE app_user SET last_study_date=?, streak_days=4 WHERE user_id=?", java.sql.Date.valueOf("2026-01-01"), userId)
        jdbc.update(
            "INSERT INTO quiz_review_pool(user_id,quiz_id,status,available_on,last_submitted_at) VALUES (?,?,'WRONG',?,?)",
            userId,
            quizId,
            java.sql.Date.valueOf("2026-01-01"),
            java.sql.Timestamp.from(Instant.now()),
        )

        postAnswer(quizId, mapper.readTree("""{"answer":1}"""), replay = true).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(true) }
            jsonPath("$.data.correctAnswer.answer") { value(1) }
            jsonPath("$.data.streakDays") { value(4) }
        }
        assertEquals(
            "COMPLETED",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
        assertEquals("WRONG", reviewStatus(quizId))
        assertEquals(
            java.sql.Date.valueOf("2026-01-01"),
            jdbc.queryForObject("SELECT last_study_date FROM app_user WHERE user_id=?", java.sql.Date::class.java, userId),
        )
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
        assertEquals(true, jdbc.queryForObject("SELECT replay FROM quiz_attempt WHERE user_id=?", Boolean::class.java, userId))
    }

    @Test
    fun `replay accepts successive answers without content completion calls`() {
        val (_, lessonId) = createUnlockedLesson("replay without completion")
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','intro')", lessonId)
        val quizIds = listOf(seedFixture(fixture, lessonId, 1), seedFixture(fixture, lessonId, 2))
        jdbc.update("UPDATE lesson_progress SET status='COMPLETED', completed_at=now() WHERE user_id=? AND lesson_id=?", userId, lessonId)
        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = """{"replay":true}"""
            }.andExpect { status { isOk() } }
        quizIds.forEach { quizId ->
            postAnswer(quizId, mapper.readTree("""{"answer":1}"""), replay = true).andExpect {
                status { isOk() }
                jsonPath("$.data.isCorrect") { value(true) }
            }
        }
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=? AND replay", Int::class.java, userId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM reward_ledger WHERE user_id=?", Int::class.java, userId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=?", Int::class.java, userId))
        assertEquals(
            "COMPLETED",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
    }

    @Test
    fun `lesson replay leaves normal progress and rewards unchanged`() {
        val (_, lessonId) = createUnlockedLesson("replay progress")
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        val quizId = seedFixture(fixture, lessonId, 1)
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','intro')", lessonId)
        val contentIds =
            jdbc.query(
                "SELECT content_id FROM lesson_content WHERE lesson_id=? ORDER BY content_order",
                { rs, _ -> rs.getLong(1) },
                lessonId,
            )
        val textContentId = contentIds.first()
        val quizContentId = contentIds.last()

        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/$textContentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        postAnswer(quizId, mapper.readTree("""{"answer":1}""")).andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/$quizContentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
            jsonPath("$.data.completion.rewards.length()") { value(1) }
        }

        val normalProgressBefore =
            jdbc.queryForMap(
                "SELECT status,last_content_id,completed_at FROM lesson_progress WHERE user_id=? AND lesson_id=?",
                userId,
                lessonId,
            )
        val rewardCountBefore = jdbc.queryForObject("SELECT COUNT(*) FROM reward_ledger WHERE user_id=?", Int::class.java, userId)
        val startReplay =
            mvc
                .post("/api/v1/lessons/$lessonId/start") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                    contentType = MediaType.APPLICATION_JSON
                    content = mapper.writeValueAsBytes(mapOf("replay" to true))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.progress.status") { value("COMPLETED") }
                    jsonPath("$.data.progress.lastContentId") { doesNotExist() }
                    jsonPath("$.data.progress.resumeContentId") { value(textContentId) }
                }.andReturn()
        assertEquals(2, mapper.readTree(startReplay.response.contentAsString)["data"]["contents"].size())

        mvc.post("/api/v1/contents/$textContentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = mapper.writeValueAsBytes(mapOf("replay" to true))
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.progress.status") { value("COMPLETED") }
                jsonPath("$.data.progress.lastContentId") { value(textContentId) }
                jsonPath("$.data.progress.resumeContentId") { value(quizContentId) }
            }
        postAnswer(quizId, mapper.readTree("""{"answer":1}"""), replay = true).andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/$quizContentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
            jsonPath("$.data.completion.rewardStatus") { value("ALREADY_GRANTED") }
            jsonPath("$.data.completion.firstCompletion") { value(false) }
            jsonPath("$.data.completion.rewards.length()") { value(0) }
        }

        assertEquals(
            normalProgressBefore,
            jdbc.queryForMap(
                "SELECT status,last_content_id,completed_at FROM lesson_progress WHERE user_id=? AND lesson_id=?",
                userId,
                lessonId,
            ),
        )
        assertEquals(rewardCountBefore, jdbc.queryForObject("SELECT COUNT(*) FROM reward_ledger WHERE user_id=?", Int::class.java, userId))
        assertEquals(
            "COMPLETED",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
    }

    @Test
    fun `energy is spent only when lesson stardust is granted`() {
        val now = Instant.parse("2026-03-10T05:00:00Z")
        `when`(clock.instant()).thenReturn(now)
        val tomorrow = Instant.parse("2026-03-10T15:00:00Z")
        mvc.get("/api/v1/users/me/wallet") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.energy") { value(5) }
            jsonPath("$.data.energyResetsAt") { value(tomorrow.toString()) }
        }
        jdbc.update(
            "INSERT INTO user_wallet(user_id,energy,energy_date) VALUES (?,0,'2026-03-10') ON CONFLICT (user_id) DO UPDATE SET energy=0, energy_date='2026-03-10'",
            userId,
        )
        entityManager.clear()

        val (_, lessonId) = createUnlockedLesson("energy lesson")
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','본문')", lessonId)
        val contentId = jdbc.queryForObject("SELECT content_id FROM lesson_content WHERE lesson_id=?", Long::class.java, lessonId)
        mvc.post("/api/v1/lessons/$lessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.energyNotice") { value(true) }
        }
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
            jsonPath("$.data.completion.rewards.length()") { value(0) }
            jsonPath("$.data.completion.rewardStatus") { value("NO_ENERGY") }
            jsonPath("$.data.completion.firstCompletion") { value(true) }
            jsonPath("$.data.completion.wallet.stardust") { value(0) }
            jsonPath("$.data.completion.wallet.energy") { value(0) }
        }

        `when`(clock.instant()).thenReturn(tomorrow)
        val replay = mapper.writeValueAsBytes(mapOf("replay" to true))
        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = replay
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.energyNotice") { value(false) }
            }
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.completion.rewards[0].currency") { value("STARDUST") }
            jsonPath("$.data.completion.rewardStatus") { value("GRANTED") }
            jsonPath("$.data.completion.firstCompletion") { value(false) }
            jsonPath("$.data.completion.wallet.stardust") { value(10) }
            jsonPath("$.data.completion.wallet.energy") { value(4) }
        }

        // 별가루를 받은 레슨의 다시 보기는 에너지를 쓰지 않는다.
        mvc
            .post("/api/v1/lessons/$lessonId/start") {
                header(HttpHeaders.AUTHORIZATION, auth)
                contentType = MediaType.APPLICATION_JSON
                content = replay
            }.andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.completion.rewardStatus") { value("ALREADY_GRANTED") }
            jsonPath("$.data.completion.wallet.energy") { value(4) }
        }

        // 레슨을 시작할 때는 에너지를 쓰지 않는다.
        val (_, nextLessonId) = createUnlockedLesson("energy resume")
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','본문')", nextLessonId)
        repeat(2) {
            mvc.post("/api/v1/lessons/$nextLessonId/start") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }
        }
        mvc.get("/api/v1/users/me/wallet") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            jsonPath("$.data.energy") { value(4) }
            jsonPath("$.data.energyResetsAt") { value(Instant.parse("2026-03-11T15:00:00Z").toString()) }
        }
    }

    @Test
    fun `quiz answer submissions do not record study streak`() {
        val (_, lessonId) = createUnlockedLesson("streak dates")
        val fixture = quizFixtures().first { it["caseId"].asText() == "single" }
        val quizId = seedFixture(fixture, lessonId, 0)
        val response = mapper.readTree("""{"answer":1}""")

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T14:59:59Z"))
        assertEquals(0, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)
        assertEquals(0, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)
        assertEquals(
            null,
            jdbc.queryForObject("SELECT last_study_date FROM app_user WHERE user_id=?", java.sql.Date::class.java, userId),
        )

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T15:00:00Z"))
        assertEquals(0, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-12T15:00:00Z"))
        assertEquals(0, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)
        assertEquals(
            null,
            jdbc.queryForObject("SELECT last_study_date FROM app_user WHERE user_id=?", java.sql.Date::class.java, userId),
        )
    }

    @Test
    fun `completed study events advance streak once per KST date`() {
        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T14:59:59Z"))
        assertEquals(1, studyStreak.recordCompletedStudy(userId))
        assertEquals(1, studyStreak.recordCompletedStudy(userId))

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T15:00:00Z"))
        assertEquals(2, studyStreak.recordCompletedStudy(userId))

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-12T15:00:00Z"))
        assertEquals(1, studyStreak.recordCompletedStudy(userId))
    }

    private fun createCourse(
        title: String,
        lessons: Int,
    ): Long {
        val slug = "c-" + UUID.randomUUID().toString().replace("-", "")
        jdbc.update("INSERT INTO course(slug,title,category,topic) VALUES (?, ?, 'TEST', ?)", slug, "$title-$slug", title)
        val courseId = checkNotNull(jdbc.queryForObject("SELECT course_id FROM course ORDER BY course_id DESC LIMIT 1", Long::class.java))
        repeat(lessons) { order ->
            jdbc.update(
                "INSERT INTO lesson(course_id,slug,title,lesson_order) VALUES (?, ?, ?, ?)",
                courseId,
                "$slug/l${order + 1}",
                "레슨 ${order + 1}",
                order + 1,
            )
        }
        return courseId
    }

    /** 다른 테스트가 남긴 코스가 순서 계산에 끼지 않도록 나머지를 온보딩으로 돌린다. 트랜잭션이 끝나면 되돌아간다. */
    private fun onlyCourses(vararg courseIds: Long) {
        jdbc.update("UPDATE course SET is_onboarding = TRUE WHERE course_id NOT IN (${courseIds.joinToString(",")})")
        courseIds.forEachIndexed { index, id -> jdbc.update("UPDATE course SET course_order = ? WHERE course_id = ?", index + 1, id) }
    }

    private fun lessonIds(courseId: Long): List<Long> =
        jdbc.queryForList("SELECT lesson_id FROM lesson WHERE course_id=? ORDER BY lesson_order", Long::class.java, courseId)

    private fun progressRows(): Int =
        checkNotNull(jdbc.queryForObject("SELECT COUNT(*) FROM lesson_progress WHERE user_id=?", Int::class.java, userId))

    private fun complete(
        lessonId: Long,
        courseId: Long,
    ) {
        jdbc.update(
            "INSERT INTO lesson_progress(user_id,lesson_id,course_id,status,completed_at) VALUES (?,?,?,'COMPLETED',now())",
            userId,
            lessonId,
            courseId,
        )
    }

    private fun createUnlockedLesson(title: String): Pair<Long, Long> {
        val courseId = createCourse(title, 1)
        val lessonId = checkNotNull(jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId))
        jdbc.update(
            "INSERT INTO lesson_progress(user_id,lesson_id,course_id,status) VALUES (?, ?, ?, 'UNLOCKED')",
            userId,
            lessonId,
            courseId,
        )
        return courseId to lessonId
    }

    private fun quizFixtures(): List<JsonNode> =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { mapper.readTree(it).toList() }

    private fun supportedQuizFixtures(): List<JsonNode> {
        val byCase = quizFixtures().associateBy { it["caseId"].asText() }
        val caseIds = listOf("single", "slider", "multi", "single", "blank")
        return caseIds.map { byCase.getValue(it) }
    }

    private fun seedFixture(
        fixture: JsonNode,
        lessonId: Long,
        order: Int,
    ): Long {
        val quiz =
            quizzes.saveAndFlush(
                QuizItemEntity(
                    lessonId = 23,
                    question = fixture["question"].asText(),
                    instruction = fixture["instruction"].asText(),
                    interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
                    config = mapper.convertValue(fixture["config"], object : TypeReference<Map<String, Any?>>() {}),
                    answer =
                        fixture["answer"].takeUnless { it.isNull }?.let {
                            mapper.convertValue(
                                it,
                                object : TypeReference<Map<String, Any?>>() {},
                            )
                        },
                    explanation = fixture["explanation"]?.asText(),
                    difficulty = fixture["difficulty"].asText(),
                    quizOrder = order,
                ),
            )
        jdbc.update(
            "INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, ?, 'QUIZ', ?)",
            lessonId,
            order,
            quiz.id,
        )
        entityManager.flush()
        return checkNotNull(quiz.id)
    }

    private fun postAnswer(
        quizId: Long,
        answer: JsonNode,
        replay: Boolean = false,
    ) = mvc.post("/api/v1/quizzes/$quizId/answer") {
        header(HttpHeaders.AUTHORIZATION, auth)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsBytes(mapOf("answer" to answer, "replay" to replay))
    }

    private fun postReviewAnswer(
        reviewItemId: Long,
        answer: JsonNode,
    ) = mvc.post("/api/v1/reviews/$reviewItemId/answer") {
        header(HttpHeaders.AUTHORIZATION, auth)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsBytes(mapOf("answer" to answer))
    }

    private fun postReviewComplete(
        reviewItemIds: List<Long>,
        key: String,
    ) = mvc.post("/api/v1/reviews/complete") {
        header(HttpHeaders.AUTHORIZATION, auth)
        header("Idempotency-Key", key)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsBytes(mapOf("reviewItemIds" to reviewItemIds))
    }

    private fun createReviewSessionItems(
        quizIds: List<Long>,
        completed: Boolean,
    ): List<Long> {
        val reviewDate = java.sql.Date.valueOf(java.time.LocalDate.ofInstant(clock.instant(), java.time.ZoneId.of("Asia/Seoul")))
        val sessionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO review_session(user_id,review_date) VALUES (?,?) RETURNING review_session_id",
                    Long::class.java,
                    userId,
                    reviewDate,
                ),
            )
        return quizIds.mapIndexed { index, quizId ->
            val itemId =
                checkNotNull(
                    jdbc.queryForObject(
                        "INSERT INTO review_session_item(review_session_id,quiz_id,item_order,source_status) VALUES (?, ?, ?, 'WRONG') RETURNING review_item_id",
                        Long::class.java,
                        sessionId,
                        quizId,
                        index,
                    ),
                )
            if (completed) {
                jdbc.update(
                    "UPDATE review_session_item SET completed=true,correct=true,answered_at=?,attempt_id=? WHERE review_item_id=?",
                    Timestamp.from(clock.instant()),
                    itemId,
                    itemId,
                )
            }
            itemId
        }
    }

    private fun reviewStatus(quizId: Long): String? =
        jdbc
            .query(
                "SELECT status FROM quiz_review_pool WHERE user_id=? AND quiz_id=?",
                { rs, _ -> rs.getString(1) },
                userId,
                quizId,
            ).firstOrNull()
}
