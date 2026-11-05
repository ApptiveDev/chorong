package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

enum class RotationFailure { INVALID, EXPIRED, REUSED }

data class RotationResult(
    val token: TokenResponse? = null,
    val failure: RotationFailure? = null,
)

@Service
class TokenRotationService(
    private val refreshTokens: UserRefreshTokenRepository,
    private val users: UserRepository,
    private val tokens: TokenService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun rotate(
        raw: String,
        deviceUuid: String?,
    ): RotationResult {
        val hash = tokens.hash(raw)
        val userId = refreshTokens.findUserIdByTokenHash(hash) ?: return RotationResult(failure = RotationFailure.INVALID)
        val user = users.findByIdForUpdate(userId) ?: return RotationResult(failure = RotationFailure.INVALID)
        if (!user.status.available) return RotationResult(failure = RotationFailure.INVALID)
        val token = refreshTokens.findByTokenHash(hash) ?: return RotationResult(failure = RotationFailure.INVALID)
        if (deviceUuid != null && !deviceUuid.equals(token.deviceUuid, ignoreCase = true)) {
            return RotationResult(failure = RotationFailure.INVALID)
        }
        val now = OffsetDateTime.now(clock)
        if (token.revokedAt != null) {
            refreshTokens.revokeAllByUserId(userId, now)
            log.warn("auth.refresh_reused userId={}", userId)
            return RotationResult(failure = RotationFailure.REUSED)
        }
        if (!token.expiresAt.isAfter(now)) return RotationResult(failure = RotationFailure.EXPIRED)
        token.revokedAt = now
        return RotationResult(token = tokens.issue(userId, token.deviceUuid))
    }
}
