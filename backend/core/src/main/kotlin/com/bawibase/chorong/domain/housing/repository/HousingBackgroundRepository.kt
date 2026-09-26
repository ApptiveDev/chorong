package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingBackgroundEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingBackgroundRepository : JpaRepository<HousingBackgroundEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingBackgroundEntity>
    fun findByCode(code: String): HousingBackgroundEntity?
}
