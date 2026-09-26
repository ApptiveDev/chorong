package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.dto.GuestRequest
import com.bawibase.chorong.domain.auth.dto.LogoutRequest
import com.bawibase.chorong.domain.auth.dto.MeResponse
import com.bawibase.chorong.domain.auth.dto.PasswordLoginRequest
import com.bawibase.chorong.domain.auth.dto.PasswordSignUpRequest
import com.bawibase.chorong.domain.auth.dto.RefreshRequest
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.auth.service.AuthService
import com.bawibase.chorong.domain.auth.service.TokenService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "인증")
@RequestMapping("/api/auth")
class AuthController(
    private val authService: AuthService,
    private val tokenService: TokenService,
) {
    // TODO(auth): POST /social/{provider} (AuthService.socialLogin) 개방. 개방 시 SecurityConfig 의 permitAll 경로에도 추가한다.
    // TODO(auth): 인증 수단 연동. Bearer 로 로그인한 유저(a 수단)에 다른 수단(b)을 붙인다.
    //  - POST /link/password {email, password}: PASSWORD 행 + user_password 추가. 비회원 → 이메일 회원 전환 경로.
    //  - POST /link/social/{provider}: 검증기로 SocialIdentity 를 만들고 AuthService.socialLogin(identity, currentUserId = 유저) 호출.
    //  - DELETE /link/{provider}: 수단 해제. 마지막 수단은 해제 불가.
    //  같은 user_id 를 유지하므로 하우징 자산은 그대로 이어진다.

    @Operation(description = "기기 UUID 로 비회원 가입 후 바로 로그인한다. 이미 등록된 UUID 면 409.")
    @PostMapping("/guest/signup")
    @ResponseStatus(HttpStatus.CREATED)
    fun guestSignUp(
        @Valid @RequestBody request: GuestRequest,
    ): TokenResponse = authService.guestSignUp(request.deviceUuid)

    @Operation(description = "기기 UUID 로 비회원 로그인. 등록되지 않은 UUID 면 401.")
    @PostMapping("/guest/login")
    fun guestLogin(
        @Valid @RequestBody request: GuestRequest,
    ): TokenResponse = authService.guestLogin(request.deviceUuid)

    @Operation(description = "이메일·비밀번호로 가입하고 바로 로그인한다.")
    @PostMapping("/password/signup")
    @ResponseStatus(HttpStatus.CREATED)
    fun passwordSignUp(
        @Valid @RequestBody request: PasswordSignUpRequest,
    ): TokenResponse = authService.passwordSignUp(request.email, request.password, request.deviceUuid)

    @Operation(description = "이메일·비밀번호 로그인. 5회 실패하면 10분 잠긴다.")
    @PostMapping("/password/login")
    fun passwordLogin(
        @Valid @RequestBody request: PasswordLoginRequest,
    ): TokenResponse = authService.passwordLogin(request.email, request.password, request.deviceUuid)

    @Operation(description = "리프레시 토큰으로 새 토큰 쌍을 받는다. 쓴 리프레시 토큰은 폐기된다.")
    @PostMapping("/refresh")
    fun refresh(
        @Valid @RequestBody request: RefreshRequest,
    ): TokenResponse = tokenService.rotate(request.refreshToken)

    @Operation(description = "리프레시 토큰을 폐기한다.")
    @SecurityRequirement(name = "bearer")
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(
        @Parameter(hidden = true) @CurrentUserId userId: Long,
        @RequestBody(required = false) request: LogoutRequest?,
    ) = authService.logout(userId, request?.refreshToken)

    @Operation(description = "내 계정과 연결된 인증 수단을 조회한다.")
    @SecurityRequirement(name = "bearer")
    @GetMapping("/me")
    fun me(
        @Parameter(hidden = true) @CurrentUserId userId: Long,
    ): MeResponse = authService.me(userId)
}
