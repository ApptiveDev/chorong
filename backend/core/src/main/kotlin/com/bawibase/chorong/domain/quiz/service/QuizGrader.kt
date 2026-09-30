package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.model.DragDropQuizDefinition
import com.bawibase.chorong.domain.quiz.model.DragDropUserResponse
import com.bawibase.chorong.domain.quiz.model.ExactSliderAnswer
import com.bawibase.chorong.domain.quiz.model.FlipCardQuizDefinition
import com.bawibase.chorong.domain.quiz.model.FlipCardUserResponse
import com.bawibase.chorong.domain.quiz.model.MatchingQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchingUserResponse
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceUserResponse
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizItemOption
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.model.RangeSliderAnswer
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SortUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeUserResponse
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.bawibase.chorong.domain.quiz.model.TapUserResponse
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.math.RoundingMode

internal data class QuizGrade(
    val graded: Boolean,
    val correct: Boolean?,
    val completed: Boolean,
)

@Component
class QuizGrader {
    private val stored = QuizValueValidation(ErrorCode.QUIZ_DATA_INVALID)
    private val submitted = QuizValueValidation(ErrorCode.INVALID_QUIZ_RESPONSE)

    fun validate(quiz: QuizDefinition) {
        prepare(quiz)
    }

    /** 저장 데이터 검증을 먼저 끝내고 사용자 답안을 채점할 함수를 반환한다. */
    internal fun prepare(quiz: QuizDefinition): (QuizUserResponse) -> QuizGrade {
        stored.ensure(quiz.config.allowRetry != false)
        stored.ensure(quiz.config.showHint != true)
        return when (quiz) {
            is SliderQuizDefinition -> {
                slider(quiz)
            }

            is SwipeQuizDefinition -> {
                swipe(quiz)
            }

            is TapQuizDefinition -> {
                val grade = selection(quiz.config.items, quiz.config.selectionType, quiz.config.maxSelections, quiz.answer.correctItemIds)
                response<TapUserResponse> { grade(it.selectedItemIds) }
            }

            is MultipleChoiceQuizDefinition -> {
                val grade =
                    selection(quiz.config.options, quiz.config.selectionType, quiz.config.maxSelections, quiz.answer.correctOptionIds)
                response<MultipleChoiceUserResponse> { grade(it.selectedOptionIds) }
            }

            is DragDropQuizDefinition -> {
                val grade = placement(quiz.config.items, quiz.config.targets, quiz.answer.placements, oneToOne = false)
                response<DragDropUserResponse> { grade(it.placements) }
            }

            is MatchingQuizDefinition -> {
                val grade = placement(quiz.config.leftItems, quiz.config.rightItems, quiz.answer.matches, oneToOne = true)
                response<MatchingUserResponse> { grade(it.matches) }
            }

            is SortQuizDefinition -> {
                sort(quiz)
            }

            is FlipCardQuizDefinition -> {
                flip(quiz)
            }
        }
    }

    private fun slider(quiz: SliderQuizDefinition): (QuizUserResponse) -> QuizGrade {
        val config = quiz.config
        stored.ensure(config.min < config.max && config.step > BigDecimal.ZERO)

        fun selectable(value: BigDecimal) =
            value >= config.min && value <= config.max && (value - config.min).remainder(config.step).compareTo(BigDecimal.ZERO) == 0

        config.initialValue?.let { stored.ensure(selectable(it)) }
        val lower: BigDecimal
        val upper: BigDecimal
        when (val answer = quiz.answer) {
            is ExactSliderAnswer -> {
                lower = answer.value
                upper = answer.value
                stored.ensure(selectable(answer.value))
            }

            is RangeSliderAnswer -> {
                lower = answer.min
                upper = answer.max
                stored.ensure(lower >= config.min && upper <= config.max && lower <= upper)
                val firstSelectable = config.min + (lower - config.min).divide(config.step, 0, RoundingMode.CEILING) * config.step
                stored.ensure(firstSelectable <= upper)
            }
        }
        return response<SliderUserResponse> {
            submitted.ensure(selectable(it.value))
            graded(it.value >= lower && it.value <= upper)
        }
    }

    private fun swipe(quiz: SwipeQuizDefinition): (QuizUserResponse) -> QuizGrade {
        val choices =
            listOf(quiz.config.left, quiz.config.right).map {
                stored.text(it.label)
                stored.text(it.value)
            }
        stored.ensure(choices.toSet().size == 2)
        val correct = stored.text(quiz.answer.correctValue)
        stored.ensure(correct in choices)
        return response<SwipeUserResponse> {
            val value = submitted.text(it.value)
            submitted.ensure(value in choices)
            graded(value == correct)
        }
    }

    private fun selection(
        items: List<QuizItemOption>,
        selectionType: SelectionType,
        maxSelections: Int?,
        correctIds: List<String>,
    ): (List<String>) -> QuizGrade {
        val ids = itemIds(items)
        val single = selectionType == SelectionType.SINGLE
        val limit = maxSelections ?: if (single) 1 else ids.size
        stored.ensure(limit > 0 && (!single || limit == 1))
        val correct = stored.ids(correctIds)
        stored.ensure(correct.all { it in ids } && correct.size <= limit && (!single || correct.size == 1))
        return { response ->
            val selected = submitted.ids(response)
            submitted.ensure(selected.all { it in ids } && selected.size <= limit && (!single || selected.size == 1))
            graded(selected.toSet() == correct.toSet())
        }
    }

    private fun placement(
        items: List<QuizItemOption>,
        targets: List<QuizItemOption>,
        correctPlacements: Map<String, String>,
        oneToOne: Boolean,
    ): (Map<String, String>) -> QuizGrade {
        val left = itemIds(items)
        val right = itemIds(targets)
        if (oneToOne) stored.ensure(left.size == right.size)
        val correct = stored.mapping(correctPlacements, left, right, oneToOne)
        return { response ->
            val chosen = submitted.mapping(response, left, right, oneToOne)
            graded(chosen == correct)
        }
    }

    private fun sort(quiz: SortQuizDefinition): (QuizUserResponse) -> QuizGrade {
        val ids = itemIds(quiz.config.items)
        val correct = stored.ids(quiz.answer.correctOrder)
        stored.ensure(correct.toSet() == ids)
        return response<SortUserResponse> {
            val chosen = submitted.ids(it.order)
            submitted.ensure(chosen.toSet() == ids)
            graded(chosen == correct)
        }
    }

    private fun flip(quiz: FlipCardQuizDefinition): (QuizUserResponse) -> QuizGrade {
        for (card in listOf(quiz.config.front, quiz.config.back)) {
            val content = listOfNotNull(card.title, card.text, card.imageUrl)
            stored.ensure(content.isNotEmpty())
            content.forEach(stored::text)
        }
        return response<FlipCardUserResponse> {
            QuizGrade(graded = false, correct = null, completed = it.flipped)
        }
    }

    private fun itemIds(items: List<QuizItemOption>): Set<String> =
        stored
            .ids(
                items.map { item ->
                    stored.ensure(item.text != null || item.imageUrl != null)
                    item.text?.let(stored::text)
                    item.imageUrl?.let(stored::text)
                    item.id
                },
            ).toSet()

    private inline fun <reified T : QuizUserResponse> response(crossinline grade: (T) -> QuizGrade): (QuizUserResponse) -> QuizGrade =
        { response ->
            if (response !is T) throw ApiException(ErrorCode.INVALID_QUIZ_RESPONSE)
            grade(response)
        }

    private fun graded(correct: Boolean) = QuizGrade(graded = true, correct = correct, completed = true)
}

private class QuizValueValidation(
    private val error: ErrorCode,
) {
    fun ensure(condition: Boolean) {
        if (!condition) throw ApiException(error)
    }

    fun text(value: String): String {
        ensure(value.isNotBlank())
        return value
    }

    fun ids(values: List<String>): List<String> {
        ensure(values.isNotEmpty())
        values.forEach(::text)
        ensure(values.size == values.toSet().size)
        return values
    }

    fun mapping(
        values: Map<String, String>,
        left: Set<String>,
        right: Set<String>,
        oneToOne: Boolean,
    ): Map<String, String> {
        ensure(values.keys == left)
        values.values.forEach(::text)
        ensure(values.values.all { it in right })
        if (oneToOne) ensure(values.values.toSet() == right && values.size == right.size)
        return values
    }
}
