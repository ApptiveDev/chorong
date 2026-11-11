package com.bawibase.chorong.domain.quiz.serialization

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.BlankAnswer
import com.bawibase.chorong.domain.quiz.model.BlankConfig
import com.bawibase.chorong.domain.quiz.model.BlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungAnswer
import com.bawibase.chorong.domain.quiz.model.ChosungConfig
import com.bawibase.chorong.domain.quiz.model.ChosungQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungUserResponse
import com.bawibase.chorong.domain.quiz.model.IndexUserResponse
import com.bawibase.chorong.domain.quiz.model.MatchConfig
import com.bawibase.chorong.domain.quiz.model.MatchQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchUserResponse
import com.bawibase.chorong.domain.quiz.model.MultiAnswer
import com.bawibase.chorong.domain.quiz.model.MultiConfig
import com.bawibase.chorong.domain.quiz.model.MultiQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultiUserResponse
import com.bawibase.chorong.domain.quiz.model.OxAnswer
import com.bawibase.chorong.domain.quiz.model.OxConfig
import com.bawibase.chorong.domain.quiz.model.OxQuizDefinition
import com.bawibase.chorong.domain.quiz.model.OxUserResponse
import com.bawibase.chorong.domain.quiz.model.QuizAnswer
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.model.SingleAnswer
import com.bawibase.chorong.domain.quiz.model.SingleConfig
import com.bawibase.chorong.domain.quiz.model.SingleQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderAnswer
import com.bawibase.chorong.domain.quiz.model.SliderConfig
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
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
                DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS,
            )
            disable(
                DeserializationFeature.ACCEPT_FLOAT_AS_INT,
                DeserializationFeature.ACCEPT_SINGLE_VALUE_AS_ARRAY,
                DeserializationFeature.UNWRAP_SINGLE_VALUE_ARRAYS,
                DeserializationFeature.ACCEPT_EMPTY_STRING_AS_NULL_OBJECT,
                DeserializationFeature.ACCEPT_EMPTY_ARRAY_AS_NULL_OBJECT,
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
        return when (quiz.interactionType) {
            QuizInteractionType.OX -> {
                OxQuizDefinition(stored(config, OxConfig::class.java), stored(answer, OxAnswer::class.java))
            }

            QuizInteractionType.SINGLE -> {
                SingleQuizDefinition(stored(config, SingleConfig::class.java), stored(answer, SingleAnswer::class.java))
            }

            QuizInteractionType.MULTI -> {
                MultiQuizDefinition(stored(config, MultiConfig::class.java), stored(answer, MultiAnswer::class.java))
            }

            QuizInteractionType.BLANK -> {
                BlankQuizDefinition(stored(config, BlankConfig::class.java), stored(answer, BlankAnswer::class.java))
            }

            QuizInteractionType.SLIDER -> {
                SliderQuizDefinition(stored(config, SliderConfig::class.java), stored(answer, SliderAnswer::class.java))
            }

            QuizInteractionType.MATCH -> {
                if (answer != null) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                MatchQuizDefinition(stored(config, MatchConfig::class.java))
            }

            QuizInteractionType.CHOSUNG -> {
                ChosungQuizDefinition(stored(config, ChosungConfig::class.java), stored(answer, ChosungAnswer::class.java))
            }
        }
    }

    /** DB 문제에서 결정한 유형을 사용한다. 요청에는 별도의 유형 필드가 필요하지 않다. */
    fun readResponse(
        quiz: QuizDefinition,
        response: JsonNode,
    ): QuizUserResponse {
        val type =
            when (quiz) {
                is OxQuizDefinition -> OxUserResponse::class.java
                is SingleQuizDefinition, is BlankQuizDefinition -> IndexUserResponse::class.java
                is MultiQuizDefinition -> MultiUserResponse::class.java
                is SliderQuizDefinition -> SliderUserResponse::class.java
                is MatchQuizDefinition -> MatchUserResponse::class.java
                is ChosungQuizDefinition -> ChosungUserResponse::class.java
            }
        return read(response, type, ErrorCode.INVALID_QUIZ_RESPONSE)
    }

    /** 저장한 제출 답안을 다시 읽는다. */
    fun readStoredResponse(
        quiz: QuizDefinition,
        response: Map<String, Any?>,
    ): QuizUserResponse = readResponse(quiz, storedTree(response))

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
