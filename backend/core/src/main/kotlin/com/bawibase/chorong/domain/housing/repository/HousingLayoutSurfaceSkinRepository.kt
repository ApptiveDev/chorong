package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingLayoutSurfaceSkinEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingLayoutSurfaceSkinRepository : JpaRepository<HousingLayoutSurfaceSkinEntity, Long> {
    fun findAllByLayoutIdIn(layoutIds: Collection<Long>): List<HousingLayoutSurfaceSkinEntity>
    fun deleteAllByLayoutId(layoutId: Long)
}
