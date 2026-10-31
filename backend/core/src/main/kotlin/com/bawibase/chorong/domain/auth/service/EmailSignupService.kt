package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.SecureRandom
import java.time.Clock
import java.time.Duration
import java.time.OffsetDateTime
import java.util.UUID

data class EmailSignupResult(
    val verificationId: UUID,
    val expiresAt: OffsetDateTime,
)

@Service
class EmailSignupService(
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val jdbc: JdbcTemplate,
    private val codeEncoder: PasswordEncoder,
    private val sender: EmailVerificationSender,
    private val clock: Clock,
    private val emails: EmailIdentityCoordinator,
    @Value("\${spring.flyway.default-schema}") schema: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val random = SecureRandom()
    private val table = schema.also { require(it.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) } + ".email_signup_verification"
    private val passwordEncoder =
        Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8().apply {
            setEncodeHashAsBase64(true)
        }

    @Transactional
    fun start(
        userId: Long,
        email: String,
        password: String,
    ): EmailSignupResult {
        val normalizedEmail = emails.normalize(email)
        emails.lock(normalizedEmail)
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (user.status != UserStatus.GUEST && user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)
        if (auths.findAllByProviderAndProviderUidIgnoreCase(AuthProvider.PASSWORD, normalizedEmail).isNotEmpty()) {
            throw ApiV1Exception(ApiErrorCode.EMAIL_ALREADY_REGISTERED)
        }
        val now = OffsetDateTime.now(clock)
        val latest =
            jdbc.queryForObject(
                "SELECT max(created_at) FROM $table WHERE email = ?",
                OffsetDateTime::class.java,
                normalizedEmail,
            )
        val next = latest?.plusSeconds(60)
        if (next != null && now.isBefore(next)) {
            val remaining = Duration.between(now, next)
            throw ApiV1Exception(ApiErrorCode.RATE_LIMITED, retryAfter = remaining.seconds + if (remaining.nano > 0) 1 else 0)
        }
        val verificationId = UUID.randomUUID()
        val expiresAt = now.plusMinutes(10)
        val code = random.nextInt(1_000_000).toString().padStart(6, '0')
        val passwordHash = AccountPasswordVerifier.PREFIX + passwordEncoder.encode(password)
        val codeHash = codeEncoder.encode(code)
        jdbc.update(
            "UPDATE $table SET invalidated_at = ? WHERE email = ? AND invalidated_at IS NULL AND consumed_at IS NULL",
            now,
            normalizedEmail,
        )
        jdbc.update(
            """INSERT INTO $table
                (verification_id,user_id,email,password_hash,code_hash,created_at,expires_at)
                VALUES (?,?,?,?,?,?,?)""",
            verificationId,
            userId,
            normalizedEmail,
            passwordHash,
            codeHash,
            now,
            expiresAt,
        )
        try {
            sender.send(normalizedEmail, code)
        } catch (e: Exception) {
            log.warn("auth.email_delivery_failed userId={}", userId)
            throw IllegalStateException("Email verification delivery failed")
        }
        return EmailSignupResult(verificationId, expiresAt)
    }
}
