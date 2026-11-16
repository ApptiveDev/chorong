package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse
import com.bawibase.chorong.domain.quiz.service.QuizService
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Date
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId
import kotlin.random.Random

@Service
class ReviewSetService(
    private val jdbc: JdbcTemplate,
    private val quizzes: QuizService,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun next(userId: Long): ReviewSetResponse {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val validUser =
            jdbc
                .query(
                    "SELECT user_id FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                    { rs, _ -> rs.getLong(1) },
                    userId,
                ).firstOrNull()
        if (validUser == null) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)

        val existing = findOpenSession(userId, today)
        if (existing != null) return sessionResponse(existing, userId, today)

        val available = candidates(userId, today)
        if (available.size < ReviewSelection.SESSION_SIZE) {
            return ReviewSetResponse(emptyList(), EMPTY_MESSAGE, rewardEligible(userId, today))
        }

        val sessionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO review_session(user_id, review_date) VALUES (?, ?) RETURNING review_session_id",
                    Long::class.java,
                    userId,
                    Date.valueOf(today),
                ),
            )
        ReviewSelection.select(available, Random.Default).forEachIndexed { index, candidate ->
            jdbc.update(
                "INSERT INTO review_session_item(review_session_id, quiz_id, item_order, source_status) VALUES (?, ?, ?, ?)",
                sessionId,
                candidate.quizId,
                index,
                if (candidate.reviewOnly) "REVIEW_ONLY" else "LESSON_WRONG",
            )
        }
        return sessionResponse(sessionId, userId, today)
    }

    // 레슨 전 필수 복습(lesson_id 있는 회차)은 없어졌다. 레슨과 무관한 회차만 이어 쓴다.
    private fun findOpenSession(
        userId: Long,
        today: LocalDate,
    ): Long? =
        jdbc
            .query(
                "SELECT review_session_id FROM review_session WHERE user_id=? AND review_date=? AND lesson_id IS NULL AND status='OPEN'",
                { rs, _ -> rs.getLong(1) },
                userId,
                Date.valueOf(today),
            ).firstOrNull()

    private fun sessionResponse(
        sessionId: Long,
        userId: Long,
        today: LocalDate,
    ): ReviewSetResponse {
        val items =
            jdbc
                .query(
                    "SELECT review_item_id, quiz_id FROM review_session_item WHERE review_session_id=? ORDER BY item_order",
                    { rs, _ -> ItemRow(rs.getLong("review_item_id"), rs.getLong("quiz_id")) },
                    sessionId,
                ).map { ReviewItemResponse(it.reviewItemId, quizzes.get(it.quizId)) }
        return ReviewSetResponse(items, rewardEligible = rewardEligible(userId, today))
    }

    /** API-504에서도 쓴다. 재출제 제외 기간이 아닌 후보 수. */
    fun candidateCount(userId: Long): Int = candidates(userId, LocalDate.ofInstant(clock.instant(), kst)).size

    /**
     * 완료한 레슨의 복습 전용 문제와, 완료한 레슨에서 처음 학습할 때 틀린 퀴즈.
     * 복습에서 푼 문제는 available_on(다음 날)부터 다시 후보가 된다. lessonHasWrong은 그 레슨에 틀린 퀴즈가 하나라도 있는지다.
     */
    private fun candidates(
        userId: Long,
        today: LocalDate,
    ): List<ReviewCandidate> =
        jdbc.query(
            """WITH done AS (
                   SELECT lp.lesson_id FROM lesson_progress lp JOIN course c ON c.course_id = lp.course_id
                   WHERE lp.user_id = ? AND lp.status = 'COMPLETED' AND NOT c.is_onboarding
               ),
               -- 레슨 퀴즈는 화면에 연결된 레슨, 복습 전용 문제는 quiz_item.lesson_id 를 기준으로 삼는다.
               owned AS (
                   SELECT q.quiz_id, q.lesson_id, TRUE AS review_only FROM quiz_item q WHERE q.review_only
                   UNION ALL
                   SELECT lc.quiz_id, lc.lesson_id, FALSE FROM lesson_content lc WHERE lc.quiz_id IS NOT NULL
               ),
               wrong AS (
                   SELECT o.lesson_id, o.quiz_id FROM quiz_review_pool p JOIN owned o ON o.quiz_id = p.quiz_id
                   WHERE p.user_id = ? AND p.lesson_wrong AND NOT o.review_only
               )
               SELECT o.quiz_id, o.lesson_id, o.review_only,
                      EXISTS (SELECT 1 FROM wrong w WHERE w.lesson_id = o.lesson_id) AS lesson_has_wrong
               FROM owned o
               JOIN done d ON d.lesson_id = o.lesson_id
               LEFT JOIN quiz_review_pool p ON p.user_id = ? AND p.quiz_id = o.quiz_id
               WHERE (o.review_only OR o.quiz_id IN (SELECT quiz_id FROM wrong))
                 AND (p.available_on IS NULL OR p.available_on <= ?)
               ORDER BY o.quiz_id""",
            { rs, _ ->
                ReviewCandidate(
                    rs.getLong("quiz_id"),
                    rs.getLong("lesson_id"),
                    rs.getBoolean("review_only"),
                    rs.getBoolean("lesson_has_wrong"),
                )
            },
            userId,
            userId,
            userId,
            Date.valueOf(today),
        )

    private fun rewardEligible(
        userId: Long,
        today: LocalDate,
    ): Boolean =
        (
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM review_session WHERE user_id=? AND review_date=? AND reward_granted",
                Int::class.java,
                userId,
                Date.valueOf(today),
            ) ?: 0
        ) < DAILY_REWARD_LIMIT

    private data class ItemRow(
        val reviewItemId: Long,
        val quizId: Long,
    )

    companion object {
        private const val DAILY_REWARD_LIMIT = 3
        private const val EMPTY_MESSAGE = "더 이상 복습할 문제가 없어요"
    }
}

data class ReviewCandidate(
    val quizId: Long,
    val lessonId: Long,
    val reviewOnly: Boolean,
    val lessonHasWrong: Boolean,
)

/**
 * API-501 다섯 자리 구성.
 * 1) 틀린 문제가 있는 레슨에서 최대 4개. 레슨마다 복습 전용 문제를 먼저, 모자라면 그 레슨의 틀린 퀴즈로 채운다.
 * 2) 모두 맞힌 레슨의 복습 전용 문제에서 1개.
 * 3) 남은 자리는 남은 후보에서 복습 전용 문제를 먼저, 그다음 틀린 퀴즈를 무작위로 채운다.
 */
object ReviewSelection {
    const val SESSION_SIZE = 5
    private const val WRONG_LESSON_TARGET = 4

    fun select(
        candidates: List<ReviewCandidate>,
        random: Random,
    ): List<ReviewCandidate> {
        val chosen = linkedSetOf<ReviewCandidate>()
        val wrongLessons = candidates.filter { it.lessonHasWrong }.groupBy { it.lessonId }
        for (lesson in wrongLessons.keys.shuffled(random)) {
            val pool = wrongLessons.getValue(lesson)
            val ordered = pool.filter { it.reviewOnly }.shuffled(random) + pool.filterNot { it.reviewOnly }.shuffled(random)
            for (candidate in ordered) {
                if (chosen.size >= WRONG_LESSON_TARGET) break
                chosen += candidate
            }
            if (chosen.size >= WRONG_LESSON_TARGET) break
        }
        candidates
            .filter { !it.lessonHasWrong && it.reviewOnly }
            .shuffled(random)
            .firstOrNull()
            ?.let { chosen += it }
        val rest = candidates.filterNot { it in chosen }
        val fill = rest.filter { it.reviewOnly }.shuffled(random) + rest.filterNot { it.reviewOnly }.shuffled(random)
        for (candidate in fill) {
            if (chosen.size >= SESSION_SIZE) break
            chosen += candidate
        }
        return chosen.take(SESSION_SIZE)
    }
}
