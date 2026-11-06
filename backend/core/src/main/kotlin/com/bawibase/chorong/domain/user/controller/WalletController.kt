package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@JsonIgnoreProperties(ignoreUnknown = true)
data class WalletBalancesResponse(
    val stardust: Long,
)

@RestController
@RequestMapping("/api/v1/users/me/wallet")
class WalletController(
    private val wallets: UserWalletService,
) {
    @Operation(operationId = "API-904", summary = "별가루 잔액 조회")
    @GetMapping
    fun get(
        @CurrentUserId userId: Long,
    ): ApiResponse<WalletBalancesResponse> {
        val wallet = wallets.ensureWallet(userId)
        return ApiResponse(WalletBalancesResponse(wallet.stardust))
    }
}
