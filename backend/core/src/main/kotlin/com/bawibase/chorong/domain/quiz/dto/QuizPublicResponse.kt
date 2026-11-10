package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.model.BlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultiQuizDefinition
import com.bawibase.chorong.domain.quiz.model.OxQuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.SingleQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper

typealias QuizPublicResponse = QuizResponse

/** 제출 후 보여 줄 정답. 답안과 같은 모양이다. */
object QuizPublicAnswer {
    private val mapper = jacksonObjectMapper()

    fun correct(quiz: QuizDefinition): JsonNode =
        mapper.valueToTree(
            when (quiz) {
                is OxQuizDefinition -> mapOf("answer" to quiz.answer.answer)
                is SingleQuizDefinition -> mapOf("answer" to quiz.answer.answer)
                is BlankQuizDefinition -> mapOf("answer" to quiz.answer.answer)
                is MultiQuizDefinition -> mapOf("answers" to quiz.answer.answers.sorted())
                is SliderQuizDefinition -> mapOf("answer" to quiz.answer.answer)
                is MatchQuizDefinition -> mapOf("pairs" to quiz.config.pairs)
                is ChosungQuizDefinition -> mapOf("answer" to quiz.answer.answer.first())
            },
        )
}
