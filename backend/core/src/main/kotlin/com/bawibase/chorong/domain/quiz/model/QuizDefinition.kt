package com.bawibase.chorong.domain.quiz.model

import com.bawibase.chorong.domain.quiz.QuizInteractionType

sealed interface QuizDefinition {
    val interactionType: QuizInteractionType
    val config: QuizConfig
    val answer: QuizAnswer?
}

data class OxQuizDefinition(
    override val config: OxConfig,
    override val answer: OxAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.OX
}

data class SingleQuizDefinition(
    override val config: SingleConfig,
    override val answer: SingleAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.SINGLE
}

data class MultiQuizDefinition(
    override val config: MultiConfig,
    override val answer: MultiAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.MULTI
}

data class BlankQuizDefinition(
    override val config: BlankConfig,
    override val answer: BlankAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.BLANK
}

data class SliderQuizDefinition(
    override val config: SliderConfig,
    override val answer: SliderAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.SLIDER
}

/** 짝은 앱이 한 쌍씩 바로 판정하도록 config에 공개한다. 저장 정답은 없다. */
data class MatchQuizDefinition(
    override val config: MatchConfig,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.MATCH
    override val answer: QuizAnswer? get() = null
}

data class ChosungQuizDefinition(
    override val config: ChosungConfig,
    override val answer: ChosungAnswer,
) : QuizDefinition {
    override val interactionType: QuizInteractionType get() = QuizInteractionType.CHOSUNG
}
