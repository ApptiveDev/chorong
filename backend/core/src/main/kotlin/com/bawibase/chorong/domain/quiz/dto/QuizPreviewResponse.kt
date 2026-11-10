package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "저장하지 않는 퀴즈 테스트 결과")
data class QuizPreviewResponse(
    val graded: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    @param:Schema(description = "정답 여부", nullable = true)
    val correct: Boolean?,
    val completed: Boolean,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val explanation: String?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val closeness: Int? = null,
)
