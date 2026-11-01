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
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserWalletRepository
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.context.annotation.Import
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
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

    @Autowired lateinit var auths: UserAuthRepository

    @Autowired lateinit var objectMapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    private val header = HttpHeaders.AUTHORIZATION

    /** 이메일·비밀번호 가입으로 Bearer 헤더 값을 받는다. */
    private fun login(email: String): String {
        val body =
            mockMvc
                .post("/api/auth/password/signup") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"email":"$email","password":"password123"}"""
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response.contentAsString
        return "Bearer " + objectMapper.readTree(body)["accessToken"].asText()
    }

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
    fun `me without token is rejected`() {
        mockMvc.get("/api/housing/me").andExpect {
            status { isUnauthorized() }
            jsonPath("$.code") { value("UNAUTHORIZED") }
        }
    }

    @Test
    fun `first me call creates user with defaults and layout`() {
        val device = login("h-${UUID.randomUUID()}@test.local")
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
    fun `v1 home returns saved housing and legacy layouts without invented coordinates`() {
        val device = login("v1-h-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, device) }.andExpect { status { isOk() } }
        mockMvc.get("/api/v1/housings/me") { header(header, device) }.andExpect {
            status { isOk() }
            jsonPath("$.data.housing.name") { value("나의 우주") }
            jsonPath("$.data.housing.isPublic") { value(false) }
            jsonPath("$.data.housing.likeCount") { value(0) }
            jsonPath("$.data.placements.length()") { value(0) }
            jsonPath("$.data.avatar") { value(null) }
            jsonPath("$.data.activeRoomId") { value("room_basic") }
            jsonPath("$.data.legacyLayouts.room_basic.avatarId") { value("av_cat") }
        }
    }

    @Test
    fun `v1 coordinate placement replaces owned items and leaves legacy layout intact`() {
        val token = login("v1-placement-${UUID.randomUUID()}@test.local")
        val inventoryBody =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val furnitureInventoryId =
            objectMapper
                .readTree(inventoryBody)["data"]["items"]
                .first { it["itemType"].asText() == "FURNITURE" }["inventoryId"]
                .asText()

        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"placements":[{"inventoryId":"$furnitureInventoryId","area":"INTERIOR","transform":{"x":0.35,"y":0.7,"rotation":90,"layer":2}}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements.length()") { value(1) }
                jsonPath("$.data.placements[0].inventoryId") { value(furnitureInventoryId) }
                jsonPath("$.data.placements[0].transform.x") { value(0.35) }
            }
        mockMvc.get("/api/v1/housings/me") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.placements.length()") { value(1) }
            jsonPath("$.data.legacyLayouts.room_basic.avatarId") { value("av_cat") }
        }
        mockMvc.get("/api/v1/users/me/inventory") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items[?(@.inventoryId=='$furnitureInventoryId')].placed[0]") { value(true) }
        }

        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$furnitureInventoryId","area":"EXTERIOR","transform":{"x":0.5,"y":0.5}}]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("PLACEMENT_AREA_MISMATCH") }
            }

        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements.length()") { value(0) }
            }
    }

    @Test
    fun `v1 shop list filters store items and reports option prices and ownership`() {
        val email = "v1-store-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        val furnitureItemId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO housing_store_item(name,item_type,sort_order) VALUES ('Store chair','FURNITURE',1) RETURNING item_id""",
                    Long::class.java,
                ),
            )
        val objectItemId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO housing_store_item(name,item_type,unlocked,unlock_hint,sort_order) VALUES ('Locked object','OBJECT',FALSE,'Complete a lesson',2) RETURNING item_id""",
                    Long::class.java,
                ),
            )
        val ownedOptionId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO housing_store_option(item_id,option_json,currency,price,preview_asset,sort_order)
                       VALUES (?, '{"color":"blue"}', 'STAR', 10, 'store/chair-blue.png', 1) RETURNING option_id""",
                    Long::class.java,
                    furnitureItemId,
                ),
            )
        jdbc.update(
            """INSERT INTO housing_store_option(item_id,option_json,currency,price,preview_asset,sort_order)
               VALUES (?, '{"color":"red"}', 'STARDUST', 5, 'store/chair-red.png', 2)""",
            furnitureItemId,
        )
        jdbc.update("INSERT INTO housing_store_owned_option(user_id,option_id) VALUES (?,?)", userId, ownedOptionId)
        jdbc.update(
            """INSERT INTO housing_store_option(item_id,option_json,currency,price,preview_asset)
               VALUES (?, '{"shape":"round"}', 'STARDUST', 20, 'store/object-round.png')""",
            objectItemId,
        )

        val allItemsBody =
            mockMvc
                .get("/api/v1/shop/items") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val items = objectMapper.readTree(allItemsBody)["data"]["items"]
        assertEquals(2, items.size())
        val furnitureItem = items.first { it["itemId"].asLong() == furnitureItemId }
        assertEquals(2, furnitureItem["options"].size())
        assertEquals("STARDUST", furnitureItem["minPrice"]["currency"].asText())
        assertEquals(5, furnitureItem["minPrice"]["amount"].asInt())
        assertTrue(furnitureItem["options"][0]["owned"].asBoolean())
        assertFalse(furnitureItem["options"][1]["owned"].asBoolean())
        val lockedItem = items.first { it["itemId"].asLong() == objectItemId }
        assertFalse(lockedItem["unlocked"].asBoolean())
        assertEquals("Complete a lesson", lockedItem["unlockHint"].asText())

        val detailBody =
            mockMvc
                .get("/api/v1/shop/items/$furnitureItemId") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val detail = objectMapper.readTree(detailBody)["data"]
        assertEquals(furnitureItem, detail["item"])
        assertEquals(furnitureItem["options"], detail["options"])

        mockMvc.get("/api/v1/shop/items/$objectItemId") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.item.unlocked") { value(false) }
            jsonPath("$.data.options.length()") { value(1) }
        }
        mockMvc.get("/api/v1/shop/items/9223372036854775807") { header(header, token) }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("NOT_FOUND") }
        }
        mockMvc.get("/api/v1/shop/items?itemType=FURNITURE") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items.length()") { value(1) }
            jsonPath("$.data.items[0].itemType") { value("FURNITURE") }
        }
        mockMvc.get("/api/v1/shop/items?itemType=INVALID") { header(header, token) }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
        }
    }

    @Test
    fun `v1 bulk store purchase debits wallet and adds placeable inventory`() {
        val email = "v1-purchase-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        val itemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_item(name,item_type) VALUES ('Purchased chair','FURNITURE') RETURNING item_id",
                    Long::class.java,
                ),
            )
        val optionId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO housing_store_option(item_id,option_json,currency,price,preview_asset)
                       VALUES (?, '{"color":"green"}', 'STAR', 10, 'store/chair-green.png') RETURNING option_id""",
                    Long::class.java,
                    itemId,
                ),
            )
        jdbc.update("UPDATE user_wallet SET star=50 WHERE user_id=?", userId)
        val body = """{"items":[{"itemId":$itemId,"optionId":$optionId}]}"""
        val idempotencyKey = "purchase-${UUID.randomUUID()}"
        val firstResponse =
            mockMvc
                .post("/api/v1/shop/purchases") {
                    header(header, token)
                    header("Idempotency-Key", idempotencyKey)
                    contentType = MediaType.APPLICATION_JSON
                    content = body
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.wallet.star") { value(40) }
                    jsonPath("$.data.inventoryItems[0].itemId") { value(itemId.toInt()) }
                    jsonPath("$.data.inventoryItems[0].option.color") { value("green") }
                }.andReturn()
        val inventoryId = objectMapper.readTree(firstResponse.response.contentAsString)["data"]["inventoryItems"][0]["inventoryId"].asText()
        mockMvc
            .post("/api/v1/shop/purchases") {
                header(header, token)
                header("Idempotency-Key", idempotencyKey)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.inventoryItems[0].inventoryId") { value(inventoryId) }
                jsonPath("$.data.wallet.star") { value(40) }
            }
        mockMvc.get("/api/v1/users/me/inventory") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items[?(@.inventoryId=='$inventoryId')].placed[0]") { value(false) }
        }
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$inventoryId","area":"INTERIOR","transform":{"x":0.3,"y":0.6}}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements[0].inventoryId") { value(inventoryId) }
            }
        mockMvc.get("/api/v1/users/me/inventory") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items[?(@.inventoryId=='$inventoryId')].placed[0]") { value(true) }
        }
    }

    @Test
    fun `v1 profile patch updates member settings and rejects guest visibility changes`() {
        val memberToken = login("v1-p-${UUID.randomUUID()}@test.local")
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, memberToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"새로운 우주","isPublic":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.name") { value("새로운 우주") }
                jsonPath("$.data.isPublic") { value(true) }
            }
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, memberToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":""}"""
            }.andExpect { status { isBadRequest() } }

        val guestBody =
            mockMvc
                .post("/api/v1/auth/guest") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"deviceUuid":"${UUID.randomUUID()}","platform":"ANDROID"}"""
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val guestToken = "Bearer " + objectMapper.readTree(guestBody)["data"]["accessToken"].asText()
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, guestToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"게스트 방"}"""
            }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, guestToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect {
                status { isForbidden() }
                jsonPath("$.error.code") { value("MEMBER_ONLY") }
            }
    }

    @Test
    fun `layout save validates and persists`() {
        val device = login("h-${UUID.randomUUID()}@test.local")
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
        val email = "h-${UUID.randomUUID()}@test.local"
        val device = login(email)
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

        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
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
