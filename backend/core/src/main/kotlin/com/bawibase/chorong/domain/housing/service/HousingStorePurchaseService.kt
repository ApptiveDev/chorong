package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiError
import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiErrorItem
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.housing.dto.HousingCoordinatePlacementBatchRequest
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
    private val housing: HousingService,
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
        // newInventoryIds[i][n] 은 items 의 i 번째 항목에서 n 번째로 산 보유 ID 다.
        val newInventoryIds =
            request.items.map { requested ->
                List(requested.quantity) {
                    checkNotNull(
                        jdbc.queryForObject(
                            "INSERT INTO housing_store_owned_option (user_id,option_id) VALUES (?,?) RETURNING inventory_id",
                            Long::class.java,
                            userId,
                            requested.optionId,
                        ),
                    )
                }
            }
        // 배치 검증이 실패하면 예외가 트랜잭션 전체를 되돌려 차감과 구매분도 남지 않는다.
        val placements =
            request.placements?.let { requested ->
                val resolved = requested.map { it.copy(inventoryId = resolveInventoryId(it.inventoryId, newInventoryIds)) }
                housing.saveCoordinatePlacements(userId, HousingCoordinatePlacementBatchRequest(resolved)).placements
            }
        val ownedByOption = inventoryReader.inventory(userId, null).items.associateBy { it.optionId }
        val inventory = options.filterNotNull().distinctBy { it.optionId }.map { checkNotNull(ownedByOption[it.optionId]) }
        logger.info("shop.store_purchased userId={} itemCount={} stardust={}", userId, inventory.size, stardustCost)
        return HousingStorePurchaseResponse(inventory, wallets.balances(wallet), placements)
    }

    /** `new:{index}:{n}` 을 이번 구매분의 `store:{id}` 로 바꾼다. 범위를 벗어나면 미보유(ERR-30)다. */
    private fun resolveInventoryId(
        inventoryId: String,
        newInventoryIds: List<List<Long>>,
    ): String {
        if (!inventoryId.startsWith(NEW_PREFIX)) return inventoryId
        val parts = inventoryId.removePrefix(NEW_PREFIX).split(':')
        val index = parts.getOrNull(0)?.takeIf { it.all(Char::isDigit) }?.toIntOrNull()
        val copy = parts.getOrNull(1)?.takeIf { it.all(Char::isDigit) }?.toIntOrNull()
        val id =
            if (parts.size == 2 && index != null && copy != null) newInventoryIds.getOrNull(index)?.getOrNull(copy) else null
        return STORE_PREFIX + (id ?: throw ApiV1Exception(ApiErrorCode.INVENTORY_ITEM_NOT_OWNED))
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
        const val NEW_PREFIX = "new:"
        const val STORE_PREFIX = "store:"
        val logger = LoggerFactory.getLogger(HousingStorePurchaseService::class.java)
    }
}
