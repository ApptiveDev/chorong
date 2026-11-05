package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.service.EmailSignupResult
import com.bawibase.chorong.domain.auth.service.EmailSignupService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class EmailSignupRequest(
    @field:NotBlank @field:Email @field:Size(max = 255)
    @field:Pattern(regexp = "^[^ @]+@[^ @]+$")
    val email: String,
    @field:Size(min = 8, max = 64)
    @field:Pattern(regexp = "(?s)^(?=.*[a-zA-Z])(?=.*[0-9]).*$", message = "영문과 숫자를 포함해야 합니다.")
    val password: String,
)

@RestController
@RequestMapping("/api/v1/auth/email")
class EmailSignupController(
    private val signup: EmailSignupService,
) {
    @Operation(operationId = "API-102")
    @PostMapping("/signup")
    fun signup(
        @CurrentUserId userId: Long,
        @Valid @RequestBody request: EmailSignupRequest,
    ): ApiResponse<EmailSignupResult> = ApiResponse(signup.start(userId, request.email, request.password))
}
