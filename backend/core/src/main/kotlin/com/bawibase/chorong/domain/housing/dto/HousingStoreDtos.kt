package com.bawibase.chorong.domain.housing.dto

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.databind.DeserializationContext
import com.fasterxml.jackson.databind.annotation.JsonDeserialize
import com.fasterxml.jackson.databind.deser.std.StdDeserializer
import jakarta.validation.Valid
import jakarta.validation.constraints.Max
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
    @field:Min(1) @field:Max(50) @field:JsonDeserialize(using = PurchaseQuantityDeserializer::class) val quantity: Int,
)

class PurchaseQuantityDeserializer : StdDeserializer<Int>(Int::class.java) {
    override fun deserialize(
        parser: JsonParser,
        context: DeserializationContext,
    ): Int {
        if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return context.handleUnexpectedToken(Int::class.java, parser) as Int
        return parser.intValue
    }
}

data class HousingStorePurchaseRequest(
    @field:Size(min = 1, max = 50) @field:Valid val items: List<HousingStorePurchaseItemRequest>,
)

data class HousingStorePurchaseResponse(
    val inventoryItems: List<com.bawibase.chorong.domain.user.service.InventoryItemResponse>,
    val wallet: com.bawibase.chorong.domain.user.controller.WalletBalancesResponse,
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
    val ownedCount: Long,
)
