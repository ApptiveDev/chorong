package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.model.DragDropQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ExactSliderAnswer
import com.bawibase.chorong.domain.quiz.model.FlipCardQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchingQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.RangeSliderAnswer
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.model.TapQuizDefinition
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import java.math.RoundingMode

typealias QuizPublicResponse = QuizResponse

object QuizPublicAnswer {
    private val mapper = jacksonObjectMapper()

    fun correct(quiz: QuizDefinition): JsonNode =
        mapper.valueToTree(
            when (quiz) {
                is SliderQuizDefinition -> {
                    val value =
                        when (val answer = quiz.answer) {
                            is ExactSliderAnswer -> {
                                answer.value
                            }

                            is RangeSliderAnswer -> {
                                quiz.config.min +
                                    (answer.min - quiz.config.min).divide(quiz.config.step, 0, RoundingMode.CEILING) * quiz.config.step
                            }
                        }
                    mapOf("value" to value)
                }

                is SwipeQuizDefinition -> {
                    mapOf("value" to quiz.answer.correctValue)
                }

                is TapQuizDefinition -> {
                    mapOf("selectedItemIds" to quiz.answer.correctItemIds)
                }

                is MultipleChoiceQuizDefinition -> {
                    mapOf("selectedOptionIds" to quiz.answer.correctOptionIds)
                }

                is DragDropQuizDefinition -> {
                    mapOf("placements" to quiz.answer.placements)
                }

                is SortQuizDefinition -> {
                    mapOf("order" to quiz.answer.correctOrder)
                }

                is MatchingQuizDefinition -> {
                    mapOf("matches" to quiz.answer.matches)
                }

                is FlipCardQuizDefinition -> {
                    mapOf("pairs" to quiz.answer.pairs)
                }
            },
        )
}
