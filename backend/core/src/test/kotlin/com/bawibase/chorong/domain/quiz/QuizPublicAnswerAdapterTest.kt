package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.quiz.dto.QuizPublicAnswer
import com.bawibase.chorong.domain.quiz.model.FillBlankConfig
import com.bawibase.chorong.domain.quiz.model.FillBlankQuizDefinition
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceAnswer
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceConfig
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceQuizDefinition
import com.bawibase.chorong.domain.quiz.model.QuizItemOption
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SortAnswer
import com.bawibase.chorong.domain.quiz.model.SortConfig
import com.bawibase.chorong.domain.quiz.model.SortQuizDefinition
import com.bawibase.chorong.domain.quiz.model.SwipeAnswer
import com.bawibase.chorong.domain.quiz.model.SwipeChoice
import com.bawibase.chorong.domain.quiz.model.SwipeConfig
import com.bawibase.chorong.domain.quiz.model.SwipeQuizDefinition
import com.bawibase.chorong.domain.quiz.serialization.QuizPublicAnswerAdapter
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class QuizPublicAnswerAdapterTest {
    private val mapper = jacksonObjectMapper()
    private val adapter = QuizPublicAnswerAdapter(mapper)

    @Test
    fun `converts public answers into grader response format`() {
        assertEquals(
            mapper.readTree("""{"selectedOptionIds":["italy"]}"""),
            adapter.adapt(
                MultipleChoiceQuizDefinition(
                    MultipleChoiceConfig(SelectionType.SINGLE, listOf(QuizItemOption("italy", "Italy"))),
                    MultipleChoiceAnswer(listOf("italy")),
                ),
                mapper.readTree("""{"index":0}"""),
            ),
        )
        assertEquals(
            mapper.readTree("""{"value":"TRUE"}"""),
            adapter.adapt(
                SwipeQuizDefinition(
                    SwipeConfig(SwipeChoice("FALSE", "No"), SwipeChoice("TRUE", "Yes")),
                    SwipeAnswer("TRUE"),
                ),
                mapper.readTree("""{"value":true}"""),
            ),
        )
        assertEquals(
            mapper.readTree("""{"order":["first","second"]}"""),
            adapter.adapt(
                SortQuizDefinition(
                    SortConfig(listOf(QuizItemOption("first", "First"), QuizItemOption("second", "Second"))),
                    SortAnswer(listOf("first", "second")),
                ),
                mapper.readTree("""{"order":[0,1]}"""),
            ),
        )
        assertEquals(
            mapper.readTree("""{"texts":["answer"]}"""),
            adapter.adapt(
                FillBlankQuizDefinition(
                    FillBlankConfig(),
                    com.bawibase.chorong.domain.quiz.model
                        .FillBlankAnswer(listOf("answer")),
                ),
                mapper.readTree("""{"texts":["answer"]}"""),
            ),
        )
    }

    @Test
    fun `rejects unexpected fields and invalid indices`() {
        val quiz =
            MultipleChoiceQuizDefinition(
                MultipleChoiceConfig(SelectionType.SINGLE, listOf(QuizItemOption("italy", "Italy"))),
                MultipleChoiceAnswer(listOf("italy")),
            )

        assertInvalidResponse { adapter.adapt(quiz, mapper.readTree("""{"index":0,"extra":true}""")) }
        assertInvalidResponse { adapter.adapt(quiz, mapper.readTree("""{"index":1}""")) }
        assertInvalidResponse { adapter.adapt(quiz, mapper.readTree("""{"index":0.5}""")) }
    }

    private fun assertInvalidResponse(block: () -> Unit) {
        val exception = assertFailsWith<ApiException> { block() }
        assertEquals(ErrorCode.INVALID_QUIZ_RESPONSE, exception.code)
    }

    @Test
    fun `maps graded public responses back to answer contract`() {
        val quiz =
            MultipleChoiceQuizDefinition(
                MultipleChoiceConfig(SelectionType.SINGLE, listOf(QuizItemOption("a", "A"), QuizItemOption("b", "B"))),
                MultipleChoiceAnswer(listOf("b")),
            )
        assertEquals(
            mapper.readTree("""{"index":1}"""),
            QuizPublicAnswer.from(
                quiz,
                com.bawibase.chorong.domain.quiz.model
                    .MultipleChoiceUserResponse(listOf("b")),
            ),
        )
        assertEquals(
            mapper.readTree("""{"order":[1,0]}"""),
            QuizPublicAnswer.from(
                SortQuizDefinition(
                    SortConfig(listOf(QuizItemOption("a", "A"), QuizItemOption("b", "B"))),
                    SortAnswer(listOf("b", "a")),
                ),
                com.bawibase.chorong.domain.quiz.model
                    .SortUserResponse(listOf("b", "a")),
            ),
        )
    }
}
