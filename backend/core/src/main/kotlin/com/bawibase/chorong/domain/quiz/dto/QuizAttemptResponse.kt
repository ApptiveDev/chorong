package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "서버가 채점하고 저장한 제출 결과")
data class QuizAttemptResponse(
    val attemptId: Long,
    val graded: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    @param:Schema(description = "정답 여부. FLIP_CARD는 null이다.", nullable = true)
    val correct: Boolean?,
    @param:Schema(description = "유효한 답안 제출은 true. FLIP_CARD는 flipped 값이다.")
    val completed: Boolean,
    val explanation: String,
)
