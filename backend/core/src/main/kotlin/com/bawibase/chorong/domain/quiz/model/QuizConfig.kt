package com.bawibase.chorong.domain.quiz.model

import com.fasterxml.jackson.annotation.JsonInclude
import io.swagger.v3.oas.annotations.media.Schema
import java.math.BigDecimal

/** 선택 속성의 null은 필드 생략을 나타낸다. 명시적 null 입력은 JSON 변환 단계에서 거절한다. */
@JsonInclude(JsonInclude.Include.NON_NULL)
sealed interface QuizConfig {
    val shuffle: Boolean?
    val allowRetry: Boolean?
    val showHint: Boolean?
}

@Schema(requiredProperties = ["min", "max", "step"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SliderConfig(
    val min: BigDecimal,
    val max: BigDecimal,
    val step: BigDecimal,
    @field:Schema(description = "생략 시 앱은 min에서 시작한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val initialValue: BigDecimal? = null,
    @field:Schema(description = "생략 시 단위를 표시하지 않는다. 빈 문자열도 허용한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val unit: String? = null,
    @field:Schema(description = "생략 시 앱은 값을 표시한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    val showValue: Boolean? = null,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["left", "right"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SwipeConfig(
    val left: SwipeChoice,
    val right: SwipeChoice,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["selectionType", "items"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class TapConfig(
    val selectionType: SelectionType,
    val items: List<QuizItemOption>,
    @field:Schema(
        description = "TAP·MULTIPLE_CHOICE 선택 한도. SINGLE은 1만 허용한다.",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED,
        minimum = "1",
        maximum = "2147483647",
    )
    val maxSelections: Int? = null,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["selectionType", "options"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MultipleChoiceConfig(
    val selectionType: SelectionType,
    val options: List<QuizItemOption>,
    @field:Schema(
        description = "TAP·MULTIPLE_CHOICE 선택 한도. SINGLE은 1만 허용한다.",
        requiredMode = Schema.RequiredMode.NOT_REQUIRED,
        minimum = "1",
        maximum = "2147483647",
    )
    val maxSelections: Int? = null,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["items", "targets"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class DragDropConfig(
    val items: List<QuizItemOption>,
    val targets: List<QuizItemOption>,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["items"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class SortConfig(
    val items: List<QuizItemOption>,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["leftItems", "rightItems"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class MatchingConfig(
    val leftItems: List<QuizItemOption>,
    val rightItems: List<QuizItemOption>,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig

@Schema(requiredProperties = ["cards"], additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
data class FlipCardConfig(
    val cards: List<QuizItemOption>,
    @field:Schema(description = "생략 시 표시 순서를 섞지 않는다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val shuffle: Boolean? = null,
    @field:Schema(description = "생략 또는 true만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val allowRetry: Boolean? = null,
    @field:Schema(description = "생략 또는 false만 지원한다.", requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    override val showHint: Boolean? = null,
) : QuizConfig
