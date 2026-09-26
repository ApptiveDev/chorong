package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingRoomSurfaceEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingRoomSurfaceRepository : JpaRepository<HousingRoomSurfaceEntity, Long> {
    fun findAllByRoomIdInOrderBySortOrderAsc(roomIds: Collection<Long>): List<HousingRoomSurfaceEntity>
}
