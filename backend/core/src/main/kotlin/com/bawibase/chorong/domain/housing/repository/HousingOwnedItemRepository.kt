package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.HousingItemType
import com.bawibase.chorong.domain.housing.entity.HousingOwnedItemEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingOwnedItemRepository : JpaRepository<HousingOwnedItemEntity, Long> {
    fun findAllByUserId(userId: Long): List<HousingOwnedItemEntity>

    fun existsByUserIdAndItemTypeAndItemId(
        userId: Long,
        itemType: HousingItemType,
        itemId: Long,
    ): Boolean
}
