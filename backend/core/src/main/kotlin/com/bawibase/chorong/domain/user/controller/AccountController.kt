package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.service.AccountWithdrawalService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
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
) {
    @Operation(operationId = "API-110")
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun withdraw(
        @CurrentUserId userId: Long,
        @Valid @RequestBody(required = false) request: AccountWithdrawalRequest?,
    ) = withdrawal.withdraw(userId, request?.reason)
}
