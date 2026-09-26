package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.auth.config.JwtProperties
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.user.entity.UserRefreshTokenEntity
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import org.springframework.security.oauth2.jose.jws.MacAlgorithm
import org.springframework.security.oauth2.jwt.JwsHeader
import org.springframework.security.oauth2.jwt.JwtClaimsSet
import org.springframework.security.oauth2.jwt.JwtEncoder
import org.springframework.security.oauth2.jwt.JwtEncoderParameters
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Clock
import java.time.OffsetDateTime
import java.util.Base64

@Service
@Transactional
class TokenService(
    private val props: JwtProperties,
    private val encoder: JwtEncoder,
    private val refreshTokens: UserRefreshTokenRepository,
    private val clock: Clock,
) {
    private val random = SecureRandom()

    fun issue(
        userId: Long,
        deviceUuid: String?,
        created: Boolean = false,
    ): TokenResponse {
        val now = clock.instant()
        val claims =
            JwtClaimsSet
                .builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(props.accessTtl))
                .build()
        val access = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).tokenValue

        val raw = ByteArray(32).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        refreshTokens.save(
            UserRefreshTokenEntity(
                userId = userId,
                tokenHash = hash(raw),
                deviceUuid = deviceUuid,
                expiresAt = OffsetDateTime.now(clock).plus(props.refreshTtl),
            ),
        )
        return TokenResponse(access, raw, props.accessTtl.seconds, created)
    }

    /** 리프레시 토큰을 한 번 쓰고 폐기한 뒤 새 쌍을 발급한다. */
    fun rotate(rawRefreshToken: String): TokenResponse {
        val now = OffsetDateTime.now(clock)
        val token = refreshTokens.findByTokenHash(hash(rawRefreshToken)) ?: throw ApiException(ErrorCode.REFRESH_TOKEN_INVALID)
        if (!token.isUsable(now)) throw ApiException(ErrorCode.REFRESH_TOKEN_INVALID)
        token.revokedAt = now
        return issue(token.userId, token.deviceUuid)
    }

    fun revoke(
        userId: Long,
        rawRefreshToken: String?,
    ) {
        val now = OffsetDateTime.now(clock)
        if (rawRefreshToken == null) {
            refreshTokens.revokeAllByUserId(userId, now)
            return
        }
        val token = refreshTokens.findByTokenHash(hash(rawRefreshToken)) ?: return
        if (token.userId == userId && token.revokedAt == null) token.revokedAt = now
    }

    private fun hash(raw: String): String =
        MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }

    companion object {
        const val ISSUER = "chorong"
    }
}
