package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "서버가 채점하고 저장한 제출 결과")
data class QuizAttemptResponse(
    val attemptId: Long,
    val graded: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS)
    @param:Schema(description = "정답 여부. FLIP_CARD는 제출한 짝이 모두 맞는지 나타낸다.", nullable = true)
    val correct: Boolean?,
    @param:Schema(description = "유효한 답안 제출은 true. FLIP_CARD는 모든 카드의 짝을 맞춰야 true다.")
    val completed: Boolean,
    val explanation: String,
)
