package com.bawibase.chorong.domain.quiz.model

import java.math.BigDecimal

/** DB에만 저장하는 정답. 조회 응답에는 포함하지 않는다. */
sealed interface QuizAnswer

data class OxAnswer(
    val answer: Boolean,
) : QuizAnswer

data class SingleAnswer(
    val answer: Int,
) : QuizAnswer

data class MultiAnswer(
    val answers: List<Int>,
) : QuizAnswer

data class BlankAnswer(
    val answer: Int,
) : QuizAnswer

/** answer는 트랙 위치(0~1), tolerance는 정답으로 인정하는 위치 차이. */
data class SliderAnswer(
    val answer: BigDecimal,
    val tolerance: BigDecimal,
) : QuizAnswer

/** 인정하는 정답 목록. 공백을 빼고 비교한다. */
data class ChosungAnswer(
    val answer: List<String>,
) : QuizAnswer
