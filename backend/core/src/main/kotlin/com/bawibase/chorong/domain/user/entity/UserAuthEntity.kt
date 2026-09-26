package com.bawibase.chorong.domain.user.entity

import com.bawibase.chorong.domain.user.AuthProvider
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "user_auth")
class UserAuthEntity(
    @Column(name = "user_id", nullable = false)
    var userId: Long,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    var provider: AuthProvider,
    @Column(name = "provider_uid", nullable = false, length = 255)
    var providerUid: String,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "auth_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
