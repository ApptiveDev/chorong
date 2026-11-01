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
    fun `course listing filters onboarding and content returns public quiz only`() {
        jdbc.update("INSERT INTO course(title,category,description,course_order) VALUES ('일반 코스','SCIENCE','설명',1)")
        val courseId = jdbc.queryForObject("SELECT course_id FROM course WHERE title='일반 코스'", Long::class.java)
        jdbc.update("INSERT INTO course(title,category,is_onboarding) VALUES ('온보딩','START',true)")
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
            jsonPath("$.data.courses[0].totalLessons") { value(1) }
        }
        mvc.get("/api/v1/courses/$courseId") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
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
            jsonPath("$.data.contents[1].quiz.answer") { doesNotExist() }
            jsonPath("$.data.contents[1].quiz.explanation") { doesNotExist() }
            jsonPath("$.data.contents[2].contentType") { value("IMAGE") }
            jsonPath("$.data.contents[3].contentType") { value("VIDEO") }
        }
        assertEquals(23L, quizzes.findById(checkNotNull(quiz.id)).orElseThrow().lessonId)
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
        val quizId = seedFixture(quizFixtures().first(), lessonId, 1)
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
        val fixture = quizFixtures().first()
        postAnswer(quizId, fixture["correctResponse"]).andExpect { status { isOk() } }
        mvc.post("/api/v1/contents/${contentIds[1]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.progress.lastContentId") { value(contentIds[1]) }
            jsonPath("$.data.progress.resumeContentId") { value(contentIds[2]) }
            jsonPath("$.data.lessonCompleted") { value(false) }
        }
        mvc.post("/api/v1/contents/${contentIds[2]}/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.progress.resumeContentId") { doesNotExist() }
            jsonPath("$.data.lessonCompleted") { value(false) }
        }
        mvc.get("/api/v1/users/me/progress") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect {
            status { isOk() }
            jsonPath("$.data.current.lessonId") { value(lessonId) }
            jsonPath("$.data.current.status") { value("IN_PROGRESS") }
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
        mvc.post("/api/v1/contents/$contentId/complete") { header(HttpHeaders.AUTHORIZATION, auth) }.andExpect { status { isOk() } }

        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.courseCompleted") { value(true) }
                jsonPath("$.data.rewards.length()") { value(2) }
                jsonPath("$.data.rewards[0].amount") { value(1) }
                jsonPath("$.data.rewards[1].badge.constellationId") { value(778) }
                jsonPath("$.data.wallet.star") { value(1) }
            }
        mvc
            .post("/api/v1/lessons/$lessonId/complete") {
                header(HttpHeaders.AUTHORIZATION, auth)
                header("Idempotency-Key", key)
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(2) }
                jsonPath("$.data.wallet.star") { value(1) }
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
                jsonPath("$.data.wallet.star") { value(1) }
            }
        assertEquals(
            1,
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
    fun `review set selects four wrong and one correct and reuses open set`() {
        val (_, lessonId) = createUnlockedLesson("review set")
        val fixtureItems = quizFixtures().take(5)
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
    fun `review answers update pools enforce one submission and defer incomplete flip cards`() {
        val (_, lessonId) = createUnlockedLesson("review answer")
        val allFixtures = quizFixtures()
        val fixtures = listOf(allFixtures[0], allFixtures[1], allFixtures[2], allFixtures[3], allFixtures[6])
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
        postReviewAnswer(correctItemId, fixtures[0]["correctResponse"]).andExpect {
            status { isOk() }
            jsonPath("$.data.completed") { value(true) }
            jsonPath("$.data.correct") { value(true) }
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
        }
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
        postReviewAnswer(correctItemId, fixtures[0]["correctResponse"]).andExpect { status { isConflict() } }
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=? AND quiz_id=?", Int::class.java, userId, correctQuizId),
        )

        val wrongItemId = items[1]["reviewItemId"].asLong()
        val wrongQuizId = items[1]["quiz"]["quizId"].asLong()
        postReviewAnswer(wrongItemId, mapper.readTree("""{"value":"FALSE"}""")).andExpect {
            status { isOk() }
            jsonPath("$.data.correct") { value(false) }
            jsonPath("$.data.excludedUntil") { value(null) }
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

        val flipItemId = items[4]["reviewItemId"].asLong()
        val flipQuizId = items[4]["quiz"]["quizId"].asLong()
        val partial = mapper.readTree("""{"pairs":[{"firstCardId":"c1","secondCardId":"c5"}]}""")
        postReviewAnswer(flipItemId, partial).andExpect {
            status { isOk() }
            jsonPath("$.data.completed") { value(false) }
            jsonPath("$.data.excludedUntil") { value(null) }
        }
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_session_item WHERE review_item_id=? AND completed",
                Int::class.java,
                flipItemId,
            ),
        )
        assertEquals("CORRECT", reviewStatus(flipQuizId))
        postReviewAnswer(flipItemId, fixtures[4]["correctResponse"]).andExpect {
            status { isOk() }
            jsonPath("$.data.completed") { value(true) }
            jsonPath("$.data.correct") { value(true) }
        }
        assertEquals(0, jdbc.queryForObject("SELECT streak_days FROM app_user WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `review answer cannot access another users session item`() {
        val otherUserId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "외부 복습 ${UUID.randomUUID()}")).id)
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
        postReviewAnswer(reviewItemId, quizFixtures().first()["correctResponse"]).andExpect { status { isNotFound() } }
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
            jsonPath("$.data.rewards[0].currency") { value("STAR") }
            jsonPath("$.data.rewards[0].amount") { value(1) }
            jsonPath("$.data.wallet.star") { value(1) }
        }
        postReviewComplete(firstItems, firstKey).andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(1) }
            jsonPath("$.data.wallet.star") { value(1) }
        }
        postReviewComplete(firstItems.reversed(), firstKey).andExpect { status { isConflict() } }
        postReviewComplete(firstItems, UUID.randomUUID().toString()).andExpect {
            status { isOk() }
            jsonPath("$.data.rewards.length()") { value(0) }
            jsonPath("$.data.wallet.star") { value(1) }
        }

        repeat(3) { index ->
            val itemIds = createReviewSessionItems(quizIds, completed = true)
            postReviewComplete(itemIds, UUID.randomUUID().toString()).andExpect {
                status { isOk() }
                jsonPath("$.data.rewards.length()") { value(if (index < 2) 1 else 0) }
                jsonPath("$.data.wallet.star") { value(minOf(index + 2, 3)) }
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
    fun `all eleven quiz fixtures submit through the learning contract and update review state`() {
        val (courseId, lessonId) = createUnlockedLesson("11 quiz fixture")
        val fixtureItems = quizFixtures()
        val quizIds = fixtureItems.mapIndexed { index, item -> seedFixture(item, lessonId, index) }

        val wrong = mapper.readTree("""{"value":1900}""")
        postAnswer(quizIds.first(), wrong).andExpect {
            status { isOk() }
            jsonPath("$.data.graded") { value(true) }
            jsonPath("$.data.correct") { value(false) }
            jsonPath("$.data.completed") { value(true) }
            jsonPath("$.data.streakDays") { value(1) }
        }
        assertEquals("WRONG", reviewStatus(quizIds.first()))

        fixtureItems.forEachIndexed { index, item ->
            postAnswer(quizIds[index], item["correctResponse"]).andExpect {
                status { isOk() }
                jsonPath("$.data.attemptId") { exists() }
                jsonPath("$.data.graded") { value(true) }
                jsonPath("$.data.correct") { value(true) }
                jsonPath("$.data.completed") { value(true) }
                jsonPath("$.data.streakDays") { value(1) }
                jsonPath("$.data.correctAnswer") { doesNotExist() }
            }
        }
        assertEquals(12, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
        assertEquals(11, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=?", Int::class.java, userId))
        assertEquals(
            11,
            jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=? AND status='CORRECT'", Int::class.java, userId),
        )
        assertEquals(
            "IN_PROGRESS",
            jdbc.queryForObject("SELECT status FROM lesson_progress WHERE user_id=? AND lesson_id=?", String::class.java, userId, lessonId),
        )
        assertEquals(courseId, jdbc.queryForObject("SELECT course_id FROM lesson WHERE lesson_id=?", Long::class.java, lessonId))
    }

    @Test
    fun `locked lesson rejects submission without recording an attempt`() {
        val (_, lessonId) = createUnlockedLesson("locked quiz")
        jdbc.update("DELETE FROM lesson_progress WHERE user_id=? AND lesson_id=?", userId, lessonId)
        val quizId = seedFixture(quizFixtures().first(), lessonId, 0)

        postAnswer(quizId, quizFixtures().first()["correctResponse"]).andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("LESSON_LOCKED") }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_attempt WHERE user_id=?", Int::class.java, userId))
    }

    @Test
    fun `flip card partial answer is recorded but does not update review pool or study streak`() {
        val (_, lessonId) = createUnlockedLesson("flip partial")
        val fixture = quizFixtures().first { it["caseId"].asText() == "flip_card" }
        val quizId = seedFixture(fixture, lessonId, 0)
        val partial = mapper.readTree("""{"pairs":[{"firstCardId":"c1","secondCardId":"c5"}]}""")

        postAnswer(quizId, partial).andExpect {
            status { isOk() }
            jsonPath("$.data.graded") { value(true) }
            jsonPath("$.data.correct") { value(true) }
            jsonPath("$.data.completed") { value(false) }
            jsonPath("$.data.explanation") { value("") }
            jsonPath("$.data.streakDays") { value(0) }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM quiz_review_pool WHERE user_id=?", Int::class.java, userId))
        assertEquals(null, jdbc.queryForObject("SELECT last_study_date FROM app_user WHERE user_id=?", java.sql.Date::class.java, userId))
    }

    @Test
    fun `replay records answer but leaves completed progress review pool and streak unchanged`() {
        val (_, lessonId) = createUnlockedLesson("replay quiz")
        val fixture = quizFixtures().first()
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

        postAnswer(quizId, fixture["correctResponse"], replay = true).andExpect {
            status { isOk() }
            jsonPath("$.data.correct") { value(true) }
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
    fun `completed learning answers advance streak on consecutive KST dates and reset after a gap`() {
        val (_, lessonId) = createUnlockedLesson("streak dates")
        val fixture = quizFixtures().first()
        val quizId = seedFixture(fixture, lessonId, 0)
        val response = fixture["correctResponse"]

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T14:59:59Z"))
        assertEquals(1, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)
        assertEquals(1, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-10T15:00:00Z"))
        assertEquals(2, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)

        `when`(clock.instant()).thenReturn(Instant.parse("2026-10-12T15:00:00Z"))
        assertEquals(1, learningQuizzes.submit(userId, quizId, response, replay = false).streakDays)
    }

    private fun createCourse(
        title: String,
        lessons: Int,
    ): Long {
        jdbc.update("INSERT INTO course(title,category) VALUES (?, 'TEST')", "$title-${UUID.randomUUID()}")
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
        response: JsonNode,
        replay: Boolean = false,
    ) = mvc.post("/api/v1/quizzes/$quizId/answer") {
        header(HttpHeaders.AUTHORIZATION, auth)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsBytes(mapOf("response" to response, "replay" to replay))
    }

    private fun postReviewAnswer(
        reviewItemId: Long,
        response: JsonNode,
    ) = mvc.post("/api/v1/reviews/$reviewItemId/answer") {
        header(HttpHeaders.AUTHORIZATION, auth)
        contentType = MediaType.APPLICATION_JSON
        content = mapper.writeValueAsBytes(mapOf("response" to response))
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
