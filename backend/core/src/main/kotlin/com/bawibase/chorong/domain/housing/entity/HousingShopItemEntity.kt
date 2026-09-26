package com.bawibase.chorong.domain.housing.entity

import com.bawibase.chorong.domain.housing.HousingItemType
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
@Table(name = "housing_shop_item")
class HousingShopItemEntity(
    @Column(nullable = false, length = 60)
    var code: String,
    @Enumerated(EnumType.STRING)
    @Column(name = "item_type", nullable = false, length = 20)
    var itemType: HousingItemType,
    @Column(name = "item_id", nullable = false)
    var itemId: Long,
    @Column(name = "price_coin", nullable = false)
    var priceCoin: Long,
    @Column(name = "sort_order", nullable = false)
    var sortOrder: Int = 0,
    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "shop_item_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
