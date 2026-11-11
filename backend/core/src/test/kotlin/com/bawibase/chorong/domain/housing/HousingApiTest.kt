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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

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
            jsonPath("$.data.housing.isPublic") { value(true) }
            jsonPath("$.data.housing.likeCount") { value(0) }
            jsonPath("$.data.placements.length()") { value(0) }
            jsonPath("$.data.avatar.x") { value(0.5) }
            jsonPath("$.data.avatar.y") { value(0.5) }
            jsonPath("$.data.avatar.state") { value("IDLE") }
            jsonPath("$.data.avatar.placementId") { value(null) }
            jsonPath("$.data.activeRoomId") { value("room_basic") }
            jsonPath("$.data.legacyLayouts.room_basic.avatarId") { value("av_cat") }
        }
    }

    @Test
    fun `v1 inventory omits option fields for legacy items`() {
        val token = login("v1-inventory-null-option-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }

        val inventory =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val items = objectMapper.readTree(inventory)["data"]["items"]
        assertTrue(items.size() > 0)
        assertTrue(
            items.all {
                !it.has("optionId") && !it.has("option") && it["copies"].all { copy -> copy["acquiredVia"].asText() == "STARTER" }
            },
        )
    }

    @Test
    fun `v1 home and public housing return the same saved avatar state`() {
        val ownerEmail = "v1-avatar-owner-${UUID.randomUUID()}@test.local"
        val ownerToken = login(ownerEmail)
        val viewerToken = login("v1-avatar-viewer-${UUID.randomUUID()}@test.local")
        val ownerId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, ownerEmail)).userId
        mockMvc.get("/api/v1/housings/me") { header(header, ownerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.avatar.x") { value(0.5) }
            jsonPath("$.data.avatar.y") { value(0.5) }
            jsonPath("$.data.avatar.state") { value("IDLE") }
        }
        jdbc.update(
            "INSERT INTO housing_avatar_state(user_id,x,y,state,placement_id) VALUES (?,0.23,0.81,'SIT',NULL)",
            ownerId,
        )
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, ownerToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect { status { isOk() } }

        mockMvc.get("/api/v1/housings/me") { header(header, ownerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.avatar.x") { value(0.23) }
            jsonPath("$.data.avatar.y") { value(0.81) }
            jsonPath("$.data.avatar.state") { value("SIT") }
            jsonPath("$.data.avatar.placementId") { value(null) }
        }
        mockMvc.get("/api/v1/housings/$ownerId") { header(header, viewerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.avatar.x") { value(0.23) }
            jsonPath("$.data.avatar.y") { value(0.81) }
            jsonPath("$.data.avatar.state") { value("SIT") }
            jsonPath("$.data.avatar.placementId") { value(null) }
        }
    }

    @Test
    fun `v1 avatar patch validates and persists avatar state and owned placement`() {
        val email = "v1-avatar-patch-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }
        val inventoryBody =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andReturn()
                .response.contentAsString
        val furnitureInventoryId =
            objectMapper
                .readTree(inventoryBody)["data"]["items"]
                .first { it["itemType"].asText() == "FURNITURE" }["copies"][0]["inventoryId"]
                .asText()
        val placementsBody =
            mockMvc
                .put("/api/v1/housings/me/placements") {
                    header(header, token)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"placements":[{"inventoryId":"$furnitureInventoryId","area":"INTERIOR","transform":{"x":0.3,"y":0.4}}]}"""
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val placementId = objectMapper.readTree(placementsBody)["data"]["placements"][0]["placementId"].asLong()
        val otherToken = login("v1-avatar-other-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, otherToken) }.andExpect { status { isOk() } }
        val otherInventoryBody =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, otherToken) }
                .andReturn()
                .response.contentAsString
        val otherFurnitureInventoryId =
            objectMapper
                .readTree(otherInventoryBody)["data"]["items"]
                .first { it["itemType"].asText() == "FURNITURE" }["copies"][0]["inventoryId"]
                .asText()
        val otherPlacementBody =
            mockMvc
                .put("/api/v1/housings/me/placements") {
                    header(header, otherToken)
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """{"placements":[{"inventoryId":"$otherFurnitureInventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5}}]}"""
                }.andReturn()
                .response.contentAsString
        val otherPlacementId = objectMapper.readTree(otherPlacementBody)["data"]["placements"][0]["placementId"].asLong()

        mockMvc
            .patch("/api/v1/housings/me/avatar") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"x":0.25,"y":0.75,"state":"SLEEP","placementId":$placementId}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.x") { value(0.25) }
                jsonPath("$.data.y") { value(0.75) }
                jsonPath("$.data.state") { value("SLEEP") }
                jsonPath("$.data.placementId") { value(placementId) }
            }
        mockMvc.get("/api/v1/housings/me") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.avatar.x") { value(0.25) }
            jsonPath("$.data.avatar.y") { value(0.75) }
            jsonPath("$.data.avatar.state") { value("SLEEP") }
            jsonPath("$.data.avatar.placementId") { value(placementId) }
        }
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$furnitureInventoryId","area":"INTERIOR","transform":{"x":0.2,"y":0.6}}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements[0].placementId") { value(placementId) }
            }
        mockMvc.get("/api/v1/housings/me") { header(header, token) }.andExpect {
            jsonPath("$.data.avatar.placementId") { value(placementId) }
        }
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM housing_avatar_state WHERE user_id=?", Int::class.java, userId),
        )

        mockMvc
            .patch("/api/v1/housings/me/avatar") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"x":0.5,"y":0.5,"state":"IDLE","placementId":999999999}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("PLACEMENT_NOT_FOUND") }
            }
        mockMvc
            .patch("/api/v1/housings/me/avatar") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"x":0.5,"y":0.5,"state":"IDLE","placementId":$otherPlacementId}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("PLACEMENT_NOT_FOUND") }
            }
        mockMvc
            .patch("/api/v1/housings/me/avatar") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"x":1.01,"y":0.5,"state":"IDLE"}"""
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/v1/housings/me/avatar") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"x":0.5,"y":0.5,"state":"UNKNOWN"}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `v1 housing placements include store option in save and both detail responses`() {
        val email = "v1-placement-option-${UUID.randomUUID()}@test.local"
        val token = login(email)
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        val itemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_item(name,item_type) VALUES ('Option chair','FURNITURE') RETURNING item_id",
                    Long::class.java,
                ),
            )
        val optionId =
            checkNotNull(
                jdbc.queryForObject(
                    """INSERT INTO housing_store_option(item_id,option_json,currency,price,preview_asset)
                       VALUES (?, '{"color":"blue"}', 'STAR', 1, 'chair-blue') RETURNING option_id""",
                    Long::class.java,
                    itemId,
                ),
            )
        val inventoryId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_owned_option(user_id,option_id) VALUES (?,?) RETURNING inventory_id",
                    Long::class.java,
                    userId,
                    optionId,
                ),
            )
        val saveBody =
            mockMvc
                .put("/api/v1/housings/me/placements") {
                    header(header, token)
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"placements":[{"inventoryId":"store:$inventoryId","area":"INTERIOR","transform":{"x":0.4,"y":0.6}}]}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.data.placements[0].optionId") { value(optionId) }
                    jsonPath("$.data.placements[0].option.color") { value("blue") }
                }.andReturn()
                .response.contentAsString
        val savedPlacement = objectMapper.readTree(saveBody)["data"]["placements"][0]
        val housingId = userId
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect { status { isOk() } }

        val ownerResponse =
            mockMvc
                .get("/api/v1/housings/me") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val viewerToken = login("v1-placement-option-viewer-${UUID.randomUUID()}@test.local")
        val publicResponse =
            mockMvc
                .get("/api/v1/housings/$housingId") { header(header, viewerToken) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString

        listOf(ownerResponse, publicResponse).forEach { body ->
            val placement = objectMapper.readTree(body)["data"]["placements"][0]
            assertEquals(savedPlacement["placementId"], placement["placementId"])
            assertEquals(optionId, placement["optionId"].asLong())
            assertEquals("blue", placement["option"]["color"].asText())
        }
    }

    @Test
    fun `public housing APIs return fallback nickname when owner has none`() {
        val ownerEmail = "v1-no-nickname-owner-${UUID.randomUUID()}@test.local"
        val ownerToken = login(ownerEmail)
        mockMvc.get("/api/housing/me") { header(header, ownerToken) }.andExpect { status { isOk() } }
        val ownerId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, ownerEmail)).userId
        jdbc.update("UPDATE app_user SET nickname=NULL WHERE user_id=?", ownerId)
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, ownerToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect { status { isOk() } }

        val viewerEmail = "v1-no-nickname-viewer-${UUID.randomUUID()}@test.local"
        val viewerToken = login(viewerEmail)
        mockMvc.get("/api/housing/me") { header(header, viewerToken) }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, viewerToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect { status { isOk() } }

        mockMvc.get("/api/v1/housings/$ownerId") { header(header, viewerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.ownerNickname") { value("알 수 없음") }
        }
        mockMvc.get("/api/v1/housings/explore") { header(header, viewerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.housings[?(@.housingId==$ownerId)].ownerNickname") { value("알 수 없음") }
        }
    }

    @Test
    fun `v1 coordinate placement replaces owned items and leaves legacy layout intact`() {
        val token = login("v1-placement-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }
        val inventoryBody =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val furnitureInventoryId =
            objectMapper
                .readTree(inventoryBody)["data"]["items"]
                .first { it["itemType"].asText() == "FURNITURE" }["copies"][0]["inventoryId"]
                .asText()

        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"placements":[{"inventoryId":"$furnitureInventoryId","area":"INTERIOR","transform":{"x":0.35,"y":0.7,"flippedX":true,"layer":2}}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements.length()") { value(1) }
                jsonPath("$.data.placements[0].inventoryId") { value(furnitureInventoryId) }
                jsonPath("$.data.placements[0].transform.x") { value(0.35) }
                jsonPath("$.data.placements[0].transform.flippedX") { value(true) }
                jsonPath("$.data.placements[0].transform.rotation") { doesNotExist() }
                jsonPath("$.data.placements[0].optionId") { doesNotExist() }
                jsonPath("$.data.placements[0].option") { doesNotExist() }
            }
        mockMvc.get("/api/v1/housings/me") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.placements.length()") { value(1) }
            jsonPath("$.data.placements[0].transform.flippedX") { value(true) }
            jsonPath("$.data.legacyLayouts.room_basic.avatarId") { value("av_cat") }
        }
        mockMvc.get("/api/v1/users/me/inventory") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.items[*].copies[?(@.inventoryId=='$furnitureInventoryId')].placed") { value(true) }
        }
        val duplicate = """{"inventoryId":"$furnitureInventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5}}"""
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[$duplicate,$duplicate]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.code") { value("INVENTORY_ITEM_NOT_OWNED") }
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
    fun `v1 placement layer is limited to zero through nine`() {
        val token = login("v1-object-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }
        val inventoryBody =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        val inventoryId =
            objectMapper
                .readTree(inventoryBody)["data"]["items"]
                .first { it["itemType"].asText() == "OBJECT" }["copies"][0]["inventoryId"]
                .asText()
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$inventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5,"layer":9}}]}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.placements[0].area") { value("INTERIOR") }
                jsonPath("$.data.placements[0].transform.layer") { value(9) }
            }
        mockMvc.get("/api/v1/housings/me") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.placements[0].transform.layer") { value(9) }
        }
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$inventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5,"layer":10}}]}"""
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"placements":[{"inventoryId":"$inventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5,"rotation":90}}]}"""
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$inventoryId","area":"INTERIOR","transform":{"x":0.5,"y":0.5,"layer":-1}}]}"""
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `v1 shop list filters store items and reports option prices and ownership`() {
        val email = "v1-store-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        jdbc.update("DELETE FROM housing_store_item")
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
        assertEquals(1, furnitureItem["options"].size())
        assertTrue(furnitureItem.has("unlockHint"))
        assertTrue(furnitureItem["unlockHint"].isNull)
        assertEquals("STARDUST", furnitureItem["minPrice"]["currency"].asText())
        assertEquals(5, furnitureItem["minPrice"]["amount"].asInt())
        assertEquals(0, furnitureItem["options"][0]["ownedCount"].asInt())
        mockMvc
            .post("/api/v1/shop/purchases") {
                header(header, token)
                header("Idempotency-Key", UUID.randomUUID().toString())
                contentType = MediaType.APPLICATION_JSON
                content = """{"items":[{"itemId":$furnitureItemId,"optionId":$ownedOptionId,"quantity":1}]}"""
            }.andExpect {
                status { isBadRequest() }
                jsonPath("$.error.items[0].code") { value("OPTION_INVALID") }
            }
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
                       VALUES (?, '{"color":"green"}', 'STARDUST', 10, 'store/chair-green.png') RETURNING option_id""",
                    Long::class.java,
                    itemId,
                ),
            )
        jdbc.update(
            "INSERT INTO user_wallet(user_id,star,stardust) VALUES (?,50,50) ON CONFLICT (user_id) DO UPDATE SET star=50,stardust=50",
            userId,
        )
        val body = """{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":2}]}"""
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
                    jsonPath("$.data.wallet.stardust") { value(30) }
                    jsonPath("$.data.wallet.star") { doesNotExist() }
                    jsonPath("$.data.inventoryItems[0].itemId") { value(itemId.toInt()) }
                    jsonPath("$.data.inventoryItems[0].option.color") { value("green") }
                    jsonPath("$.data.inventoryItems[0].ownedCount") { value(2) }
                }.andReturn()
        val inventoryId =
            objectMapper
                .readTree(
                    firstResponse.response.contentAsString,
                )["data"]["inventoryItems"][0]["copies"][0]["inventoryId"]
                .asText()
        mockMvc
            .post("/api/v1/shop/purchases") {
                header(header, token)
                header("Idempotency-Key", idempotencyKey)
                contentType = MediaType.APPLICATION_JSON
                content = body
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.inventoryItems[0].copies[0].inventoryId") { value(inventoryId) }
                jsonPath("$.data.wallet.stardust") { value(30) }
            }
        val inventoryResponse =
            mockMvc
                .get("/api/v1/users/me/inventory") { header(header, token) }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.data.items[*].copies[?(@.inventoryId=='$inventoryId')].placed") { value(false) }
                }.andReturn()
                .response.contentAsString
        val purchasedItem =
            objectMapper
                .readTree(inventoryResponse)["data"]["items"]
                .first { item -> item["copies"].any { it["inventoryId"].asText() == inventoryId } }
        assertEquals(optionId, purchasedItem["optionId"].asLong())
        assertEquals("green", purchasedItem["option"]["color"].asText())
        assertEquals(objectMapper.readTree(firstResponse.response.contentAsString)["data"]["inventoryItems"][0], purchasedItem)
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
            jsonPath("$.data.items[*].copies[?(@.inventoryId=='$inventoryId')].placed") { value(true) }
        }
    }

    @Test
    fun `v1 purchase groups repeated options and rejects invalid quantities and insufficient balance`() {
        val email = "bulk-quantity-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        val itemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_item(name,item_type) VALUES ('Bulk','FURNITURE') RETURNING item_id",
                    Long::class.java,
                ),
            )
        val optionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_option(item_id,currency,price,preview_asset) VALUES (?,'STARDUST',10,'bulk-a') RETURNING option_id",
                    Long::class.java,
                    itemId,
                ),
            )
        val otherId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_option(item_id,currency,price,preview_asset) VALUES (?,'STARDUST',5,'bulk-b') RETURNING option_id",
                    Long::class.java,
                    itemId,
                ),
            )
        jdbc.update(
            "INSERT INTO user_wallet(user_id,star,stardust) VALUES (?,7,100) ON CONFLICT (user_id) DO UPDATE SET star=7,stardust=100",
            userId,
        )
        val key = UUID.randomUUID().toString()
        val body = """{"items":[
            {"itemId":$itemId,"optionId":$optionId,"quantity":2},
            {"itemId":$itemId,"optionId":$otherId,"quantity":1},
            {"itemId":$itemId,"optionId":$optionId,"quantity":1}]}"""

        fun purchase(
            value: String,
            idempotencyKey: String = UUID.randomUUID().toString(),
        ) = mockMvc.post("/api/v1/shop/purchases") {
            header(header, token)
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            content = value
        }
        val first =
            purchase(body, key)
                .andExpect {
                    status { isOk() }
                    jsonPath("$.data.wallet.stardust") { value(65) }
                    jsonPath("$.data.inventoryItems.length()") { value(2) }
                    jsonPath("$.data.inventoryItems[0].ownedCount") { value(3) }
                    jsonPath("$.data.inventoryItems[0].availableCount") { value(3) }
                    jsonPath("$.data.inventoryItems[0].copies.length()") { value(3) }
                }.andReturn()
                .response.contentAsString
        val repeat =
            purchase(body, key)
                .andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
        assertEquals(objectMapper.readTree(first), objectMapper.readTree(repeat))
        mockMvc.get("/api/v1/shop/items/$itemId") { header(header, token) }.andExpect {
            status { isOk() }
            jsonPath("$.data.options[0].ownedCount") { value(3) }
            jsonPath("$.data.options[1].ownedCount") { value(1) }
        }
        purchase("""{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":1}]}""").andExpect {
            status { isOk() }
            jsonPath("$.data.inventoryItems[0].ownedCount") { value(4) }
            jsonPath("$.data.wallet.stardust") { value(55) }
        }
        for (quantity in listOf("0", "51", "1.5", "null", "\"2\"")) {
            purchase("""{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":$quantity}]}""")
                .andExpect { status { isBadRequest() } }
        }
        purchase("""{"items":[{"itemId":$itemId,"optionId":$optionId}]}""").andExpect { status { isBadRequest() } }
        purchase(
            """{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":7},{"itemId":$itemId,"optionId":$otherId,"quantity":1}]}""",
        ).andExpect {
            status { isPaymentRequired() }
            jsonPath("$.error.items.length()") { value(2) }
            jsonPath("$.error.items[0].code") { value("INSUFFICIENT_BALANCE") }
        }
        assertEquals(5, jdbc.queryForObject("SELECT COUNT(*) FROM housing_store_owned_option WHERE user_id=?", Int::class.java, userId))
        assertEquals(55L, jdbc.queryForObject("SELECT stardust FROM user_wallet WHERE user_id=?", Long::class.java, userId))
        assertEquals(7L, jdbc.queryForObject("SELECT star FROM user_wallet WHERE user_id=?", Long::class.java, userId))
        jdbc.update("UPDATE housing_store_option SET price=? WHERE option_id=?", Long.MAX_VALUE, optionId)
        purchase("""{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":2}]}""").andExpect { status { isBadRequest() } }
        assertEquals(55L, jdbc.queryForObject("SELECT stardust FROM user_wallet WHERE user_id=?", Long::class.java, userId))
        jdbc.update("UPDATE housing_store_option SET price=? WHERE option_id IN (?,?)", Long.MAX_VALUE / 2 + 1, optionId, otherId)
        purchase("""{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":1},{"itemId":$itemId,"optionId":$otherId,"quantity":1}]}""")
            .andExpect { status { isBadRequest() } }
        assertEquals(55L, jdbc.queryForObject("SELECT stardust FROM user_wallet WHERE user_id=?", Long::class.java, userId))
    }

    @Test
    fun `inventory groups three copies and tracks sources and placements`() {
        val email = "inventory-group-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        mockMvc.get("/api/housing/me") { header(header, token) }.andExpect { status { isOk() } }
        val itemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_item(name,item_type) VALUES ('Group','FURNITURE') RETURNING item_id",
                    Long::class.java,
                ),
            )
        val optionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_option(item_id,currency,price,preview_asset) VALUES (?,'STARDUST',1,'group') RETURNING option_id",
                    Long::class.java,
                    itemId,
                ),
            )
        val copies =
            listOf("PURCHASE", "REWARD", "STARTER").map { source ->
                checkNotNull(
                    jdbc.queryForObject(
                        "INSERT INTO housing_store_owned_option(user_id,option_id,acquired_via) VALUES (?,?,?) RETURNING inventory_id",
                        Long::class.java,
                        userId,
                        optionId,
                        source,
                    ),
                )
            }
        val placedId = "store:${copies[1]}"
        mockMvc
            .put("/api/v1/housings/me/placements") {
                header(header, token)
                contentType = MediaType.APPLICATION_JSON
                content = """{"placements":[{"inventoryId":"$placedId","area":"INTERIOR","transform":{"x":0.5,"y":0.5}}]}"""
            }.andExpect { status { isOk() } }
        val inventory =
            mockMvc
                .get("/api/v1/users/me/inventory") {
                    header(header, token)
                    param("itemType", "FURNITURE")
                }.andExpect { status { isOk() } }
                .andReturn()
                .response.contentAsString
                .let(objectMapper::readTree)
        val item = inventory["data"]["items"].first { it["optionId"]?.asLong() == optionId }
        assertEquals(3, item["ownedCount"].asInt())
        assertEquals(1, item["placedCount"].asInt())
        assertEquals(2, item["availableCount"].asInt())
        assertEquals(setOf("PURCHASE", "REWARD", "STARTER"), item["copies"].map { it["acquiredVia"].asText() }.toSet())
        assertTrue(item["copies"].first { it["inventoryId"].asText() == placedId }["placed"].asBoolean())
        assertEquals(1, item["copies"].count { it["placed"].asBoolean() })
        mockMvc
            .get("/api/v1/users/me/inventory") {
                header(header, token)
                param("itemType", "OBJECT")
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.items[?(@.optionId==$optionId)]") { isEmpty() }
            }
        mockMvc
            .get("/api/v1/users/me/inventory") {
                header(header, token)
                param("itemType", "furniture")
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `concurrent purchases serialize balance and grant copies once per successful request`() {
        val email = "bulk-race-${UUID.randomUUID()}@test.local"
        val token = login(email)
        val userId = checkNotNull(auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, email)).userId
        val itemId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_item(name,item_type) VALUES ('Race','FURNITURE') RETURNING item_id",
                    Long::class.java,
                ),
            )
        val optionId =
            checkNotNull(
                jdbc.queryForObject(
                    "INSERT INTO housing_store_option(item_id,currency,price,preview_asset) VALUES (?,'STARDUST',10,'race') RETURNING option_id",
                    Long::class.java,
                    itemId,
                ),
            )
        jdbc.update("INSERT INTO user_wallet(user_id,stardust) VALUES (?,50) ON CONFLICT (user_id) DO UPDATE SET stardust=50", userId)
        val latch = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures =
                (1..2).map {
                    executor.submit<Int> {
                        check(latch.await(10, TimeUnit.SECONDS))
                        mockMvc
                            .post("/api/v1/shop/purchases") {
                                header(header, token)
                                header("Idempotency-Key", UUID.randomUUID().toString())
                                contentType = MediaType.APPLICATION_JSON
                                content = """{"items":[{"itemId":$itemId,"optionId":$optionId,"quantity":3}]}"""
                            }.andReturn()
                            .response.status
                    }
                }
            latch.countDown()
            assertEquals(listOf(200, 402), futures.map { it.get(30, TimeUnit.SECONDS) }.sorted())
            assertEquals(20L, jdbc.queryForObject("SELECT stardust FROM user_wallet WHERE user_id=?", Long::class.java, userId))
            assertEquals(
                3,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM housing_store_owned_option WHERE user_id=? AND option_id=?",
                    Int::class.java,
                    userId,
                    optionId,
                ),
            )
        } finally {
            executor.shutdownNow()
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
    fun `public renamed housing appears in explore and public detail`() {
        val ownerEmail = "public-owner-${UUID.randomUUID()}@test.local"
        val ownerToken = login(ownerEmail)
        mockMvc.get("/api/housing/me") { header(header, ownerToken) }.andExpect { status { isOk() } }
        val ownerId = auths.findByProviderAndProviderUid(AuthProvider.PASSWORD, ownerEmail)!!.userId
        val housingName = "초롱 공개 하우스"

        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, ownerToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"name":"$housingName","isPublic":true}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.data.name") { value(housingName) }
                jsonPath("$.data.isPublic") { value(true) }
            }

        val viewerToken = login("public-viewer-${UUID.randomUUID()}@test.local")
        mockMvc.get("/api/housing/me") { header(header, viewerToken) }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/v1/housings/me") {
                header(header, viewerToken)
                contentType = MediaType.APPLICATION_JSON
                content = """{"isPublic":true}"""
            }.andExpect { status { isOk() } }

        mockMvc.get("/api/v1/housings/explore") { header(header, viewerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.housings[?(@.housingId==$ownerId)].name") { value(housingName) }
        }
        mockMvc.get("/api/v1/housings/$ownerId") { header(header, viewerToken) }.andExpect {
            status { isOk() }
            jsonPath("$.data.housing.name") { value(housingName) }
            jsonPath("$.data.housing.isPublic") { value(true) }
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
