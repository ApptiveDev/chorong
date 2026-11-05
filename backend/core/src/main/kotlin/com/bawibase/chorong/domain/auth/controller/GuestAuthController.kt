package com.bawibase.chorong.domain.auth.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.auth.service.GuestAuthService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "auth")
@RequestMapping("/api/v1/auth")
class GuestAuthController(
    private val guests: GuestAuthService,
) {
    @Operation(operationId = "API-101", summary = "게스트 계정 생성 또는 디바이스 자동 로그인")
    @PostMapping("/guest")
    fun guest(
        @Valid @RequestBody request: GuestAuthRequest,
    ): ApiResponse<GuestAuthData> = ApiResponse(guests.authenticate(request.deviceUuid, request.platform))
}
