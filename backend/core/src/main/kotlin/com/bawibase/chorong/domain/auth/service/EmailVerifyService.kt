package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.UserBrief
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserPasswordEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserPasswordRepository
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

data class EmailVerifyResult(
    val data: GuestAuthData? = null,
    val error: ApiErrorCode? = null,
)

private data class VerificationSession(
    val email: String,
    val passwordHash: String,
    val codeHash: String,
    val expiresAt: OffsetDateTime,
    val invalidatedAt: OffsetDateTime?,
    val consumedAt: OffsetDateTime?,
    val failedAttempts: Int,
)

@Service
class EmailVerifyService(
    private val jdbc: JdbcTemplate,
    private val emails: EmailIdentityCoordinator,
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val passwords: UserPasswordRepository,
    private val refreshTokens: UserRefreshTokenRepository,
    private val codeEncoder: PasswordEncoder,
    private val tokens: TokenService,
    private val clock: Clock,
    @Value("\${spring.flyway.default-schema}") schema: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val table = schema.also { require(it.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) } + ".email_signup_verification"

    @Transactional
    fun verify(
        userId: Long,
        jwtSessionId: Long?,
        verificationId: UUID,
        code: String,
    ): EmailVerifyResult {
        val email =
            jdbc
                .query(
                    "SELECT email FROM $table WHERE verification_id = ? AND user_id = ?",
                    { rs, _ -> rs.getString("email") },
                    verificationId,
                    userId,
                ).singleOrNull() ?: return EmailVerifyResult(error = ApiErrorCode.VERIFICATION_INVALID)
        emails.lock(email)
        val user = users.findByIdForUpdate(userId) ?: return EmailVerifyResult(error = ApiErrorCode.UNAUTHORIZED)
        val session =
            jdbc
                .query(
                    """SELECT email,password_hash,code_hash,expires_at,invalidated_at,consumed_at,failed_attempts
               FROM $table WHERE verification_id = ? AND user_id = ? FOR UPDATE""",
                    { rs, _ ->
                        VerificationSession(
                            rs.getString("email"),
                            rs.getString("password_hash"),
                            rs.getString("code_hash"),
                            rs.getObject("expires_at", OffsetDateTime::class.java),
                            rs.getObject("invalidated_at", OffsetDateTime::class.java),
                            rs.getObject("consumed_at", OffsetDateTime::class.java),
                            rs.getInt("failed_attempts"),
                        )
                    },
                    verificationId,
                    userId,
                ).singleOrNull() ?: return EmailVerifyResult(error = ApiErrorCode.VERIFICATION_INVALID)
        val now = OffsetDateTime.now(clock)
        if (session.consumedAt != null || session.invalidatedAt != null || !session.expiresAt.isAfter(now) ||
            user.status !in setOf(UserStatus.GUEST, UserStatus.ACTIVE) || session.failedAttempts >= MAX_ATTEMPTS
        ) {
            return EmailVerifyResult(error = ApiErrorCode.VERIFICATION_INVALID)
        }
        val device =
            jwtSessionId
                ?.let { refreshTokens.findById(it).orElse(null) }
                ?.takeIf { it.userId == userId }
                ?.deviceUuid
                ?: return EmailVerifyResult(error = ApiErrorCode.UNAUTHORIZED)
        if (!codeEncoder.matches(code, session.codeHash)) {
            val failures = session.failedAttempts + 1
            jdbc.update(
                "UPDATE $table SET failed_attempts = ?, invalidated_at = ? WHERE verification_id = ?",
                failures,
                if (failures >= MAX_ATTEMPTS) now else null,
                verificationId,
            )
            return EmailVerifyResult(error = ApiErrorCode.VERIFICATION_INVALID)
        }
        if (auths.findAllByProviderAndProviderUidIgnoreCase(AuthProvider.PASSWORD, session.email).isNotEmpty()) {
            return EmailVerifyResult(error = ApiErrorCode.ACCOUNT_EXISTS_FOR_PROVIDER)
        }
        check(session.passwordHash.startsWith(AccountPasswordVerifier.PREFIX) && session.passwordHash.length <= 100)
        val auth = auths.saveAndFlush(UserAuthEntity(userId, AuthProvider.PASSWORD, session.email))
        passwords.saveAndFlush(UserPasswordEntity(checkNotNull(auth.id), session.passwordHash, now))
        user.email = session.email
        user.status = UserStatus.ACTIVE
        jdbc.update("UPDATE $table SET consumed_at = ? WHERE verification_id = ?", now, verificationId)
        val token = tokens.issue(userId, device)
        log.info("auth.linked userId={} provider=PASSWORD", userId)
        return EmailVerifyResult(
            data =
                GuestAuthData(
                    token.accessToken,
                    token.refreshToken,
                    token.expiresIn,
                    UserBrief(userId, UserNicknamePolicy.displayName(user.nickname, user.status), user.status),
                    isNew = false,
                ),
        )
    }

    companion object {
        const val MAX_ATTEMPTS = 5
    }
}
