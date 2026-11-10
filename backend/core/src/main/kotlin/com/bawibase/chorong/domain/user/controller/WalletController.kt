package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@JsonIgnoreProperties(ignoreUnknown = true)
data class WalletBalancesResponse(
    val stardust: Long,
    // 남은 에너지(0~5). 매일 00시(KST)에 5개로 채운다.
    // 기본값 null 은 에너지 도입 전에 저장한 멱등 응답을 다시 읽을 때만 쓰인다.
    val energy: Int? = null,
    val energyResetsAt: Instant? = null,
)

@RestController
@RequestMapping("/api/v1/users/me/wallet")
class WalletController(
    private val wallets: UserWalletService,
) {
    @Operation(operationId = "API-904", summary = "별가루·에너지 잔액 조회")
    @GetMapping
    fun get(
        @CurrentUserId userId: Long,
    ): ApiResponse<WalletBalancesResponse> {
        val wallet = wallets.ensureWallet(userId)
        return ApiResponse(wallets.balances(wallet))
    }
}
