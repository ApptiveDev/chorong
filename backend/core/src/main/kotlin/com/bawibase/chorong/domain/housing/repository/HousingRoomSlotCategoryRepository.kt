package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotCategoryEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingRoomSlotCategoryRepository : JpaRepository<HousingRoomSlotCategoryEntity, Long> {
    fun findAllBySlotIdIn(slotIds: Collection<Long>): List<HousingRoomSlotCategoryEntity>
}
