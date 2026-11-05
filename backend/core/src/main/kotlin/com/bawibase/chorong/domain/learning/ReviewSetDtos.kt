package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse

data class ReviewItemResponse(
    val reviewItemId: Long,
    val quiz: QuizPublicResponse,
)

data class ReviewSetResponse(
    val reviewItems: List<ReviewItemResponse>,
    val message: String? = null,
    val rewardEligible: Boolean,
)
