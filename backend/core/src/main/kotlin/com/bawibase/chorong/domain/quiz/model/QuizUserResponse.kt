package com.bawibase.chorong.domain.quiz.model

import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal

sealed interface QuizUserResponse

@Schema(requiredProperties = ["value"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SliderUserResponse(
    val value: BigDecimal,
) : QuizUserResponse

@Schema(requiredProperties = ["value"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SwipeUserResponse(
    val value: String,
) : QuizUserResponse

@Schema(requiredProperties = ["selectedItemIds"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class TapUserResponse(
    val selectedItemIds: List<String>,
) : QuizUserResponse

@Schema(requiredProperties = ["selectedOptionIds"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MultipleChoiceUserResponse(
    val selectedOptionIds: List<String>,
) : QuizUserResponse

@Schema(requiredProperties = ["placements"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class DragDropUserResponse(
    val placements: Map<String, String>,
) : QuizUserResponse

@Schema(requiredProperties = ["order"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SortUserResponse(
    val order: List<String>,
) : QuizUserResponse

@Schema(requiredProperties = ["matches"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MatchingUserResponse(
    val matches: Map<String, String>,
) : QuizUserResponse

@Schema(
    description = "현재까지 맞춘 짝과 새로 확인할 짝. 카드와 짝의 순서는 채점에 영향을 주지 않는다.",
    requiredProperties = ["pairs"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class FlipCardUserResponse(
    val pairs: List<QuizCardPair>,
) : QuizUserResponse
