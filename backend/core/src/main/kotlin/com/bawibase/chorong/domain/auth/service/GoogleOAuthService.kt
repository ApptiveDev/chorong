package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.auth.dto.GuestAuthData
import com.bawibase.chorong.domain.auth.dto.UserBrief
import com.bawibase.chorong.domain.housing.service.HousingCatalogService
import com.bawibase.chorong.domain.housing.service.HousingService
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.entity.UserOauthEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserOauthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowCallbackHandler
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.security.MessageDigest

@Service
class GoogleOAuthService(
    private val jdbc: JdbcTemplate,
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val oauths: UserOauthRepository,
    private val catalog: HousingCatalogService,
    private val housing: HousingService,
    private val wallets: UserWalletService,
    private val tokens: TokenService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun authenticate(
        subject: String,
        deviceUuid: String,
        currentUserId: Long?,
    ): GuestAuthData = authenticate(AuthProvider.GOOGLE, subject, deviceUuid, currentUserId)

    @Transactional
    fun authenticate(
        provider: AuthProvider,
        subject: String,
        deviceUuid: String,
        currentUserId: Long?,
    ): GuestAuthData {
        require(provider in setOf(AuthProvider.GOOGLE, AuthProvider.KAKAO))
        val key = MessageDigest.getInstance("SHA-256").digest("chorong.${provider.name.lowercase()}:$subject".toByteArray(Charsets.UTF_8))
        jdbc.query("SELECT pg_advisory_xact_lock(?)", RowCallbackHandler { }, ByteBuffer.wrap(key).long)
        val existing = auths.findByProviderAndProviderUid(provider, subject)
        val user: UserEntity
        val created: Boolean
        if (currentUserId != null) {
            user = users.findByIdForUpdate(currentUserId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            if (user.status != UserStatus.GUEST) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)
            if (existing != null && existing.userId != currentUserId) {
                throw ApiV1Exception(ApiErrorCode.ACCOUNT_EXISTS_FOR_PROVIDER)
            }
            if (existing == null) addIdentity(currentUserId, provider, subject)
            user.status = UserStatus.ACTIVE
            created = false
        } else if (existing != null) {
            user = users.findByIdForUpdate(existing.userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            if (user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
            created = false
        } else {
            user = users.saveAndFlush(UserEntity().apply { status = UserStatus.ACTIVE })
            val id = checkNotNull(user.id)
            addIdentity(id, provider, subject)
            val snapshot = catalog.snapshot()
            if (!snapshot.rooms.any { it.isDefault } || !snapshot.backgrounds.any { it.isDefault } ||
                !snapshot.avatars.any { it.isDefault } || !snapshot.walls.any { it.isDefault } ||
                !snapshot.floors.any { it.isDefault }
            ) {
                throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING)
            }
            housing.ensureProfile(id, snapshot, logCreated = false)
            wallets.ensureWallet(id)
            created = true
        }
        val id = checkNotNull(user.id)
        val token = tokens.issue(id, deviceUuid.lowercase())
        if (created) {
            log.info("user.created userId={} provider={}", id, provider)
        } else if (currentUserId != null && existing == null) {
            log.info("auth.linked userId={} provider={}", id, provider)
        }
        return GuestAuthData(
            token.accessToken,
            token.refreshToken,
            token.expiresIn,
            UserBrief(id, UserNicknamePolicy.displayName(user.nickname, user.status), user.status),
            created,
        )
    }

    private fun addIdentity(
        userId: Long,
        provider: AuthProvider,
        subject: String,
    ) {
        val auth = auths.saveAndFlush(UserAuthEntity(userId, provider, subject))
        oauths.save(UserOauthEntity(checkNotNull(auth.id)))
    }
}
