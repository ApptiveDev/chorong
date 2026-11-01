package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingCoordinatePlacementEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingCoordinatePlacementRepository : JpaRepository<HousingCoordinatePlacementEntity, Long> {
    fun findAllByUserIdOrderByLayerAscIdAsc(userId: Long): List<HousingCoordinatePlacementEntity>

    fun deleteAllByUserId(userId: Long)

    fun findAllByUserIdIn(userIds: Collection<Long>): List<HousingCoordinatePlacementEntity>
}
