package com.bawibase.chorong.domain.auth.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.push.service.PushDeviceService
import com.bawibase.chorong.domain.user.UserStatus
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRefreshTokenRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

@Service
class AccountWithdrawalService(
    private val users: UserRepository,
    private val refreshTokens: UserRefreshTokenRepository,
    private val auths: UserAuthRepository,
    private val housingProfiles: HousingProfileRepository,
    private val pushDevices: PushDeviceService,
    private val jdbc: JdbcTemplate,
    private val clock: Clock,
    @Value("\${spring.flyway.default-schema}") schema: String,
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val verificationTable =
        schema.also { require(it.matches(Regex("[A-Za-z_][A-Za-z0-9_]*"))) } + ".email_signup_verification"

    @Transactional
    fun withdraw(
        userId: Long,
        reason: String?,
    ) {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (user.status != UserStatus.ACTIVE) throw ApiV1Exception(ApiErrorCode.FORBIDDEN)

        val now = OffsetDateTime.now(clock)
        user.status = UserStatus.WITHDRAWN
        user.withdrawnAt = now
        user.withdrawalReason = reason
        user.deletionAfter = now.plusDays(90)
        refreshTokens.revokeAllByUserId(userId, now)
        auths.deleteAllByUserId(userId)
        jdbc.update("DELETE FROM $verificationTable WHERE user_id = ?", userId)
        pushDevices.deleteAll(userId)
        housingProfiles.makePrivate(userId)
        log.info("user.withdrawn userId={}", userId)
    }
}
