package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.auth.config.JwtProperties
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.user.entity.UserRefreshTokenEntity
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.service.UserAccessService
import org.slf4j.LoggerFactory
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
    private val access: UserAccessService,
    private val users: UserRepository,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val random = SecureRandom()

    fun issue(
        userId: Long,
        deviceUuid: String?,
        created: Boolean = false,
    ): TokenResponse {
        users.findByIdForUpdate(userId) ?: throw ApiException(ErrorCode.UNAUTHORIZED)
        val role = access.role(userId)
        val now = clock.instant()
        val raw = ByteArray(32).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        val refresh =
            refreshTokens.saveAndFlush(
                UserRefreshTokenEntity(
                    userId = userId,
                    tokenHash = hash(raw),
                    deviceUuid = deviceUuid,
                    expiresAt = OffsetDateTime.now(clock).plus(props.refreshTtl),
                ),
            )
        val claims =
            JwtClaimsSet
                .builder()
                .issuer(ISSUER)
                .subject(userId.toString())
                .claim("role", role.name)
                .claim("sid", checkNotNull(refresh.id).toString())
                .issuedAt(now)
                .expiresAt(now.plus(props.accessTtl))
                .build()
        val access = encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).tokenValue

        return TokenResponse(access, raw, props.accessTtl.seconds, created)
    }

    fun revoke(
        userId: Long,
        rawRefreshToken: String?,
    ) {
        users.findByIdForUpdate(userId) ?: return
        val now = OffsetDateTime.now(clock)
        if (rawRefreshToken == null) {
            val count = refreshTokens.revokeAllByUserId(userId, now)
            log.info("auth.logout_all userId={} count={}", userId, count)
            return
        }
        val token = refreshTokens.findByTokenHash(hash(rawRefreshToken)) ?: return
        if (token.userId == userId && token.revokedAt == null) token.revokedAt = now
    }

    fun hash(raw: String): String = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray()).joinToString("") { "%02x".format(it) }

    companion object {
        const val ISSUER = "chorong"
    }
}
