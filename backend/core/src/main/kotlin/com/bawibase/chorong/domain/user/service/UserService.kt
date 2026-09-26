package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class UserService(
    private val users: UserRepository,
) {
    fun resolveByDevice(deviceUuid: String): UserEntity {
        val uuid = deviceUuid.trim()
        if (uuid.isEmpty()) throw ApiException(ErrorCode.DEVICE_ID_REQUIRED)
        if (uuid.length > 36) throw ApiException(ErrorCode.DEVICE_ID_INVALID)
        users.findByDeviceUuid(uuid)?.let { return it }
        return try {
            users.save(UserEntity(deviceUuid = uuid))
        } catch (e: DataIntegrityViolationException) {
            users.findByDeviceUuid(uuid) ?: throw e
        }
    }
}
