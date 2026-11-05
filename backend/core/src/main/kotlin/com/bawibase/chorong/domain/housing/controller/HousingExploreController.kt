package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.housing.dto.PublicHousingDetailResponse
import com.bawibase.chorong.domain.housing.service.HousingExploreData
import com.bawibase.chorong.domain.housing.service.HousingExploreService
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/housings")
class HousingExploreController(
    private val explore: HousingExploreService,
) {
    @GetMapping("/explore")
    @Operation(operationId = "API-801", summary = "공개 하우징 탐색")
    fun explore(
        @CurrentUserId userId: Long,
        @RequestParam(defaultValue = "recent") sort: String,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) size: Int?,
    ): PagedResponse<HousingExploreData> = explore.explore(userId, sort, cursor, size)

    @GetMapping("/{housingId}")
    @Operation(operationId = "API-802", summary = "다른 사용자 하우징 조회")
    fun getPublicHousing(
        @CurrentUserId userId: Long,
        @PathVariable housingId: Long,
    ): ApiResponse<PublicHousingDetailResponse> = ApiResponse(explore.getPublicHousing(userId, housingId))
}
