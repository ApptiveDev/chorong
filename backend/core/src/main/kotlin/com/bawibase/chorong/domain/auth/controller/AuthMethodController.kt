package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.service.AppleTokenVerifierFactory
import com.bawibase.chorong.domain.auth.service.AuthMethodResult
import com.bawibase.chorong.domain.auth.service.AuthMethodService
import com.bawibase.chorong.domain.auth.service.GoogleTokenVerifier
import com.bawibase.chorong.domain.auth.service.KakaoTokenVerifier
import com.bawibase.chorong.domain.user.AuthProvider
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class LinkAuthRequest(
    @field:Size(max = 16384) val idToken: String? = null,
    @field:Size(max = 8192) val accessToken: String? = null,
    @field:Size(max = 4096) val authorizationCode: String? = null,
    val verificationId: String? = null,
)

@RestController
@RequestMapping("/api/v1/auth/link")
class AuthMethodController(
    private val methods: AuthMethodService,
    private val google: GoogleTokenVerifier,
    private val kakao: KakaoTokenVerifier,
    private val apple: AppleTokenVerifierFactory,
) {
    @Operation(operationId = "API-108")
    @PostMapping("/{provider}")
    fun link(
        @CurrentUserId userId: Long,
        @PathVariable provider: String,
        @Valid @RequestBody request: LinkAuthRequest,
    ): ApiResponse<AuthMethodResult> {
        val result =
            when (provider.lowercase()) {
                "email" -> {
                    methods.confirmEmailLink(userId, parseVerificationId(request.verificationId))
                }

                "google" -> {
                    methods.linkSocial(userId, AuthProvider.GOOGLE, google.verify(request.idToken.required("idToken")))
                }

                "kakao" -> {
                    methods.linkSocial(userId, AuthProvider.KAKAO, kakao.verify(request.accessToken.required("accessToken")))
                }

                "apple" -> {
                    val subject =
                        apple.verifier.verify(
                            request.idToken.required("idToken"),
                            request.authorizationCode.required("authorizationCode"),
                        )
                    methods.linkSocial(userId, AuthProvider.APPLE, subject)
                }

                else -> {
                    throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
                }
            }
        return ApiResponse(result)
    }

    @Operation(operationId = "API-109")
    @DeleteMapping("/{provider}")
    fun unlink(
        @CurrentUserId userId: Long,
        @PathVariable provider: String,
    ): ApiResponse<AuthMethodResult> = ApiResponse(methods.unlink(userId, linkableProvider(provider)))

    private fun parseVerificationId(value: String?): UUID =
        try {
            UUID.fromString(value ?: throw IllegalArgumentException())
        } catch (_: IllegalArgumentException) {
            throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }

    private fun String?.required(field: String): String =
        this?.takeIf(String::isNotBlank) ?: throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)

    private fun linkableProvider(value: String): AuthProvider =
        when (value.lowercase()) {
            "email" -> AuthProvider.PASSWORD
            "google" -> AuthProvider.GOOGLE
            "kakao" -> AuthProvider.KAKAO
            "apple" -> AuthProvider.APPLE
            else -> throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }
}
