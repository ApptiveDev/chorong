package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowCallbackHandler
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import java.nio.ByteBuffer
import java.security.MessageDigest

@Service
class GuestAccountCoordinator(
    private val jdbc: JdbcTemplate,
    private val auths: UserAuthRepository,
) {
    private val uuidPattern = Regex(GuestAuthRequest.UUID_PATTERN)

    fun normalize(value: String): String = value.trim().let { if (uuidPattern.matches(it)) it.lowercase() else it }

    @Transactional(propagation = Propagation.MANDATORY)
    fun lock(deviceUuid: String) {
        val bytes = MessageDigest.getInstance("SHA-256").digest("chorong.guest:$deviceUuid".toByteArray(Charsets.UTF_8))
        val key = ByteBuffer.wrap(bytes).long
        jdbc.query("SELECT pg_advisory_xact_lock(?)", RowCallbackHandler { }, key)
    }

    fun find(deviceUuid: String): UserAuthEntity? {
        if (!uuidPattern.matches(deviceUuid)) return auths.findByProviderAndProviderUid(AuthProvider.GUEST, deviceUuid)
        val matches = auths.findAllByProviderAndProviderUidIgnoreCase(AuthProvider.GUEST, deviceUuid)
        if (matches.size > 1) throw ApiException(ErrorCode.DEVICE_ALREADY_REGISTERED)
        return matches.singleOrNull()
    }
}
