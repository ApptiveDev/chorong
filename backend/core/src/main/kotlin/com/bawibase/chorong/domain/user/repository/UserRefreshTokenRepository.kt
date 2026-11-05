package com.bawibase.chorong.domain.user.repository

import com.bawibase.chorong.domain.user.entity.UserRefreshTokenEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import java.time.OffsetDateTime

interface UserRefreshTokenRepository : JpaRepository<UserRefreshTokenEntity, Long> {
    fun findByTokenHash(tokenHash: String): UserRefreshTokenEntity?

    @Query("select t.userId from UserRefreshTokenEntity t where t.tokenHash = :tokenHash")
    fun findUserIdByTokenHash(tokenHash: String): Long?

    @Modifying
    @Query(
        "update UserRefreshTokenEntity t set t.revokedAt = :now where t.userId = :userId and upper(t.deviceUuid) = upper(:deviceUuid) and t.revokedAt is null",
    )
    fun revokeByUserIdAndDeviceUuid(
        userId: Long,
        deviceUuid: String,
        now: OffsetDateTime,
    ): Int

    @Modifying
    @Query("update UserRefreshTokenEntity t set t.revokedAt = :now where t.userId = :userId and t.revokedAt is null")
    fun revokeAllByUserId(
        userId: Long,
        now: OffsetDateTime,
    ): Int
}
