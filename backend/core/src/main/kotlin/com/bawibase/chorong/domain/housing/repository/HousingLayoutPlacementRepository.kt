package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingLayoutPlacementEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingLayoutPlacementRepository : JpaRepository<HousingLayoutPlacementEntity, Long> {
    fun findAllByLayoutIdIn(layoutIds: Collection<Long>): List<HousingLayoutPlacementEntity>

    fun deleteAllByLayoutId(layoutId: Long)
}
