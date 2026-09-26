package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserOauthEntity
import org.springframework.data.jpa.repository.JpaRepository

interface UserOauthRepository : JpaRepository<UserOauthEntity, Long>
