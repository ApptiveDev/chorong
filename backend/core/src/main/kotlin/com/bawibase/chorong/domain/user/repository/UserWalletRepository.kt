package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface UserWalletRepository : JpaRepository<UserWalletEntity, Long> {
    @Modifying
    @Query(value = "INSERT INTO user_wallet (user_id) VALUES (:userId) ON CONFLICT (user_id) DO NOTHING", nativeQuery = true)
    fun insertIfAbsent(
        @Param("userId") userId: Long,
    ): Int

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from UserWalletEntity w where w.userId = :userId")
    fun findByIdForUpdate(
        @Param("userId") userId: Long,
    ): UserWalletEntity?
}
