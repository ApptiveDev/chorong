package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.housing.dto.PurchaseRequest
import com.bawibase.chorong.domain.housing.dto.PurchaseResponse
import com.bawibase.chorong.domain.housing.dto.ShopResponse
import com.bawibase.chorong.domain.housing.service.HousingShopService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "하우징 (상점)")
@SecurityRequirement(name = "bearer")
@RequestMapping("/api/housing/shop")
class HousingShopController(
    private val shopService: HousingShopService,
) {
    @Operation(description = "상점에서 구매 가능한 하우징 아이템 목록을 조회합니다.")
    @GetMapping
    fun list(
        @Parameter(hidden = true) @CurrentUserId userId: Long,
    ): ShopResponse = shopService.list(userId)

    @Operation(description = "요청한 아이템을 구매합니다.")
    @PostMapping("/purchase")
    fun purchase(
        @Parameter(hidden = true) @CurrentUserId userId: Long,
        @Valid @RequestBody request: PurchaseRequest,
    ): PurchaseResponse = shopService.purchase(userId, request.itemId)
}
