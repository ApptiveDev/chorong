package com.bawibase.chorong.domain.auth.dto

import com.bawibase.chorong.domain.user.AuthProvider
import io.swagger.v3.oas.annotations.media.Schema
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size

@Schema(description = "비회원 가입·로그인 요청")
data class GuestRequest(
    @field:NotBlank
    @field:Size(max = 36)
    @param:Schema(description = "기기별 UUID (36자 이하)")
    val deviceUuid: String,
)

@Schema(description = "이메일·비밀번호 가입 요청")
data class PasswordSignUpRequest(
    @field:NotBlank
    @field:Email
    @field:Size(max = 255)
    val email: String,
    @field:NotBlank
    @field:Size(min = 8, max = 72)
    val password: String,
    @field:Size(max = 36)
    val deviceUuid: String? = null,
)

@Schema(description = "이메일·비밀번호 로그인 요청")
data class PasswordLoginRequest(
    @field:NotBlank
    @field:Email
    @field:Size(max = 255)
    val email: String,
    @field:NotBlank
    @field:Size(max = 72)
    val password: String,
    @field:Size(max = 36)
    val deviceUuid: String? = null,
)

@Schema(description = "리프레시 토큰 요청")
data class RefreshRequest(
    @field:NotBlank
    val refreshToken: String,
)

@Schema(description = "로그아웃 요청. refreshToken 을 주면 그 토큰만, 없으면 유저의 모든 리프레시 토큰을 폐기한다.")
data class LogoutRequest(
    val refreshToken: String? = null,
)

data class TokenResponse(
    val accessToken: String,
    val refreshToken: String,
    @param:Schema(description = "액세스 토큰 만료까지 남은 초")
    val expiresIn: Long,
    @param:Schema(description = "이 요청으로 유저가 새로 만들어졌는지")
    val created: Boolean,
)

data class MeResponse(
    val userId: Long,
    val nickname: String?,
    val email: String?,
    val providers: List<AuthProvider>,
)
