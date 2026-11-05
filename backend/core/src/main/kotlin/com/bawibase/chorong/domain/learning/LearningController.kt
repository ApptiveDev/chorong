package com.bawibase.chorong.domain.learning

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.quiz.dto.QuizPublicResponse
import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

data class CourseSummary(
    val courseId: Long,
    val title: String,
    val category: String,
    val totalLessons: Int,
    val completedLessons: Int,
    val constellation: Any? = null,
)

data class LessonSummary(
    val lessonId: Long,
    val title: String,
    val order: Int,
    val status: String = "LOCKED",
    val unlocksAt: java.time.Instant? = null,
    val completedAt: java.time.Instant? = null,
)

data class CourseDetail(
    val courseId: Long,
    val title: String,
    val category: String,
    val totalLessons: Int,
    val completedLessons: Int,
    val constellation: Any?,
    val description: String,
    val lessons: List<LessonSummary>,
)

data class LearningContent(
    val contentId: Long,
    val order: Int,
    val contentType: String,
    val body: String?,
    val mediaUrl: String?,
    val quiz: QuizPublicResponse?,
)

data class LessonDetail(
    val lessonId: Long,
    val courseId: Long,
    val title: String,
    val description: String,
    val contents: List<LearningContent>,
)

data class LessonStartRequest(
    val replay: Boolean = false,
)

data class LessonProgressState(
    val status: String,
    val lastContentId: Long?,
    val resumeContentId: Long?,
)

data class LessonStartResponse(
    val reviewRequired: Boolean,
    val review: ReviewSetResponse? = null,
    val progress: LessonProgressState,
    val contents: List<LearningContent>,
)

data class ContentCompletionResult(
    val progress: LessonProgressState,
    val lessonCompleted: Boolean = false,
    val completion: Any? = null,
)

data class CourseProgressSummary(
    val courseId: Long,
    val completedLessons: Int,
    val totalLessons: Int,
)

data class CurrentLessonProgress(
    val lessonId: Long,
    val courseId: Long,
    val status: String,
)

data class LearningProgressSummary(
    val courses: List<CourseProgressSummary>,
    val current: CurrentLessonProgress?,
)

data class LearningAnswerRequest(
    val answer: JsonNode,
    val replay: Boolean = false,
)

@RestController
@RequestMapping("/api/v1")
class LearningController(
    private val learning: LearningService,
    private val learningQuizzes: LearningQuizService,
    private val lessonProgress: LessonProgressService,
    private val lessonCompletion: LessonCompletionService,
    private val reviewSets: ReviewSetService,
    private val reviewAnswers: ReviewAnswerService,
    private val reviewCompletion: ReviewCompletionService,
    private val onboarding: OnboardingService,
) {
    @GetMapping("/onboarding")
    @Operation(operationId = "API-601", summary = "온보딩 레슨 조회")
    fun getOnboarding(
        @CurrentUserId userId: Long,
    ): ApiResponse<Map<String, LessonDetail>> = ApiResponse(mapOf("lesson" to onboarding.getLesson(userId)))

    @PostMapping("/onboarding/complete")
    @Operation(operationId = "API-602", summary = "온보딩 완료 또는 건너뛰기")
    fun completeOnboarding(
        @CurrentUserId userId: Long,
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
        @RequestBody request: OnboardingCompleteRequest,
    ): ResponseEntity<ApiResponse<OnboardingCompleteResponse>> {
        val result = onboarding.complete(userId, request, idempotencyKey)
        return ResponseEntity.status(result.status).body(ApiResponse(result.body))
    }

    @GetMapping("/courses")
    @Operation(operationId = "API-401", summary = "코스 목록", description = "ONBOARDING 코스는 제외한다.")
    fun courses(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) category: String?,
    ): ApiResponse<Map<String, List<CourseSummary>>> = ApiResponse(mapOf("courses" to learning.listCourses(userId, category)))

    @GetMapping("/courses/{courseId}")
    @Operation(operationId = "API-402", summary = "코스 상세")
    fun course(
        @CurrentUserId userId: Long,
        @PathVariable courseId: Long,
    ): ApiResponse<CourseDetail> = ApiResponse(learning.getCourse(userId, courseId))

    @GetMapping("/lessons/{lessonId}")
    @Operation(operationId = "API-403", summary = "레슨 콘텐츠 상세", description = "퀴즈 콘텐츠의 정답과 해설은 제외한다.")
    fun lesson(
        @PathVariable lessonId: Long,
    ): ApiResponse<LessonDetail> = ApiResponse(learning.getLesson(lessonId))

    @PostMapping("/lessons/{lessonId}/start")
    @Operation(operationId = "API-404", summary = "Start or resume lesson")
    fun startLesson(
        @CurrentUserId userId: Long,
        @PathVariable lessonId: Long,
        @RequestBody(required = false) request: LessonStartRequest?,
    ): ApiResponse<LessonStartResponse> = ApiResponse(lessonProgress.start(userId, lessonId, request?.replay ?: false))

    @PostMapping("/contents/{contentId}/complete")
    @Operation(operationId = "API-405", summary = "Complete lesson content")
    fun completeContent(
        @CurrentUserId userId: Long,
        @PathVariable contentId: Long,
    ): ApiResponse<ContentCompletionResult> = ApiResponse(lessonProgress.completeContent(userId, contentId))

    @GetMapping("/users/me/progress")
    @Operation(operationId = "API-408", summary = "Get learning progress")
    fun progress(
        @CurrentUserId userId: Long,
    ): ApiResponse<LearningProgressSummary> = ApiResponse(lessonProgress.getProgress(userId))

    @GetMapping("/reviews/next")
    @Operation(operationId = "API-501", summary = "Get next review set")
    fun nextReviewSet(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) lessonId: Long?,
    ): ApiResponse<ReviewSetResponse> = ApiResponse(reviewSets.next(userId, lessonId))

    @PostMapping("/reviews/{reviewItemId}/answer")
    @Operation(operationId = "API-502", summary = "Submit a review answer")
    fun submitReviewAnswer(
        @CurrentUserId userId: Long,
        @PathVariable reviewItemId: Long,
        @RequestBody request: LearningAnswerRequest,
    ): ApiResponse<ReviewAnswerResponse> = ApiResponse(reviewAnswers.submit(userId, reviewItemId, request.answer))

    @PostMapping("/reviews/complete")
    @Operation(operationId = "API-503", summary = "Complete review session and grant reward")
    fun completeReview(
        @CurrentUserId userId: Long,
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
        @RequestBody request: ReviewCompleteRequest,
    ): ResponseEntity<ApiResponse<ReviewCompleteResponse>> {
        val result = reviewCompletion.complete(userId, request.reviewItemIds, idempotencyKey)
        return ResponseEntity.status(result.status).body(ApiResponse(result.body))
    }

    @PostMapping("/lessons/{lessonId}/complete")
    @Operation(operationId = "API-407", summary = "Complete lesson and grant rewards")
    fun completeLesson(
        @CurrentUserId userId: Long,
        @PathVariable lessonId: Long,
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
    ): ResponseEntity<ApiResponse<LessonCompleteResponse>> {
        val result = lessonCompletion.complete(userId, lessonId, idempotencyKey)
        return ResponseEntity.status(result.status).body(ApiResponse(result.body))
    }

    @PostMapping("/quizzes/{quizId}/answer")
    @Operation(
        operationId = "API-406",
        summary = "퀴즈 답안 제출·채점",
        description = "기존 8종 퀴즈를 채점한다. 해금된 레슨만 제출할 수 있고 정답 객체는 반환하지 않는다.",
    )
    fun answer(
        @CurrentUserId userId: Long,
        @PathVariable quizId: Long,
        @RequestBody request: LearningAnswerRequest,
    ): ApiResponse<AnswerResult> = ApiResponse(learningQuizzes.submit(userId, quizId, request.answer, request.replay))
}
