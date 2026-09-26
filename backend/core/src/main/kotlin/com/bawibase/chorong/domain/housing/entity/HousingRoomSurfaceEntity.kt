package com.bawibase.chorong.domain.housing.entity

import com.bawibase.chorong.domain.housing.SurfaceKind
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.OffsetDateTime
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp

@Entity
@Table(name = "housing_room_surface")
class HousingRoomSurfaceEntity(
    @Column(name = "room_id", nullable = false)
    var roomId: Long,

    @Column(nullable = false, length = 60)
    var code: String,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    var kind: SurfaceKind,

    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "surface_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
