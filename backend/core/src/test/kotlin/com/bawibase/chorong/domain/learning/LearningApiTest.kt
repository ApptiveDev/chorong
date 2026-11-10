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
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
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
        jdbc.update("INSERT INTO course(title,category,topic,description,course_order) VALUES ('일반 코스','SCIENCE','일반 코스','설명',1)")
        val courseId = jdbc.queryForObject("SELECT course_id FROM course WHERE title='일반 코스'", Long::class.java)
        jdbc.update("INSERT INTO course(title,category,topic,is_onboarding) VALUES ('온보딩','START','온보딩',true)")
        jdbc.update("INSERT INTO lesson(course_id,title,lesson_order) VALUES (?, '레슨 1', 1)", courseId)
        val lessonId = jdbc.queryForObject("SELECT lesson_id FROM lesson WHERE course_id=?", Long::class.java, courseId)
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?, 0, 'TEXT', '학습 본문')", lessonId)
        val quiz =
            quizzes.saveAndFlush(
                QuizItemEntity(
                    lessonId = 23,
                    question = "질문",
                    instruction = "선택",
                    interactionType = QuizInteractionType.MULTIPLE_CHOICE,
                    config =
                        mapOf(
                            "selectionType" to "SINGLE",
                            "options" to listOf(mapOf("id" to "a", "text" to "선택지")),
                            "shuffle" to false,
                        ),
                    answer = mapOf("correctOptionIds" to listOf("a")),
                    explanation = "비공개 해설",
                    difficulty = "EASY",
                    quizOrder = 0,
                ),
            )
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,quiz_id) VALUES (?, 1, 'QUIZ', ?)", lessonId, quiz.id)
        jdbc.update(
            "INSERT INTO lesson_content(lesson_id,content_order,content_type,media_url) VALUES (?, 2, 'IMAGE', 'https://example.com/image.png')",
            lessonId,
        )
        jdbc.update(
            "INSERT INTO lesson_content(lesson_id,content_order,content_type,media_url) VALUES (?, 3, 'VIDEO', 'https://example.com/video.mp4')",
            lessonId,
        )
        entityManager.flush()

        mvc.get("/api/v1/courses") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.courses.length()") { value(1) }
            jsonPath("$.data.courses[0].title") { value("일반 코스") }
            jsonPath("$.data.courses[0].topic") { value("일반 코스") }
            jsonPath("$.data.courses[0].totalLessons") { value(1) }
        }
        mvc.get("/api/v1/courses/$courseId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.topic") { value("일반 코스") }
            jsonPath("$.data.lessons[0].lessonId") { value(lessonId) }
            jsonPath("$.data.lessons[0].status") { value("UNLOCKED") }
        }
        mvc.get("/api/v1/lessons/$lessonId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.contents.length()") { value(4) }
            jsonPath("$.data.contents[0].contentType") { value("TEXT") }
            jsonPath("$.data.contents[0].body") { value("학습 본문") }
            jsonPath("$.data.contents[1].contentType") { value("QUIZ") }
            jsonPath("$.data.contents[1].quiz.quizId") { value(quiz.id) }
            jsonPath("$.data.contents[1].quiz.interactionType") { value("MULTIPLE_CHOICE") }
            jsonPath("$.data.contents[1].quiz.config.options[0].text") { value("선택지") }
            jsonPath("$.data.contents[1].quiz.instruction") { value("선택") }
            jsonPath("$.data.contents[1].quiz.type") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.answer") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.explanation") { doesNotExist() }
            jsonPath("$.data.contents[2].contentType") { value("IMAGE") }
            jsonPath("$.data.contents[3].contentType") { value("VIDEO") }
        }
        assertEquals(23L, quizzes.findById(checkNotNull(quiz.id)).orElseThrow().lessonId)
    }

    @Test
    fun `course listing filters category and topic separately and together`() {
        jdbc.update(
            """INSERT INTO course(title,category,topic,course_order) VALUES
               ('우주 과학','SCIENCE','SPACE',1),
               ('자연 과학','SCIENCE','NATURE',2),
               ('우주 예술','ART','SPACE',3),
               ('자연 예술','ART','NATURE',4)""",
        )

        mvc
            .get("/api/v1/courses") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("category", "SCIENCE")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courses.length()") { value(2) }
            }
        mvc
            .get("/api/v1/courses") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("topic", "SPACE")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courses.length()") { value(2) }
            }
        mvc
            .get("/api/v1/courses") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("category", "SCIENCE")
                param("topic", "SPACE")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courses.length()") { value(1) }
                jsonPath("$.data.courses[0].title") { value("우주 과학") }
                jsonPath("$.data.courses[0].topic") { value("SPACE") }
            }
        mvc
            .get("/api/v1/courses") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("category", "ART")
                param("topic", "MISSING")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courses.length()") { value(0) }
            }
    }

    @Test
    fun `missing course and lesson return not found`() {
        mvc.get("/api/v1/courses/999999") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isNotFound() } }
        mvc.get("/api/v1/lessons/999999") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `lesson start resumes in order and requires completed quiz attempt`() {
        val (_, lessonId) = createUnlockedLesson("lesson progress")
        jdbc.update("INSERT INTO lesson_content(lesson_id,content_order,content_type,body) VALUES (?,0,'TEXT','intro')", lessonId)
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
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
            jsonPath("$.data.contents[1].quiz.interactionType") { value("MULTIPLE_CHOICE") }
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
        postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}""")).andExpect { status { isOk() } }
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
            jsonPath("$.data.completion.rewards.length()") { value(3) }
            jsonPath("$.data.completion.rewards[0].amount") { value(1) }
            jsonPath("$.data.completion.rewards[1].badge.constellationId") { value(778) }
            jsonPath("$.data.completion.rewards[1].badge.badgeType") { value("STAR") }
            jsonPath("$.data.completion.rewards[2].badge.badgeType") { value("CONSTELLATION") }
            jsonPath("$.data.completion.wallet.stardust") { value(1) }
        }

        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courseCompleted") { value(true) }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.stardust") { value(1) }
            }
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.wallet.stardust") { value(1) }
            }
        jdbc.update(
            "UPDATE idempotency_record SET response_body=? WHERE user_id=? AND operation_id='API-407' AND idempotency_key=?",
            """{"rewards":[{"type":"WALLET","currency":"STAR","amount":1}],"wallet":{"star":3,"stardust":1},"courseCompleted":true}""",
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
                jsonPath("$.data.wallet.stardust") { value(1) }
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
                jsonPath("$.data.wallet.stardust") { value(1) }
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
    fun `lesson completion stores artwork once and paginates artwork history`() {
        val (_, lessonId) = createUnlockedLesson("artwork completion")
        jdbc.update("INSERT INTO user_wallet(user_id,star,stardust) VALUES (?,17,0) ON CONFLICT (user_id) DO UPDATE SET star=17", userId)
        jdbc.update(
            "INSERT INTO reward_ledger(user_id,source_type,source_id,source_key,reward_type,currency,amount) VALUES (?,'LESSON',?,'old-star','WALLET','STAR',1)",
            userId,
            lessonId,
        )
        jdbc.update("UPDATE lesson SET artwork_image_url='https://example.com/art.png' WHERE lesson_id=?", lessonId)
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
        val quizId = seedFixture(fixture, lessonId, 0)
        val contentId =
            checkNotNull(jdbc.queryForObject("SELECT content_id FROM lesson_content WHERE lesson_id=?", Long::class.java, lessonId))
        jdbc.update(
            "UPDATE lesson_progress SET status='IN_PROGRESS',last_content_id=? WHERE user_id=? AND lesson_id=?",
            contentId,
            userId,
            lessonId,
        )
        val now = clock.instant()
        listOf(Triple(false, false, -3L), Triple(true, false, -2L), Triple(false, true, -1L)).forEach { (correct, replay, seconds) ->
            jdbc.update(
                """INSERT INTO quiz_attempt(quiz_id,user_id,response,graded,correct,completed,replay,submitted_at)
                   VALUES (?,?,'{}'::jsonb,true,?,true,?,?)""",
                quizId,
                userId,
                correct,
                replay,
                Timestamp.from(now.plusSeconds(seconds)),
            )
        }
        val key = UUID.randomUUID().toString()
        val first =
            mvc
                .post("/api/v1/lessons/$lessonId/complete") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                    header("Idempotency-Key", key)
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.quizSummary.correctCount") { value(1) }
                    jsonPath("$.data.quizSummary.totalCount") { value(1) }
                    jsonPath("$.data.rewards[0].currency") { value("STARDUST") }
                    jsonPath("$.data.wallet.stardust") { value(1) }
                    jsonPath("$.data.wallet.star") { doesNotExist() }
                    jsonPath("$.data.rewards[1].type") { value("ARTWORK") }
                    jsonPath("$.data.rewards[1].artwork.imageUrl") { value("https://example.com/art.png") }
                }.andReturn()
                .response.contentAsString
        val artworkId = mapper.readTree(first)["data"]["rewards"][1]["artwork"]["artworkId"].asLong()
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", UUID.randomUUID().toString())
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(0) }
                jsonPath("$.data.quizSummary.correctCount") { value(1) }
            }
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM learning_artwork WHERE user_id=? AND lesson_id=?", Int::class.java, userId, lessonId),
        )
        assertEquals(17L, jdbc.queryForObject("SELECT star FROM user_wallet WHERE user_id=?", Long::class.java, userId))
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM reward_ledger WHERE user_id=? AND artwork_id=?", Int::class.java, userId, artworkId),
        )
        mvc.get("/api/v1/users/me/rewards") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(2) }
            jsonPath("$.data.rewards[0].artwork.artworkId") { value(artworkId.toInt()) }
        }
        val (_, otherLessonId) = createUnlockedLesson("another artwork")
        jdbc.update(
            "INSERT INTO learning_artwork(user_id,lesson_id,image_url,completed_at) VALUES (?,?,?,?)",
            userId,
            otherLessonId,
            "https://example.com/other.png",
            Timestamp.from(now),
        )
        val page =
            mvc
                .get("/api/v1/users/me/artworks") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                    param("size", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.artworks.length()") { value(1) }
                }.andReturn()
                .response.contentAsString
                .let(mapper::readTree)
        val cursor = page["meta"]["nextCursor"].asText()
        val next =
            mvc
                .get("/api/v1/users/me/artworks") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                    param("size", "1")
                    param("cursor", cursor)
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let(mapper::readTree)
        assertEquals(artworkId, next["data"]["artworks"][0]["artworkId"].asLong())
        mvc
            .get("/api/v1/users/me/artworks") {
                header(HttpHeaders.AUTHORIZATION, auth)
                param("cursor", "invalid")
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `onboarding completion grants artwork once while skip grants none`() {
        val (courseId, lessonId) = createUnlockedLesson("onboarding artwork")
        jdbc.update("UPDATE course SET is_onboarding=true WHERE course_id=?", courseId)
        jdbc.update("UPDATE lesson SET artwork_image_url='https://example.com/onboarding.png' WHERE lesson_id=?", lessonId)
        val quizId = seedFixture(quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }, lessonId, 0)
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
                jsonPath("$.data.rewards[1].artwork.imageUrl") { value("https://example.com/onboarding.png") }
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
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM learning_artwork WHERE user_id=?", Int::class.java, otherId))
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
                    param("lessonId", lessonId.toString())
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.reviewItems.length()") { value(5) }
                    jsonPath("$.data.reviewItems[0].quiz.quizId") { value(quizIds[0].toInt()) }
                    jsonPath("$.data.reviewItems[4].quiz.quizId") { value(quizIds[4].toInt()) }
                    jsonPath("$.data.reviewItems[0].quiz.answer") { doesNotExist() }
                    jsonPath("$.data.reviewItems[0].quiz.interactionType") { value("MULTIPLE_CHOICE") }
                    jsonPath("$.data.reviewItems[1].quiz.interactionType") { value("SLIDER") }
                    jsonPath("$.data.reviewItems[2].quiz.interactionType") { value("SORT") }
                    jsonPath("$.data.reviewItems[4].quiz.interactionType") { value("TAP") }
                    jsonPath("$.data.rewardEligible") { value(true) }
                }.andReturn()
                .response.contentAsString
        val firstItemIds = mapper.readTree(first)["data"]["reviewItems"].map { it["reviewItemId"].asLong() }
        val second =
            mvc
                .get("/api/v1/reviews/next") {
                    header(HttpHeaders.AUTHORIZATION, auth)
                    param("lessonId", lessonId.toString())
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(firstItemIds, mapper.readTree(second)["data"]["reviewItems"].map { it["reviewItemId"].asLong() })

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
            postReviewAnswer(correctItemId, mapper.readTree("""{"selectedOptionIds":["italy"]}"""))
                .andExpect {
                    status { isOk() }
                    jsonPath("$.data.isCorrect") { value(true) }
                    jsonPath("$.data.correctAnswer.selectedOptionIds[0]") { value("italy") }
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
            postReviewAnswer(correctItemId, mapper.readTree("""{"selectedOptionIds":["france"]}"""))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(mapper.readTree(correctReviewResponse)["data"], mapper.readTree(repeated)["data"])
        val oldResult = mapper.readTree(correctReviewResponse)["data"].deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        oldResult.remove("completed")
        oldResult.set<com.fasterxml.jackson.databind.JsonNode>("correctAnswer", mapper.readTree("""{"index":0}"""))
        jdbc.update("UPDATE review_session_item SET answer_result=?::jsonb WHERE review_item_id=?", oldResult.toString(), correctItemId)
        val upgraded =
            postReviewAnswer(correctItemId, mapper.readTree("""{"selectedOptionIds":["france"]}"""))
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(mapper.readTree(correctReviewResponse)["data"], mapper.readTree(upgraded)["data"])
        jdbc.update("UPDATE review_session_item SET answer_result=NULL WHERE review_item_id=?", correctItemId)
        val legacyRepeated =
            postReviewAnswer(correctItemId, mapper.readTree("""{"selectedOptionIds":["france"]}"""))
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
        postReviewAnswer(wrongItemId, mapper.readTree("""{"value":1750}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(false) }
            jsonPath("$.data.correctAnswer.value") { value(1760) }
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
        postReviewAnswer(fillBlankItemId, mapper.readTree("""{"selectedItemIds":["renaissance"]}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(true) }
            jsonPath("$.data.correctAnswer.selectedItemIds[0]") { value("renaissance") }
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
        postReviewAnswer(reviewItemId, mapper.readTree("""{"selectedOptionIds":["italy"]}""")).andExpect { status { isNotFound() } }
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
    fun `KST boundary unlocks one new lesson per day and counts completed lessons`() {
        val courseId = createCourse("KST boundary", 3)
        `when`(clock.instant()).thenReturn(Instant.parse("2026-01-01T14:59:59Z"))

        val beforeMidnight = learning.getCourse(userId, courseId)
        assertEquals(listOf("UNLOCKED", "LOCKED", "LOCKED"), beforeMidnight.lessons.map { it.status })
        assertEquals(Instant.parse("2026-01-01T15:00:00Z"), beforeMidnight.lessons[1].unlocksAt)

        val repeated = learning.getCourse(userId, courseId)
        assertEquals(1, unlockCount(courseId))
        assertEquals(beforeMidnight.lessons.map { it.status }, repeated.lessons.map { it.status })

        `when`(clock.instant()).thenReturn(Instant.parse("2026-01-01T15:00:00Z"))
        val afterMidnight = learning.getCourse(userId, courseId)
        assertEquals(listOf("UNLOCKED", "UNLOCKED", "LOCKED"), afterMidnight.lessons.map { it.status })
        assertEquals(Instant.parse("2026-01-02T15:00:00Z"), afterMidnight.lessons[2].unlocksAt)

        `when`(clock.instant()).thenReturn(Instant.parse("2026-01-02T15:00:00Z"))
        val allUnlocked = learning.getCourse(userId, courseId)
        assertEquals(listOf("UNLOCKED", "UNLOCKED", "UNLOCKED"), allUnlocked.lessons.map { it.status })
        jdbc.update(
            "UPDATE lesson_progress SET status='COMPLETED', completed_at=? WHERE course_id=?",
            Timestamp.from(Instant.parse("2026-01-02T15:01:00Z")),
            courseId,
        )
        assertEquals(3, learning.listCourses(userId, null).first { it.courseId == courseId }.completedLessons)
        assertEquals(3, unlockCount(courseId))
        `when`(clock.instant()).thenReturn(Instant.parse("2026-01-03T15:00:00Z"))
        assertEquals(listOf("COMPLETED", "COMPLETED", "COMPLETED"), learning.getCourse(userId, courseId).lessons.map { it.status })
        assertEquals(3, unlockCount(courseId))

        val anotherUserId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "다른 학습자")).id)
        assertEquals(listOf("UNLOCKED", "LOCKED", "LOCKED"), learning.getCourse(anotherUserId, courseId).lessons.map { it.status })
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun `concurrent lesson completions grant one artwork`() {
        val (courseId, lessonId) = createUnlockedLesson("concurrent artwork")
        jdbc.update("UPDATE lesson SET artwork_image_url='https://example.com/art.png' WHERE lesson_id=?", lessonId)
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
            assertEquals(1, results.sumOf { result -> result.rewards.count { it.type == "ARTWORK" } })
            assertEquals(
                1,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM learning_artwork WHERE user_id=? AND lesson_id=?",
                    Int::class.java,
                    userId,
                    lessonId,
                ),
            )
            assertEquals(
                1,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM reward_ledger WHERE user_id=? AND source_id=? AND reward_type='ARTWORK'",
                    Int::class.java,
                    userId,
                    lessonId,
                ),
            )
        } finally {
            pool.shutdownNow()
            jdbc.update("DELETE FROM user_refresh_token WHERE user_id=?", userId)
            jdbc.update("DELETE FROM user_wallet WHERE user_id=?", userId)
            jdbc.update("DELETE FROM app_user WHERE user_id=?", userId)
            jdbc.update("DELETE FROM course WHERE course_id=?", courseId)
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun `concurrent course detail requests create one unlock`() {
        val courseId = createCourse("Concurrent", 2)
        val pool = Executors.newFixedThreadPool(8)
        try {
            val requests = (1..8).map { pool.submit<List<String>> { learning.getCourse(userId, courseId).lessons.map { it.status } } }
            val results = requests.map { it.get() }
            assertEquals(1, unlockCount(courseId))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lesson_progress WHERE course_id=?", Int::class.java, courseId))
            assertEquals(1, results.map { it.count { status -> status == "UNLOCKED" } }.distinct().size)
            assertEquals(listOf("UNLOCKED", "LOCKED"), results.first())
        } finally {
            pool.shutdownNow()
            jdbc.update("DELETE FROM course WHERE course_id=?", courseId)
            jdbc.update("DELETE FROM user_refresh_token WHERE user_id=?", userId)
            jdbc.update("DELETE FROM app_user WHERE user_id=?", userId)
        }
    }

    @Test
    fun `supported public quiz answers submit through learning contract`() {
        val (courseId, lessonId) = createUnlockedLesson("public quiz fixture")
        val fixtureItems = supportedQuizFixtures()
        val quizIds = fixtureItems.mapIndexed { index, item -> seedFixture(item, lessonId, index) }

        val wrong = mapper.readTree("""{"selectedOptionIds":["france"]}""")
        postAnswer(quizIds.first(), wrong).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(false) }
            jsonPath("$.data.correctAnswer.selectedOptionIds[0]") { value("italy") }
            jsonPath("$.data.streakDays") { value(0) }
        }
        assertEquals("WRONG", reviewStatus(quizIds.first()))

        val correctAnswers =
            listOf(
                mapper.readTree("""{"selectedOptionIds":["italy"]}"""),
                mapper.readTree("""{"value":1760.0}"""),
                mapper.readTree("""{"order":["renaissance","industrial","french_revolution"]}"""),
                mapper.readTree("""{"selectedOptionIds":["italy"]}"""),
                mapper.readTree("""{"selectedItemIds":["renaissance"]}"""),
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
                setOf("attemptId", "isCorrect", "completed", "correctAnswer", "explanation", "streakDays"),
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
            val wrong =
                when (fixture["interactionType"].asText()) {
                    "SLIDER" -> """{"value":1740}"""
                    "TAP" -> """{"selectedItemIds":["humanism"]}"""
                    "DRAG_DROP" -> """{"placements":{"aristotle":"ancient","newton":"ancient","einstein":"ancient"}}"""
                    "SORT" -> """{"order":["industrial","renaissance","french_revolution"]}"""
                    "MATCHING" -> """{"matches":{"newton":"relativity","einstein":"gravity","darwin":"evolution"}}"""
                    "FLIP_CARD" -> """{"pairs":[{"firstCardId":"c1","secondCardId":"c2"}]}"""
                    else -> """{"selectedOptionIds":["france"]}"""
                }
            postAnswer(ids[index], mapper.readTree(wrong)).andExpect {
                status { isOk() }
                jsonPath("$.data.isCorrect") { value(false) }
            }
            if (fixture["interactionType"].asText() == "FLIP_CARD") {
                postAnswer(ids[index], mapper.readTree("""{"pairs":[{"firstCardId":"c1","secondCardId":"c5"}]}""")).andExpect {
                    status { isOk() }
                    jsonPath("$.data.completed") { value(false) }
                    jsonPath("$.data.correctAnswer") { doesNotExist() }
                }
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
    fun `review flip card stays open until all pairs are matched`() {
        val (_, lessonId) = createUnlockedLesson("flip review")
        val fixture = quizFixtures().first { it["caseId"].asText() == "flip_card" }
        val quizId = seedFixture(fixture, lessonId, 0)
        val reviewItemId = createReviewSessionItems(listOf(quizId), completed = false).single()
        postReviewAnswer(reviewItemId, mapper.readTree("""{"pairs":[{"firstCardId":"c1","secondCardId":"c5"}]}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.completed") { value(false) }
            jsonPath("$.data.correctAnswer") { doesNotExist() }
        }
        assertEquals(
            false,
            jdbc.queryForObject("SELECT completed FROM review_session_item WHERE review_item_id=?", Boolean::class.java, reviewItemId),
        )
        postReviewAnswer(reviewItemId, fixture["correctResponse"]).andExpect {
            status { isOk() }
            jsonPath("$.data.completed") { value(true) }
            jsonPath("$.data.correctAnswer.pairs.length()") { value(3) }
        }
    }

    @Test
    fun `public quiz answer rejects invalid shape and out of range index`() {
        val (_, lessonId) = createUnlockedLesson("invalid public answer")
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
        val quizId = seedFixture(fixture, lessonId, 0)

        postAnswer(quizId, mapper.readTree("""{"response":{"selectedOptionIds":["italy"]}}""")).andExpect {
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
        val (_, lessonId) = createUnlockedLesson("locked quiz")
        jdbc.update("DELETE FROM lesson_progress WHERE user_id=? AND lesson_id=?", userId, lessonId)
        val fixture = quizFixtures().first()
        val quizId = seedFixture(fixture, lessonId, 0)

        postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}""")).andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("LESSON_LOCKED") }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `replay records answer but leaves completed progress review pool and streak unchanged`() {
        val (_, lessonId) = createUnlockedLesson("replay quiz")
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
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

        postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}"""), replay = true).andExpect {
            status { isOk() }
            jsonPath("$.data.isCorrect") { value(true) }
            jsonPath("$.data.correctAnswer.selectedOptionIds[0]") { value("italy") }
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
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
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
            postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}"""), replay = true).andExpect {
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
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
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
        postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}""")).andExpect { status { isOk() } }
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
        postAnswer(quizId, mapper.readTree("""{"selectedOptionIds":["italy"]}"""), replay = true).andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/$quizContentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.lessonCompleted") { value(true) }
            jsonPath("$.data.completion") { doesNotExist() }
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
    fun `quiz answer submissions do not record study streak`() {
        val (_, lessonId) = createUnlockedLesson("streak dates")
        val fixture = quizFixtures().first { it["caseId"].asText() == "multiple_choice_single" }
        val quizId = seedFixture(fixture, lessonId, 0)
        val response = mapper.readTree("""{"selectedOptionIds":["italy"]}""")

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
        jdbc.update("INSERT INTO course(title,category,topic) VALUES (?, 'TEST', ?)", "$title-${UUID.randomUUID()}", title)
        val courseId = checkNotNull(jdbc.queryForObject("SELECT course_id FROM course ORDER BY course_id DESC LIMIT 1", Long::class.java))
        repeat(lessons) { order ->
            jdbc.update(
                "INSERT INTO lesson(course_id,title,lesson_order) VALUES (?, ?, ?)",
                courseId,
                "레슨 ${order + 1}",
                order + 1,
            )
        }
        return courseId
    }

    private fun unlockCount(courseId: Long): Int =
        checkNotNull(jdbc.queryForObject("SELECT COUNT(*) FROM course_daily_unlock WHERE course_id=?", Int::class.java, courseId))

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
        val caseIds = listOf("multiple_choice_single", "slider_exact", "sort", "multiple_choice_single", "fill_blank")
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
                    explanation = fixture["explanation"].asText(),
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
