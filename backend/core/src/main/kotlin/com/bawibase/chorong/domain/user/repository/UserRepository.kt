package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserEntity
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query

interface UserRepository : JpaRepository<UserEntity, Long> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserEntity u where u.id = :userId")
    fun findByIdForUpdate(userId: Long): UserEntity?
}
