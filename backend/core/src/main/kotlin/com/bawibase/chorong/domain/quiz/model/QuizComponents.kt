package com.bawibase.chorong.domain.quiz.model

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema

enum class SelectionType {
    SINGLE,
    MULTIPLE,
}

@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(
    description = "id와 text·imageUrl 중 하나 이상이 필요하다. 지정한 문자열은 공백일 수 없다.",
    requiredProperties = ["id"],
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class QuizItemOption(
    val id: String,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val text: String? = null,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val imageUrl: String? = null,
)

@Schema(requiredProperties = ["value", "label"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SwipeChoice(
    val value: String,
    val label: String,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(
    description = "title·text·imageUrl 중 하나 이상이 필요하다. 지정한 문자열은 공백일 수 없다.",
    additionalProperties = Schema.AdditionalPropertiesValue.FALSE,
)
data class QuizCardFace(
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val title: String? = null,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val text: String? = null,
    @field:Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val imageUrl: String? = null,
)

@Schema(requiredProperties = ["firstCardId", "secondCardId"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class QuizCardPair(
    val firstCardId: String,
    val secondCardId: String,
)
