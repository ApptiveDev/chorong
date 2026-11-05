package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.service.PasswordLoginFailure
import com.bawibase.chorong.domain.auth.service.PasswordLoginService
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

data class EmailLoginRequest(
    @field:NotBlank @field:Email @field:Size(max = 255)
    @field:Pattern(regexp = "^[^ @]+@[^ @]+$") val email: String,
    @field:NotBlank @field:Size(max = 72) val password: String,
    @field:Pattern(regexp = GuestAuthRequest.UUID_PATTERN) val deviceUuid: String,
)

@RestController
@RequestMapping("/api/v1/auth/email")
class EmailLoginController(
    private val login: PasswordLoginService,
) {
    @Operation(operationId = "API-104")
    @PostMapping("/login")
    fun login(
        @Valid @RequestBody request: EmailLoginRequest,
    ): ApiResponse<GuestAuthData> {
        val result = login.login(request.email, request.password, request.deviceUuid.lowercase(), requireMember = true)
        val token =
            result.token ?: throw ApiV1Exception(
                if (result.failure == PasswordLoginFailure.LOCKED) ApiErrorCode.ACCOUNT_LOCKED else ApiErrorCode.UNAUTHORIZED,
                retryAfter = result.retryAfter,
            )
        return ApiResponse(GuestAuthData(token.accessToken, token.refreshToken, token.expiresIn, checkNotNull(result.user), false))
    }
}
