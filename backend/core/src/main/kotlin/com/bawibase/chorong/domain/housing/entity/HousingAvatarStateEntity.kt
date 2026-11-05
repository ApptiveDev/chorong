package com.bawibase.chorong.domain.housing.entity

import com.bawibase.chorong.domain.housing.dto.AvatarState
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
@Table(name = "housing_avatar_state")
class HousingAvatarStateEntity(
    @Id
    @Column(name = "user_id")
    var userId: Long,
    @Column(nullable = false)
    var x: Double = 0.5,
    @Column(nullable = false)
    var y: Double = 0.5,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    var state: AvatarState = AvatarState.IDLE,
    @Column(name = "placement_id")
    var placementId: Long? = null,
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
