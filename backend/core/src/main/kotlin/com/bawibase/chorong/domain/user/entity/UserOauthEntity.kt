package com.bawibase.chorong.domain.user.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.UpdateTimestamp
import org.hibernate.type.SqlTypes
import java.time.OffsetDateTime

@Entity
@Table(name = "user_oauth")
class UserOauthEntity(
    @Id
    @Column(name = "auth_id")
    var authId: Long,
    @Column(length = 255)
    var email: String? = null,
    @Column(name = "email_verified", nullable = false)
    var emailVerified: Boolean = false,
    @Column(name = "display_name", length = 80)
    var displayName: String? = null,
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "profile_json", columnDefinition = "jsonb")
    var profileJson: Map<String, Any?>? = null,
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
