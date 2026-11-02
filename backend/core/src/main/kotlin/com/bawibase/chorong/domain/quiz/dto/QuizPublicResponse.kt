package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.model.FillBlankConfig
import com.bawibase.chorong.domain.quiz.model.FillBlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.FillBlankUserResponse
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceConfig
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceUserResponse
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizItemOption
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SortConfig
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SortUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeUserResponse
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.bawibase.chorong.domain.quiz.model.TapUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeChoice
import com.bawibase.chorong.domain.quiz.model.SwipeConfig
import com.bawibase.chorong.domain.quiz.model.TapConfig
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.util.Locale

@JsonInclude(JsonInclude.Include.ALWAYS)
data class QuizPublicResponse(
    val quizId: Long,
    val type: Type,
    val question: String,
    val options: Map<String, Any?>?,
    val hint: String?,
) {
    enum class Type {
        MULTIPLE_CHOICE,
        FILL_BLANK,
        OX,
        ORDERING,
    }

    companion object {
        fun from(quiz: QuizResponse): QuizPublicResponse {
            val (type, options) = mapConfig(quiz.interactionType, quiz.config)
            return QuizPublicResponse(quiz.quizId, type, quiz.question, options, quiz.instruction)
        }

        private fun mapConfig(
            interactionType: QuizInteractionType,
            config: QuizConfig,
        ): Pair<Type, Map<String, Any?>?> =
            when (interactionType) {
                QuizInteractionType.MULTIPLE_CHOICE -> {
                    val multipleChoice = config as MultipleChoiceConfig
                    requireSingleSelection(multipleChoice.selectionType)
                    Type.MULTIPLE_CHOICE to mapOf("choices" to choices(multipleChoice.options))
                }

                QuizInteractionType.TAP -> {
                    val tap = config as TapConfig
                    requireSingleSelection(tap.selectionType)
                    Type.MULTIPLE_CHOICE to mapOf("choices" to choices(tap.items))
                }

                QuizInteractionType.FILL_BLANK -> Type.FILL_BLANK to null

                QuizInteractionType.SWIPE -> {
                    val swipe = config as SwipeConfig
                    val choices = listOf(configuredChoice(swipe.left), configuredChoice(swipe.right))
                    if (choices.map { it["value"] }.toSet().size != 2) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                    Type.OX to mapOf("choices" to choices)
                }

                QuizInteractionType.SORT -> Type.ORDERING to mapOf("items" to choices((config as SortConfig).items))

                QuizInteractionType.SLIDER,
                QuizInteractionType.DRAG_DROP,
                QuizInteractionType.MATCHING,
                QuizInteractionType.FLIP_CARD -> throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
            }

        private fun choices(items: List<QuizItemOption>): List<Map<String, Any?>> =
            items.map { item ->
                buildMap<String, Any?> {
                    put("id", item.id)
                    item.text?.let { put("text", it) }
                    item.imageUrl?.let { put("imageUrl", it) }
                }
            }

        private fun requireSingleSelection(selectionType: SelectionType) {
            if (selectionType != SelectionType.SINGLE) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
        }

        private fun configuredChoice(choice: SwipeChoice): Map<String, Any?> =
            mapOf(
                "value" to (
                    choice.value.lowercase(Locale.ROOT).toBooleanStrictOrNull()
                        ?: throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                ),
                "label" to choice.label,
            )
    }
}

object QuizPublicAnswer {
    fun from(
        quiz: QuizDefinition,
        response: QuizUserResponse,
    ): JsonNode =
        ObjectMapper().valueToTree(
            when {
                quiz is MultipleChoiceQuizDefinition && response is MultipleChoiceUserResponse -> {
                    val index = quiz.config.options.indexOfFirst { it.id == response.selectedOptionIds.singleOrNull() }
                    if (index < 0) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                    mapOf("index" to index)
                }

                quiz is TapQuizDefinition && response is TapUserResponse -> {
                    val index = quiz.config.items.indexOfFirst { it.id == response.selectedItemIds.singleOrNull() }
                    if (index < 0) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                    mapOf("index" to index)
                }

                quiz is SwipeQuizDefinition && response is SwipeUserResponse -> {
                    mapOf(
                        "value" to (
                            response.value.lowercase(Locale.ROOT).toBooleanStrictOrNull()
                                ?: throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                        ),
                    )
                }

                quiz is SortQuizDefinition && response is SortUserResponse -> {
                    val indices = response.order.map { id -> quiz.config.items.indexOfFirst { it.id == id } }
                    if (indices.any { it < 0 }) throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
                    mapOf("order" to indices)
                }

                quiz is FillBlankQuizDefinition && response is FillBlankUserResponse -> {
                    mapOf("texts" to response.texts)
                }

                else -> throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
            },
        )
}
