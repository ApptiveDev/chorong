package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingRoomEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingRoomRepository : JpaRepository<HousingRoomEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingRoomEntity>

    fun findByCode(code: String): HousingRoomEntity?
}
