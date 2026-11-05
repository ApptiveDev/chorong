package com.bawibase.chorong.domain.quiz

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.model.FillBlankConfig
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceConfig
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.QuizItemOption
import com.bawibase.chorong.domain.quiz.model.SelectionType
import com.bawibase.chorong.domain.quiz.model.SortConfig
import com.bawibase.chorong.domain.quiz.model.SwipeChoice
import com.bawibase.chorong.domain.quiz.model.SwipeConfig
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class QuizPublicResponseTest {
    private fun response(
        type: QuizInteractionType,
        config: QuizConfig,
    ) = QuizPublicResponse.from(
        QuizResponse(
            quizId = 7,
            lessonId = 1,
            question = "question",
            instruction = "hint",
            interactionType = type,
            config = config,
            difficulty = "basic",
            quizOrder = 0,
        ),
    )

    @Test
    fun `maps supported quiz types to the v1 public shape`() {
        val choices = listOf(QuizItemOption("a", "A"), QuizItemOption("b", "B"))
        val choiceOptions =
            mapOf(
                "choices" to
                    listOf(
                        mapOf("index" to 0, "label" to "A"),
                        mapOf("index" to 1, "label" to "B"),
                    ),
            )
        assertEquals(
            QuizPublicResponse(7, QuizPublicResponse.Type.MULTIPLE_CHOICE, "question", choiceOptions, "hint"),
            response(QuizInteractionType.MULTIPLE_CHOICE, MultipleChoiceConfig(SelectionType.SINGLE, choices)),
        )
        assertEquals(
            QuizPublicResponse(7, QuizPublicResponse.Type.FILL_BLANK, "question", null, "hint"),
            response(QuizInteractionType.FILL_BLANK, FillBlankConfig()),
        )
        assertEquals(
            QuizPublicResponse(
                7,
                QuizPublicResponse.Type.OX,
                "question",
                mapOf(
                    "choices" to
                        listOf(
                            mapOf("value" to false, "label" to "No"),
                            mapOf("value" to true, "label" to "Yes"),
                        ),
                ),
                "hint",
            ),
            response(QuizInteractionType.SWIPE, SwipeConfig(SwipeChoice("false", "No"), SwipeChoice("true", "Yes"))),
        )
        assertEquals(
            QuizPublicResponse(
                7,
                QuizPublicResponse.Type.ORDERING,
                "question",
                mapOf("items" to choiceOptions.getValue("choices")),
                "hint",
            ),
            response(QuizInteractionType.SORT, SortConfig(choices)),
        )
    }

    @Test
    fun `rejects legacy quiz types without a 0 2 equivalent`() {
        assertFailsWith<ApiException> { response(QuizInteractionType.SLIDER, FillBlankConfig()) }
        assertFailsWith<ApiException> {
            response(
                QuizInteractionType.MULTIPLE_CHOICE,
                MultipleChoiceConfig(SelectionType.MULTIPLE, listOf(QuizItemOption("a", "A"))),
            )
        }
    }
}
