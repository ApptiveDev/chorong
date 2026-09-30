package com.bawibase.chorong.domain.quiz.model

import java.math.BigDecimal

sealed interface QuizAnswer

sealed interface SliderAnswer : QuizAnswer

data class ExactSliderAnswer(
    val value: BigDecimal,
) : SliderAnswer

data class RangeSliderAnswer(
    val min: BigDecimal,
    val max: BigDecimal,
) : SliderAnswer

data class SwipeAnswer(
    val correctValue: String,
) : QuizAnswer

data class TapAnswer(
    val correctItemIds: List<String>,
) : QuizAnswer

data class MultipleChoiceAnswer(
    val correctOptionIds: List<String>,
) : QuizAnswer

data class DragDropAnswer(
    val placements: Map<String, String>,
) : QuizAnswer

data class SortAnswer(
    val correctOrder: List<String>,
) : QuizAnswer

data class MatchingAnswer(
    val matches: Map<String, String>,
) : QuizAnswer
