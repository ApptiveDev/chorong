package com.bawibase.chorong.domain.quiz.controller

import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptRequest
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptResponse
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.service.QuizService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "퀴즈")
@SecurityRequirement(name = "bearer")
@RequestMapping("/api/quizzes")
class QuizController(
    private val quizService: QuizService,
) {
    @Operation(summary = "학습별 퀴즈 조회", description = "quizOrder, quizId 순으로 조회한다. 문제가 없으면 빈 배열을 반환한다. 정답과 해설은 포함하지 않는다.")
    @GetMapping
    fun list(
        @Parameter(description = "양의 정수 학습 ID", schema = Schema(minimum = "1"))
        @RequestParam lessonId: Long,
    ): List<QuizResponse> = quizService.list(lessonId)

    @Operation(summary = "퀴즈 상세 조회", description = "문제와 화면 구성 정보를 조회한다. 없는 퀴즈는 404를 반환한다. 정답과 해설은 포함하지 않는다.")
    @GetMapping("/{quizId}")
    fun get(
        @Parameter(description = "양의 정수 퀴즈 ID", schema = Schema(minimum = "1"))
        @PathVariable quizId: Long,
    ): QuizResponse = quizService.get(quizId)

    @Operation(
        summary = "퀴즈 답안 제출",
        description = "서버에서 채점하고 로그인한 사용자의 제출 기록을 저장한다. 유효한 오답도 201을 반환한다. 입력 오류는 400, 문제 데이터 오류는 409이다.",
    )
    @PostMapping("/{quizId}/attempts")
    @ResponseStatus(HttpStatus.CREATED)
    fun submit(
        @Parameter(hidden = true) @CurrentUserId userId: Long,
        @Parameter(description = "양의 정수 퀴즈 ID", schema = Schema(minimum = "1"))
        @PathVariable quizId: Long,
        @RequestBody request: QuizAttemptRequest,
    ): QuizAttemptResponse = quizService.submit(userId, quizId, request.response)
}
