package com.bawibase.chorong.domain.housing.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "housing_profile")
class HousingProfileEntity(
    @Id
    @Column(name = "user_id")
    var userId: Long,
    @Column(name = "active_room_id")
    var activeRoomId: Long? = null,
    @Column(name = "is_public", nullable = false)
    var isPublic: Boolean = true,
    @Column(nullable = false, length = 20)
    var name: String = "나의 우주",
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
