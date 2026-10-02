package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "저장하지 않는 퀴즈 테스트 결과")
data class QuizPreviewResponse(
    val graded: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    @param:Schema(description = "정답 여부. FLIP_CARD는 제출한 짝이 모두 맞는지 나타낸다.", nullable = true)
    val correct: Boolean?,
    val completed: Boolean,
    val explanation: String,
)
