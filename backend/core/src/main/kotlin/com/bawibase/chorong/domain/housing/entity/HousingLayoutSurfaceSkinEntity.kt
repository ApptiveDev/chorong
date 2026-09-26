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
@Table(name = "housing_layout_surface_skin")
class HousingLayoutSurfaceSkinEntity(
    @Column(name = "layout_id", nullable = false)
    var layoutId: Long,

    @Column(name = "surface_id", nullable = false)
    var surfaceId: Long,

    @Enumerated(EnumType.STRING)
    @Column(name = "skin_type", nullable = false, length = 10)
    var skinType: SurfaceKind,

    @Column(name = "skin_id", nullable = false)
    var skinId: Long,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "surface_skin_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
