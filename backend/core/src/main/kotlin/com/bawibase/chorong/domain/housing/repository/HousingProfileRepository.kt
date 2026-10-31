package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param

interface HousingProfileRepository : JpaRepository<HousingProfileEntity, Long> {
    @Modifying
    @Query("update HousingProfileEntity p set p.isPublic = false where p.userId = :userId")
    fun makePrivate(
        @Param("userId") userId: Long,
    ): Int
}
