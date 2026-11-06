package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiError
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiErrorItem
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseRequest
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseResponse
import com.bawibase.chorong.domain.idempotency.IdempotencyService
import com.bawibase.chorong.domain.idempotency.IdempotentResponse
import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.bawibase.chorong.domain.user.service.RewardReadService
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.slf4j.LoggerFactory
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HousingStorePurchaseService(
    private val jdbc: JdbcTemplate,
    private val idempotency: IdempotencyService,
    private val wallets: UserWalletService,
    private val inventoryReader: RewardReadService,
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
                option
            }
        if (errors.isNotEmpty()) fail(errors)

        val wallet = wallets.ensureWallet(userId)
        val stardustCost =
            request.items.zip(options).fold(0L) { total, (requested, option) ->
                try {
                    Math.addExact(total, Math.multiplyExact(checkNotNull(option).price, requested.quantity.toLong()))
                } catch (_: ArithmeticException) {
                    throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
                }
            }
        if (wallet.stardust < stardustCost) {
            request.items
                .zip(options)
                .filter { it.second?.currency == STARDUST }
                .forEach { (item, _) -> errors.add(item.error(ApiErrorCode.INSUFFICIENT_BALANCE)) }
        }
        if (errors.isNotEmpty()) fail(errors)

        wallet.stardust -= stardustCost
        request.items.forEach { requested ->
            repeat(requested.quantity) {
                jdbc.update("INSERT INTO housing_store_owned_option (user_id,option_id) VALUES (?,?)", userId, requested.optionId)
            }
        }
        val ownedByOption = inventoryReader.inventory(userId, null).items.associateBy { it.optionId }
        val inventory = options.filterNotNull().distinctBy { it.optionId }.map { checkNotNull(ownedByOption[it.optionId]) }
        logger.info("shop.store_purchased userId={} itemCount={} stardust={}", userId, inventory.size, stardustCost)
        return HousingStorePurchaseResponse(inventory, WalletBalancesResponse(wallet.stardust))
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
               WHERE o.item_id=? AND o.option_id=? AND o.is_active AND o.currency='STARDUST'""",
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

    private fun fail(items: List<ApiErrorItem>): Nothing {
        val code = ApiErrorCode.valueOf(items.first().code)
        throw ApiV1Exception(ApiError(code, items = items))
    }

    private fun com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseItemRequest.error(code: ApiErrorCode) =
        ApiErrorItem(itemId, optionId, code.name)

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
        const val STARDUST = "STARDUST"
        val logger = LoggerFactory.getLogger(HousingStorePurchaseService::class.java)
    }
}
