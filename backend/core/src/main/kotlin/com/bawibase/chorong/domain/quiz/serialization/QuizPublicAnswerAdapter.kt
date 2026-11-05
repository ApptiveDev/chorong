package com.bawibase.chorong.domain.quiz.serialization

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.model.FillBlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.util.Locale

@Component
class QuizPublicAnswerAdapter(
    private val mapper: ObjectMapper,
) {
    fun adapt(
        quiz: QuizDefinition,
        answer: JsonNode,
    ): JsonNode =
        when (quiz) {
            is MultipleChoiceQuizDefinition -> {
                if (quiz.config.selectionType != SelectionType.SINGLE) invalidQuizData()
                exactFields(answer, "index")
                internalResponse("selectedOptionIds", listOf(itemId(quiz.config.options.map { it.id }, answer["index"])))
            }

            is TapQuizDefinition -> {
                if (quiz.config.selectionType != SelectionType.SINGLE) invalidQuizData()
                exactFields(answer, "index")
                internalResponse("selectedItemIds", listOf(itemId(quiz.config.items.map { it.id }, answer["index"])))
            }

            is FillBlankQuizDefinition -> {
                exactFields(answer, "texts")
                val texts = answer["texts"]
                if (!texts.isArray || texts.any { !it.isTextual }) invalidResponse()
                internalResponse("texts", texts.map { it.textValue() })
            }

            is SwipeQuizDefinition -> {
                exactFields(answer, "value")
                val value = answer["value"]
                if (!value.isBoolean) invalidResponse()
                val matchingChoices =
                    listOf(quiz.config.left, quiz.config.right).filter { choice ->
                        choice.value.lowercase(Locale.ROOT).toBooleanStrictOrNull() == value.booleanValue()
                    }
                if (matchingChoices.size != 1) invalidQuizData()
                internalResponse("value", matchingChoices.single().value)
            }

            is SortQuizDefinition -> {
                exactFields(answer, "order")
                val indices =
                    indices(
                        answer["order"],
                        quiz.config.items
                            .map { it.id }
                            .size,
                    )
                if (indices.size != quiz.config.items.size || indices.toSet().size != indices.size) invalidResponse()
                internalResponse("order", indices.map { quiz.config.items[it].id })
            }

            else -> {
                invalidQuizData()
            }
        }

    private fun itemId(
        itemIds: List<String>,
        index: JsonNode,
    ): String {
        if (!index.isIntegralNumber || !index.canConvertToInt()) invalidResponse()
        return itemIds.getOrNull(index.intValue()) ?: invalidResponse()
    }

    private fun indices(
        node: JsonNode,
        itemCount: Int,
    ): List<Int> {
        if (!node.isArray) invalidResponse()
        return node.map { item ->
            if (!item.isIntegralNumber || !item.canConvertToInt()) invalidResponse()
            item.intValue().also { if (it !in 0 until itemCount) invalidResponse() }
        }
    }

    private fun exactFields(
        node: JsonNode,
        vararg fields: String,
    ) {
        if (!node.isObject || node.fieldNames().asSequence().toSet() != fields.toSet()) invalidResponse()
    }

    private fun internalResponse(
        field: String,
        value: Any,
    ): JsonNode = mapper.valueToTree(mapOf(field to value))

    private fun invalidResponse(): Nothing = throw ApiException(ErrorCode.INVALID_QUIZ_RESPONSE)

    private fun invalidQuizData(): Nothing = throw ApiException(ErrorCode.QUIZ_DATA_INVALID)
}
