package com.bawibase.chorong.domain.housing.dto

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import java.time.OffsetDateTime

data class CatalogResponse(
    val version: Long,
    val backgrounds: List<CatalogItemResponse>,
    val walls: List<CatalogItemResponse>,
    val floors: List<CatalogItemResponse>,
    val avatars: List<CatalogItemResponse>,
    val furniture: List<FurnitureResponse>,
    val rooms: List<RoomResponse>,
)

data class CatalogItemResponse(
    val id: String,
    val name: String,
)

data class FurnitureResponse(
    val id: String,
    val name: String,
    val category: String,
    @field:JsonInclude(JsonInclude.Include.NON_NULL)
    val compatibleRoomIds: List<String>?,
)

data class RoomResponse(
    val id: String,
    val name: String,
    val surfaces: List<SurfaceResponse>,
    val slots: List<SlotResponse>,
)

data class SurfaceResponse(
    val id: String,
    val kind: String,
)

data class SlotResponse(
    val id: String,
    val allowedCategories: List<String>,
)

data class WalletResponse(
    val coin: Long,
)

data class OwnedResponse(
    val backgroundIds: List<String>,
    val wallIds: List<String>,
    val floorIds: List<String>,
    val roomIds: List<String>,
    val avatarIds: List<String>,
    val furniture: List<OwnedFurnitureResponse>,
)

data class OwnedFurnitureResponse(
    val furnitureId: String,
    val category: String,
)

data class PlacementResponse(
    val slotId: String,
    val furnitureId: String,
)

data class LayoutResponse(
    val backgroundId: String,
    val surfaceSkins: Map<String, String>,
    val avatarId: String,
    val placements: List<PlacementResponse>,
    val updatedAt: OffsetDateTime?,
)

data class MeResponse(
    val wallet: WalletResponse,
    val owned: OwnedResponse,
    val activeRoomId: String?,
    val layouts: Map<String, LayoutResponse>,
)

data class PlacementRequest(
    @field:NotBlank val slotId: String,
    @field:NotBlank val furnitureId: String,
)

data class LayoutRequest(
    @field:NotBlank val backgroundId: String,
    val surfaceSkins: Map<String, String> = emptyMap(),
    @field:NotBlank val avatarId: String,
    @field:Valid val placements: List<PlacementRequest> = emptyList(),
)

data class ActiveRoomRequest(
    @field:NotBlank val roomId: String,
)

data class ActiveRoomResponse(
    val activeRoomId: String,
)

data class PriceResponse(
    val coin: Long,
)

data class ShopItemResponse(
    val id: String,
    val type: String,
    val targetId: String,
    val price: PriceResponse,
    val owned: Boolean,
)

data class ShopResponse(
    val items: List<ShopItemResponse>,
)

data class PurchaseRequest(
    @field:NotBlank val itemId: String,
)

data class PurchaseResponse(
    val wallet: WalletResponse,
    val owned: OwnedResponse,
    val layouts: Map<String, LayoutResponse>,
)
