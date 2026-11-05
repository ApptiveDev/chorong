package com.bawibase.chorong.domain.housing.dto

import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.Valid
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Size

data class HousingResponse(
    val housingId: Long,
    val name: String,
    val isPublic: Boolean,
    val likeCount: Int,
)

data class HousingDetailResponse(
    val housing: HousingResponse,
    val placements: List<HousingCoordinatePlacementResponse>,
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val avatar: AvatarResponse,
    val activeRoomId: String?,
    val legacyLayouts: Map<String, LayoutResponse>,
)

data class PublicHousingDetailResponse(
    val housing: HousingResponse,
    val placements: List<HousingCoordinatePlacementResponse> = emptyList(),
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val avatar: AvatarResponse,
    val activeRoomId: String?,
    val legacyLayouts: Map<String, LayoutResponse>,
    val ownerNickname: String,
    val likedByMe: Boolean,
)

data class AvatarResponse(
    val x: Double,
    val y: Double,
    val state: AvatarState,
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val placementId: Long?,
)

enum class AvatarState { IDLE, SIT, SLEEP }

data class HousingAvatarPatchRequest(
    @field:NotNull @field:DecimalMin("0.0") @field:DecimalMax("1.0") val x: Double,
    @field:NotNull @field:DecimalMin("0.0") @field:DecimalMax("1.0") val y: Double,
    @field:NotNull val state: AvatarState,
    val placementId: Long? = null,
)

data class HousingCoordinatePlacementRequest(
    @field:NotBlank val inventoryId: String,
    @field:NotNull val area: com.bawibase.chorong.domain.housing.HousingPlacementArea,
    @field:Valid val transform: HousingPlacementTransformRequest,
)

data class HousingPlacementTransformRequest(
    @field:DecimalMin("0.0") @field:DecimalMax("1.0") val x: Double,
    @field:DecimalMin("0.0") @field:DecimalMax("1.0") val y: Double,
    @field:Min(0) @field:Max(270) val rotation: Int = 0,
    @field:Min(0) val layer: Int = 0,
)

data class HousingCoordinatePlacementBatchRequest(
    @field:Size(max = 200) @field:Valid val placements: List<HousingCoordinatePlacementRequest>,
)

data class HousingCoordinatePlacementResponse(
    val placementId: Long,
    val inventoryId: String,
    val area: com.bawibase.chorong.domain.housing.HousingPlacementArea,
    val transform: HousingPlacementTransformResponse,
    val itemId: Long,
    val optionId: Long,
    val option: Map<String, Any?>,
)

data class HousingPlacementTransformResponse(
    val x: Double,
    val y: Double,
    val rotation: Int,
    val layer: Int,
)

data class HousingCoordinatePlacementBatchResponse(
    val placements: List<HousingCoordinatePlacementResponse>,
)

data class HousingProfilePatchRequest(
    val name: String? = null,
    val isPublic: Boolean? = null,
)

fun HousingProfileEntity.toHousingResponse(likeCount: Int = 0) = HousingResponse(userId, name, isPublic, likeCount)
