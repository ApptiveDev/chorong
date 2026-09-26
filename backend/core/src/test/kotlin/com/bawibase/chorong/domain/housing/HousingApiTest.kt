package com.bawibase.chorong.domain.housing

import com.bawibase.chorong.TestcontainersConfig
import com.bawibase.chorong.domain.housing.entity.HousingAvatarEntity
import com.bawibase.chorong.domain.housing.entity.HousingBackgroundEntity
import com.bawibase.chorong.domain.housing.entity.HousingFloorEntity
import com.bawibase.chorong.domain.housing.entity.HousingFurnitureEntity
import com.bawibase.chorong.domain.housing.entity.HousingFurnitureRoomEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotCategoryEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSlotEntity
import com.bawibase.chorong.domain.housing.entity.HousingRoomSurfaceEntity
import com.bawibase.chorong.domain.housing.entity.HousingShopItemEntity
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
import com.bawibase.chorong.domain.housing.repository.HousingShopItemRepository
import com.bawibase.chorong.domain.housing.repository.HousingWallRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfig::class)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class HousingApiTest {
    @Autowired lateinit var mockMvc: MockMvc

    @Autowired lateinit var backgrounds: HousingBackgroundRepository

    @Autowired lateinit var walls: HousingWallRepository

    @Autowired lateinit var floors: HousingFloorRepository

    @Autowired lateinit var avatars: HousingAvatarRepository

    @Autowired lateinit var furniture: HousingFurnitureRepository

    @Autowired lateinit var furnitureRooms: HousingFurnitureRoomRepository

    @Autowired lateinit var rooms: HousingRoomRepository

    @Autowired lateinit var surfaces: HousingRoomSurfaceRepository

    @Autowired lateinit var slots: HousingRoomSlotRepository

    @Autowired lateinit var slotCategories: HousingRoomSlotCategoryRepository

    @Autowired lateinit var shopItems: HousingShopItemRepository

    @Autowired lateinit var wallets: UserWalletRepository

    @Autowired lateinit var users: UserRepository

    private val header = "X-Device-Id"

    @BeforeAll
    fun seed() {
        if (rooms.findByCode("room_basic") != null) return
        backgrounds.save(HousingBackgroundEntity(code = "bg_forest", name = "숲", isDefault = true))
        walls.save(HousingWallEntity(code = "wall_brick", name = "벽돌", isDefault = true))
        val bluePaper = walls.save(HousingWallEntity(code = "wall_paper_blue", name = "파란 벽지"))
        floors.save(HousingFloorEntity(code = "floor_wood", name = "원목", isDefault = true))
        avatars.save(HousingAvatarEntity(code = "av_cat", name = "고양이", isDefault = true))
        furniture.save(HousingFurnitureEntity(code = "fn_chair_wood", name = "나무 의자", category = "chair", isDefault = true))
        furniture.save(HousingFurnitureEntity(code = "fn_frame_sun", name = "해 액자", category = "frame", isDefault = true))
        val atticLamp = furniture.save(HousingFurnitureEntity(code = "fn_lamp_attic", name = "다락 램프", category = "lamp", isDefault = true))
        val basic = rooms.save(HousingRoomEntity(code = "room_basic", name = "기본 방", isDefault = true))
        val attic = rooms.save(HousingRoomEntity(code = "room_attic", name = "다락방"))
        furnitureRooms.save(HousingFurnitureRoomEntity(furnitureId = checkNotNull(atticLamp.id), roomId = checkNotNull(attic.id)))
        for (room in listOf(basic, attic)) {
            val roomId = checkNotNull(room.id)
            surfaces.save(HousingRoomSurfaceEntity(roomId = roomId, code = "wall_left", kind = SurfaceKind.WALL, sortOrder = 0))
            surfaces.save(HousingRoomSurfaceEntity(roomId = roomId, code = "wall_right", kind = SurfaceKind.WALL, sortOrder = 1))
            surfaces.save(HousingRoomSurfaceEntity(roomId = roomId, code = "floor", kind = SurfaceKind.FLOOR, sortOrder = 2))
            val floorSlot = slots.save(HousingRoomSlotEntity(roomId = roomId, code = "s_floor_1", sortOrder = 0))
            val wallSlot = slots.save(HousingRoomSlotEntity(roomId = roomId, code = "s_wall_l1", sortOrder = 1))
            slotCategories.save(HousingRoomSlotCategoryEntity(slotId = checkNotNull(floorSlot.id), category = "chair"))
            slotCategories.save(HousingRoomSlotCategoryEntity(slotId = checkNotNull(floorSlot.id), category = "lamp"))
            slotCategories.save(HousingRoomSlotCategoryEntity(slotId = checkNotNull(wallSlot.id), category = "frame"))
        }
        shopItems.save(
            HousingShopItemEntity(
                code = "shop_wall_paper_blue",
                itemType = HousingItemType.WALL,
                itemId = checkNotNull(bluePaper.id),
                priceCoin = 300,
                sortOrder = 0,
            ),
        )
        shopItems.save(
            HousingShopItemEntity(
                code = "shop_room_attic",
                itemType = HousingItemType.ROOM,
                itemId = checkNotNull(attic.id),
                priceCoin = 1000,
                sortOrder = 1,
            ),
        )
    }

    @Test
    fun `catalog lists rooms with surfaces and slots`() {
        mockMvc.get("/api/housing/catalog").andExpect {
            status { isOk() }
            jsonPath("$.rooms[?(@.id=='room_basic')].surfaces.length()") { value(3) }
            jsonPath("$.rooms[?(@.id=='room_basic')].slots[0].allowedCategories") { isArray() }
            jsonPath("$.furniture[?(@.id=='fn_lamp_attic')].compatibleRoomIds[0]") { value("room_attic") }
            jsonPath("$.furniture[?(@.id=='fn_chair_wood')].compatibleRoomIds") { doesNotExist() }
        }
    }

    @Test
    fun `me without header is rejected`() {
        mockMvc.get("/api/housing/me").andExpect {
            status { isBadRequest() }
            jsonPath("$.code") { value("HEADER_REQUIRED") }
        }
    }

    @Test
    fun `first me call creates user with defaults and layout`() {
        val device = UUID.randomUUID().toString()
        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect {
            status { isOk() }
            jsonPath("$.wallet.coin") { value(0) }
            jsonPath("$.activeRoomId") { value("room_basic") }
            jsonPath("$.owned.roomIds[0]") { value("room_basic") }
            jsonPath("$.owned.furniture.length()") { value(3) }
            jsonPath("$.layouts.room_basic.surfaceSkins.wall_left") { value("wall_brick") }
            jsonPath("$.layouts.room_basic.surfaceSkins.floor") { value("floor_wood") }
            jsonPath("$.layouts.room_basic.placements.length()") { value(0) }
        }
        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect { status { isOk() } }
    }

    @Test
    fun `layout save validates and persists`() {
        val device = UUID.randomUUID().toString()
        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect { status { isOk() } }

        mockMvc
            .put("/api/housing/me/rooms/room_basic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_brick","wall_right":"wall_brick","floor":"floor_wood"},
                "placements":[{"slotId":"s_floor_1","furnitureId":"fn_frame_sun"}]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("SLOT_CATEGORY_MISMATCH") }
                jsonPath("$.details.slotId") { value("s_floor_1") }
            }

        mockMvc
            .put("/api/housing/me/rooms/room_basic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_brick","wall_right":"wall_brick","floor":"floor_wood"},
                "placements":[{"slotId":"s_floor_1","furnitureId":"fn_lamp_attic"}]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("ROOM_INCOMPATIBLE") }
            }

        mockMvc
            .put("/api/housing/me/rooms/room_basic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_brick","floor":"floor_wood"},
                "placements":[]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("SURFACE_MISMATCH") }
            }

        mockMvc
            .put("/api/housing/me/rooms/room_basic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_paper_blue","wall_right":"wall_brick","floor":"floor_wood"},
                "placements":[]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("NOT_OWNED") }
            }

        mockMvc
            .put("/api/housing/me/rooms/room_basic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_brick","wall_right":"wall_brick","floor":"floor_wood"},
                "placements":[{"slotId":"s_floor_1","furnitureId":"fn_chair_wood"},{"slotId":"s_wall_l1","furnitureId":"fn_frame_sun"}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.placements.length()") { value(2) }
                jsonPath("$.updatedAt") { exists() }
            }

        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect {
            status { isOk() }
            jsonPath("$.layouts.room_basic.placements.length()") { value(2) }
            jsonPath("$.layouts.room_basic.placements[?(@.slotId=='s_wall_l1')].furnitureId") { value("fn_frame_sun") }
        }

        mockMvc
            .put("/api/housing/me/rooms/room_attic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat","surfaceSkins":{},"placements":[]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("NOT_OWNED") }
            }
    }

    @Test
    fun `shop purchase deducts coin and unlocks room`() {
        val device = UUID.randomUUID().toString()
        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect { status { isOk() } }

        mockMvc.get("/api/housing/shop") { header(header, device) }.andExpect {
            status { isOk() }
            jsonPath("$.items[?(@.id=='shop_room_attic')].owned") { value(false) }
            jsonPath("$.items[?(@.id=='shop_room_attic')].type") { value("room") }
        }

        mockMvc
            .post("/api/housing/shop/purchase") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"itemId":"shop_room_attic"}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.code") { value("INSUFFICIENT_COIN") }
            }

        val userId = checkNotNull(checkNotNull(users.findByDeviceUuid(device)).id)
        val wallet = wallets.findById(userId).orElseThrow()
        wallet.coin = 1500
        wallets.save(wallet)

        mockMvc
            .post("/api/housing/shop/purchase") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"itemId":"shop_room_attic"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.wallet.coin") { value(500) }
                jsonPath("$.owned.roomIds.length()") { value(2) }
                jsonPath("$.layouts.room_attic.surfaceSkins.wall_right") { value("wall_brick") }
            }

        mockMvc
            .post("/api/housing/shop/purchase") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"itemId":"shop_room_attic"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("ALREADY_OWNED") }
            }

        mockMvc
            .put("/api/housing/me/active-room") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"roomId":"room_attic"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.activeRoomId") { value("room_attic") }
            }

        mockMvc
            .put("/api/housing/me/rooms/room_attic/layout") {
                header(header, device)
                contentType = MediaType.APPLICATION_JSON
                content = """{"backgroundId":"bg_forest","avatarId":"av_cat",
                "surfaceSkins":{"wall_left":"wall_brick","wall_right":"wall_brick","floor":"floor_wood"},
                "placements":[{"slotId":"s_floor_1","furnitureId":"fn_lamp_attic"}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.placements[0].furnitureId") { value("fn_lamp_attic") }
            }
    }
}
