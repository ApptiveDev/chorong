package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.domain.housing.dto.PurchaseRequest
import com.bawibase.chorong.domain.housing.dto.PurchaseResponse
import com.bawibase.chorong.domain.housing.dto.ShopResponse
import com.bawibase.chorong.domain.housing.service.HousingShopService
import com.bawibase.chorong.domain.user.service.UserService
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/housing/shop")
class HousingShopController(
    private val userService: UserService,
    private val shopService: HousingShopService,
) {
    @GetMapping
    fun list(@RequestHeader(HousingMeController.DEVICE_HEADER) deviceId: String): ShopResponse =
        shopService.list(userId(deviceId))

    @PostMapping("/purchase")
    fun purchase(
        @RequestHeader(HousingMeController.DEVICE_HEADER) deviceId: String,
        @Valid @RequestBody request: PurchaseRequest,
    ): PurchaseResponse = shopService.purchase(userId(deviceId), request.itemId)

    private fun userId(deviceId: String): Long = checkNotNull(userService.resolveByDevice(deviceId).id)
}
