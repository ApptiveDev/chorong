package com.bawibase.chorong.domain.user.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.user.service.ArtworkPageData
import com.bawibase.chorong.domain.user.service.ConstellationData
import com.bawibase.chorong.domain.user.service.InventoryData
import com.bawibase.chorong.domain.user.service.RewardPageData
import com.bawibase.chorong.domain.user.service.RewardReadService
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1")
class RewardReadController(
    private val rewards: RewardReadService,
) {
    @GetMapping("/users/me/artworks")
    @Operation(operationId = "API-908", summary = "학습으로 획득한 그림")
    fun getArtworks(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) size: Int?,
    ): PagedResponse<ArtworkPageData> = rewards.artworks(userId, cursor, size)

    @GetMapping("/users/me/rewards")
    @Operation(operationId = "API-905", summary = "보상 지급 내역")
    fun getRewards(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) size: Int?,
    ): PagedResponse<RewardPageData> = rewards.rewards(userId, cursor, size)

    @GetMapping("/constellations")
    @Operation(operationId = "API-906", summary = "별자리 목록과 획득 현황")
    fun getConstellations(
        @CurrentUserId userId: Long,
    ): ApiResponse<ConstellationData> = ApiResponse(rewards.constellations(userId))

    @GetMapping("/users/me/inventory")
    @Operation(operationId = "API-907", summary = "인벤토리 조회")
    fun getInventory(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) itemType: String?,
    ): ApiResponse<InventoryData> = ApiResponse(rewards.inventory(userId, itemType))
}
