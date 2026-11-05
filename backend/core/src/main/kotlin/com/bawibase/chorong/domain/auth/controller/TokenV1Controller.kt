package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.service.RotationFailure
import com.bawibase.chorong.domain.auth.service.TokenLogoutService
import com.bawibase.chorong.domain.auth.service.TokenRotationService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import org.springframework.http.HttpStatus
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class RefreshV1Request(
    @field:NotBlank val refreshToken: String,
    @field:Pattern(regexp = GuestAuthRequest.UUID_PATTERN) val deviceUuid: String,
)

data class LogoutV1Request(
    val all: Boolean = false,
)

data class TokenPairV1(
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long,
)

@RestController
@RequestMapping("/api/v1/auth")
class TokenV1Controller(
    private val rotations: TokenRotationService,
    private val logout: TokenLogoutService,
) {
    @Operation(operationId = "API-106")
    @PostMapping("/token/refresh")
    fun refresh(
        @Valid @RequestBody request: RefreshV1Request,
    ): ApiResponse<TokenPairV1> {
        val result = rotations.rotate(request.refreshToken, request.deviceUuid)
        val token =
            result.token ?: throw ApiV1Exception(
                when (result.failure) {
                    RotationFailure.REUSED -> ApiErrorCode.AUTH_TOKEN_REUSED
                    RotationFailure.EXPIRED -> ApiErrorCode.AUTH_TOKEN_EXPIRED
                    else -> ApiErrorCode.UNAUTHORIZED
                },
            )
        return ApiResponse(TokenPairV1(token.accessToken, token.refreshToken, token.expiresIn))
    }

    @Operation(operationId = "API-107")
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(
        @CurrentUserId userId: Long,
        @AuthenticationPrincipal jwt: Jwt,
        @RequestBody(required = false) request: LogoutV1Request?,
    ) = logout.logout(userId, jwt.getClaimAsString("sid")?.toLongOrNull(), request?.all ?: false)
}
