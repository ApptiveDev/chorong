package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserOauthEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserOauthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowCallbackHandler
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.UUID

data class AuthMethodResult(
    val providers: List<String>,
)

@Service
class AuthMethodService(
    private val jdbc: JdbcTemplate,
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val oauths: UserOauthRepository,
    @Value("\${spring.flyway.default-schema}") schema: String,
) {
    private val verificationTable = schema.also { require(it.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) } + ".email_signup_verification"
    private val log = LoggerFactory.getLogger(javaClass)

    @Transactional
    fun linkSocial(
        userId: Long,
        provider: AuthProvider,
        subject: String,
    ): AuthMethodResult {
        require(provider in SOCIAL_PROVIDERS)
        lock(provider, subject)
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)
        val existing = auths.findByProviderAndProviderUid(provider, subject)
        if (existing != null && existing.userId != userId) throw ApiV1Exception(ApiErrorCode.PROVIDER_ALREADY_LINKED)
        if (existing == null) {
            val auth = auths.saveAndFlush(UserAuthEntity(userId, provider, subject))
            oauths.save(UserOauthEntity(checkNotNull(auth.id)))
            log.info("auth.linked userId={} provider={}", userId, provider)
        }
        return result(userId)
    }

    @Transactional
    fun confirmEmailLink(
        userId: Long,
        verificationId: UUID,
    ): AuthMethodResult {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)
        val session =
            jdbc
                .query(
                    "SELECT email,consumed_at,invalidated_at FROM $verificationTable WHERE verification_id = ? AND user_id = ? FOR UPDATE",
                    { rs, _ -> Triple(rs.getString("email"), rs.getObject("consumed_at"), rs.getObject("invalidated_at")) },
                    verificationId,
                    userId,
                ).singleOrNull() ?: throw ApiV1Exception(ApiErrorCode.VERIFICATION_INVALID)
        if (session.second == null || session.third != null) throw ApiV1Exception(ApiErrorCode.VERIFICATION_INVALID)
        val auth = auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, session.first)
        if (auth == null || auth.userId != userId) throw ApiV1Exception(ApiErrorCode.VERIFICATION_INVALID)
        return result(userId)
    }

    @Transactional
    fun unlink(
        userId: Long,
        provider: AuthProvider,
    ): AuthMethodResult {
        require(provider in LINKABLE_PROVIDERS)
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)
        val auth =
            auths.findAllByUserId(userId).firstOrNull { it.provider == provider }
                ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val linkedMethods = auths.findAllByUserId(userId).count { it.provider != AuthProvider.GUEST }
        if (linkedMethods <= 1) throw ApiV1Exception(ApiErrorCode.LAST_AUTH_METHOD)
        auths.delete(auth)
        auths.flush()
        log.info("auth.unlinked userId={} provider={}", userId, provider)
        return result(userId)
    }

    private fun result(userId: Long) =
        AuthMethodResult(
            auths
                .findAllByUserId(userId)
                .asSequence()
                .filter { it.provider != AuthProvider.GUEST }
                .map { if (it.provider == AuthProvider.PASSWORD) "EMAIL" else it.provider.name }
                .sorted()
                .toList(),
        )

    private fun lock(
        provider: AuthProvider,
        subject: String,
    ) {
        val key = MessageDigest.getInstance("SHA-256").digest("chorong.${provider.name.lowercase()}:$subject".toByteArray(Charsets.UTF_8))
        jdbc.query("SELECT pg_advisory_xact_lock(?)", RowCallbackHandler { }, ByteBuffer.wrap(key).long)
    }

    companion object {
        private val SOCIAL_PROVIDERS = setOf(AuthProvider.GOOGLE, AuthProvider.KAKAO, AuthProvider.APPLE, AuthProvider.NAVER)
        private val LINKABLE_PROVIDERS = SOCIAL_PROVIDERS + AuthProvider.PASSWORD
    }
}
