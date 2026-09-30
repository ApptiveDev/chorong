package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.auth.service.TokenService
import com.bawibase.chorong.domain.quiz.entity.QuizAttemptEntity
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.repository.QuizAttemptRepository
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.TypeMismatchException
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.MissingServletRequestParameterException
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@SpringBootTest
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import(TestcontainersConfig::class)
@Transactional
class QuizApiTest {
    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var quizzes: QuizItemRepository

    @Autowired lateinit var attempts: QuizAttemptRepository

    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var tokenService: TokenService

    @Autowired lateinit var objectMapper: ObjectMapper

    @Autowired lateinit var entityManager: EntityManager

    @Autowired lateinit var jdbc: JdbcTemplate

    @Value("\${spring.jpa.properties.hibernate.default_schema}")
    private lateinit var schema: String

    private fun table(name: String): String = "\"${schema.replace("\"", "\"\"")}\".$name"

    private lateinit var bearer: String
    private var userId = 0L

    private val responseFields =
        setOf("quizId", "lessonId", "question", "instruction", "interactionType", "config", "difficulty", "quizOrder")

    @BeforeEach
    fun signIn() {
        userId = checkNotNull(users.saveAndFlush(UserEntity(nickname = "퀴즈 테스트")).id)
        bearer = "Bearer " + tokenService.issue(userId, null).accessToken
    }

    private fun fixtures(): List<JsonNode> =
        checkNotNull(javaClass.getResourceAsStream("/quiz/quiz-items.json")).use { objectMapper.readTree(it).toList() }

    private fun jsonMap(node: JsonNode): Map<String, Any?> = objectMapper.convertValue(node, object : TypeReference<Map<String, Any?>>() {})

    private fun seed(
        fixture: JsonNode = fixtures().first { it["caseId"].asText() == "multiple_choice_single" },
        lessonId: Long = 101L,
        order: Int = fixture["quizOrder"].asInt(),
    ): QuizItemEntity {
        val quiz =
            quizzes.saveAndFlush(
                QuizItemEntity(
                    lessonId = lessonId,
                    question = fixture["question"].asText(),
                    instruction = fixture["instruction"].asText(),
                    interactionType = QuizInteractionType.valueOf(fixture["interactionType"].asText()),
                    config = jsonMap(fixture["config"]),
                    answer = fixture["answer"].takeUnless { it.isNull }?.let(::jsonMap),
                    explanation = fixture["explanation"].asText(),
                    difficulty = fixture["difficulty"].asText(),
                    quizOrder = order,
                ),
            )
        entityManager.clear()
        return quiz
    }

    private fun get(
        path: String,
        expectedStatus: Int = 200,
    ): JsonNode {
        val result =
            mockMvc
                .get(path) { header(HttpHeaders.AUTHORIZATION, bearer) }
                .andExpect { status { isEqualTo(expectedStatus) } }
                .andReturn()
        return objectMapper.readTree(result.response.contentAsString)
    }

    private fun assertPublicFields(body: JsonNode) {
        assertEquals(responseFields, body.fieldNames().asSequence().toSet())
        assertFalse(body.has("answer"))
        assertFalse(body.has("explanation"))
    }

    @Test
    fun `list filters lessons and sorts by order then id without exposing answers`() {
        val later = seed(order = 20)
        val first = seed(order = 10)
        val second = seed(order = 10)
        seed(lessonId = 202L, order = 0)

        val body = get("/api/quizzes?lessonId=101")

        assertEquals(listOf(first.id, second.id, later.id), body.map { it["quizId"].asLong() })
        assertTrue(body.all { it["lessonId"].asLong() == 101L })
        body.forEach(::assertPublicFields)
    }

    @Test
    fun `all interaction types and variants round trip through postgres and the API`() {
        val examples = fixtures()
        assertEquals(
            QuizInteractionType.entries.toSet(),
            examples.map { QuizInteractionType.valueOf(it["interactionType"].asText()) }.toSet(),
        )
        for (example in examples) {
            val quiz = seed(example)
            val body = get("/api/quizzes/${quiz.id}")
            assertPublicFields(body)
            assertEquals(example["question"], body["question"])
            assertEquals(example["instruction"], body["instruction"])
            assertEquals(example["interactionType"], body["interactionType"])
            assertEquals(example["config"], body["config"])
            assertEquals(example["difficulty"], body["difficulty"])
            assertEquals(example["quizOrder"], body["quizOrder"])

            val stored =
                jdbc.queryForMap(
                    "SELECT config, answer, pg_typeof(config)::text AS config_type FROM ${table("quiz_item")} WHERE quiz_id = ?",
                    quiz.id,
                )
            assertEquals("jsonb", stored["config_type"])
            assertEquals(example["config"], objectMapper.readTree(stored["config"].toString()))
            if (quiz.interactionType == QuizInteractionType.FLIP_CARD) {
                assertNull(stored["answer"])
                assertEquals(example["config"]["back"], body["config"]["back"])
            } else {
                assertEquals(example["answer"], objectMapper.readTree(stored["answer"].toString()))
            }
        }
        assertEquals(examples.size, get("/api/quizzes?lessonId=101").size())
    }

    @Test
    fun `lesson with no quizzes returns an empty array`() {
        seed(lessonId = 202L)
        val body = get("/api/quizzes?lessonId=101")
        assertTrue(body.isArray)
        assertEquals(0, body.size())
    }

    @Test
    fun `unknown quiz returns a structured 404`() {
        assertEquals("QUIZ_NOT_FOUND", get("/api/quizzes/${Long.MAX_VALUE}", 404)["code"].asText())
    }

    @Test
    fun `both read endpoints require a valid bearer token`() {
        val quiz = seed()
        for (path in listOf("/api/quizzes?lessonId=101", "/api/quizzes/${quiz.id}")) {
            mockMvc.get(path).andExpect {
                status { isUnauthorized() }
                jsonPath("$.code") { value("UNAUTHORIZED") }
            }
            mockMvc.get(path) { header(HttpHeaders.AUTHORIZATION, "Bearer invalid-token") }.andExpect {
                status { isUnauthorized() }
            }
        }
    }

    @Test
    fun `nonpositive ids return validation errors`() {
        for (value in listOf(0, -1)) {
            val lessonError = get("/api/quizzes?lessonId=$value", 400)
            assertEquals("INVALID_QUIZ_REQUEST", lessonError["code"].asText())
            assertEquals("lessonId", lessonError["details"]["field"].asText())
            val quizError = get("/api/quizzes/$value", 400)
            assertEquals("INVALID_QUIZ_REQUEST", quizError["code"].asText())
            assertEquals("quizId", quizError["details"]["field"].asText())
        }
    }

    @Test
    fun `missing malformed and overflowing ids use the common 400 handler`() {
        for (base in listOf("/api/quizzes", "/api/dev/quizzes")) {
            val paths =
                mapOf(
                    base to MissingServletRequestParameterException::class.java,
                    "$base?lessonId=" to TypeMismatchException::class.java,
                    "$base?lessonId=abc" to TypeMismatchException::class.java,
                    "$base?lessonId=1.5" to TypeMismatchException::class.java,
                    "$base?lessonId=9223372036854775808" to TypeMismatchException::class.java,
                    "$base/abc" to TypeMismatchException::class.java,
                    "$base/9223372036854775808" to TypeMismatchException::class.java,
                )
            for ((path, exceptionType) in paths) {
                val result =
                    mockMvc
                        .get(path) {
                            if (base == "/api/quizzes") header(HttpHeaders.AUTHORIZATION, bearer)
                        }.andExpect {
                            status { isBadRequest() }
                            jsonPath("$.code") { value("BAD_REQUEST") }
                        }.andReturn()
                assertTrue(exceptionType.isInstance(result.resolvedException), "$path: ${result.resolvedException?.javaClass?.simpleName}")
            }
        }
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `unreadable request envelopes return common 400 errors without writing records`() {
        val quiz = seed()
        val beforeUsers = users.count()
        val bodies =
            listOf(
                "",
                " ",
                "{}",
                "null",
                "[]",
                """{"response":""",
                """{"response":{"selectedOptionIds":["italy"]},"response":{"selectedOptionIds":["italy"]}}""",
                """{"response":{"selectedOptionIds":["italy"],"selectedOptionIds":["italy"]}}""",
            )
        for (path in listOf("/api/quizzes/${quiz.id}/attempts", "/api/dev/quizzes/${quiz.id}/check")) {
            for (body in bodies) {
                val result =
                    mockMvc
                        .post(path) {
                            if (path.startsWith("/api/quizzes/")) header(HttpHeaders.AUTHORIZATION, bearer)
                            contentType = MediaType.APPLICATION_JSON
                            content = body
                        }.andExpect {
                            status { isBadRequest() }
                            jsonPath("$.code") { value("BAD_REQUEST") }
                        }.andReturn()
                assertTrue(result.resolvedException is HttpMessageNotReadableException, path)
            }
        }
        assertEquals(0L, attempts.count())
        assertEquals(beforeUsers, users.count())
    }

    @Test
    fun `malformed submission path ids return common 400 errors without writing records`() {
        val beforeUsers = users.count()
        for (id in listOf("abc", "1.5", "9223372036854775808")) {
            for (path in listOf("/api/quizzes/$id/attempts", "/api/dev/quizzes/$id/check")) {
                val result =
                    mockMvc
                        .post(path) {
                            if (path.startsWith("/api/quizzes/")) header(HttpHeaders.AUTHORIZATION, bearer)
                            contentType = MediaType.APPLICATION_JSON
                            content = """{"response":{"selectedOptionIds":["italy"]}}"""
                        }.andExpect {
                            status { isBadRequest() }
                            jsonPath("$.code") { value("BAD_REQUEST") }
                        }.andReturn()
                assertTrue(result.resolvedException is TypeMismatchException, path)
            }
        }
        assertEquals(0L, attempts.count())
        assertEquals(beforeUsers, users.count())
    }

    @Test
    fun `a database content change is reflected by the next lookup`() {
        val quiz = seed()
        get("/api/quizzes/${quiz.id}")
        val config = mapOf("selectionType" to "SINGLE", "options" to listOf(mapOf("id" to "italy", "text" to "수정한 선택지")))
        jdbc.update(
            "UPDATE ${table("quiz_item")} SET question = ?, config = ?::jsonb WHERE quiz_id = ?",
            "DB에서 수정한 문제",
            objectMapper.writeValueAsString(config),
            quiz.id,
        )
        entityManager.clear()

        val body = get("/api/quizzes/${quiz.id}")
        assertEquals("DB에서 수정한 문제", body["question"].asText())
        assertEquals(objectMapper.valueToTree<JsonNode>(config), body["config"])
        assertPublicFields(body)
    }

    @Test
    fun `attempt mappings preserve correct incorrect and ungraded results`() {
        val quiz = seed()
        val flip = seed(fixtures().first { it["caseId"].asText() == "flip_card" })
        for (correct in listOf(true, false, null)) {
            val response: Map<String, Any?> =
                if (correct ==
                    null
                ) {
                    mapOf("flipped" to true)
                } else {
                    mapOf("selectedOptionIds" to listOf(if (correct) "italy" else "france"))
                }
            val saved =
                attempts.saveAndFlush(
                    QuizAttemptEntity(
                        quizId = checkNotNull(if (correct == null) flip.id else quiz.id),
                        userId = userId,
                        response = response,
                        graded = correct != null,
                        correct = correct,
                        completed = true,
                    ),
                )
            entityManager.clear()

            val loaded = attempts.findById(checkNotNull(saved.id)).orElseThrow()
            assertEquals(userId, loaded.userId)
            assertEquals(response, loaded.response)
            assertEquals(correct, loaded.correct)
            assertEquals(correct != null, loaded.graded)
            assertTrue(loaded.completed)
            assertNotNull(loaded.submittedAt)
        }
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "answer = NULL",
            "config = '[]'::jsonb",
            "interaction_type = 'UNKNOWN'",
            "interaction_type = 'FLIP_CARD'",
            "lesson_id = 0",
            "quiz_order = -1",
            "difficulty = ''",
        ],
    )
    fun `invalid stored quiz metadata is rejected`(change: String) {
        val quiz = seed()
        val error =
            assertThrows<DataIntegrityViolationException> {
                jdbc.update("UPDATE ${table("quiz_item")} SET $change WHERE quiz_id = ?", quiz.id)
            }
        assertEquals("23514", (error.mostSpecificCause as SQLException).sqlState)
    }

    @ParameterizedTest
    @ValueSource(strings = ["quiz_id", "user_id"])
    fun `attempt references must point to an existing quiz and user`(column: String) {
        val quiz = seed()
        val error =
            assertThrows<DataIntegrityViolationException> {
                jdbc.update(
                    "INSERT INTO ${table(
                        "quiz_attempt",
                    )} (quiz_id, user_id, response, graded, correct, completed) VALUES (?, ?, '{}'::jsonb, true, true, true)",
                    if (column == "quiz_id") Long.MAX_VALUE else quiz.id,
                    if (column == "user_id") Long.MAX_VALUE else userId,
                )
            }
        assertEquals("23503", (error.mostSpecificCause as SQLException).sqlState)
    }

    @ParameterizedTest
    @ValueSource(strings = ["true, NULL", "false, true", "false, false"])
    fun `ungraded and graded attempt results cannot be mixed`(result: String) {
        val quiz = seed()
        val error =
            assertThrows<DataIntegrityViolationException> {
                jdbc.update(
                    "INSERT INTO ${table(
                        "quiz_attempt",
                    )} (quiz_id, user_id, response, graded, correct, completed) VALUES (?, ?, '{}'::jsonb, $result, true)",
                    quiz.id,
                    userId,
                )
            }
        assertEquals("23514", (error.mostSpecificCause as SQLException).sqlState)
    }

    @Test
    fun `openapi describes bearer protected reads without answer fields`() {
        val result = mockMvc.get("/api-docs").andExpect { status { isOk() } }.andReturn()
        val docs = objectMapper.readTree(result.response.contentAsString)
        for (path in listOf("/api/quizzes", "/api/quizzes/{quizId}")) {
            assertTrue(docs["paths"][path]["get"]["security"].any { it.has("bearer") })
        }
        assertEquals(responseFields, docs["components"]["schemas"]["QuizResponse"]["properties"].fieldNames().asSequence().toSet())
    }

    private fun submit(
        quizId: Long,
        body: String,
        expectedStatus: Int = 201,
    ): JsonNode {
        val result =
            mockMvc
                .post("/api/quizzes/$quizId/attempts") {
                    header(HttpHeaders.AUTHORIZATION, bearer)
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect { status { isEqualTo(expectedStatus) } }
                .andReturn()
        return objectMapper.readTree(result.response.contentAsString.ifEmpty { "{}" })
    }

    @Test
    fun `all types and variants save server results and the original response`() {
        val examples = fixtures()
        for (example in examples) {
            val quiz = seed(example)
            val response = example["correctResponse"]
            val body = submit(checkNotNull(quiz.id), """{"response":$response}""")
            val flip = quiz.interactionType == QuizInteractionType.FLIP_CARD
            assertEquals(setOf("attemptId", "graded", "correct", "completed", "explanation"), body.fieldNames().asSequence().toSet())
            assertEquals(!flip, body["graded"].asBoolean())
            if (flip) assertTrue(body["correct"].isNull) else assertTrue(body["correct"].asBoolean())
            assertTrue(body["completed"].asBoolean())
            assertEquals(quiz.explanation, body["explanation"].asText())
            entityManager.flush()
            entityManager.clear()
            val attempt = attempts.findById(body["attemptId"].asLong()).orElseThrow()
            assertEquals(quiz.id, attempt.quizId)
            assertEquals(userId, attempt.userId)
            assertEquals(response, objectMapper.valueToTree<JsonNode>(attempt.response))
            assertEquals(!flip, attempt.graded)
            assertEquals(if (flip) null else true, attempt.correct)
            assertTrue(attempt.completed)
            assertNotNull(attempt.submittedAt)
        }
        assertEquals(examples.size.toLong(), attempts.count())
    }

    @Test
    fun `forged client identity and correctness do not change the stored result`() {
        val quiz = seed()
        val otherUser = users.saveAndFlush(UserEntity(nickname = "다른 사용자"))
        val body =
            submit(
                checkNotNull(quiz.id),
                """{"response":{"selectedOptionIds":["france"]},"userId":${otherUser.id},"isCorrect":true,"correct":true,"graded":false}""",
            )
        assertTrue(body["graded"].asBoolean())
        assertFalse(body["correct"].asBoolean())
        assertTrue(body["completed"].asBoolean())
        entityManager.flush()
        entityManager.clear()
        val attempt = attempts.findById(body["attemptId"].asLong()).orElseThrow()
        assertEquals(userId, attempt.userId)
        assertEquals(false, attempt.correct)
        assertEquals(mapOf("selectedOptionIds" to listOf("france")), attempt.response)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "{}",
            "null",
            "[]",
            "{\"response\":null}",
            "{\"response\":[]}",
            "{\"response\":3}",
            "{\"response\":{\"selectedOptionIds\":[]}}",
            "{\"response\":{\"selectedOptionIds\":[\"italy\",\"italy\"]}}",
            "{\"response\":{\"selectedOptionIds\":[\"unknown\"]}}",
            "{\"response\":{\"selectedOptionIds\":[\"italy\"],\"isCorrect\":true}}",
            "{\"response\":",
        ],
    )
    fun `invalid request bodies never create attempts`(request: String) {
        val quiz = seed()
        submit(checkNotNull(quiz.id), request, 400)
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `maxSelections is enforced by the submission API`() {
        val example = fixtures().first { it["caseId"].asText() == "tap_multiple" }
        val quiz = seed(example)
        quizzes.findById(checkNotNull(quiz.id)).orElseThrow().config += "maxSelections" to 3
        quizzes.flush()
        entityManager.clear()
        val result =
            submit(
                checkNotNull(quiz.id),
                """{"response":{"selectedItemIds":["humanism","perspective","realism","abstract"]}}""",
                400,
            )
        assertEquals("INVALID_QUIZ_RESPONSE", result["code"].asText())
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `missing and invalid quiz ids never create attempts`() {
        val response = """{"response":{"selectedOptionIds":["italy"]}}"""
        assertEquals("QUIZ_NOT_FOUND", submit(Long.MAX_VALUE, response, 404)["code"].asText())
        assertEquals("INVALID_QUIZ_REQUEST", submit(0, response, 400)["code"].asText())
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `submission requires a valid authenticated user`() {
        val quiz = seed()
        for (authorization in listOf(null, "Bearer invalid-token")) {
            mockMvc
                .post("/api/quizzes/${quiz.id}/attempts") {
                    if (authorization != null) header(HttpHeaders.AUTHORIZATION, authorization)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"response":{"selectedOptionIds":["italy"]}}"""
                }.andExpect { status { isUnauthorized() } }
        }
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `withdrawn users cannot submit with a previously issued token`() {
        val quiz = seed()
        users.findById(userId).orElseThrow().status = UserStatus.WITHDRAWN
        users.flush()
        entityManager.clear()
        val result = submit(checkNotNull(quiz.id), """{"response":{"selectedOptionIds":["italy"]}}""", 401)
        assertEquals("USER_WITHDRAWN", result["code"].asText())
        assertEquals(0L, attempts.count())
    }

    @ParameterizedTest
    @ValueSource(strings = ["config", "answer", "allowRetry", "showHint"])
    fun `bad stored quiz data blocks reads and submission without exposing the answer`(field: String) {
        val quiz = seed()
        val managed = quizzes.findById(checkNotNull(quiz.id)).orElseThrow()
        when (field) {
            "config" -> managed.config += "selectionType" to "UNKNOWN"
            "answer" -> managed.answer = mapOf("correctOptionIds" to listOf("unknown"))
            "allowRetry" -> managed.config += "allowRetry" to false
            "showHint" -> managed.config += "showHint" to true
        }
        quizzes.flush()
        entityManager.clear()
        val replies =
            listOf(
                get("/api/quizzes/${quiz.id}", 409),
                get("/api/quizzes?lessonId=101", 409),
                submit(checkNotNull(quiz.id), """{"response":{"selectedOptionIds":["italy"]}}""", 409),
            )
        for (reply in replies) {
            assertEquals("QUIZ_DATA_INVALID", reply["code"].asText())
            assertFalse(reply.toString().contains("correctOptionIds"))
            assertFalse(reply.toString().contains(quiz.explanation))
        }
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `flip false remains an ungraded incomplete record`() {
        val quiz = seed(fixtures().first { it["caseId"].asText() == "flip_card" })
        val body = submit(checkNotNull(quiz.id), """{"response":{"flipped":false}}""")
        assertFalse(body["graded"].asBoolean())
        assertTrue(body["correct"].isNull)
        assertFalse(body["completed"].asBoolean())
        entityManager.flush()
        entityManager.clear()
        val saved = attempts.findById(body["attemptId"].asLong()).orElseThrow()
        assertNull(saved.correct)
        assertFalse(saved.graded)
        assertFalse(saved.completed)
    }

    @Test
    fun `repeated valid submissions create separate records`() {
        val quiz = seed()
        val response = """{"response":{"selectedOptionIds":["italy"]}}"""
        val first = submit(checkNotNull(quiz.id), response)
        val second = submit(checkNotNull(quiz.id), response)
        assertTrue(first["attemptId"].asLong() != second["attemptId"].asLong())
        assertEquals(2L, attempts.count())
    }

    @Test
    fun `submission openapi hides user id and declares the request and result`() {
        val result = mockMvc.get("/api-docs").andExpect { status { isOk() } }.andReturn()
        val docs = objectMapper.readTree(result.response.contentAsString)
        val operation = docs["paths"]["/api/quizzes/{quizId}/attempts"]["post"]
        assertTrue(operation["security"].any { it.has("bearer") })
        assertTrue(operation["parameters"].none { it["name"].asText() == "userId" })
        assertEquals(setOf("response"), docs["components"]["schemas"]["QuizAttemptRequest"]["properties"].fieldNames().asSequence().toSet())
        assertEquals(
            setOf("attemptId", "graded", "correct", "completed", "explanation"),
            docs["components"]["schemas"]["QuizAttemptResponse"]["properties"].fieldNames().asSequence().toSet(),
        )
    }

    @Test
    fun `duplicate JSON fields are rejected before grading`() {
        val quiz = seed()
        for (body in listOf(
            """{"response":{"selectedOptionIds":["italy"],"selectedOptionIds":["italy"]}}""",
            """{"response":{"selectedOptionIds":["italy"]},"response":{"selectedOptionIds":["italy"]}}""",
        )) {
            submit(checkNotNull(quiz.id), body, 400)
        }
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `fractional input is not rounded onto a valid slider step`() {
        val example = fixtures().first { it["caseId"].asText() == "slider_range" }
        val quiz = seed(example)
        val managed = quizzes.findById(checkNotNull(quiz.id)).orElseThrow()
        managed.config = mapOf("min" to 0, "max" to 1, "step" to 0.1)
        managed.answer = mapOf("value" to 0.1)
        quizzes.flush()
        entityManager.clear()
        val error = submit(checkNotNull(quiz.id), """{"response":{"value":0.100000000000000000001}}""", 400)
        assertEquals("INVALID_QUIZ_RESPONSE", error["code"].asText())
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `stored numeric response keeps decimal precision`() {
        val example = fixtures().first { it["caseId"].asText() == "slider_range" }
        val quiz = seed(example)
        val managed = quizzes.findById(checkNotNull(quiz.id)).orElseThrow()
        managed.config = mapOf("min" to 0, "max" to 1, "step" to java.math.BigDecimal("0.000000000000000001"))
        managed.answer = mapOf("min" to 0.1, "max" to 0.2)
        quizzes.flush()
        entityManager.clear()
        val result = submit(checkNotNull(quiz.id), """{"response":{"value":0.100000000000000001}}""")
        assertTrue(result["correct"].asBoolean())
        entityManager.flush()
        entityManager.clear()
        assertEquals(
            java.math.BigDecimal("0.100000000000000001"),
            attempts.findById(result["attemptId"].asLong()).orElseThrow().response["value"],
        )
        assertEquals(
            "0.100000000000000001",
            jdbc.queryForObject(
                "SELECT response ->> 'value' FROM ${table("quiz_attempt")} WHERE attempt_id = ?",
                String::class.java,
                result["attemptId"].asLong(),
            ),
        )
    }

    @Test
    fun `stored slider config and exact answer keep decimal precision`() {
        val quiz = seed(fixtures().first { it["caseId"].asText() == "slider_exact" })
        val managed = quizzes.findById(checkNotNull(quiz.id)).orElseThrow()
        managed.config = mapOf("min" to 0, "max" to 1, "step" to java.math.BigDecimal("0.000000000000000001"))
        managed.answer = mapOf("value" to java.math.BigDecimal("0.100000000000000001"))
        quizzes.flush()
        entityManager.clear()
        val exact = submit(checkNotNull(quiz.id), """{"response":{"value":0.100000000000000001}}""")
        val different = submit(checkNotNull(quiz.id), """{"response":{"value":0.1}}""")
        assertTrue(exact["correct"].asBoolean())
        assertFalse(different["correct"].asBoolean())
    }

    @Test
    fun `stored semantic errors take precedence over response conversion and never save attempts`() {
        val quiz = seed()
        val managed = quizzes.findById(checkNotNull(quiz.id)).orElseThrow()
        managed.config += "maxSelections" to 0
        quizzes.flush()
        entityManager.clear()
        val result = submit(checkNotNull(quiz.id), """{"response":{"selectedOptionIds":"italy"}}""", 409)
        assertEquals("QUIZ_DATA_INVALID", result["code"].asText())
        assertEquals(0L, attempts.count())
    }

    @Test
    fun `typed public configs keep original fields and omit absent nested options`() {
        val examples = fixtures().toMutableList()
        val minimal =
            fixtures()
                .first { it["caseId"].asText() == "slider_exact" }
                .deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>()
        val config = minimal["config"] as com.fasterxml.jackson.databind.node.ObjectNode
        config.remove(listOf("initialValue", "unit", "showValue"))
        config.put("shuffle", false)
        config.put("allowRetry", true)
        config.put("showHint", false)
        examples.add(minimal)
        val expected = examples.associate { example -> checkNotNull(seed(example).id) to example["config"] }
        val list = get("/api/quizzes?lessonId=101")
        assertEquals(expected.size, list.size())
        for (item in list) {
            assertPublicFields(item)
            assertEquals(expected[item["quizId"].asLong()], item["config"])
            val detail = get("/api/quizzes/${item["quizId"].asLong()}")
            assertPublicFields(detail)
            assertEquals(item["config"], detail["config"])
        }
    }

    @Test
    fun `openapi exposes concrete config and response contracts without server answers`() {
        val result = mockMvc.get("/api-docs").andExpect { status { isOk() } }.andReturn()
        val schemas = objectMapper.readTree(result.response.contentAsString)["components"]["schemas"]

        fun resolve(node: JsonNode): JsonNode =
            if (node.has("\$ref")) resolve(schemas[node["\$ref"].asText().substringAfterLast('/')]) else node

        fun alternatives(node: JsonNode): Set<String> =
            resolve(node)["oneOf"]?.map { it["\$ref"].asText().substringAfterLast('/') }?.toSet() ?: emptySet()
        val configs =
            mapOf(
                "SliderConfig" to setOf("min", "max", "step"),
                "SwipeConfig" to setOf("left", "right"),
                "TapConfig" to setOf("selectionType", "items"),
                "MultipleChoiceConfig" to setOf("selectionType", "options"),
                "DragDropConfig" to setOf("items", "targets"),
                "SortConfig" to setOf("items"),
                "MatchingConfig" to setOf("leftItems", "rightItems"),
                "FlipCardConfig" to setOf("front", "back"),
            )
        val config = schemas["QuizResponse"]["properties"]["config"]
        assertEquals(configs.keys, alternatives(config), resolve(config).toString())
        for ((name, required) in configs) {
            val schema = resolve(schemas[name])
            assertEquals(required, schema["required"].map { it.asText() }.toSet(), name)
            assertEquals(false, schema["additionalProperties"]?.asBoolean(), name)
            assertTrue(schema.has("properties"), "$name: $schema")
            val properties = schema["properties"]
            assertFalse(properties.has("answer"), name)
            assertFalse(properties.has("type"), name)
            for (field in listOf("shuffle", "allowRetry", "showHint")) {
                assertTrue(properties.has(field), "$name.$field")
                assertFalse(properties[field].path("nullable").asBoolean(), "$name.$field ${properties[field]}")
            }
        }
        val responses =
            mapOf(
                "SliderUserResponse" to "value",
                "SwipeUserResponse" to "value",
                "TapUserResponse" to "selectedItemIds",
                "MultipleChoiceUserResponse" to "selectedOptionIds",
                "DragDropUserResponse" to "placements",
                "SortUserResponse" to "order",
                "MatchingUserResponse" to "matches",
                "FlipCardUserResponse" to "flipped",
            )
        val response = schemas["QuizAttemptRequest"]["properties"]["response"]
        assertEquals(responses.keys, alternatives(response), resolve(response).toString())
        for ((name, field) in responses) {
            val schema = resolve(schemas[name])
            assertEquals(setOf(field), schema["required"].map { it.asText() }.toSet(), name)
            assertEquals(setOf(field), schema["properties"].fieldNames().asSequence().toSet(), name)
            assertEquals(false, schema["additionalProperties"]?.asBoolean(), name)
        }
        assertEquals("number", schemas["SliderUserResponse"]["properties"]["value"]["type"].asText())
        assertEquals("string", schemas["SwipeUserResponse"]["properties"]["value"]["type"].asText())
        assertEquals(setOf("id"), schemas["QuizItemOption"]["required"].map { it.asText() }.toSet())
        assertTrue(schemas["QuizCardFace"].path("required").isMissingNode || schemas["QuizCardFace"]["required"].isEmpty)
        for (name in listOf("QuizDefinition", "QuizAnswer", "ExactSliderAnswer", "MultipleChoiceAnswer")) {
            assertFalse(schemas.has(name), name)
        }
    }
}
