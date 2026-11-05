package com.bawibase.chorong.domain.auth.repository

import com.bawibase.chorong.domain.auth.entity.GuestDeviceEntity
import org.springframework.data.jpa.repository.JpaRepository

interface GuestDeviceRepository : JpaRepository<GuestDeviceEntity, Long>
