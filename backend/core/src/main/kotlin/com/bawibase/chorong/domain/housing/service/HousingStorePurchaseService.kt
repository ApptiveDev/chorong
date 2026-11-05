package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiError
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiErrorItem
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseRequest
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseResponse
import com.bawibase.chorong.domain.housing.dto.HousingStoreWalletResponse
import com.bawibase.chorong.domain.idempotency.IdempotencyService
import com.bawibase.chorong.domain.idempotency.IdempotentResponse
import com.bawibase.chorong.domain.user.service.InventoryItemResponse
import com.bawibase.chorong.domain.user.service.UserWalletService
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HousingStorePurchaseService(
    private val jdbc: JdbcTemplate,
    private val idempotency: IdempotencyService,
    private val wallets: UserWalletService,
    private val objectMapper: ObjectMapper,
) {
    @Transactional
    fun purchase(
        userId: Long,
        idempotencyKey: String,
        request: HousingStorePurchaseRequest,
    ): HousingStorePurchaseResponse =
        idempotency
            .execute(userId, OPERATION_ID, idempotencyKey, request, HousingStorePurchaseResponse::class.java) {
                IdempotentResponse(200, purchaseOnce(userId, request))
            }.body

    private fun purchaseOnce(
        userId: Long,
        request: HousingStorePurchaseRequest,
    ): HousingStorePurchaseResponse {
        val requestedOptions = mutableSetOf<Long>()
        val errors = mutableListOf<ApiErrorItem>()
        val options =
            request.items.map { requested ->
                val item = findItem(requested.itemId)
                val option =
                    when {
                        item != null && !item.unlocked -> {
                            errors.add(requested.error(ApiErrorCode.ITEM_LOCKED))
                            null
                        }

                        item == null || !item.active -> {
                            errors.add(requested.error(ApiErrorCode.OPTION_INVALID))
                            null
                        }

                        else -> {
                            findOption(requested.itemId, requested.optionId).also {
                                if (it == null) errors.add(requested.error(ApiErrorCode.OPTION_INVALID))
                            }
                        }
                    }
                if (option != null) {
                    val previouslyOwned = isOwned(userId, requested.optionId)
                    if (previouslyOwned || !requestedOptions.add(requested.optionId)) {
                        errors.add(requested.error(ApiErrorCode.ALREADY_OWNED))
                    }
                }
                option
            }
        if (errors.isNotEmpty()) fail(errors)

        val wallet = wallets.ensureWallet(userId)
        val newlyOwned =
            options.mapIndexedNotNull { index, option ->
                option ?: return@mapIndexedNotNull null
                val requested = request.items[index]
                if (isOwned(userId, requested.optionId)) errors.add(requested.error(ApiErrorCode.ALREADY_OWNED))
                option
            }
        if (errors.isNotEmpty()) fail(errors)

        val starCost = newlyOwned.filter { it.currency == STAR }.sumCost()
        val stardustCost = newlyOwned.filter { it.currency == STARDUST }.sumCost()
        if (wallet.star < starCost) {
            request.items
                .zip(options)
                .filter { it.second?.currency == STAR }
                .forEach { (item, _) -> errors.add(item.error(ApiErrorCode.INSUFFICIENT_BALANCE)) }
        }
        if (wallet.stardust < stardustCost) {
            request.items
                .zip(options)
                .filter { it.second?.currency == STARDUST }
                .forEach { (item, _) -> errors.add(item.error(ApiErrorCode.INSUFFICIENT_BALANCE)) }
        }
        if (errors.isNotEmpty()) fail(errors)

        wallet.star -= starCost
        wallet.stardust -= stardustCost
        val inventory =
            request.items.zip(options).map { (requested, option) ->
                checkNotNull(option)
                val acquired =
                    checkNotNull(
                        jdbc.queryForObject(
                            "INSERT INTO housing_store_owned_option (user_id,option_id) VALUES (?,?) RETURNING inventory_id,acquired_at",
                            { rs, _ -> rs.getLong("inventory_id") to rs.getTimestamp("acquired_at").toInstant() },
                            userId,
                            requested.optionId,
                        ),
                    )
                InventoryItemResponse(
                    inventoryId = "store:${acquired.first}",
                    itemId = option.itemId,
                    itemType = option.itemType,
                    name = option.itemName,
                    optionId = option.optionId,
                    option = objectMapper.readValue(option.optionJson, OPTION_TYPE),
                    acquiredVia = "PURCHASE",
                    acquiredAt = acquired.second,
                    placed = false,
                )
            }
        logger.info("shop.store_purchased userId={} itemCount={} star={} stardust={}", userId, inventory.size, starCost, stardustCost)
        return HousingStorePurchaseResponse(inventory, HousingStoreWalletResponse(wallet.star, wallet.stardust))
    }

    private fun findItem(itemId: Long): StoreItem? =
        jdbc
            .query(
                "SELECT item_id,name,item_type,unlocked,is_active FROM housing_store_item WHERE item_id=?",
                {
                    rs,
                    _,
                    ->
                    StoreItem(
                        rs.getLong("item_id"),
                        rs.getString("name"),
                        rs.getString("item_type"),
                        rs.getBoolean("unlocked"),
                        rs.getBoolean("is_active"),
                    )
                },
                itemId,
            ).firstOrNull()

    private fun findOption(
        itemId: Long,
        optionId: Long,
    ): StoreOption? =
        jdbc
            .query(
                """SELECT o.option_id,o.item_id,i.name,i.item_type,o.option_json::text AS option_json,o.currency,o.price
               FROM housing_store_option o JOIN housing_store_item i ON i.item_id=o.item_id
               WHERE o.item_id=? AND o.option_id=? AND o.is_active""",
                { rs, _ ->
                    StoreOption(
                        rs.getLong("option_id"),
                        rs.getLong("item_id"),
                        rs.getString("name"),
                        rs.getString("item_type"),
                        rs.getString("option_json"),
                        rs.getString("currency"),
                        rs.getLong("price"),
                    )
                },
                itemId,
                optionId,
            ).firstOrNull()

    private fun isOwned(
        userId: Long,
        optionId: Long,
    ): Boolean =
        jdbc.queryForObject(
            "SELECT EXISTS (SELECT 1 FROM housing_store_owned_option WHERE user_id=? AND option_id=?)",
            Boolean::class.java,
            userId,
            optionId,
        ) ?: false

    private fun fail(items: List<ApiErrorItem>): Nothing {
        val code = ApiErrorCode.valueOf(items.first().code)
        throw ApiV1Exception(ApiError(code, items = items))
    }

    private fun com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseItemRequest.error(code: ApiErrorCode) =
        ApiErrorItem(itemId, optionId, code.name)

    private fun List<StoreOption>.sumCost(): Long =
        fold(0L) { total, option ->
            try {
                Math.addExact(total, option.price)
            } catch (_: ArithmeticException) {
                throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
            }
        }

    private data class StoreItem(
        val id: Long,
        val name: String,
        val type: String,
        val unlocked: Boolean,
        val active: Boolean,
    )

    private data class StoreOption(
        val optionId: Long,
        val itemId: Long,
        val itemName: String,
        val itemType: String,
        val optionJson: String,
        val currency: String,
        val price: Long,
    )

    private companion object {
        const val OPERATION_ID = "API-903"
        const val STAR = "STAR"
        const val STARDUST = "STARDUST"
        val logger = LoggerFactory.getLogger(HousingStorePurchaseService::class.java)
        val OPTION_TYPE = object : TypeReference<Map<String, Any?>>() {}
    }
}
