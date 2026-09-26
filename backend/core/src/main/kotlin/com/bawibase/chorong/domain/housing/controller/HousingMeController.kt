package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.domain.housing.dto.ActiveRoomRequest
import com.bawibase.chorong.domain.housing.dto.ActiveRoomResponse
import com.bawibase.chorong.domain.housing.dto.LayoutRequest
import com.bawibase.chorong.domain.housing.dto.LayoutResponse
import com.bawibase.chorong.domain.housing.dto.MeResponse
import com.bawibase.chorong.domain.housing.service.HousingService
import com.bawibase.chorong.domain.user.service.UserService
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "하우징 (내 방)")
@SecurityRequirement(name = "deviceId")
@RequestMapping("/api/housing/me")
class HousingMeController(
    private val userService: UserService,
    private val housingService: HousingService,
) {
    @GetMapping
    fun me(@Parameter(hidden = true) @RequestHeader(DEVICE_HEADER) deviceId: String): MeResponse =
        housingService.me(userId(deviceId))

    @PutMapping("/rooms/{roomId}/layout")
    fun saveLayout(
        @Parameter(hidden = true) @RequestHeader(DEVICE_HEADER) deviceId: String,
        @PathVariable roomId: String,
        @Valid @RequestBody request: LayoutRequest,
    ): LayoutResponse = housingService.saveLayout(userId(deviceId), roomId, request)

    @PutMapping("/active-room")
    fun setActiveRoom(
        @Parameter(hidden = true) @RequestHeader(DEVICE_HEADER) deviceId: String,
        @Valid @RequestBody request: ActiveRoomRequest,
    ): ActiveRoomResponse = ActiveRoomResponse(housingService.setActiveRoom(userId(deviceId), request.roomId))

    private fun userId(deviceId: String): Long = checkNotNull(userService.resolveByDevice(deviceId).id)

    companion object {
        const val DEVICE_HEADER = "X-Device-Id"
    }
}
