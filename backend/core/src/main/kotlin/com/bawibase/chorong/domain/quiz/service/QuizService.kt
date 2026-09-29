package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptResponse
import com.bawibase.chorong.domain.quiz.dto.QuizPreviewResponse
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.entity.QuizAttemptEntity
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.repository.QuizAttemptRepository
import com.bawibase.chorong.domain.quiz.repository.QuizItemRepository
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class QuizService(
    private val quizzes: QuizItemRepository,
    private val attempts: QuizAttemptRepository,
    private val users: UserRepository,
    private val grader: QuizGrader,
    private val objectMapper: ObjectMapper,
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
        val result = grader.grade(quiz, response)
        return QuizPreviewResponse(
            graded = result.graded,
            correct = result.correct,
            completed = result.completed,
            explanation = quiz.explanation,
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
        val result = grader.grade(quiz, response)
        val attempt =
            attempts.save(
                QuizAttemptEntity(
                    quizId = quizId,
                    userId = userId,
                    response =
                        response.traverse(objectMapper).use { parser ->
                            objectMapper
                                .readerFor(object : TypeReference<Map<String, Any?>>() {})
                                .with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                                .readValue<Map<String, Any?>>(parser)
                        },
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
            explanation = quiz.explanation,
        )
    }

    private fun findQuiz(quizId: Long): QuizItemEntity {
        validateId(quizId, "quizId")
        return quizzes.findById(quizId).orElseThrow { ApiException(ErrorCode.QUIZ_NOT_FOUND) }
    }

    private fun publicQuiz(quiz: QuizItemEntity): QuizResponse {
        grader.validate(quiz)
        return QuizResponse.from(quiz)
    }

    private fun validateId(
        id: Long,
        field: String,
    ) {
        if (id <= 0) throw ApiException(ErrorCode.INVALID_QUIZ_REQUEST, mapOf("field" to field))
    }
}
