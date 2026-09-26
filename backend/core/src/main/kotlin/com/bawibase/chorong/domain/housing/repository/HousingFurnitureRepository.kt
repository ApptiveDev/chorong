package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingFurnitureEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingFurnitureRepository : JpaRepository<HousingFurnitureEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingFurnitureEntity>
    fun findByCode(code: String): HousingFurnitureEntity?
}
