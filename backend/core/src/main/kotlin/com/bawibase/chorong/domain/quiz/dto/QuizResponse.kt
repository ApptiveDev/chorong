package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "퀴즈 조회 결과. 정답과 해설은 포함하지 않는다.")
data class QuizResponse(
    val quizId: Long,
    val lessonId: Long,
    val question: String,
    val instruction: String,
    val interactionType: QuizInteractionType,
    @param:Schema(description = "유형별 화면 구성. FLIP_CARD의 back은 공개 학습 내용이다.")
    val config: Map<String, Any?>,
    @param:Schema(description = "난이도 문자열. 고정된 값 목록은 없다.")
    val difficulty: String,
    val quizOrder: Int,
) {
    companion object {
        fun from(quiz: QuizItemEntity) =
            QuizResponse(
                quizId = checkNotNull(quiz.id),
                lessonId = quiz.lessonId,
                question = quiz.question,
                instruction = quiz.instruction,
                interactionType = quiz.interactionType,
                config = quiz.config,
                difficulty = quiz.difficulty,
                quizOrder = quiz.quizOrder,
            )
    }
}
