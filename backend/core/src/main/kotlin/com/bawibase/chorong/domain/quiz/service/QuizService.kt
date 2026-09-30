package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptResponse
import com.bawibase.chorong.domain.quiz.dto.QuizPreviewResponse
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.entity.QuizAttemptEntity
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.repository.QuizAttemptRepository
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.quiz.serialization.QuizModelConverter
import com.bawibase.chorong.domain.user.UserStatus
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
            explanation = if (quiz.interactionType == QuizInteractionType.FLIP_CARD && !result.completed) "" else quiz.explanation,
        )
    }

    @Transactional
    fun submit(
        userId: Long,
        quizId: Long,
        response: JsonNode,
    ): QuizAttemptResponse {
        val user = users.findById(userId).orElseThrow { ApiException(ErrorCode.UNAUTHORIZED) }
        if (user.status != UserStatus.ACTIVE) throw ApiException(ErrorCode.USER_WITHDRAWN)
        val quiz = findQuiz(quizId)
        val checked = check(quiz, response)
        val result = checked.result
        val attempt =
            attempts.save(
                QuizAttemptEntity(
                    quizId = quizId,
                    userId = userId,
                    response = converter.writeResponse(checked.response),
                    graded = result.graded,
                    correct = result.correct,
                    completed = result.completed,
                ),
            )
        return QuizAttemptResponse(
            attemptId = checkNotNull(attempt.id),
            graded = result.graded,
            correct = result.correct,
            completed = result.completed,
            explanation = if (quiz.interactionType == QuizInteractionType.FLIP_CARD && !result.completed) "" else quiz.explanation,
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
