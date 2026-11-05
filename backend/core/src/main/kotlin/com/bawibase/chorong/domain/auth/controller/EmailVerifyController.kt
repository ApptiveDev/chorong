package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.service.EmailVerifyService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.Pattern
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class EmailVerifyRequest(
    @field:Pattern(regexp = GuestAuthRequest.UUID_PATTERN) val verificationId: String,
    @field:Pattern(regexp = "[0-9]{6}") val code: String,
)

@RestController
@RequestMapping("/api/v1/auth/email")
class EmailVerifyController(
    private val verification: EmailVerifyService,
) {
    @Operation(operationId = "API-103")
    @PostMapping("/verify")
    fun verify(
        @CurrentUserId userId: Long,
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: EmailVerifyRequest,
    ): ApiResponse<GuestAuthData> {
        val result =
            verification.verify(
                userId,
                jwt.getClaimAsString("sid")?.toLongOrNull(),
                UUID.fromString(request.verificationId),
                request.code,
            )
        return ApiResponse(result.data ?: throw ApiV1Exception(result.error ?: ApiErrorCode.INTERNAL))
    }
}
