package com.bawibase.chorong.domain.quiz.model

import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal

sealed interface QuizUserResponse

@Schema(description = "OX", requiredProperties = ["answer"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class OxUserResponse(
    val answer: Boolean,
) : QuizUserResponse

@Schema(
    description = "SINGLE·BLANK. 고른 보기의 순번(0부터).",
    requiredProperties = ["answer"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class IndexUserResponse(
    val answer: Int,
) : QuizUserResponse

@Schema(
    description = "MULTI. 고른 보기의 순번(0부터) 목록. 순서는 채점에 영향을 주지 않는다.",
    requiredProperties = ["answers"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class MultiUserResponse(
    val answers: List<Int>,
) : QuizUserResponse

@Schema(
    description = "SLIDER. 손잡이를 놓은 트랙 위치(0~1).",
    requiredProperties = ["answer"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class SliderUserResponse(
    val answer: BigDecimal,
) : QuizUserResponse

@Schema(
    description = "MATCH. 사용자가 이은 [왼쪽, 오른쪽] 짝 전체. 짝의 순서는 채점에 영향을 주지 않는다.",
    requiredProperties = ["pairs"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class MatchUserResponse(
    val pairs: List<List<String>>,
) : QuizUserResponse

@Schema(
    description = "CHOSUNG. 입력한 낱말. 공백을 빼고 비교한다.",
    requiredProperties = ["answer"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class ChosungUserResponse(
    val answer: String,
) : QuizUserResponse
