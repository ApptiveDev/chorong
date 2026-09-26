package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingAvatarEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingAvatarRepository : JpaRepository<HousingAvatarEntity, Long> {
    fun findAllByIsActiveTrueOrderBySortOrderAsc(): List<HousingAvatarEntity>

    fun findByCode(code: String): HousingAvatarEntity?
}
