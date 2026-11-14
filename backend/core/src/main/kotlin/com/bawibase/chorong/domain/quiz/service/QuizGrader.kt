package com.bawibase.chorong.domain.quiz.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.model.BlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungQuizDefinition
import com.bawibase.chorong.domain.quiz.model.ChosungUserResponse
import com.bawibase.chorong.domain.quiz.model.IndexUserResponse
import com.bawibase.chorong.domain.quiz.model.MatchQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MatchUserResponse
import com.bawibase.chorong.domain.quiz.model.MultiQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultiUserResponse
import com.bawibase.chorong.domain.quiz.model.OxQuizDefinition
import com.bawibase.chorong.domain.quiz.model.OxUserResponse
import com.bawibase.chorong.domain.quiz.model.QuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizUserResponse
import com.bawibase.chorong.domain.quiz.model.SinglePresentation
import com.bawibase.chorong.domain.quiz.model.SinglePresentationType
import com.bawibase.chorong.domain.quiz.model.SingleQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URI

internal data class QuizGrade(
    val graded: Boolean,
    val correct: Boolean?,
    val completed: Boolean,
    /** SLIDER만 채운다. 정답 위치에 얼마나 가까운지(0~100). */
    val closeness: Int? = null,
)

@Component
class QuizGrader {
    private val stored = QuizValueValidation(ErrorCode.QUIZ_DATA_INVALID)
    private val submitted = QuizValueValidation(ErrorCode.INVALID_QUIZ_RESPONSE)

    fun validate(quiz: QuizDefinition) {
        prepare(quiz)
    }

    /** 저장 데이터 검증을 먼저 끝내고 사용자 답안을 채점할 함수를 반환한다. */
    internal fun prepare(quiz: QuizDefinition): (QuizUserResponse) -> QuizGrade =
        when (quiz) {
            is OxQuizDefinition -> {
                response<OxUserResponse> { graded(it.answer == quiz.answer.answer) }
            }

            is SingleQuizDefinition -> {
                quiz.config.presentation?.let(::validatePresentation)
                index(quiz.config.options, quiz.answer.answer)
            }

            is BlankQuizDefinition -> {
                stored.text(quiz.config.before)
                stored.text(quiz.config.after)
                index(quiz.config.options, quiz.answer.answer)
            }

            is MultiQuizDefinition -> {
                multi(quiz)
            }

            is SliderQuizDefinition -> {
                slider(quiz)
            }

            is MatchQuizDefinition -> {
                match(quiz)
            }

            is ChosungQuizDefinition -> {
                chosung(quiz)
            }
        }

    private fun index(
        options: List<String>,
        correct: Int,
    ): (QuizUserResponse) -> QuizGrade {
        options(options)
        stored.ensure(correct in options.indices)
        return response<IndexUserResponse> {
            submitted.ensure(it.answer in options.indices)
            graded(it.answer == correct)
        }
    }

    private fun multi(quiz: MultiQuizDefinition): (QuizUserResponse) -> QuizGrade {
        val options = quiz.config.options
        options(options)
        val correct = stored.indices(quiz.answer.answers, options.size)
        return response<MultiUserResponse> {
            graded(submitted.indices(it.answers, options.size) == correct)
        }
    }

    private fun slider(quiz: SliderQuizDefinition): (QuizUserResponse) -> QuizGrade {
        stored.ensure(quiz.config.ticks.size >= 2)
        quiz.config.ticks.forEach(stored::text)
        quiz.config.hint?.let(stored::text)
        val target = quiz.answer.answer
        val tolerance = quiz.answer.tolerance
        stored.ensure(target in BigDecimal.ZERO..BigDecimal.ONE && tolerance in BigDecimal.ZERO..BigDecimal.ONE)
        return response<SliderUserResponse> {
            submitted.ensure(it.answer in BigDecimal.ZERO..BigDecimal.ONE)
            val distance = (it.answer - target).abs()
            val closeness = (BigDecimal.ONE - distance).movePointRight(2).setScale(0, RoundingMode.HALF_UP).toInt()
            QuizGrade(graded = true, correct = distance <= tolerance, completed = true, closeness = closeness)
        }
    }

    private fun match(quiz: MatchQuizDefinition): (QuizUserResponse) -> QuizGrade {
        val pairs = quiz.config.pairs
        stored.ensure(pairs.size >= 2 && pairs.all { it.size == 2 })
        pairs.flatten().forEach(stored::text)
        val lefts = pairs.map { it[0] }
        val rights = pairs.map { it[1] }
        stored.ensure(lefts.toSet().size == lefts.size && rights.toSet().size == rights.size)
        val correct = pairs.map { it[0] to it[1] }.toSet()
        return response<MatchUserResponse> { response ->
            submitted.ensure(response.pairs.all { it.size == 2 })
            val chosen = response.pairs.map { it[0] to it[1] }
            submitted.ensure(chosen.map { it.first }.sorted() == lefts.sorted())
            submitted.ensure(chosen.map { it.second }.sorted() == rights.sorted())
            graded(chosen.toSet() == correct)
        }
    }

    private fun chosung(quiz: ChosungQuizDefinition): (QuizUserResponse) -> QuizGrade {
        stored.text(quiz.config.hint)
        stored.ensure(quiz.answer.answer.isNotEmpty())
        val accepted =
            quiz.answer.answer
                .map { compact(stored.text(it)) }
                .toSet()
        return response<ChosungUserResponse> {
            val typed = compact(it.answer)
            submitted.ensure(typed.isNotEmpty())
            graded(typed in accepted)
        }
    }

    private fun options(options: List<String>) {
        stored.ensure(options.size >= 2)
        options.forEach(stored::text)
    }

    private fun validatePresentation(presentation: SinglePresentation) {
        val stages = presentation.stages
        val rows = presentation.rows
        val columns = presentation.columns
        if (presentation.type == SinglePresentationType.INLINE_WORD) {
            stored.ensure(presentation.mediaUrl == null && stages == null && rows == null && columns == null)
            return
        }
        val media = presentation.mediaUrl
        stored.ensure(!media.isNullOrBlank() && media == media.trim())
        val uri = runCatching { URI(checkNotNull(media)) }.getOrNull()
        stored.ensure(uri != null && uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank())
        if (presentation.type == SinglePresentationType.AUDIO) {
            stored.ensure(stages == null && rows == null && columns == null)
            return
        }
        stored.ensure(stages != null && stages.isNotEmpty() && stages.size <= 64)
        val values = checkNotNull(stages)
        when (presentation.type) {
            SinglePresentationType.TILE -> {
                stored.ensure(rows != null && columns != null && rows in 2..8 && columns in 2..8)
                val total = checkNotNull(rows) * checkNotNull(columns)
                stored.ensure(values.all { it in 1..total } && values.zipWithNext().all { (a, b) -> a < b })
                stored.ensure(values.last() == total)
            }

            SinglePresentationType.ZOOM_OUT -> {
                stored.ensure(rows == null && columns == null)
                stored.ensure(values.all { it in 1..8 } && values.zipWithNext().all { (a, b) -> a > b })
                stored.ensure(values.last() == 1)
            }

            SinglePresentationType.SHARPEN -> {
                stored.ensure(rows == null && columns == null)
                stored.ensure(values.all { it in 0..32 } && values.zipWithNext().all { (a, b) -> a > b })
                stored.ensure(values.last() == 0)
            }

            SinglePresentationType.AUDIO, SinglePresentationType.INLINE_WORD -> {
                return
            }
        }
    }

    private inline fun <reified T : QuizUserResponse> response(crossinline grade: (T) -> QuizGrade): (QuizUserResponse) -> QuizGrade =
        { response ->
            if (response !is T) throw ApiException(ErrorCode.INVALID_QUIZ_RESPONSE)
            grade(response)
        }

    private fun graded(correct: Boolean) = QuizGrade(graded = true, correct = correct, completed = true)

    companion object {
        private val whitespace = Regex("\\s+")

        /** 초성 답안은 공백을 모두 빼고 비교한다. */
        internal fun compact(value: String) = value.replace(whitespace, "")
    }
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

    /** 비어 있지 않고 중복 없는 보기 순번 집합. */
    fun indices(
        values: List<Int>,
        size: Int,
    ): Set<Int> {
        ensure(values.isNotEmpty() && values.all { it in 0 until size } && values.toSet().size == values.size)
        return values.toSet()
    }
}
