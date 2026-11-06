package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

enum class WalletCurrency { STARDUST }

@Service
@Transactional
class UserWalletService(
    private val wallets: UserWalletRepository,
) {
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
