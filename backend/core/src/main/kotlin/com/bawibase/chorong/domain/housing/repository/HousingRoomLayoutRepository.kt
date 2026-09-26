package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingRoomLayoutEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingRoomLayoutRepository : JpaRepository<HousingRoomLayoutEntity, Long> {
    fun findAllByUserId(userId: Long): List<HousingRoomLayoutEntity>
    fun findByUserIdAndRoomId(userId: Long, roomId: Long): HousingRoomLayoutEntity?
}
