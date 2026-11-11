package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "서버가 채점하고 저장한 제출 결과")
data class QuizAttemptResponse(
    val attemptId: Long,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val graded: Boolean,
    @param:Schema(description = "정답 여부", nullable = true)
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correct: Boolean? = null,
    @param:Schema(description = "유효한 답안 제출은 true")
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val completed: Boolean,
    @param:Schema(description = "해설. 해설이 없는 문항은 점수에 넣지 않으며 이 필드를 생략한다.")
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val explanation: String?,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val correctAnswer: JsonNode? = null,
    @param:Schema(description = "SLIDER만. 정답 위치에 얼마나 가까운지(0~100).")
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val closeness: Int? = null,
    @param:Schema(description = "해설의 출처. 없으면 생략한다.")
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val source: String? = null,
)
