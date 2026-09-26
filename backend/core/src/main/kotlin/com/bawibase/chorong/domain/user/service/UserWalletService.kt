package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class UserWalletService(
    private val wallets: UserWalletRepository,
) {
    fun ensureWallet(userId: Long): UserWalletEntity =
        wallets.findById(userId).orElseGet { wallets.save(UserWalletEntity(userId = userId)) }

    fun deduct(
        userId: Long,
        amount: Long,
    ): UserWalletEntity {
        val wallet = ensureWallet(userId)
        if (wallet.coin < amount) {
            throw ApiException(ErrorCode.INSUFFICIENT_COIN, mapOf("required" to amount, "coin" to wallet.coin))
        }
        wallet.coin -= amount
        return wallet
    }
}
