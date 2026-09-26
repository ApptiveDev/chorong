package com.bawibase.chorong.domain.housing

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.housing.entity.HousingAvatarEntity
import com.bawibase.chorong.domain.housing.entity.HousingBackgroundEntity
import com.bawibase.chorong.domain.housing.entity.HousingFloorEntity
import com.bawibase.chorong.domain.housing.entity.HousingFurnitureEntity
import com.bawibase.chorong.domain.housing.entity.HousingLayoutPlacementEntity
import com.bawibase.chorong.domain.housing.entity.HousingLayoutSurfaceSkinEntity
import com.bawibase.chorong.domain.housing.entity.HousingOwnedItemEntity
import com.bawibase.chorong.domain.housing.entity.HousingProfileEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomLayoutEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotCategoryEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSurfaceEntity
import com.bawibase.chorong.domain.housing.entity.HousingWallEntity
import com.bawibase.chorong.domain.housing.repository.HousingAvatarRepository
import com.bawibase.chorong.domain.housing.repository.HousingBackgroundRepository
import com.bawibase.chorong.domain.housing.repository.HousingFloorRepository
import com.bawibase.chorong.domain.housing.repository.HousingFurnitureRepository
import com.bawibase.chorong.domain.housing.repository.HousingLayoutPlacementRepository
import com.bawibase.chorong.domain.housing.repository.HousingLayoutSurfaceSkinRepository
import com.bawibase.chorong.domain.housing.repository.HousingOwnedItemRepository
import com.bawibase.chorong.domain.housing.repository.HousingProfileRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomLayoutRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSlotCategoryRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSlotRepository
import com.bawibase.chorong.domain.housing.repository.HousingRoomSurfaceRepository
import com.bawibase.chorong.domain.housing.repository.HousingWallRepository
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.entity.UserAuthEntity
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.dao.DataIntegrityViolationException
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

@SpringBootTest
@Import(TestcontainersConfig::class)
class HousingRepositoryTest {
    @Autowired lateinit var users: UserRepository

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var backgrounds: HousingBackgroundRepository

    @Autowired lateinit var walls: HousingWallRepository

    @Autowired lateinit var floors: HousingFloorRepository

    @Autowired lateinit var avatars: HousingAvatarRepository

    @Autowired lateinit var furniture: HousingFurnitureRepository

    @Autowired lateinit var rooms: HousingRoomRepository

    @Autowired lateinit var surfaces: HousingRoomSurfaceRepository

    @Autowired lateinit var slots: HousingRoomSlotRepository

    @Autowired lateinit var slotCategories: HousingRoomSlotCategoryRepository

    @Autowired lateinit var profiles: HousingProfileRepository

    @Autowired lateinit var ownedItems: HousingOwnedItemRepository

    @Autowired lateinit var layouts: HousingRoomLayoutRepository

    @Autowired lateinit var surfaceSkins: HousingLayoutSurfaceSkinRepository

    @Autowired lateinit var placements: HousingLayoutPlacementRepository

    @Test
    fun `catalog, profile and layout round trip`() {
        val suffix = UUID.randomUUID().toString().take(8)
        val bg = backgrounds.save(HousingBackgroundEntity(code = "bg_$suffix", name = "숲"))
        val wall = walls.save(HousingWallEntity(code = "wall_$suffix", name = "벽돌"))
        val floor = floors.save(HousingFloorEntity(code = "floor_$suffix", name = "원목"))
        val avatar = avatars.save(HousingAvatarEntity(code = "av_$suffix", name = "고양이"))
        val chair = furniture.save(HousingFurnitureEntity(code = "fn_$suffix", name = "의자", category = "chair"))
        val room = rooms.save(HousingRoomEntity(code = "room_$suffix", name = "기본 방"))
        val roomId = checkNotNull(room.id)

        val wallLeft = surfaces.save(HousingRoomSurfaceEntity(roomId = roomId, code = "wall_left", kind = SurfaceKind.WALL, sortOrder = 0))
        surfaces.save(HousingRoomSurfaceEntity(roomId = roomId, code = "floor", kind = SurfaceKind.FLOOR, sortOrder = 1))
        val slot = slots.save(HousingRoomSlotEntity(roomId = roomId, code = "s_floor_1"))
        slotCategories.save(HousingRoomSlotCategoryEntity(slotId = checkNotNull(slot.id), category = "chair"))

        val user = users.save(UserEntity())
        val userId = checkNotNull(user.id)
        auths.save(UserAuthEntity(userId = userId, provider = AuthProvider.GUEST, providerUid = UUID.randomUUID().toString()))
        profiles.save(HousingProfileEntity(userId = userId, activeRoomId = roomId))
        ownedItems.save(HousingOwnedItemEntity(userId = userId, itemType = HousingItemType.ROOM, itemId = roomId))

        val layout =
            layouts.save(
                HousingRoomLayoutEntity(
                    userId = userId,
                    roomId = roomId,
                    backgroundId = checkNotNull(bg.id),
                    avatarId = checkNotNull(avatar.id),
                ),
            )
        val layoutId = checkNotNull(layout.id)
        surfaceSkins.save(
            HousingLayoutSurfaceSkinEntity(
                layoutId = layoutId,
                surfaceId = checkNotNull(wallLeft.id),
                skinType = SurfaceKind.WALL,
                skinId = checkNotNull(wall.id),
            ),
        )
        placements.save(
            HousingLayoutPlacementEntity(layoutId = layoutId, slotId = checkNotNull(slot.id), furnitureId = checkNotNull(chair.id)),
        )

        assertEquals(2, surfaces.findAllByRoomIdInOrderBySortOrderAsc(listOf(roomId)).size)
        assertEquals(listOf("chair"), slotCategories.findAllBySlotIdIn(listOf(checkNotNull(slot.id))).map { it.category })
        assertTrue(ownedItems.existsByUserIdAndItemTypeAndItemId(userId, HousingItemType.ROOM, roomId))
        assertEquals(listOf(AuthProvider.GUEST), auths.findAllByUserId(userId).map { it.provider })
        assertNotNull(profiles.findById(userId).orElse(null))
        assertEquals(layoutId, layouts.findByUserIdAndRoomId(userId, roomId)?.id)
        assertEquals(1, surfaceSkins.findAllByLayoutIdIn(listOf(layoutId)).size)
        assertEquals(1, placements.findAllByLayoutIdIn(listOf(layoutId)).size)
        assertEquals(floor.code, floors.findByCode(floor.code)?.code)

        assertThrows<DataIntegrityViolationException> {
            layouts.save(
                HousingRoomLayoutEntity(
                    userId = userId,
                    roomId = roomId,
                    backgroundId = checkNotNull(bg.id),
                    avatarId = checkNotNull(avatar.id),
                ),
            )
        }
    }
}
