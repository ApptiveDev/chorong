package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.service.GoogleOAuthService
import com.bawibase.chorong.domain.auth.service.KakaoTokenVerifier
import com.bawibase.chorong.domain.user.AuthProvider
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class KakaoOAuthRequest(
    @field:NotBlank @field:Size(max = 8192) val accessToken: String,
    @field:Pattern(regexp = GuestAuthRequest.UUID_PATTERN) val deviceUuid: String,
)

@RestController
@RequestMapping("/api/v1/auth/oauth")
class KakaoOAuthController(
    private val verifier: KakaoTokenVerifier,
    private val oauth: GoogleOAuthService,
) {
    @Operation(operationId = "API-105")
    @PostMapping("/kakao")
    fun kakao(
        @AuthenticationPrincipal jwt: Jwt?,
        @Valid @RequestBody request: KakaoOAuthRequest,
    ): ApiResponse<GuestAuthData> {
        val subject = verifier.verify(request.accessToken)
        return ApiResponse(oauth.authenticate(AuthProvider.KAKAO, subject, request.deviceUuid, jwt?.subject?.toLongOrNull()))
    }
}
