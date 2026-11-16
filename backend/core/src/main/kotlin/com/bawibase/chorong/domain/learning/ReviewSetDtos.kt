package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse

data class ReviewItemResponse(
    val reviewItemId: Long,
    val quiz: QuizPublicResponse,
)

data class ReviewSetResponse(
    // 후보가 부족해 회차를 만들지 않았으면 null
    val reviewSessionId: Long?,
    val reviewItems: List<ReviewItemResponse>,
    val message: String? = null,
    val rewardEligible: Boolean,
)
