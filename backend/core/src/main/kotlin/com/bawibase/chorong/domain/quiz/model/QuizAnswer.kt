package com.bawibase.chorong.domain.quiz.model

import java.math.BigDecimal

/** DB에 저장하는 정답. 조회 응답에는 MULTI 정답만 config로 공개한다. */
sealed interface QuizAnswer

data class OxAnswer(
    val answer: Boolean,
) : QuizAnswer

/** correctWord는 INLINE_WORD(틀린 곳 찾기)의 바른 낱말. 문제 config로 내보내지 않는다. */
data class SingleAnswer(
    val answer: Int,
    val correctWord: String? = null,
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
