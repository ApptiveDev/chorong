package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.math.RoundingMode

internal data class QuizGrade(
    val graded: Boolean,
    val correct: Boolean?,
    val completed: Boolean,
)

@Component
class QuizGrader(
    private val objectMapper: ObjectMapper,
) {
    private val stored = QuizJsonValidation(ErrorCode.QUIZ_DATA_INVALID)
    private val submitted = QuizJsonValidation(ErrorCode.INVALID_QUIZ_RESPONSE)

    fun validate(quiz: QuizItemEntity) {
        prepare(quiz)
    }

    internal fun grade(
        quiz: QuizItemEntity,
        response: JsonNode,
    ): QuizGrade = prepare(quiz)(response)

    private fun prepare(quiz: QuizItemEntity): (JsonNode) -> QuizGrade {
        val config = objectMapper.valueToTree<JsonNode>(quiz.config)
        val answer = quiz.answer?.let { objectMapper.valueToTree<JsonNode>(it) }
        stored.objectValue(config)
        if (config.has("shuffle")) stored.boolean(config["shuffle"])
        // 반복 제출은 허용한다. 재시도 제한과 힌트 데이터는 아직 지원하지 않는다.
        if (config.has("allowRetry")) stored.ensure(stored.boolean(config["allowRetry"]))
        if (config.has("showHint")) stored.ensure(!stored.boolean(config["showHint"]))
        if (config.has("maxSelections")) {
            stored.ensure(quiz.interactionType in setOf(QuizInteractionType.TAP, QuizInteractionType.MULTIPLE_CHOICE))
        }
        if (quiz.interactionType == QuizInteractionType.FLIP_CARD) stored.ensure(answer == null) else stored.objectValue(answer)
        return when (quiz.interactionType) {
            QuizInteractionType.SLIDER -> {
                slider(config, checkNotNull(answer))
            }

            QuizInteractionType.SWIPE -> {
                swipe(config, checkNotNull(answer))
            }

            QuizInteractionType.TAP -> {
                selection(config, checkNotNull(answer), "items", "correctItemIds", "selectedItemIds")
            }

            QuizInteractionType.MULTIPLE_CHOICE -> {
                selection(
                    config,
                    checkNotNull(answer),
                    "options",
                    "correctOptionIds",
                    "selectedOptionIds",
                )
            }

            QuizInteractionType.DRAG_DROP -> {
                placement(config, checkNotNull(answer), false)
            }

            QuizInteractionType.MATCHING -> {
                placement(config, checkNotNull(answer), true)
            }

            QuizInteractionType.SORT -> {
                sort(config, checkNotNull(answer))
            }

            QuizInteractionType.FLIP_CARD -> {
                flip(config)
            }
        }
    }

    private fun slider(
        config: JsonNode,
        answer: JsonNode,
    ): (JsonNode) -> QuizGrade {
        configKeys(config, "min", "max", "step", "initialValue", "unit", "showValue")
        val min = stored.number(config["min"])
        val max = stored.number(config["max"])
        val step = stored.number(config["step"])
        stored.ensure(min < max && step > BigDecimal.ZERO)

        fun selectable(value: BigDecimal) = value >= min && value <= max && (value - min).remainder(step).compareTo(BigDecimal.ZERO) == 0
        if (config.has("initialValue")) stored.ensure(selectable(stored.number(config["initialValue"])))
        if (config.has("unit")) stored.text(config["unit"], allowBlank = true)
        if (config.has("showValue")) stored.boolean(config["showValue"])
        val lower: BigDecimal
        val upper: BigDecimal
        if (answer.has("value")) {
            stored.keys(answer, setOf("value"))
            lower = stored.number(answer["value"])
            upper = lower
            stored.ensure(selectable(lower))
        } else {
            stored.keys(answer, setOf("min", "max"))
            lower = stored.number(answer["min"])
            upper = stored.number(answer["max"])
            stored.ensure(lower >= min && upper <= max && lower <= upper)
            val firstSelectable = min + (lower - min).divide(step, 0, RoundingMode.CEILING) * step
            stored.ensure(firstSelectable <= upper)
        }
        return { response ->
            submitted.keys(response, setOf("value"))
            val value = submitted.number(response["value"])
            submitted.ensure(selectable(value))
            graded(value >= lower && value <= upper)
        }
    }

    private fun swipe(
        config: JsonNode,
        answer: JsonNode,
    ): (JsonNode) -> QuizGrade {
        configKeys(config, "left", "right")
        val choices =
            listOf("left", "right").map { side ->
                val item = stored.objectValue(config[side])
                stored.keys(item, setOf("value", "label"))
                stored.text(item["label"])
                stored.text(item["value"])
            }
        stored.ensure(choices.toSet().size == 2)
        stored.keys(answer, setOf("correctValue"))
        val correct = stored.text(answer["correctValue"])
        stored.ensure(correct in choices)
        return { response ->
            submitted.keys(response, setOf("value"))
            val value = submitted.text(response["value"])
            submitted.ensure(value in choices)
            graded(value == correct)
        }
    }

    private fun selection(
        config: JsonNode,
        answer: JsonNode,
        itemsKey: String,
        answerKey: String,
        responseKey: String,
    ): (JsonNode) -> QuizGrade {
        configKeys(config, "selectionType", itemsKey, "maxSelections")
        val ids = itemIds(config[itemsKey])
        val selectionType = stored.text(config["selectionType"])
        stored.ensure(selectionType in setOf("SINGLE", "MULTIPLE"))
        val single = selectionType == "SINGLE"
        val limit =
            if (config.has("maxSelections")) {
                stored.positiveInteger(config["maxSelections"])
            } else if (single) {
                1
            } else {
                ids.size
            }
        stored.ensure(!single || limit == 1)
        stored.keys(answer, setOf(answerKey))
        val correct = stored.ids(answer[answerKey])
        stored.ensure(correct.all { it in ids } && correct.size <= limit && (!single || correct.size == 1))
        return { response ->
            submitted.keys(response, setOf(responseKey))
            val selected = submitted.ids(response[responseKey])
            submitted.ensure(selected.all { it in ids } && selected.size <= limit && (!single || selected.size == 1))
            graded(selected.toSet() == correct.toSet())
        }
    }

    private fun placement(
        config: JsonNode,
        answer: JsonNode,
        matching: Boolean,
    ): (JsonNode) -> QuizGrade {
        val leftKey = if (matching) "leftItems" else "items"
        val rightKey = if (matching) "rightItems" else "targets"
        val resultKey = if (matching) "matches" else "placements"
        configKeys(config, leftKey, rightKey)
        val left = itemIds(config[leftKey])
        val right = itemIds(config[rightKey])
        if (matching) stored.ensure(left.size == right.size)
        stored.keys(answer, setOf(resultKey))
        val correct = stored.mapping(answer[resultKey], left, right, matching)
        return { response ->
            submitted.keys(response, setOf(resultKey))
            val chosen = submitted.mapping(response[resultKey], left, right, matching)
            graded(chosen == correct)
        }
    }

    private fun sort(
        config: JsonNode,
        answer: JsonNode,
    ): (JsonNode) -> QuizGrade {
        configKeys(config, "items")
        val ids = itemIds(config["items"])
        stored.keys(answer, setOf("correctOrder"))
        val correct = stored.ids(answer["correctOrder"])
        stored.ensure(correct.toSet() == ids)
        return { response ->
            submitted.keys(response, setOf("order"))
            val chosen = submitted.ids(response["order"])
            submitted.ensure(chosen.toSet() == ids)
            graded(chosen == correct)
        }
    }

    private fun flip(config: JsonNode): (JsonNode) -> QuizGrade {
        configKeys(config, "front", "back")
        for (side in listOf("front", "back")) {
            val card = stored.objectValue(config[side])
            stored.allowedKeys(card, setOf("title", "text", "imageUrl"))
            stored.ensure(card.size() > 0)
            card.fields().forEachRemaining { stored.text(it.value) }
        }
        return { response ->
            submitted.keys(response, setOf("flipped"))
            QuizGrade(graded = false, correct = null, completed = submitted.boolean(response["flipped"]))
        }
    }

    private fun itemIds(node: JsonNode?): Set<String> {
        val items = stored.array(node)
        val ids =
            items.map { item ->
                stored.objectValue(item)
                stored.allowedKeys(item, setOf("id", "text", "imageUrl"))
                stored.ensure(item.has("text") || item.has("imageUrl"))
                if (item.has("text")) stored.text(item["text"])
                if (item.has("imageUrl")) stored.text(item["imageUrl"])
                stored.text(item["id"])
            }
        stored.ensure(ids.size == ids.toSet().size)
        return ids.toSet()
    }

    private fun configKeys(
        config: JsonNode,
        vararg keys: String,
    ) {
        stored.allowedKeys(config, keys.toSet() + setOf("shuffle", "allowRetry", "showHint"))
    }

    private fun graded(correct: Boolean) = QuizGrade(graded = true, correct = correct, completed = true)
}

private class QuizJsonValidation(
    private val error: ErrorCode,
) {
    fun ensure(condition: Boolean) {
        if (!condition) throw ApiException(error)
    }

    fun objectValue(node: JsonNode?): JsonNode {
        if (node == null || !node.isObject) throw ApiException(error)
        return node
    }

    fun keys(
        node: JsonNode,
        expected: Set<String>,
    ) {
        ensure(objectValue(node).fieldNames().asSequence().toSet() == expected)
    }

    fun allowedKeys(
        node: JsonNode,
        expected: Set<String>,
    ) {
        ensure(objectValue(node).fieldNames().asSequence().all { it in expected })
    }

    fun text(
        node: JsonNode?,
        allowBlank: Boolean = false,
    ): String {
        if (node == null || !node.isTextual) throw ApiException(error)
        val value = node.textValue()
        ensure(allowBlank || value.isNotBlank())
        return value
    }

    fun boolean(node: JsonNode?): Boolean {
        if (node == null || !node.isBoolean) throw ApiException(error)
        return node.booleanValue()
    }

    fun number(node: JsonNode?): BigDecimal {
        if (node == null || !node.isNumber) throw ApiException(error)
        return try {
            node.decimalValue()
        } catch (_: NumberFormatException) {
            throw ApiException(error)
        }
    }

    fun positiveInteger(node: JsonNode?): Int {
        if (node == null || !node.isIntegralNumber || !node.canConvertToInt()) throw ApiException(error)
        val value = node.intValue()
        ensure(value > 0)
        return value
    }

    fun array(node: JsonNode?): List<JsonNode> {
        if (node == null || !node.isArray || node.isEmpty) throw ApiException(error)
        return node.toList()
    }

    fun ids(node: JsonNode?): List<String> {
        val values = array(node).map { text(it) }
        ensure(values.size == values.toSet().size)
        return values
    }

    fun mapping(
        node: JsonNode?,
        left: Set<String>,
        right: Set<String>,
        oneToOne: Boolean,
    ): Map<String, String> {
        val obj = objectValue(node)
        ensure(obj.fieldNames().asSequence().toSet() == left)
        val values = obj.fields().asSequence().associate { it.key to text(it.value) }
        ensure(values.values.all { it in right })
        if (oneToOne) ensure(values.values.toSet() == right && values.size == right.size)
        return values
    }
}
