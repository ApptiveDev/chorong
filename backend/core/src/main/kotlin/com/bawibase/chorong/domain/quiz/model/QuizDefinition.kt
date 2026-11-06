package com.bawibase.chorong.domain.quiz.model

import com.bawibase.chorong.domain.quiz.QuizInteractionType

sealed interface QuizDefinition {
    val interactionType: QuizInteractionType
    val config: QuizConfig
    val answer: QuizAnswer?
}

data class SliderQuizDefinition(
    override val config: SliderConfig,
    override val answer: SliderAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.SLIDER
}

data class SwipeQuizDefinition(
    override val config: SwipeConfig,
    override val answer: SwipeAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.SWIPE
}

data class TapQuizDefinition(
    override val config: TapConfig,
    override val answer: TapAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.TAP
}

data class MultipleChoiceQuizDefinition(
    override val config: MultipleChoiceConfig,
    override val answer: MultipleChoiceAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.MULTIPLE_CHOICE
}

data class DragDropQuizDefinition(
    override val config: DragDropConfig,
    override val answer: DragDropAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.DRAG_DROP
}

data class SortQuizDefinition(
    override val config: SortConfig,
    override val answer: SortAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.SORT
}

data class MatchingQuizDefinition(
    override val config: MatchingConfig,
    override val answer: MatchingAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.MATCHING
}

data class FlipCardQuizDefinition(
    override val config: FlipCardConfig,
    override val answer: FlipCardAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.FLIP_CARD
}
