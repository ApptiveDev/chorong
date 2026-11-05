package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.user.UserRole
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional(readOnly = true)
class UserAccessService(
    private val users: UserRepository,
) {
    fun role(userId: Long): UserRole {
        if (userId <= 0) throw ApiException(ErrorCode.UNAUTHORIZED)
        val user = users.findById(userId).orElseThrow { ApiException(ErrorCode.UNAUTHORIZED) }
        return user.status.role ?: throw ApiException(ErrorCode.USER_WITHDRAWN)
    }
}
