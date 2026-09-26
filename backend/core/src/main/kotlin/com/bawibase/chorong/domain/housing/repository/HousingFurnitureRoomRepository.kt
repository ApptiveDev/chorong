package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingFurnitureRoomEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingFurnitureRoomRepository : JpaRepository<HousingFurnitureRoomEntity, Long> {
    fun findAllByFurnitureIdIn(furnitureIds: Collection<Long>): List<HousingFurnitureRoomEntity>
}
