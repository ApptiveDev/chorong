package com.bawibase.chorong.domain.user.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "user_password")
class UserPasswordEntity(
    @Id
    @Column(name = "auth_id")
    var authId: Long,
    @Column(name = "password_hash", nullable = false, length = 100)
    var passwordHash: String,
    @Column(name = "password_changed_at", nullable = false)
    var passwordChangedAt: OffsetDateTime,
) {
    @Column(name = "failed_count", nullable = false)
    var failedCount: Int = 0

    @Column(name = "locked_until")
    var lockedUntil: OffsetDateTime? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
