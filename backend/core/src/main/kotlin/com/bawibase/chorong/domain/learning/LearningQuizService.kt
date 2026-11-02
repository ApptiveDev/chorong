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
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    val isCorrect: Boolean,
    val correctAnswer: JsonNode,
    val explanation: String,
    val streakDays: Int,
)

@Service
class LearningQuizService(
    private val jdbc: JdbcTemplate,
    private val quizzes: QuizService,
    private val reviewGate: ReviewGateService,
    private val studyStreak: StudyStreakService,
    private val clock: Clock,
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

        val progress =
            jdbc
                .query(
                    "SELECT status FROM lesson_progress WHERE user_id = ? AND lesson_id = ? FOR UPDATE",
                    { rs, _ -> rs.getString("status") },
                    userId,
                    lesson.lessonId,
                ).firstOrNull()
        if (progress == null) throw lessonLocked(userId, lesson.courseId)
        if (replay && progress != "COMPLETED") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (!replay && progress == "COMPLETED") throw ApiV1Exception(ApiErrorCode.CONFLICT)
        if (progress !in setOf("UNLOCKED", "IN_PROGRESS", "COMPLETED")) throw lessonLocked(userId, lesson.courseId)
        reviewGate.enforce(userId, lesson.lessonId)

        val result = quizzes.submitPublic(userId, quizId, answer, replay)
        if (replay) return result.toAnswerResult(studyStreak.current(userId))

        jdbc.update(
            "UPDATE lesson_progress SET status = 'IN_PROGRESS', modified_at = now() WHERE user_id = ? AND lesson_id = ? AND status = 'UNLOCKED'",
            userId,
            lesson.lessonId,
        )
        if (result.completed) {
            val now = Timestamp.from(clock.instant())
            val studyDate = LocalDate.ofInstant(now.toInstant(), kst)
            updateReviewPool(userId, quizId, result, studyDate, now)
        }
        return result.toAnswerResult(studyStreak.current(userId))
    }

    private fun updateReviewPool(
        userId: Long,
        quizId: Long,
        result: QuizAttemptResponse,
        studyDate: LocalDate,
        submittedAt: Timestamp,
    ) {
        val status = if (result.correct == true) "CORRECT" else "WRONG"
        val availableOn = if (status == "CORRECT") studyDate.plusDays(1) else studyDate
        jdbc.update(
            """INSERT INTO quiz_review_pool(user_id, quiz_id, status, available_on, last_submitted_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT (user_id, quiz_id) DO UPDATE SET status = EXCLUDED.status,
                 available_on = EXCLUDED.available_on, last_submitted_at = EXCLUDED.last_submitted_at,
                 modified_at = now()""",
            userId,
            quizId,
            status,
            availableOn,
            submittedAt,
        )
    }

    private fun lessonLocked(
        userId: Long,
        courseId: Long,
    ): ApiV1Exception {
        val today = LocalDate.ofInstant(clock.instant(), kst)
        val alreadyUnlocked =
            jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM course_daily_unlock WHERE user_id = ? AND course_id = ? AND unlock_date = ?)",
                Boolean::class.java,
                userId,
                courseId,
                today,
            ) ?: false
        val unlocksAt = if (alreadyUnlocked) today.plusDays(1).atStartOfDay(kst).toInstant() else null
        return ApiV1Exception(ApiErrorCode.LESSON_LOCKED, unlocksAt = unlocksAt)
    }

    private fun QuizAttemptResponse.toAnswerResult(streakDays: Int) =
        AnswerResult(attemptId, checkNotNull(correct), checkNotNull(correctAnswer), explanation, streakDays)

    private data class LinkedLesson(
        val lessonId: Long,
        val courseId: Long,
        val onboarding: Boolean,
    )
}
