package com.bawibase.chorong.domain.learning.contentimport

import com.bawibase.chorong.domain.quiz.model.QuizDefinition

/** 담당자에게 돌려줄 검사 오류 한 건. lesson·screen이 null이면 별자리 칸이다. */
data class ContentIssue(
    val lesson: String?,
    val screen: String?,
    val field: String,
    val reason: String,
) {
    override fun toString(): String {
        val place = listOfNotNull(lesson?.let { "레슨 $it" } ?: "별자리", screen, field.takeIf { it.isNotEmpty() })
        return place.joinToString(" · ") + ": " + reason
    }
}

data class ContentParseResult(
    val course: ImportCourse?,
    val issues: List<ContentIssue>,
)

data class ImportCourse(
    val slug: String,
    val title: String,
    val description: String,
    val order: Int,
    val lessons: List<ImportLesson>,
)

/** key는 별자리 안의 레슨 id, DB slug는 "{별자리 id}/{key}"다. hash가 바뀌면 화면을 다시 만든다. */
data class ImportLesson(
    val key: String,
    val title: String,
    val keyword: String,
    val source: String?,
    val endingText: String,
    val endingImageUrl: String?,
    val screens: List<ImportScreen>,
    val reviewQuizzes: List<ImportQuiz>,
    val hash: String,
)

sealed interface ImportScreen {
    val section: String
    val source: String?
}

data class NarrationScreen(
    override val section: String,
    val lines: List<ImportLine>,
    override val source: String?,
) : ImportScreen

data class ConceptScreen(
    override val section: String,
    val keyword: String,
    val imageUrl: String,
    val lines: List<ImportLine>,
    override val source: String?,
) : ImportScreen

data class QuizScreen(
    override val section: String,
    val quiz: ImportQuiz,
) : ImportScreen {
    override val source: String? get() = quiz.source
}

data class ImportLine(
    val speaker: String?,
    val text: String,
)

data class ImportQuiz(
    val definition: QuizDefinition,
    val question: String,
    val instruction: String,
    val explanation: String?,
    val source: String?,
)
