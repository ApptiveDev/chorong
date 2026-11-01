package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.housing.dto.HousingStoreItemDetailResponse
import com.bawibase.chorong.domain.housing.dto.HousingStoreItemListResponse
import com.bawibase.chorong.domain.housing.dto.HousingStoreItemResponse
import com.bawibase.chorong.domain.housing.dto.HousingStoreOptionResponse
import com.bawibase.chorong.domain.housing.dto.HousingStorePriceResponse
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.Locale

data class StorePlacementInventory(
    val itemId: Long,
    val itemType: String,
)

@Service
class HousingStoreCatalogService(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    @Transactional(readOnly = true)
    fun list(
        userId: Long,
        itemType: String?,
    ): HousingStoreItemListResponse {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val normalizedType = itemType?.uppercase(Locale.ROOT)
        if (normalizedType != null && normalizedType !in ITEM_TYPES) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        return HousingStoreItemListResponse(toItemResponses(queryRows(userId, normalizedType, null)))
    }

    @Transactional(readOnly = true)
    fun detail(
        userId: Long,
        itemId: Long,
    ): HousingStoreItemDetailResponse {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val item = toItemResponses(queryRows(userId, null, itemId)).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        return HousingStoreItemDetailResponse(item = item, options = item.options)
    }

    @Transactional(readOnly = true)
    fun ownedPlacementInventory(
        userId: Long,
        inventoryIds: Collection<Long>,
    ): Map<Long, StorePlacementInventory> {
        if (inventoryIds.isEmpty()) return emptyMap()
        val placeholders = inventoryIds.joinToString(",") { "?" }
        val parameters = arrayOf<Any>(userId, *inventoryIds.toTypedArray())
        return jdbc
            .query(
                """SELECT own.inventory_id, item.item_id, item.item_type
                   FROM housing_store_owned_option own
                   JOIN housing_store_option option ON option.option_id=own.option_id
                   JOIN housing_store_item item ON item.item_id=option.item_id
                   WHERE own.user_id=? AND own.inventory_id IN ($placeholders)""",
                { rs, _ ->
                    rs.getLong("inventory_id") to StorePlacementInventory(rs.getLong("item_id"), rs.getString("item_type"))
                },
                *parameters,
            ).toMap()
    }

    private fun queryRows(
        userId: Long,
        itemType: String?,
        itemId: Long?,
    ): List<StoreOptionRow> =
        jdbc.query(
            """SELECT i.item_id, i.name, i.item_type, i.unlocked, i.unlock_hint,
                      o.option_id, o.option_json::text AS option_json, o.currency, o.price, o.preview_asset,
                      EXISTS (SELECT 1 FROM housing_store_owned_option own
                              WHERE own.user_id=? AND own.option_id=o.option_id) AS owned
               FROM housing_store_item i
               JOIN housing_store_option o ON o.item_id=i.item_id AND o.is_active
               WHERE i.is_active
                 AND (?::varchar IS NULL OR i.item_type=?)
                 AND (?::bigint IS NULL OR i.item_id=?)
               ORDER BY i.sort_order, i.item_id, o.sort_order, o.option_id""",
            { rs, _ ->
                StoreOptionRow(
                    itemId = rs.getLong("item_id"),
                    name = rs.getString("name"),
                    itemType = rs.getString("item_type"),
                    unlocked = rs.getBoolean("unlocked"),
                    unlockHint = rs.getString("unlock_hint"),
                    optionId = rs.getLong("option_id"),
                    optionJson = rs.getString("option_json"),
                    currency = rs.getString("currency"),
                    price = rs.getLong("price"),
                    previewAsset = rs.getString("preview_asset"),
                    owned = rs.getBoolean("owned"),
                )
            },
            userId,
            itemType,
            itemType,
            itemId,
            itemId,
        )

    private fun toItemResponses(rows: List<StoreOptionRow>): List<HousingStoreItemResponse> {
        val type = object : TypeReference<Map<String, Any?>>() {}
        return rows.groupBy { it.itemId }.values.map { itemRows ->
            val first = itemRows.first()
            val options =
                itemRows.map { row ->
                    HousingStoreOptionResponse(
                        optionId = row.optionId,
                        option = objectMapper.readValue(row.optionJson, type),
                        currency = row.currency,
                        price = row.price,
                        previewAsset = row.previewAsset,
                        owned = row.owned,
                    )
                }
            val cheapest = options.minWith(compareBy<HousingStoreOptionResponse> { it.price }.thenBy { it.optionId })
            HousingStoreItemResponse(
                itemId = first.itemId,
                name = first.name,
                itemType = first.itemType,
                unlocked = first.unlocked,
                unlockHint = first.unlockHint,
                minPrice = HousingStorePriceResponse(cheapest.currency, cheapest.price),
                options = options,
            )
        }
    }

    private data class StoreOptionRow(
        val itemId: Long,
        val name: String,
        val itemType: String,
        val unlocked: Boolean,
        val unlockHint: String?,
        val optionId: Long,
        val optionJson: String,
        val currency: String,
        val price: Long,
        val previewAsset: String,
        val owned: Boolean,
    )

    private companion object {
        val ITEM_TYPES = setOf("FURNITURE", "OBJECT")
    }
}
