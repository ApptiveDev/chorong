package com.bawibase.chorong.domain.quiz.dto

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "유형별 사용자 응답. 사용자 ID와 채점 결과는 서버에서 결정한다.")
@JsonDeserialize(using = QuizAttemptRequestDeserializer::class)
data class QuizAttemptRequest(
    @param:Schema(description = "퀴즈 유형에 맞는 JSON 객체", type = "object")
    val response: JsonNode,
)
