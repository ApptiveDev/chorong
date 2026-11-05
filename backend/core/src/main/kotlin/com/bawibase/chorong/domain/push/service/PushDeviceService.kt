package com.bawibase.chorong.domain.push.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.dto.DevicePlatform
import com.bawibase.chorong.domain.push.repository.PushDeviceRepository
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

@Service
class PushDeviceService(
    private val devices: PushDeviceRepository,
    private val refreshTokens: UserRefreshTokenRepository,
    private val users: UserRepository,
    private val clock: Clock,
) {
    @Transactional
    fun register(
        userId: Long,
        sessionId: Long?,
        deviceUuid: String,
        platform: DevicePlatform,
        pushToken: String,
    ) {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        val session = sessionId?.let { refreshTokens.findById(it).orElse(null) }
        val normalizedUuid = deviceUuid.lowercase()
        if (session == null || session.userId != userId || !session.isUsable(OffsetDateTime.now(clock)) ||
            session.deviceUuid?.equals(normalizedUuid, ignoreCase = true) != true
        ) {
            throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        }
        devices.upsert(normalizedUuid, userId, platform.name, pushToken)
    }

    @Transactional
    fun delete(
        userId: Long,
        deviceUuid: String,
    ) {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        devices.delete(userId, deviceUuid.lowercase())
    }

    fun deleteAll(userId: Long): Int = devices.deleteAll(userId)

    fun deleteForDevice(
        userId: Long,
        deviceUuid: String,
    ): Int = devices.delete(userId, deviceUuid.lowercase())
}
