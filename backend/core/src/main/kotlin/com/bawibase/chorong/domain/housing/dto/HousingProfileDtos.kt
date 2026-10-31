package com.bawibase.chorong.domain.housing.dto

import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.fasterxml.jackson.annotation.JsonInclude

data class HousingResponse(
    val housingId: Long,
    val name: String,
    val isPublic: Boolean,
    val likeCount: Int,
)

data class HousingDetailResponse(
    val housing: HousingResponse,
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val placements: List<Any>?,
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val avatar: Any?,
    val activeRoomId: String?,
    val legacyLayouts: Map<String, LayoutResponse>,
)

data class HousingProfilePatchRequest(
    val name: String? = null,
    val isPublic: Boolean? = null,
)

fun HousingProfileEntity.toHousingResponse() = HousingResponse(userId, name, isPublic, 0)
