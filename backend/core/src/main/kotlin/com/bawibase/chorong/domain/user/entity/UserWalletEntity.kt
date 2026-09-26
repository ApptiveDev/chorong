package com.bawibase.chorong.domain.user.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "user_wallet")
class UserWalletEntity(
    @Id
    @Column(name = "user_id")
    var userId: Long,

    @Column(nullable = false)
    var coin: Long = 0,
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
