package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.domain.housing.HousingItemType
import com.bawibase.chorong.domain.housing.dto.CatalogItemResponse
import com.bawibase.chorong.domain.housing.dto.CatalogResponse
import com.bawibase.chorong.domain.housing.dto.FurnitureResponse
import com.bawibase.chorong.domain.housing.dto.RoomResponse
import com.bawibase.chorong.domain.housing.dto.SlotResponse
import com.bawibase.chorong.domain.housing.dto.SurfaceResponse
import com.bawibase.chorong.domain.housing.entity.HousingAvatarEntity
import com.bawibase.chorong.domain.housing.entity.HousingBackgroundEntity
import com.bawibase.chorong.domain.housing.entity.HousingFloorEntity
import com.bawibase.chorong.domain.housing.entity.HousingFurnitureEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSurfaceEntity
import com.bawibase.chorong.domain.housing.entity.HousingWallEntity
import com.bawibase.chorong.domain.housing.repository.HousingAvatarRepository
import com.bawibase.chorong.domain.housing.repository.HousingBackgroundRepository
import com.bawibase.chorong.domain.housing.repository.HousingFloorRepository
import com.bawibase.chorong.domain.housing.repository.HousingFurnitureRepository
import com.bawibase.chorong.domain.housing.repository.HousingFurnitureRoomRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSlotCategoryRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSlotRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSurfaceRepository
import com.bawibase.chorong.domain.housing.repository.HousingWallRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime

class CatalogSnapshot(
    val backgrounds: List<HousingBackgroundEntity>,
    val walls: List<HousingWallEntity>,
    val floors: List<HousingFloorEntity>,
    val avatars: List<HousingAvatarEntity>,
    val furniture: List<HousingFurnitureEntity>,
    val rooms: List<HousingRoomEntity>,
    val surfacesByRoom: Map<Long, List<HousingRoomSurfaceEntity>>,
    val slotsByRoom: Map<Long, List<HousingRoomSlotEntity>>,
    val categoriesBySlot: Map<Long, List<String>>,
    val roomIdsByFurniture: Map<Long, List<Long>>,
) {
    val backgroundByCode = backgrounds.associateBy { it.code }
    val wallByCode = walls.associateBy { it.code }
    val floorByCode = floors.associateBy { it.code }
    val avatarByCode = avatars.associateBy { it.code }
    val furnitureByCode = furniture.associateBy { it.code }
    val roomByCode = rooms.associateBy { it.code }

    val backgroundById = backgrounds.associateBy { checkNotNull(it.id) }
    val wallById = walls.associateBy { checkNotNull(it.id) }
    val floorById = floors.associateBy { checkNotNull(it.id) }
    val avatarById = avatars.associateBy { checkNotNull(it.id) }
    val furnitureById = furniture.associateBy { checkNotNull(it.id) }
    val roomById = rooms.associateBy { checkNotNull(it.id) }

    val surfaceById = surfacesByRoom.values.flatten().associateBy { checkNotNull(it.id) }
    val slotById = slotsByRoom.values.flatten().associateBy { checkNotNull(it.id) }

    fun codeOf(
        type: HousingItemType,
        id: Long,
    ): String? =
        when (type) {
            HousingItemType.BACKGROUND -> backgroundById[id]?.code
            HousingItemType.WALL -> wallById[id]?.code
            HousingItemType.FLOOR -> floorById[id]?.code
            HousingItemType.AVATAR -> avatarById[id]?.code
            HousingItemType.FURNITURE -> furnitureById[id]?.code
            HousingItemType.ROOM -> roomById[id]?.code
        }

    val version: Long =
        listOf(
            backgrounds.map { it.modifiedAt },
            walls.map { it.modifiedAt },
            floors.map { it.modifiedAt },
            avatars.map { it.modifiedAt },
            furniture.map { it.modifiedAt },
            rooms.map { it.modifiedAt },
            surfacesByRoom.values.flatten().map { it.modifiedAt },
            slotsByRoom.values.flatten().map { it.modifiedAt },
        ).flatten().filterNotNull().maxOfOrNull(OffsetDateTime::toEpochSecond) ?: 0
}

@Service
@Transactional(readOnly = true)
class HousingCatalogService(
    private val backgrounds: HousingBackgroundRepository,
    private val walls: HousingWallRepository,
    private val floors: HousingFloorRepository,
    private val avatars: HousingAvatarRepository,
    private val furniture: HousingFurnitureRepository,
    private val furnitureRooms: HousingFurnitureRoomRepository,
    private val rooms: HousingRoomRepository,
    private val surfaces: HousingRoomSurfaceRepository,
    private val slots: HousingRoomSlotRepository,
    private val slotCategories: HousingRoomSlotCategoryRepository,
) {
    fun snapshot(): CatalogSnapshot {
        val roomList = rooms.findAllByIsActiveTrueOrderBySortOrderAsc()
        val roomIds = roomList.map { checkNotNull(it.id) }
        val slotList = slots.findAllByRoomIdInOrderBySortOrderAsc(roomIds)
        val furnitureList = furniture.findAllByIsActiveTrueOrderBySortOrderAsc()
        return CatalogSnapshot(
            backgrounds = backgrounds.findAllByIsActiveTrueOrderBySortOrderAsc(),
            walls = walls.findAllByIsActiveTrueOrderBySortOrderAsc(),
            floors = floors.findAllByIsActiveTrueOrderBySortOrderAsc(),
            avatars = avatars.findAllByIsActiveTrueOrderBySortOrderAsc(),
            furniture = furnitureList,
            rooms = roomList,
            surfacesByRoom = surfaces.findAllByRoomIdInOrderBySortOrderAsc(roomIds).groupBy { it.roomId },
            slotsByRoom = slotList.groupBy { it.roomId },
            categoriesBySlot =
                slotCategories
                    .findAllBySlotIdIn(slotList.map { checkNotNull(it.id) })
                    .groupBy({ it.slotId }, { it.category }),
            roomIdsByFurniture =
                furnitureRooms
                    .findAllByFurnitureIdIn(furnitureList.map { checkNotNull(it.id) })
                    .groupBy({ it.furnitureId }, { it.roomId }),
        )
    }

    fun catalog(): CatalogResponse = snapshot().toResponse()

    private fun CatalogSnapshot.toResponse() =
        CatalogResponse(
            version = version,
            backgrounds = backgrounds.map { CatalogItemResponse(it.code, it.name) },
            walls = walls.map { CatalogItemResponse(it.code, it.name) },
            floors = floors.map { CatalogItemResponse(it.code, it.name) },
            avatars = avatars.map { CatalogItemResponse(it.code, it.name) },
            furniture =
                furniture.map { f ->
                    FurnitureResponse(
                        id = f.code,
                        name = f.name,
                        category = f.category,
                        compatibleRoomIds = roomIdsByFurniture[f.id]?.mapNotNull { roomById[it]?.code },
                    )
                },
            rooms =
                rooms.map { r ->
                    val roomId = checkNotNull(r.id)
                    RoomResponse(
                        id = r.code,
                        name = r.name,
                        surfaces = surfacesByRoom[roomId].orEmpty().map { SurfaceResponse(it.code, it.kind.name.lowercase()) },
                        slots = slotsByRoom[roomId].orEmpty().map { SlotResponse(it.code, categoriesBySlot[it.id].orEmpty()) },
                    )
                },
        )
}
