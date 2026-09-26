package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserRepository : JpaRepository<UserEntity, Long> {
    fun findByDeviceUuid(deviceUuid: String): UserEntity?
}
