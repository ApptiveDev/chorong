package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserPasswordEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserPasswordRepository : JpaRepository<UserPasswordEntity, Long>
