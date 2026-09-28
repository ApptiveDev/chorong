package com.bawibase.chorong.domain.quiz.controller

import com.bawibase.chorong.domain.quiz.config.QuizPreviewCondition
import com.bawibase.chorong.domain.quiz.dto.QuizAttemptRequest
import com.bawibase.chorong.domain.quiz.dto.QuizPreviewResponse
import com.bawibase.chorong.domain.quiz.dto.QuizResponse
import com.bawibase.chorong.domain.quiz.service.QuizService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.context.annotation.Conditional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "퀴즈 테스트")
@Conditional(QuizPreviewCondition::class)
@RequestMapping("/api/dev/quizzes")
class QuizPreviewController(
    private val quizService: QuizService,
) {
    @Operation(summary = "테스트용 학습별 퀴즈 조회", description = "인증 없이 조회한다. 정답과 해설은 포함하지 않는다.")
    @GetMapping
    fun list(
        @RequestParam lessonId: Long,
    ): List<QuizResponse> = quizService.list(lessonId)

    @Operation(summary = "테스트용 퀴즈 상세 조회", description = "인증 없이 조회한다. 정답과 해설은 포함하지 않는다.")
    @GetMapping("/{quizId}")
    fun get(
        @PathVariable quizId: Long,
    ): QuizResponse = quizService.get(quizId)

    @Operation(summary = "테스트용 퀴즈 채점", description = "인증 없이 채점하고 해설을 반환한다. 사용자와 제출 기록을 생성하지 않는다.")
    @PostMapping("/{quizId}/check")
    fun check(
        @PathVariable quizId: Long,
        @RequestBody request: QuizAttemptRequest,
    ): QuizPreviewResponse = quizService.preview(quizId, request.response)
}
