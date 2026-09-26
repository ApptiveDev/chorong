package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingWallEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingWallRepository : JpaRepository<HousingWallEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingWallEntity>

    fun findByCode(code: String): HousingWallEntity?
}
