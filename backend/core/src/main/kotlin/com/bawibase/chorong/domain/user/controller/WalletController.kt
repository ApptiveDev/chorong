package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.user.service.UserWalletService
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class WalletBalancesResponse(
    val star: Long,
    val stardust: Long,
)

@RestController
@RequestMapping("/api/v1/users/me/wallet")
class WalletController(
    private val wallets: UserWalletService,
) {
    @Operation(operationId = "API-904", summary = "STAR·STARDUST 잔액 조회")
    @GetMapping
    fun get(
        @CurrentUserId userId: Long,
    ): ApiResponse<WalletBalancesResponse> {
        val wallet = wallets.ensureWallet(userId)
        return ApiResponse(WalletBalancesResponse(wallet.star, wallet.stardust))
    }
}
