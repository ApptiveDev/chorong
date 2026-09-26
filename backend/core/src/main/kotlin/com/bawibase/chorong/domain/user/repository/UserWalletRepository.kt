package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserWalletEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserWalletRepository : JpaRepository<UserWalletEntity, Long>
