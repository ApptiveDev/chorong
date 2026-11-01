package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.quiz.dto.QuizResponse

data class ReviewItemResponse(
    val reviewItemId: Long,
    val quiz: QuizResponse,
)

data class ReviewSetResponse(
    val reviewItems: List<ReviewItemResponse>,
    val message: String? = null,
    val rewardEligible: Boolean,
)
