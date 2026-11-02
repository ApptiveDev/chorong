package com.bawibase.chorong.domain.housing.dto

import com.fasterxml.jackson.annotation.JsonInclude
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Size

data class HousingStoreItemListResponse(
    val items: List<HousingStoreItemResponse>,
)

data class HousingStoreItemDetailResponse(
    val item: HousingStoreItemResponse,
    val options: List<HousingStoreOptionResponse>,
)

data class HousingStorePurchaseItemRequest(
    @field:Min(1) val itemId: Long,
    @field:Min(1) val optionId: Long,
)

data class HousingStorePurchaseRequest(
    @field:Size(min = 1, max = 50) @field:Valid val items: List<HousingStorePurchaseItemRequest>,
)

data class HousingStoreWalletResponse(
    val star: Long,
    val stardust: Long,
)

data class HousingStorePurchaseResponse(
    val inventoryItems: List<com.bawibase.chorong.domain.user.service.InventoryItemResponse>,
    val wallet: HousingStoreWalletResponse,
)

data class HousingStoreItemResponse(
    val itemId: Long,
    val name: String,
    val itemType: String,
    val unlocked: Boolean,
    @field:JsonInclude(JsonInclude.Include.ALWAYS) val unlockHint: String?,
    val minPrice: HousingStorePriceResponse,
    val options: List<HousingStoreOptionResponse>,
)

data class HousingStorePriceResponse(
    val currency: String,
    val amount: Long,
)

data class HousingStoreOptionResponse(
    val optionId: Long,
    val option: Map<String, Any?>,
    val currency: String,
    val price: Long,
    val previewAsset: String,
    val owned: Boolean,
)
