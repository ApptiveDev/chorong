package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptResponse
import com.bawibase.chorong.domain.quiz.dto.QuizPreviewResponse
import com.bawibase.chorong.domain.quiz.dto.QuizPublicAnswer
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.entity.QuizAttemptEntity
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.repository.QuizAttemptRepository
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class QuizService(
    private val quizzes: QuizItemRepository,
    private val attempts: QuizAttemptRepository,
    private val users: UserRepository,
    private val grader: QuizGrader,
    private val converter: QuizModelConverter,
) {
    fun list(lessonId: Long): List<QuizResponse> {
        validateId(lessonId, "lessonId")
        return quizzes.findAllByLessonIdOrderByQuizOrderAscIdAsc(lessonId).map(::publicQuiz)
    }

    fun get(quizId: Long): QuizResponse = publicQuiz(findQuiz(quizId))

    fun getPublicAttempt(
        userId: Long,
        quizId: Long,
        attemptId: Long,
    ): QuizAttemptResponse {
        val attempt = attempts.findById(attemptId).orElseThrow { ApiException(ErrorCode.QUIZ_NOT_FOUND) }
        if (attempt.userId != userId || attempt.quizId != quizId) throw ApiException(ErrorCode.QUIZ_NOT_FOUND)
        val quiz = findQuiz(quizId)
        val definition = converter.readDefinition(quiz)
        val closeness = grader.prepare(definition)(converter.readStoredResponse(definition, attempt.response)).closeness
        return QuizAttemptResponse(
            attemptId = attemptId,
            graded = attempt.graded,
            correct = attempt.correct,
            completed = attempt.completed,
            explanation = quiz.explanation,
            correctAnswer = QuizPublicAnswer.correct(definition),
            closeness = closeness,
            source = quiz.source,
        )
    }

    fun preview(
        quizId: Long,
        response: JsonNode,
    ): QuizPreviewResponse {
        val quiz = findQuiz(quizId)
        val result = check(quiz, response).result
        return QuizPreviewResponse(
            graded = result.graded,
            correct = result.correct,
            completed = result.completed,
            explanation = quiz.explanation,
            closeness = result.closeness,
        )
    }

    @Transactional
    fun submit(
        userId: Long,
        quizId: Long,
        response: JsonNode,
        replay: Boolean = false,
    ): QuizAttemptResponse = submitInternal(userId, quizId, response, replay, publicContract = false)

    @Transactional
    fun submitPublic(
        userId: Long,
        quizId: Long,
        answer: JsonNode,
        replay: Boolean = false,
    ): QuizAttemptResponse = submitInternal(userId, quizId, answer, replay, publicContract = true)

    private fun submitInternal(
        userId: Long,
        quizId: Long,
        submittedAnswer: JsonNode,
        replay: Boolean,
        publicContract: Boolean,
    ): QuizAttemptResponse {
        validateId(quizId, "quizId")
        val quiz = findQuiz(quizId)
        val definition = converter.readDefinition(quiz)
        grader.validate(definition)
        val user = users.findById(userId).orElseThrow { ApiException(ErrorCode.UNAUTHORIZED) }
        if (!user.status.available) throw ApiException(ErrorCode.USER_WITHDRAWN)
        val checked = check(quiz, submittedAnswer)
        val result = checked.result
        val correctAnswer = if (publicContract && result.completed) QuizPublicAnswer.correct(definition) else null
        val attempt =
            attempts.save(
                QuizAttemptEntity(
                    quizId = quizId,
                    userId = userId,
                    response = converter.writeResponse(checked.response),
                    graded = result.graded,
                    correct = result.correct,
                    completed = result.completed,
                    replay = replay,
                ),
            )
        return QuizAttemptResponse(
            attemptId = checkNotNull(attempt.id),
            graded = result.graded,
            correct = result.correct,
            completed = result.completed,
            explanation = quiz.explanation,
            correctAnswer = correctAnswer,
            closeness = result.closeness,
            source = quiz.source,
        )
    }

    private fun check(
        quiz: QuizItemEntity,
        response: JsonNode,
    ): CheckedResponse {
        val definition = converter.readDefinition(quiz)
        val grade = grader.prepare(definition)
        val submitted = converter.readResponse(definition, response)
        return CheckedResponse(submitted, grade(submitted))
    }

    private data class CheckedResponse(
        val response: QuizUserResponse,
        val result: QuizGrade,
    )

    private fun findQuiz(quizId: Long): QuizItemEntity {
        validateId(quizId, "quizId")
        return quizzes.findById(quizId).orElseThrow { ApiException(ErrorCode.QUIZ_NOT_FOUND) }
    }

    private fun publicQuiz(quiz: QuizItemEntity): QuizResponse {
        val definition = converter.readDefinition(quiz)
        grader.validate(definition)
        return QuizResponse.from(quiz, definition.config)
    }

    private fun validateId(
        id: Long,
        field: String,
    ) {
        if (id <= 0) throw ApiException(ErrorCode.INVALID_QUIZ_REQUEST, mapOf("field" to field))
    }
}
