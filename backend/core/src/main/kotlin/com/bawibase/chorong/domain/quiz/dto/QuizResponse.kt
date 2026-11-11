package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.QuizInteractionType
import com.bawibase.chorong.domain.quiz.entity.QuizItemEntity
import com.bawibase.chorong.domain.quiz.model.BlankConfig
import com.bawibase.chorong.domain.quiz.model.ChosungConfig
import com.bawibase.chorong.domain.quiz.model.MatchConfig
import com.bawibase.chorong.domain.quiz.model.MultiPublicConfig
import com.bawibase.chorong.domain.quiz.model.OxConfig
import com.bawibase.chorong.domain.quiz.model.QuizConfig
import com.bawibase.chorong.domain.quiz.model.SingleConfig
import com.bawibase.chorong.domain.quiz.model.SliderConfig
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "퀴즈 조회 결과. 해설은 포함하지 않는다. 정답은 MULTI의 정답 순번과 MATCH의 짝만 config에 공개한다.")
data class QuizResponse(
    val quizId: Long,
    val lessonId: Long,
    val question: String,
    val instruction: String,
    val interactionType: QuizInteractionType,
    // 문서는 상속 구조 대신 아래 구체 config 중 하나로 표현한다.
    @field:Schema(
        description = "interactionType에 해당하는 화면 구성",
        implementation = Any::class,
        oneOf = [
            OxConfig::class,
            SingleConfig::class,
            MultiPublicConfig::class,
            BlankConfig::class,
            SliderConfig::class,
            MatchConfig::class,
            ChosungConfig::class,
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
