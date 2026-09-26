package com.bawibase.chorong.domain.housing.repository

import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import org.springframework.data.jpa.repository.JpaRepository

interface HousingProfileRepository : JpaRepository<HousingProfileEntity, Long>
