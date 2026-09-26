package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.auth.dto.MeResponse
import com.bawibase.chorong.domain.auth.dto.TokenResponse
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.entity.UserOauthEntity
import com.bawibase.chorong.domain.user.entity.UserPasswordEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserOauthRepository
import com.bawibase.chorong.domain.user.repository.UserPasswordRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

/**
 * 소셜 provider 가 검증해 준 신원. provider 별 검증기가 만들어 넘긴다.
 * TODO(auth): provider 별 검증기 구현. Apple·Google 은 id_token JWKS 검증, Kakao·Naver 는 access_token 으로 userinfo 조회.
 */
data class SocialIdentity(
    val provider: AuthProvider,
    val providerUid: String,
    val email: String? = null,
    val emailVerified: Boolean = false,
    val displayName: String? = null,
    val profile: Map<String, Any?>? = null,
) {
    init {
        require(provider.social) { "$provider 는 소셜 provider 가 아닙니다." }
    }
}

@Service
@Transactional
class AuthService(
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val passwords: UserPasswordRepository,
    private val oauths: UserOauthRepository,
    private val passwordEncoder: PasswordEncoder,
    private val tokenService: TokenService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** 비회원 가입. 기기 UUID 를 GUEST 인증 수단으로 등록한다. 이미 등록된 UUID 면 409. */
    fun guestSignUp(deviceUuid: String): TokenResponse {
        val uuid = deviceUuid.trim()
        if (auths.findByProviderAndProviderUid(AuthProvider.GUEST, uuid) != null) {
            throw ApiException(ErrorCode.DEVICE_ALREADY_REGISTERED)
        }
        val auth =
            try {
                createUserWithAuth(AuthProvider.GUEST, uuid)
            } catch (e: DataIntegrityViolationException) {
                throw ApiException(ErrorCode.DEVICE_ALREADY_REGISTERED)
            }
        log.info("user.created userId={} provider={}", auth.userId, AuthProvider.GUEST)
        return tokenService.issue(auth.userId, uuid, created = true)
    }

    /** 비회원 로그인. 등록되지 않은 기기 UUID 면 401. */
    fun guestLogin(deviceUuid: String): TokenResponse {
        val uuid = deviceUuid.trim()
        val auth =
            auths.findByProviderAndProviderUid(AuthProvider.GUEST, uuid)
                ?: throw ApiException(ErrorCode.GUEST_NOT_FOUND)
        return tokenService.issue(activeUserId(auth.userId), uuid)
    }

    fun passwordSignUp(
        email: String,
        rawPassword: String,
        deviceUuid: String?,
    ): TokenResponse {
        val loginId = normalizeEmail(email)
        if (auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, loginId) != null) {
            throw ApiException(ErrorCode.EMAIL_ALREADY_USED)
        }
        val auth =
            try {
                createUserWithAuth(AuthProvider.PASSWORD, loginId, email = loginId)
            } catch (e: DataIntegrityViolationException) {
                throw ApiException(ErrorCode.EMAIL_ALREADY_USED)
            }
        passwords.save(
            UserPasswordEntity(
                authId = checkNotNull(auth.id),
                passwordHash = passwordEncoder.encode(rawPassword),
                passwordChangedAt = OffsetDateTime.now(clock),
            ),
        )
        log.info("user.created userId={} provider={}", auth.userId, AuthProvider.PASSWORD)
        return tokenService.issue(auth.userId, deviceUuid, created = true)
    }

    fun passwordLogin(
        email: String,
        rawPassword: String,
        deviceUuid: String?,
    ): TokenResponse {
        val auth =
            auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, normalizeEmail(email))
                ?: throw ApiException(ErrorCode.LOGIN_FAILED)
        val credential = passwords.findById(checkNotNull(auth.id)).orElseThrow { ApiException(ErrorCode.LOGIN_FAILED) }
        val now = OffsetDateTime.now(clock)
        credential.lockedUntil?.let { if (it.isAfter(now)) throw ApiException(ErrorCode.ACCOUNT_LOCKED) }

        if (!passwordEncoder.matches(rawPassword, credential.passwordHash)) {
            credential.failedCount += 1
            if (credential.failedCount >= MAX_FAILED) {
                credential.lockedUntil = now.plusMinutes(LOCK_MINUTES)
                credential.failedCount = 0
                log.warn("auth.locked userId={} until={}", auth.userId, credential.lockedUntil)
            }
            log.debug("auth.login_failed provider={}", AuthProvider.PASSWORD)
            throw ApiException(ErrorCode.LOGIN_FAILED)
        }
        credential.failedCount = 0
        credential.lockedUntil = null
        return tokenService.issue(activeUserId(auth.userId), deviceUuid)
    }

    /**
     * 소셜 로그인. 이미 연결된 신원이면 그 유저로 로그인한다.
     * [currentUserId] 가 있으면(비회원 등 로그인 상태) 그 유저에 새 수단을 연결한다. 없으면 새 유저를 만든다.
     * TODO(auth): 엔드포인트 미개방. POST /api/auth/social/{provider} 에서 검증기로 SocialIdentity 를 만들어 호출.
     */
    fun socialLogin(
        identity: SocialIdentity,
        currentUserId: Long?,
        deviceUuid: String?,
    ): TokenResponse {
        val existing = auths.findByProviderAndProviderUid(identity.provider, identity.providerUid)
        if (existing != null) {
            if (currentUserId != null && currentUserId != existing.userId) throw ApiException(ErrorCode.SOCIAL_ALREADY_LINKED)
            oauths.findById(checkNotNull(existing.id)).ifPresent { it.applyIdentity(identity) }
            return tokenService.issue(activeUserId(existing.userId), deviceUuid)
        }

        val auth =
            if (currentUserId != null) {
                activeUserId(currentUserId)
                auths.save(UserAuthEntity(userId = currentUserId, provider = identity.provider, providerUid = identity.providerUid))
            } else {
                createUserWithAuth(identity.provider, identity.providerUid, email = identity.email, nickname = identity.displayName)
            }
        oauths.save(UserOauthEntity(authId = checkNotNull(auth.id)).also { it.applyIdentity(identity) })
        if (currentUserId != null) {
            log.info("auth.linked userId={} provider={}", auth.userId, identity.provider)
        } else {
            log.info("user.created userId={} provider={}", auth.userId, identity.provider)
        }
        return tokenService.issue(auth.userId, deviceUuid, created = currentUserId == null)
    }

    @Transactional(readOnly = true)
    fun me(userId: Long): MeResponse {
        val user = users.findById(userId).orElseThrow { ApiException(ErrorCode.UNAUTHORIZED) }
        return MeResponse(
            userId = userId,
            nickname = user.nickname,
            email = user.email,
            providers = auths.findAllByUserId(userId).map { it.provider }.sortedBy { it.ordinal },
        )
    }

    fun logout(
        userId: Long,
        rawRefreshToken: String?,
    ) = tokenService.revoke(userId, rawRefreshToken)

    private fun createUserWithAuth(
        provider: AuthProvider,
        providerUid: String,
        email: String? = null,
        nickname: String? = null,
    ): UserAuthEntity {
        val user = users.save(UserEntity(nickname = nickname, email = email))
        return auths.save(UserAuthEntity(userId = checkNotNull(user.id), provider = provider, providerUid = providerUid))
    }

    private fun activeUserId(userId: Long): Long {
        val user = users.findById(userId).orElseThrow { ApiException(ErrorCode.UNAUTHORIZED) }
        if (user.status != UserStatus.ACTIVE) throw ApiException(ErrorCode.USER_WITHDRAWN)
        return userId
    }

    private fun UserOauthEntity.applyIdentity(identity: SocialIdentity) {
        email = identity.email
        emailVerified = identity.emailVerified
        displayName = identity.displayName
        profileJson = identity.profile
    }

    private fun normalizeEmail(email: String) = email.trim().lowercase()

    companion object {
        const val MAX_FAILED = 5
        const val LOCK_MINUTES = 10L
    }
}
