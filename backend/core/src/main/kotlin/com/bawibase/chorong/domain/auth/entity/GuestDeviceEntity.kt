package com.bawibase.chorong.domain.auth.entity

import com.bawibase.chorong.domain.auth.dto.DevicePlatform
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "auth_guest")
class GuestDeviceEntity(
    @Id @Column(name = "auth_id") val authId: Long,
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) var platform: DevicePlatform,
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
