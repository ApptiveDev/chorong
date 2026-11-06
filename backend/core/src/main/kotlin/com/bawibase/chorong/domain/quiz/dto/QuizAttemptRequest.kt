package com.bawibase.chorong.domain.quiz.dto

import com.bawibase.chorong.domain.quiz.model.DragDropUserResponse
import com.bawibase.chorong.domain.quiz.model.FlipCardUserResponse
import com.bawibase.chorong.domain.quiz.model.MatchingUserResponse
import com.bawibase.chorong.domain.quiz.model.MultipleChoiceUserResponse
import com.bawibase.chorong.domain.quiz.model.SliderUserResponse
import com.bawibase.chorong.domain.quiz.model.SortUserResponse
import com.bawibase.chorong.domain.quiz.model.SwipeUserResponse
import com.bawibase.chorong.domain.quiz.model.TapUserResponse
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import io.swagger.v3.oas.annotations.media.Schema

@Schema(description = "유형별 사용자 응답. 사용자 ID와 채점 결과는 서버에서 결정한다.")
@JsonDeserialize(using = QuizAttemptRequestDeserializer::class)
data class QuizAttemptRequest(
    // JsonNode 경계 타입 대신 DB 유형에 대응하는 답안 구조를 문서화한다.
    @field:Schema(
        description = "quizId로 조회한 DB 문제 유형에 맞는 답안. 숫자·문자열을 자동 변환하지 않으며 null·추가 필드는 거절한다.",
        implementation = Any::class,
        oneOf = [
            SliderUserResponse::class,
            SwipeUserResponse::class,
            TapUserResponse::class,
            MultipleChoiceUserResponse::class,
            DragDropUserResponse::class,
            SortUserResponse::class,
            MatchingUserResponse::class,
            FlipCardUserResponse::class,
        ],
    )
    val response: JsonNode,
)
