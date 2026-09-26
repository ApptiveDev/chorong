package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserAuthRepository : JpaRepository<UserAuthEntity, Long> {
    fun findByProviderAndProviderUid(
        provider: AuthProvider,
        providerUid: String,
    ): UserAuthEntity?

    fun findAllByUserId(userId: Long): List<UserAuthEntity>
}
