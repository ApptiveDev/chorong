package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.push.service.PushDeviceService
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

@Service
class TokenLogoutService(
    private val refreshTokens: UserRefreshTokenRepository,
    private val users: UserRepository,
    private val pushDevices: PushDeviceService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun logout(
        userId: Long,
        sessionId: Long?,
        all: Boolean,
    ) {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        val now = OffsetDateTime.now(clock)
        if (all) {
            val count = refreshTokens.revokeAllByUserId(userId, now)
            pushDevices.deleteAll(userId)
            log.info("auth.logout_all userId={} count={}", userId, count)
            return
        }
        val session = sessionId?.let { refreshTokens.findById(it).orElse(null) }
        val device =
            session?.takeIf { it.userId == userId }?.deviceUuid
                ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        refreshTokens.revokeByUserIdAndDeviceUuid(userId, device, now)
        pushDevices.deleteForDevice(userId, device)
    }
}
