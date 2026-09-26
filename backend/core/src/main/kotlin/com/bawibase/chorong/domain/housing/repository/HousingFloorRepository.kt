package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingFloorEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingFloorRepository : JpaRepository<HousingFloorEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingFloorEntity>
    fun findByCode(code: String): HousingFloorEntity?
}
