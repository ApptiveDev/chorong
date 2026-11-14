package com.bawibase.chorong.domain.housing.entity

import com.bawibase.chorong.domain.housing.HousingPlacementArea
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
@Table(name = "housing_coordinate_placement")
class HousingCoordinatePlacementEntity(
    @Column(name = "user_id", nullable = false)
    var userId: Long,
    @Column(name = "owned_item_id")
    var ownedItemId: Long? = null,
    @Column(name = "store_inventory_id")
    var storeInventoryId: Long? = null,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    var area: HousingPlacementArea,
    @Column(nullable = false)
    var x: Double,
    @Column(nullable = false)
    var y: Double,
    @Column(nullable = false)
    var rotation: Int = 0,
    @Column(name = "flipped_x", nullable = false)
    var flippedX: Boolean = false,
    @Column(nullable = false)
    var layer: Int = 0,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "placement_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
