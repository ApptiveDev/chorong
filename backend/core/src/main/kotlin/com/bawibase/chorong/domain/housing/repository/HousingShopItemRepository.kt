package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingShopItemEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingShopItemRepository : JpaRepository<HousingShopItemEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingShopItemEntity>

    fun findByCode(code: String): HousingShopItemEntity?
}
