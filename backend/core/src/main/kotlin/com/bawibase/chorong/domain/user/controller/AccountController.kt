package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.service.AccountWithdrawalService
import com.bawibase.chorong.domain.user.service.UserMeResponse
import com.bawibase.chorong.domain.user.service.UserMeService
import com.fasterxml.jackson.databind.JsonNode
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

data class AccountWithdrawalRequest(
    @field:Size(max = 255) val reason: String? = null,
)

@RestController
@RequestMapping("/api/v1/users/me")
class AccountController(
    private val withdrawal: AccountWithdrawalService,
    private val me: UserMeService,
) {
    @Operation(operationId = "API-201", summary = "내 정보 조회")
    @GetMapping
    fun getMe(
        @CurrentUserId userId: Long,
    ): ApiResponse<UserMeResponse> = ApiResponse(me.get(userId))

    @Operation(operationId = "API-202", summary = "내 정보 수정")
    @PatchMapping
    fun updateMe(
        @CurrentUserId userId: Long,
        @RequestBody patch: JsonNode,
    ): ApiResponse<UserMeResponse> = ApiResponse(me.update(userId, patch))

    @Operation(operationId = "API-110")
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun withdraw(
        @CurrentUserId userId: Long,
        @Valid @RequestBody(required = false) request: AccountWithdrawalRequest?,
    ) = withdrawal.withdraw(userId, request?.reason)
}
