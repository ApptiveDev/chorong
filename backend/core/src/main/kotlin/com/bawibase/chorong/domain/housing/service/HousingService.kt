package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.ApiException
import com.bawibase.chorong.common.ErrorCode
import com.bawibase.chorong.domain.housing.HousingItemType
import com.bawibase.chorong.domain.housing.SurfaceKind
import com.bawibase.chorong.domain.housing.dto.LayoutRequest
import com.bawibase.chorong.domain.housing.dto.LayoutResponse
import com.bawibase.chorong.domain.housing.dto.MeResponse
import com.bawibase.chorong.domain.housing.dto.OwnedFurnitureResponse
import com.bawibase.chorong.domain.housing.dto.OwnedResponse
import com.bawibase.chorong.domain.housing.dto.PlacementResponse
import com.bawibase.chorong.domain.housing.dto.WalletResponse
import com.bawibase.chorong.domain.housing.entity.HousingLayoutPlacementEntity
import com.bawibase.chorong.domain.housing.entity.HousingLayoutSurfaceSkinEntity
import com.bawibase.chorong.domain.housing.entity.HousingOwnedItemEntity
import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomLayoutEntity
import com.bawibase.chorong.domain.housing.repository.HousingLayoutPlacementRepository
import com.bawibase.chorong.domain.housing.repository.HousingLayoutSurfaceSkinRepository
import com.bawibase.chorong.domain.housing.repository.HousingOwnedItemRepository
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomLayoutRepository
import com.bawibase.chorong.domain.user.service.UserWalletService
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime

@Service
@Transactional
class HousingService(
    private val catalogService: HousingCatalogService,
    private val profiles: HousingProfileRepository,
    private val ownedItems: HousingOwnedItemRepository,
    private val layouts: HousingRoomLayoutRepository,
    private val surfaceSkins: HousingLayoutSurfaceSkinRepository,
    private val placements: HousingLayoutPlacementRepository,
    private val walletService: UserWalletService,
    private val clock: Clock,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun me(userId: Long): MeResponse {
        val catalog = catalogService.snapshot()
        val profile = ensureProfile(userId, catalog)
        return MeResponse(
            wallet = WalletResponse(walletService.ensureWallet(userId).coin),
            owned = ownedResponse(userId, catalog),
            activeRoomId = profile.activeRoomId?.let { catalog.roomById[it]?.code },
            layouts = layoutsResponse(userId, catalog),
        )
    }

    fun saveLayout(
        userId: Long,
        roomCode: String,
        request: LayoutRequest,
    ): LayoutResponse {
        val catalog = catalogService.snapshot()
        ensureProfile(userId, catalog)
        val owned = ownedSet(userId)
        val room = catalog.roomByCode[roomCode] ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("roomId" to roomCode))
        val roomId = checkNotNull(room.id)
        requireOwned(owned, HousingItemType.ROOM, roomId, roomCode)

        val background =
            catalog.backgroundByCode[request.backgroundId]
                ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("backgroundId" to request.backgroundId))
        requireOwned(owned, HousingItemType.BACKGROUND, checkNotNull(background.id), background.code)
        val avatar =
            catalog.avatarByCode[request.avatarId]
                ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("avatarId" to request.avatarId))
        requireOwned(owned, HousingItemType.AVATAR, checkNotNull(avatar.id), avatar.code)

        val surfaces = catalog.surfacesByRoom[roomId].orEmpty()
        if (request.surfaceSkins.keys != surfaces.map { it.code }.toSet()) {
            throw ApiException(ErrorCode.SURFACE_MISMATCH, mapOf("expected" to surfaces.map { it.code }))
        }
        val skinRows =
            surfaces.map { surface ->
                val skinCode = request.surfaceSkins.getValue(surface.code)
                val skinId =
                    when (surface.kind) {
                        SurfaceKind.WALL -> catalog.wallByCode[skinCode]?.id
                        SurfaceKind.FLOOR -> catalog.floorByCode[skinCode]?.id
                    } ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("surfaceId" to surface.code, "skinId" to skinCode))
                requireOwned(owned, surface.kind.toItemType(), skinId, skinCode)
                HousingLayoutSurfaceSkinEntity(layoutId = 0, surfaceId = checkNotNull(surface.id), skinType = surface.kind, skinId = skinId)
            }

        val slotsByCode = catalog.slotsByRoom[roomId].orEmpty().associateBy { it.code }
        val seenSlots = mutableSetOf<String>()
        val placementRows =
            request.placements.map { p ->
                val slot = slotsByCode[p.slotId] ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("slotId" to p.slotId))
                if (!seenSlots.add(p.slotId)) throw ApiException(ErrorCode.SLOT_DUPLICATED, mapOf("slotId" to p.slotId))
                val item =
                    catalog.furnitureByCode[p.furnitureId]
                        ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("furnitureId" to p.furnitureId))
                val itemId = checkNotNull(item.id)
                requireOwned(owned, HousingItemType.FURNITURE, itemId, item.code)
                if (item.category !in catalog.categoriesBySlot[slot.id].orEmpty()) {
                    throw ApiException(ErrorCode.SLOT_CATEGORY_MISMATCH, mapOf("slotId" to p.slotId, "furnitureId" to p.furnitureId))
                }
                val compatible = catalog.roomIdsByFurniture[itemId]
                if (compatible != null && roomId !in compatible) {
                    throw ApiException(ErrorCode.ROOM_INCOMPATIBLE, mapOf("roomId" to roomCode, "furnitureId" to p.furnitureId))
                }
                HousingLayoutPlacementEntity(layoutId = 0, slotId = checkNotNull(slot.id), furnitureId = itemId)
            }

        val layout =
            layouts.findByUserIdAndRoomId(userId, roomId)
                ?: layouts.save(
                    HousingRoomLayoutEntity(
                        userId = userId,
                        roomId = roomId,
                        backgroundId = checkNotNull(background.id),
                        avatarId = checkNotNull(avatar.id),
                    ),
                )
        val layoutId = checkNotNull(layout.id)
        layout.backgroundId = checkNotNull(background.id)
        layout.avatarId = checkNotNull(avatar.id)
        layout.modifiedAt = OffsetDateTime.now(clock)
        surfaceSkins.deleteAllByLayoutId(layoutId)
        placements.deleteAllByLayoutId(layoutId)
        surfaceSkins.flush()
        skinRows.forEach { it.layoutId = layoutId }
        placementRows.forEach { it.layoutId = layoutId }
        surfaceSkins.saveAll(skinRows)
        placements.saveAll(placementRows)

        return layoutResponse(layout, skinRows, placementRows, catalog)
    }

    fun setActiveRoom(
        userId: Long,
        roomCode: String,
    ): String {
        val catalog = catalogService.snapshot()
        val profile = ensureProfile(userId, catalog)
        val room = catalog.roomByCode[roomCode] ?: throw ApiException(ErrorCode.UNKNOWN_ID, mapOf("roomId" to roomCode))
        val roomId = checkNotNull(room.id)
        requireOwned(ownedSet(userId), HousingItemType.ROOM, roomId, roomCode)
        profile.activeRoomId = roomId
        return room.code
    }

    fun ensureProfile(
        userId: Long,
        catalog: CatalogSnapshot,
    ): HousingProfileEntity {
        profiles.findById(userId).orElse(null)?.let { return it }
        val profile = profiles.save(HousingProfileEntity(userId = userId))
        grantDefaults(userId, catalog)
        catalog.rooms.filter { it.isDefault }.forEach { createDefaultLayout(userId, checkNotNull(it.id), catalog) }
        profile.activeRoomId = catalog.rooms.firstOrNull { it.isDefault }?.id
        log.info("housing.profile_created userId={}", userId)
        return profile
    }

    fun createDefaultLayout(
        userId: Long,
        roomId: Long,
        catalog: CatalogSnapshot,
    ) {
        if (layouts.findByUserIdAndRoomId(userId, roomId) != null) return
        val background =
            catalog.backgrounds.firstOrNull { it.isDefault }
                ?: throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING, mapOf("type" to "background"))
        val avatar =
            catalog.avatars.firstOrNull { it.isDefault } ?: throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING, mapOf("type" to "avatar"))
        val wall =
            catalog.walls.firstOrNull { it.isDefault } ?: throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING, mapOf("type" to "wall"))
        val floor =
            catalog.floors.firstOrNull { it.isDefault } ?: throw ApiException(ErrorCode.CATALOG_DEFAULT_MISSING, mapOf("type" to "floor"))
        val layout =
            layouts.save(
                HousingRoomLayoutEntity(
                    userId = userId,
                    roomId = roomId,
                    backgroundId = checkNotNull(background.id),
                    avatarId = checkNotNull(avatar.id),
                ),
            )
        val layoutId = checkNotNull(layout.id)
        surfaceSkins.saveAll(
            catalog.surfacesByRoom[roomId].orEmpty().map { surface ->
                val skinId =
                    when (surface.kind) {
                        SurfaceKind.WALL -> checkNotNull(wall.id)
                        SurfaceKind.FLOOR -> checkNotNull(floor.id)
                    }
                HousingLayoutSurfaceSkinEntity(
                    layoutId = layoutId,
                    surfaceId = checkNotNull(surface.id),
                    skinType = surface.kind,
                    skinId = skinId,
                )
            },
        )
    }

    fun ownedResponse(
        userId: Long,
        catalog: CatalogSnapshot,
    ): OwnedResponse {
        val owned = ownedItems.findAllByUserId(userId).groupBy({ it.itemType }, { it.itemId })

        fun codes(type: HousingItemType) = owned[type].orEmpty().mapNotNull { catalog.codeOf(type, it) }
        return OwnedResponse(
            backgroundIds = codes(HousingItemType.BACKGROUND),
            wallIds = codes(HousingItemType.WALL),
            floorIds = codes(HousingItemType.FLOOR),
            roomIds = codes(HousingItemType.ROOM),
            avatarIds = codes(HousingItemType.AVATAR),
            furniture =
                owned[HousingItemType.FURNITURE]
                    .orEmpty()
                    .mapNotNull { catalog.furnitureById[it] }
                    .map { OwnedFurnitureResponse(it.code, it.category) },
        )
    }

    fun layoutsResponse(
        userId: Long,
        catalog: CatalogSnapshot,
    ): Map<String, LayoutResponse> {
        val layoutList = layouts.findAllByUserId(userId)
        val layoutIds = layoutList.map { checkNotNull(it.id) }
        val skins = surfaceSkins.findAllByLayoutIdIn(layoutIds).groupBy { it.layoutId }
        val placed = placements.findAllByLayoutIdIn(layoutIds).groupBy { it.layoutId }
        return layoutList
            .mapNotNull { layout ->
                val roomCode = catalog.roomById[layout.roomId]?.code ?: return@mapNotNull null
                roomCode to layoutResponse(layout, skins[layout.id].orEmpty(), placed[layout.id].orEmpty(), catalog)
            }.toMap()
    }

    private fun layoutResponse(
        layout: HousingRoomLayoutEntity,
        skins: List<HousingLayoutSurfaceSkinEntity>,
        placed: List<HousingLayoutPlacementEntity>,
        catalog: CatalogSnapshot,
    ) = LayoutResponse(
        backgroundId = catalog.backgroundById[layout.backgroundId]?.code ?: "",
        surfaceSkins =
            skins
                .mapNotNull { s ->
                    val surfaceCode = catalog.surfaceById[s.surfaceId]?.code ?: return@mapNotNull null
                    val skinCode = catalog.codeOf(s.skinType.toItemType(), s.skinId) ?: return@mapNotNull null
                    surfaceCode to skinCode
                }.toMap(),
        avatarId = catalog.avatarById[layout.avatarId]?.code ?: "",
        placements =
            placed.mapNotNull { p ->
                val slotCode = catalog.slotById[p.slotId]?.code ?: return@mapNotNull null
                val furnitureCode = catalog.furnitureById[p.furnitureId]?.code ?: return@mapNotNull null
                PlacementResponse(slotCode, furnitureCode)
            },
        updatedAt = layout.modifiedAt,
    )

    private fun grantDefaults(
        userId: Long,
        catalog: CatalogSnapshot,
    ) {
        val rows =
            buildList {
                catalog.backgrounds.filter { it.isDefault }.forEach { add(HousingItemType.BACKGROUND to checkNotNull(it.id)) }
                catalog.walls.filter { it.isDefault }.forEach { add(HousingItemType.WALL to checkNotNull(it.id)) }
                catalog.floors.filter { it.isDefault }.forEach { add(HousingItemType.FLOOR to checkNotNull(it.id)) }
                catalog.avatars.filter { it.isDefault }.forEach { add(HousingItemType.AVATAR to checkNotNull(it.id)) }
                catalog.furniture.filter { it.isDefault }.forEach { add(HousingItemType.FURNITURE to checkNotNull(it.id)) }
                catalog.rooms.filter { it.isDefault }.forEach { add(HousingItemType.ROOM to checkNotNull(it.id)) }
            }
        ownedItems.saveAll(rows.map { (type, id) -> HousingOwnedItemEntity(userId = userId, itemType = type, itemId = id) })
    }

    fun ownedSet(userId: Long): Set<Pair<HousingItemType, Long>> =
        ownedItems.findAllByUserId(userId).map { it.itemType to it.itemId }.toSet()

    private fun requireOwned(
        owned: Set<Pair<HousingItemType, Long>>,
        type: HousingItemType,
        id: Long,
        code: String,
    ) {
        if ((type to id) !in owned) throw ApiException(ErrorCode.NOT_OWNED, mapOf("type" to type.name.lowercase(), "id" to code))
    }

    private fun SurfaceKind.toItemType() =
        when (this) {
            SurfaceKind.WALL -> HousingItemType.WALL
            SurfaceKind.FLOOR -> HousingItemType.FLOOR
        }
}
