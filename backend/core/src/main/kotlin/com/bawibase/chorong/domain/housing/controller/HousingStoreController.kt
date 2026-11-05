package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.housing.dto.HousingStoreItemDetailResponse
import com.bawibase.chorong.domain.housing.dto.HousingStoreItemListResponse
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseRequest
import com.bawibase.chorong.domain.housing.dto.HousingStorePurchaseResponse
import com.bawibase.chorong.domain.housing.service.HousingStoreCatalogService
import com.bawibase.chorong.domain.housing.service.HousingStorePurchaseService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/shop")
class HousingStoreController(
    private val storeCatalog: HousingStoreCatalogService,
    private val storePurchases: HousingStorePurchaseService,
) {
    @GetMapping("/items")
    @Operation(operationId = "API-901", summary = "상점 상품 목록")
    fun list(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) itemType: String?,
    ): ApiResponse<HousingStoreItemListResponse> = ApiResponse(storeCatalog.list(userId, itemType))

    @GetMapping("/items/{itemId}")
    @Operation(operationId = "API-902", summary = "상점 상품 상세")
    fun detail(
        @CurrentUserId userId: Long,
        @PathVariable itemId: Long,
    ): ApiResponse<HousingStoreItemDetailResponse> = ApiResponse(storeCatalog.detail(userId, itemId))

    @PostMapping("/purchases")
    @Operation(operationId = "API-903", summary = "옵션 일괄 구매")
    fun purchase(
        @CurrentUserId userId: Long,
        @RequestHeader("Idempotency-Key") idempotencyKey: String,
        @Valid @RequestBody request: HousingStorePurchaseRequest,
    ): ApiResponse<HousingStorePurchaseResponse> = ApiResponse(storePurchases.purchase(userId, idempotencyKey, request))
}
