package com.bawibase.chorong.domain.learning

import org.junit.jupiter.api.RepeatedTest
import org.junit.jupiter.api.Test
import kotlin.random.Random
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ReviewSelectionTest {
    private var nextId = 1L

    private fun reviewOnly(
        lessonId: Long,
        lessonHasWrong: Boolean,
        count: Int = 1,
    ) = List(count) { ReviewCandidate(nextId++, lessonId, reviewOnly = true, lessonHasWrong = lessonHasWrong) }

    private fun wrong(
        lessonId: Long,
        count: Int = 1,
    ) = List(count) { ReviewCandidate(nextId++, lessonId, reviewOnly = false, lessonHasWrong = true) }

    @RepeatedTest(20)
    fun `four from the wrong lesson with review only first and one review only from a perfect lesson`() {
        val wrongLessonReviewOnly = reviewOnly(1, lessonHasWrong = true, count = 2)
        val wrongQuizzes = wrong(1, count = 3)
        val perfectReviewOnly = reviewOnly(2, lessonHasWrong = false, count = 2)

        val chosen = ReviewSelection.select(wrongLessonReviewOnly + wrongQuizzes + perfectReviewOnly, Random.Default)

        assertEquals(5, chosen.size)
        assertTrue(chosen.containsAll(wrongLessonReviewOnly))
        assertEquals(2, chosen.count { it in wrongQuizzes })
        assertEquals(1, chosen.count { it in perfectReviewOnly })
    }

    @RepeatedTest(20)
    fun `missing places are filled with review only quizzes before wrong quizzes`() {
        // 틀린 레슨에서 4개를 채운 뒤 남은 자리는 복습 전용 문제가 틀린 퀴즈보다 먼저다.
        val wrongLessonReviewOnly = reviewOnly(1, lessonHasWrong = true, count = 5)
        val wrongQuiz = wrong(1)

        val chosen = ReviewSelection.select(wrongLessonReviewOnly + wrongQuiz, Random.Default)

        assertEquals(wrongLessonReviewOnly.toSet(), chosen.toSet())
    }

    @Test
    fun `wrong quizzes fill the rest when there are not enough review only quizzes`() {
        val wrongQuiz = wrong(1)
        val perfectReviewOnly = reviewOnly(2, lessonHasWrong = false, count = 2)
        val otherWrong = wrong(3, count = 2)

        val chosen = ReviewSelection.select(wrongQuiz + perfectReviewOnly + otherWrong, Random(7))

        assertEquals((wrongQuiz + perfectReviewOnly + otherWrong).toSet(), chosen.toSet())
    }

    @RepeatedTest(20)
    fun `the choice is random and has no duplicates`() {
        val candidates = reviewOnly(2, lessonHasWrong = false, count = 4) + reviewOnly(3, lessonHasWrong = false, count = 4)

        val chosen = ReviewSelection.select(candidates, Random.Default)

        assertEquals(5, chosen.toSet().size)
    }
}
