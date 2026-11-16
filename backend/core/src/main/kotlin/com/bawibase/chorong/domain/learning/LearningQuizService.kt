package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptResponse
import com.bawibase.chorong.domain.quiz.service.QuizService
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneId

data class AnswerResult(
    val attemptId: Long,
    // 학습 레슨의 첫 퀴즈는 채점하지 않는다. 그때 isCorrect는 null이고 correctAnswer를 생략한다.
    val graded: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val isCorrect: Boolean?,
    val completed: Boolean,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correctAnswer: JsonNode?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val explanation: String?,
    val streakDays: Int,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val closeness: Int? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val source: String? = null,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correctWord: String? = null,
)

@Service
class LearningQuizService(
    private val jdbc: JdbcTemplate,
    private val quizzes: QuizService,
    private val studyStreak: StudyStreakService,
    private val clock: Clock,
    private val unlocks: LessonUnlockService,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    @Transactional
    fun submit(
        userId: Long,
        quizId: Long,
        answer: JsonNode,
        replay: Boolean,
    ): AnswerResult {
        if (userId <= 0 || quizId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val lesson =
            jdbc
                .query(
                    """SELECT l.lesson_id, l.course_id, c.is_onboarding FROM lesson_content lc
                   JOIN lesson l ON l.lesson_id = lc.lesson_id
                   JOIN course c ON c.course_id = l.course_id
                   WHERE lc.quiz_id = ?""",
                    { rs, _ -> LinkedLesson(rs.getLong("lesson_id"), rs.getLong("course_id"), rs.getBoolean("is_onboarding")) },
                    quizId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)

        if (lesson.onboarding) {
            if (replay) throw ApiV1Exception(ApiErrorCode.CONFLICT)
            val onboardingAvailable =
                jdbc
                    .query(
                        "SELECT onboarding_completed FROM app_user WHERE user_id=? AND status <> 'WITHDRAWN' FOR UPDATE",
                        { rs, _ -> !rs.getBoolean("onboarding_completed") },
                        userId,
                    ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            if (!onboardingAvailable) throw ApiV1Exception(ApiErrorCode.CONFLICT)
            val result = quizzes.submitPublic(userId, quizId, answer, false)
            return result.toAnswerResult(studyStreak.current(userId))
        }

        if (!unlocks.ensureProgress(userId, lesson.lessonId)) throw ApiV1Exception(ApiErrorCode.LESSON_LOCKED)
        val progress =
            jdbc
                .query(
                    "SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ? FOR UPDATE",
                    { rs, _ -> rs.getString("status") },
                    userId,
                    lesson.lessonId,
                ).firstOrNull()
        if (progress == null) throw ApiV1Exception(ApiErrorCode.LESSON_LOCKED)
        if (replay && progress != "COMPLETED") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (!replay && progress == "COMPLETED") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (progress !in setOf("UNLOCKED", "IN_PROGRESS", "COMPLETED")) throw ApiV1Exception(ApiErrorCode.LESSON_LOCKED)

        val result = quizzes.submitPublic(userId, quizId, answer, replay, graded = !isFirstQuiz(lesson.lessonId, quizId))
        if (replay) return result.toAnswerResult(studyStreak.current(userId))

        jdbc.update(
            "UPDATE lesson_progress SET status = 'IN_PROGRESS', modified_at = now() WHERE user_id = ? AND lesson_id = ? AND status = 'UNLOCKED'",
            userId,
            lesson.lessonId,
        )
        // 처음 학습할 때 틀린 퀴즈는 레슨이 끝나면 복습 후보가 된다. 맞혔거나 채점하지 않은 퀴즈는 기록하지 않는다.
        if (result.completed && result.graded && result.correct == false) {
            jdbc.update(
                """INSERT INTO quiz_review_pool(user_id, quiz_id, lesson_wrong, available_on, last_submitted_at)
                   VALUES (?, ?, TRUE, ?, ?)
                   ON CONFLICT (user_id, quiz_id) DO UPDATE SET lesson_wrong = TRUE, modified_at = now()""",
                userId,
                quizId,
                LocalDate.ofInstant(clock.instant(), kst),
                Timestamp.from(clock.instant()),
            )
        }
        return result.toAnswerResult(studyStreak.current(userId))
    }

    /** 학습 레슨에서 순서상 첫 퀴즈. API-403의 QuizPublic.graded=false와 같은 기준이다. */
    private fun isFirstQuiz(
        lessonId: Long,
        quizId: Long,
    ): Boolean =
        jdbc
            .query(
                "SELECT quiz_id FROM lesson_content WHERE lesson_id = ? AND quiz_id IS NOT NULL ORDER BY content_order, content_id LIMIT 1",
                { rs, _ -> rs.getLong(1) },
                lessonId,
            ).firstOrNull() == quizId

    private fun QuizAttemptResponse.toAnswerResult(streakDays: Int) =
        AnswerResult(attemptId, graded, correct, completed, correctAnswer, explanation, streakDays, closeness, source, correctWord)

    private data class LinkedLesson(
        val lessonId: Long,
        val courseId: Long,
        val onboarding: Boolean,
    )
}
