package com.bawibase.chorong.domain.quiz.serialization

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.DragDropAnswer
import com.bawibase.chorong.domain.quiz.model.DragDropConfig
import com.bawibase.chorong.domain.quiz.model.DragDropQuizDefinition
import com.bawibase.chorong.domain.quiz.model.DragDropUserResponse
import com.bawibase.chorong.domain.quiz.model.ExactSliderAnswer
import com.bawibase.chorong.domain.quiz.model.FlipCardAnswer
import com.bawibase.chorong.domain.quiz.model.FlipCardConfig
import com.bawibase.chorong.domain.quiz.model.FlipCardQuizDefinition
import com.bawibase.chorong.domain.quiz.model.FlipCardUserResponse
import com.bawibase.chorong.domain.quiz.model.MatchingAnswer
import com.bawibase.chorong.domain.quiz.model.MatchingConfig
import com.bawibase.chorong.domain.quiz.model.MatchingQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchingUserResponse
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceAnswer
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceConfig
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceUserResponse
import com.bawibase.chorong.domain.quiz.model.QuizAnswer
import com.bawibase.chorong.domain.quiz.model.QuizCardFace
import com.bawibase.chorong.domain.quiz.model.QuizCardPair
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizItemOption
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.model.RangeSliderAnswer
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SliderConfig
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import com.bawibase.chorong.domain.quiz.model.SortAnswer
import com.bawibase.chorong.domain.quiz.model.SortConfig
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SortUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeAnswer
import com.bawibase.chorong.domain.quiz.model.SwipeConfig
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeUserResponse
import com.bawibase.chorong.domain.quiz.model.TapAnswer
import com.bawibase.chorong.domain.quiz.model.TapConfig
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.bawibase.chorong.domain.quiz.model.TapUserResponse
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.cfg.CoercionAction
import com.fasterxml.jackson.databind.cfg.CoercionInputShape
import com.fasterxml.jackson.databind.type.LogicalType
import org.springframework.stereotype.Component

@Component
class QuizModelConverter(
    objectMapper: ObjectMapper,
) {
    private val reader =
        objectMapper.copy().apply {
            setDefaultPropertyInclusion(JsonInclude.Value.construct(JsonInclude.Include.ALWAYS, JsonInclude.Include.ALWAYS))
            enable(
                DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES,
                DeserializationFeature.FAIL_ON_NUMBERS_FOR_ENUMS,
                DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS,
            )
            disable(
                DeserializationFeature.ACCEPT_FLOAT_AS_INT,
                DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY,
                DeserializationFeature.UNWRAP_SINGLE_VALUE_ARRAYS,
                DeserializationFeature.ACCEPT_EMPTY_STRING_AS_NULL_OBJECT,
                DeserializationFeature.ACCEPT_EMPTY_ARRAY_AS_NULL_OBJECT,
                DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_AS_NULL,
                DeserializationFeature.READ_UNKNOWN_ENUM_VALUES_USING_DEFAULT_VALUE,
            )
            for (type in listOf(LogicalType.Integer, LogicalType.Float, LogicalType.Boolean)) {
                coercionConfigFor(type)
                    .setCoercion(CoercionInputShape.String, CoercionAction.Fail)
                    .setCoercion(CoercionInputShape.EmptyString, CoercionAction.Fail)
            }
            coercionConfigFor(LogicalType.Textual)
                .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail)
            coercionConfigFor(LogicalType.Integer)
                .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail)
            coercionConfigFor(LogicalType.Float)
                .setCoercion(CoercionInputShape.Boolean, CoercionAction.Fail)
            coercionConfigFor(LogicalType.Boolean)
                .setCoercion(CoercionInputShape.Integer, CoercionAction.Fail)
                .setCoercion(CoercionInputShape.Float, CoercionAction.Fail)
        }

    // 객체의 생략된 선택 필드만 제외한다. 입력 Map의 명시적 null은 reader가 보존한다.
    private val writer =
        reader.copy().setDefaultPropertyInclusion(
            JsonInclude.Value.construct(JsonInclude.Include.NON_NULL, JsonInclude.Include.ALWAYS),
        )
    private val mapType = object : TypeReference<Map<String, Any?>>() {}

    fun readDefinition(quiz: QuizItemEntity): QuizDefinition {
        val config = storedTree(quiz.config)
        val answer = quiz.answer?.let(::storedTree)
        // Jackson enum 변환이 앞뒤 공백을 제거하지 않도록 원본 문자열을 확인한다.
        config["selectionType"]?.let { selection ->
            if (!selection.isTextual || SelectionType.entries.none { it.name == selection.textValue() }) {
                throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
            }
        }
        return when (quiz.interactionType) {
            QuizInteractionType.SLIDER -> {
                SliderQuizDefinition(
                    stored(config, SliderConfig::class.java),
                    if (answer?.has("value") == true) {
                        stored(answer, ExactSliderAnswer::class.java)
                    } else {
                        stored(answer, RangeSliderAnswer::class.java)
                    },
                )
            }

            QuizInteractionType.SWIPE -> {
                SwipeQuizDefinition(stored(config, SwipeConfig::class.java), stored(answer, SwipeAnswer::class.java))
            }

            QuizInteractionType.TAP -> {
                TapQuizDefinition(stored(config, TapConfig::class.java), stored(answer, TapAnswer::class.java))
            }

            QuizInteractionType.MULTIPLE_CHOICE -> {
                MultipleChoiceQuizDefinition(
                    stored(config, MultipleChoiceConfig::class.java),
                    stored(answer, MultipleChoiceAnswer::class.java),
                )
            }

            QuizInteractionType.DRAG_DROP -> {
                DragDropQuizDefinition(stored(config, DragDropConfig::class.java), stored(answer, DragDropAnswer::class.java))
            }

            QuizInteractionType.SORT -> {
                SortQuizDefinition(stored(config, SortConfig::class.java), stored(answer, SortAnswer::class.java))
            }

            QuizInteractionType.MATCHING -> {
                MatchingQuizDefinition(stored(config, MatchingConfig::class.java), stored(answer, MatchingAnswer::class.java))
            }

            QuizInteractionType.FLIP_CARD -> {
                if (answer == null) {
                    legacyFlipCard(stored(config, LegacyFlipCardConfig::class.java))
                } else {
                    FlipCardQuizDefinition(stored(config, FlipCardConfig::class.java), stored(answer, FlipCardAnswer::class.java))
                }
            }
        }
    }

    // 기존 한 장짜리 저장 데이터는 배포 후 샘플 교체 전에도 조회할 수 있도록 한 쌍으로 읽는다.
    private fun legacyFlipCard(config: LegacyFlipCardConfig): FlipCardQuizDefinition {
        fun card(
            id: String,
            face: QuizCardFace,
        ): QuizItemOption {
            val content = listOfNotNull(face.title, face.text, face.imageUrl)
            if (content.isEmpty() || content.any { it.isBlank() }) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
            return QuizItemOption(id, listOfNotNull(face.title, face.text).takeIf { it.isNotEmpty() }?.joinToString("\n"), face.imageUrl)
        }
        return FlipCardQuizDefinition(
            FlipCardConfig(
                cards = listOf(card("legacy-front", config.front), card("legacy-back", config.back)),
                shuffle = config.shuffle,
                allowRetry = config.allowRetry,
                showHint = config.showHint,
            ),
            FlipCardAnswer(listOf(QuizCardPair("legacy-front", "legacy-back"))),
        )
    }

    /** DB 문제에서 결정한 유형을 사용한다. 요청에는 별도의 유형 필드가 필요하지 않다. */
    fun readResponse(
        quiz: QuizDefinition,
        response: JsonNode,
    ): QuizUserResponse {
        val type =
            when (quiz) {
                is SliderQuizDefinition -> SliderUserResponse::class.java
                is SwipeQuizDefinition -> SwipeUserResponse::class.java
                is TapQuizDefinition -> TapUserResponse::class.java
                is MultipleChoiceQuizDefinition -> MultipleChoiceUserResponse::class.java
                is DragDropQuizDefinition -> DragDropUserResponse::class.java
                is SortQuizDefinition -> SortUserResponse::class.java
                is MatchingQuizDefinition -> MatchingUserResponse::class.java
                is FlipCardQuizDefinition -> FlipCardUserResponse::class.java
            }
        return read(response, type, ErrorCode.INVALID_QUIZ_RESPONSE)
    }

    fun writeConfig(config: QuizConfig): Map<String, Any?> = writer.convertValue(config, mapType)

    fun writeAnswer(answer: QuizAnswer?): Map<String, Any?>? = answer?.let { writer.convertValue(it, mapType) }

    fun writeResponse(response: QuizUserResponse): Map<String, Any?> = writer.convertValue(response, mapType)

    private fun storedTree(value: Map<String, Any?>): JsonNode =
        try {
            reader.valueToTree(value)
        } catch (_: IllegalArgumentException) {
            throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
        }

    private fun <T> stored(
        node: JsonNode?,
        type: Class<T>,
    ): T = read(node, type, ErrorCode.QUIZ_DATA_INVALID)

    private fun <T> read(
        node: JsonNode?,
        type: Class<T>,
        error: ErrorCode,
    ): T {
        if (node == null || !node.isObject || containsNull(node)) throw ApiException(error)
        return try {
            reader.treeToValue(node, type)
        } catch (_: JsonProcessingException) {
            throw ApiException(error)
        } catch (_: IllegalArgumentException) {
            throw ApiException(error)
        }
    }

    private fun containsNull(node: JsonNode): Boolean = node.isNull || (node.isContainerNode && node.any(::containsNull))
}

private data class LegacyFlipCardConfig(
    val front: QuizCardFace,
    val back: QuizCardFace,
    val shuffle: Boolean? = null,
    val allowRetry: Boolean? = null,
    val showHint: Boolean? = null,
)
