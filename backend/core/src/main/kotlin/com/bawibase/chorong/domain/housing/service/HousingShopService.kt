package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.housing.HousingItemType
import com.bawibase.chorong.domain.housing.dto.PriceResponse
import com.bawibase.chorong.domain.housing.dto.PurchaseResponse
import com.bawibase.chorong.domain.housing.dto.ShopItemResponse
import com.bawibase.chorong.domain.housing.dto.ShopResponse
import com.bawibase.chorong.domain.housing.dto.WalletResponse
import com.bawibase.chorong.domain.housing.entity.HousingOwnedItemEntity
import com.bawibase.chorong.domain.housing.repository.HousingOwnedItemRepository
import com.bawibase.chorong.domain.housing.repository.HousingShopItemRepository
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class HousingShopService(
    private val catalogService: HousingCatalogService,
    private val housingService: HousingService,
    private val shopItems: HousingShopItemRepository,
    private val ownedItems: HousingOwnedItemRepository,
    private val walletService: UserWalletService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun list(userId: Long): ShopResponse {
        val catalog = catalogService.snapshot()
        housingService.ensureProfile(userId, catalog)
        val owned = housingService.ownedSet(userId)
        val items =
            shopItems.findAllByIsActiveTrueOrderBySortOrderAsc().mapNotNull { item ->
                val targetCode = catalog.codeOf(item.itemType, item.itemId) ?: return@mapNotNull null
                ShopItemResponse(
                    id = item.code,
                    type = item.itemType.name.lowercase(),
                    targetId = targetCode,
                    price = PriceResponse(item.priceCoin),
                    owned = (item.itemType to item.itemId) in owned,
                )
            }
        return ShopResponse(items)
    }

    fun purchase(
        userId: Long,
        itemCode: String,
    ): PurchaseResponse {
        val catalog = catalogService.snapshot()
        val profile = housingService.ensureProfile(userId, catalog)
        val item =
            shopItems.findByCode(itemCode)?.takeIf { it.isActive }
                ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("itemId" to itemCode))
        if (catalog.codeOf(item.itemType, item.itemId) == null) {
            throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("itemId" to itemCode))
        }
        if (ownedItems.existsByUserIdAndItemTypeAndItemId(userId, item.itemType, item.itemId)) {
            throw ApiException(ErrorCode.ALREADY_OWNED, mapOf("itemId" to itemCode))
        }
        val wallet = walletService.deduct(userId, item.priceCoin)
        ownedItems.save(HousingOwnedItemEntity(userId = userId, itemType = item.itemType, itemId = item.itemId))
        log.info("shop.purchased userId={} itemId={} price={} balance={}", userId, itemCode, item.priceCoin, wallet.coin)
        if (item.itemType == HousingItemType.ROOM) {
            housingService.createDefaultLayout(userId, item.itemId, catalog)
            if (profile.activeRoomId == null) profile.activeRoomId = item.itemId
        }
        return PurchaseResponse(
            wallet = WalletResponse(wallet.coin),
            owned = housingService.ownedResponse(userId, catalog),
            layouts = housingService.layoutsResponse(userId, catalog),
        )
    }
}
