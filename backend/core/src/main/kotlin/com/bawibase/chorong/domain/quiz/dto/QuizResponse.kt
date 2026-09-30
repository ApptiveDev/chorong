package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.DragDropConfig
import com.bawibase.chorong.domain.quiz.model.FlipCardConfig
import com.bawibase.chorong.domain.quiz.model.MatchingConfig
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceConfig
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.SliderConfig
import com.bawibase.chorong.domain.quiz.model.SortConfig
import com.bawibase.chorong.domain.quiz.model.SwipeConfig
import com.bawibase.chorong.domain.quiz.model.TapConfig
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "퀴즈 조회 결과. 정답과 해설은 포함하지 않는다.")
data class QuizResponse(
    val quizId: Long,
    val lessonId: Long,
    val question: String,
    val instruction: String,
    val interactionType: QuizInteractionType,
    // 문서는 상속 구조 대신 아래 구체 config 중 하나로 표현한다.
    @field:Schema(
        description = "interactionType에 해당하는 화면 구성. FLIP_CARD의 back은 공개 학습 내용이다.",
        implementation = Any::class,
        oneOf = [
            SliderConfig::class,
            SwipeConfig::class,
            TapConfig::class,
            MultipleChoiceConfig::class,
            DragDropConfig::class,
            SortConfig::class,
            MatchingConfig::class,
            FlipCardConfig::class,
        ],
    )
    val config: QuizConfig,
    @param:Schema(description = "난이도 문자열. 고정된 값 목록은 없다.")
    val difficulty: String,
    val quizOrder: Int,
) {
    companion object {
        fun from(
            quiz: QuizItemEntity,
            config: QuizConfig,
        ) = QuizResponse(
            quizId = checkNotNull(quiz.id),
            lessonId = quiz.lessonId,
            question = quiz.question,
            instruction = quiz.instruction,
            interactionType = quiz.interactionType,
            config = config,
            difficulty = quiz.difficulty,
            quizOrder = quiz.quizOrder,
        )
    }
}
