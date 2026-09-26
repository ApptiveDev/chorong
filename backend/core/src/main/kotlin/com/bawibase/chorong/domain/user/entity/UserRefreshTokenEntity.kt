package com.bawibase.chorong.domain.user.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "user_refresh_token")
class UserRefreshTokenEntity(
    @Column(name = "user_id", nullable = false)
    var userId: Long,
    @Column(name = "token_hash", nullable = false, length = 64)
    var tokenHash: String,
    @Column(name = "device_uuid", length = 36)
    var deviceUuid: String?,
    @Column(name = "expires_at", nullable = false)
    var expiresAt: OffsetDateTime,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "token_id")
    var id: Long? = null

    @Column(name = "revoked_at")
    var revokedAt: OffsetDateTime? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null

    fun isUsable(now: OffsetDateTime): Boolean = revokedAt == null && expiresAt.isAfter(now)
}
