package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

enum class WalletCurrency { STARDUST }

@Service
@Transactional
class UserWalletService(
    private val wallets: UserWalletRepository,
    private val clock: Clock,
) {
    private val kst = ZoneId.of("Asia/Seoul")

    /** 오늘(KST) 에너지를 쓴 적이 없으면 최대치로 채워진 것으로 본다. */
    fun energy(wallet: UserWalletEntity): Int = if (wallet.energyDate == today()) wallet.energy else UserWalletEntity.MAX_ENERGY

    /** 다음 00시(KST). 에너지가 최대치로 채워지는 시각이다. */
    fun energyResetsAt(): Instant = today().plusDays(1).atStartOfDay(kst).toInstant()

    /** 에너지 1개를 쓴다. 남은 에너지가 없으면 false. */
    fun spendEnergy(userId: Long): Boolean {
        val wallet = ensureWallet(userId)
        val energy = energy(wallet)
        if (energy <= 0) return false
        wallet.energy = energy - 1
        wallet.energyDate = today()
        return true
    }

    fun balances(wallet: UserWalletEntity) = WalletBalancesResponse(wallet.stardust, energy(wallet), energyResetsAt())

    private fun today(): LocalDate = LocalDate.ofInstant(clock.instant(), kst)

    fun ensureWallet(userId: Long): UserWalletEntity {
        wallets.insertIfAbsent(userId)
        return wallets.findByIdForUpdate(userId) ?: throw ApiException(ErrorCode.UNAUTHORIZED)
    }

    fun deduct(
        userId: Long,
        amount: Long,
    ): UserWalletEntity {
        val wallet = ensureWallet(userId)
        if (amount <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        if (wallet.coin < amount) {
            throw ApiException(ErrorCode.INSUFFICIENT_COIN, mapOf("required" to amount, "coin" to wallet.coin))
        }
        wallet.coin -= amount
        return wallet
    }

    fun credit(
        userId: Long,
        currency: WalletCurrency,
        amount: Long,
    ): UserWalletEntity {
        if (amount <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val wallet = ensureWallet(userId)
        val balance = wallet.stardust
        if (balance > Long.MAX_VALUE - amount) throw ApiV1Exception(ApiErrorCode.CONFLICT)
        when (currency) {
            WalletCurrency.STARDUST -> wallet.stardust = balance + amount
        }
        return wallet
    }

    fun debit(
        userId: Long,
        currency: WalletCurrency,
        amount: Long,
    ): UserWalletEntity {
        if (amount <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val wallet = ensureWallet(userId)
        val balance = wallet.stardust
        if (balance < amount) throw ApiV1Exception(ApiErrorCode.INSUFFICIENT_BALANCE)
        when (currency) {
            WalletCurrency.STARDUST -> wallet.stardust = balance - amount
        }
        return wallet
    }
}
