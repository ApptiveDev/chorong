package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.auth.dto.UserBrief
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserPasswordRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.Duration
import java.time.OffsetDateTime

enum class PasswordLoginFailure { INVALID, LOCKED, WITHDRAWN }

data class PasswordLoginResult(
    val token: TokenResponse? = null,
    val user: UserBrief? = null,
    val failure: PasswordLoginFailure? = null,
    val retryAfter: Long? = null,
    val newlyLocked: Boolean = false,
)

@Service
class PasswordLoginService(
    private val auths: UserAuthRepository,
    private val users: UserRepository,
    private val passwords: UserPasswordRepository,
    private val emails: EmailIdentityCoordinator,
    private val verifier: AccountPasswordVerifier,
    private val tokens: TokenService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun login(
        email: String,
        password: String,
        deviceUuid: String?,
        requireMember: Boolean,
    ): PasswordLoginResult {
        val matches = auths.findAllByProviderAndProviderUidIgnoreCase(AuthProvider.PASSWORD, emails.normalize(email))
        val auth = matches.singleOrNull() ?: return PasswordLoginResult(failure = PasswordLoginFailure.INVALID)
        val user = users.findByIdForUpdate(auth.userId) ?: return PasswordLoginResult(failure = PasswordLoginFailure.INVALID)
        if (user.status == UserStatus.WITHDRAWN) {
            if (requireMember) return PasswordLoginResult(failure = PasswordLoginFailure.WITHDRAWN)
            val stored = passwords.findById(checkNotNull(auth.id)).orElse(null)
            val failure =
                if (stored != null && verifier.matches(password, stored.passwordHash)) {
                    PasswordLoginFailure.WITHDRAWN
                } else {
                    PasswordLoginFailure.INVALID
                }
            return PasswordLoginResult(failure = failure)
        }
        if (requireMember && user.status != UserStatus.ACTIVE) return PasswordLoginResult(failure = PasswordLoginFailure.INVALID)
        val credential =
            passwords.findById(checkNotNull(auth.id)).orElse(null)
                ?: return PasswordLoginResult(failure = PasswordLoginFailure.INVALID)
        val now = OffsetDateTime.now(clock)
        val lockedUntil = credential.lockedUntil
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            val remaining = Duration.between(now, lockedUntil)
            return PasswordLoginResult(
                failure = PasswordLoginFailure.LOCKED,
                retryAfter = remaining.seconds + if (remaining.nano > 0) 1 else 0,
            )
        }
        if (lockedUntil != null) {
            credential.lockedUntil = null
            credential.failedCount = 0
        }
        if (!verifier.matches(password, credential.passwordHash)) {
            credential.failedCount += 1
            if (credential.failedCount >= MAX_FAILED) {
                credential.failedCount = 0
                credential.lockedUntil = now.plusMinutes(LOCK_MINUTES)
                log.warn("auth.locked userId={}", auth.userId)
                return PasswordLoginResult(failure = PasswordLoginFailure.LOCKED, retryAfter = LOCK_MINUTES * 60, newlyLocked = true)
            }
            log.debug("auth.login_failed provider=PASSWORD")
            return PasswordLoginResult(failure = PasswordLoginFailure.INVALID)
        }
        credential.failedCount = 0
        credential.lockedUntil = null
        val token = tokens.issue(auth.userId, deviceUuid)
        return PasswordLoginResult(
            token = token,
            user = UserBrief(auth.userId, UserNicknamePolicy.displayName(user.nickname, user.status), user.status),
        )
    }

    companion object {
        const val MAX_FAILED = 5
        const val LOCK_MINUTES = 15L
    }
}
