package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingRoomSlotRepository : JpaRepository<HousingRoomSlotEntity, Long> {
    fun findAllByRoomIdInOrderBySortOrderAsc(roomIds: Collection<Long>): List<HousingRoomSlotEntity>
}
