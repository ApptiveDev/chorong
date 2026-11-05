package com.bawibase.chorong.domain.push.controller

import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.auth.dto.DevicePlatform
import com.bawibase.chorong.domain.auth.dto.GuestAuthRequest
import com.bawibase.chorong.domain.push.service.PushDeviceService
import io.swagger.v3.oas.annotations.Operation
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.validation.annotation.Validated
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class PushDeviceRequest(
    @field:Pattern(regexp = GuestAuthRequest.UUID_PATTERN) val deviceUuid: String,
    val platform: DevicePlatform,
    @field:NotBlank @field:Size(max = 8192) val pushToken: String,
)

@RestController
@Validated
@RequestMapping("/api/v1/push/devices")
class PushDeviceController(
    private val devices: PushDeviceService,
) {
    @Operation(operationId = "API-301")
    @PutMapping
    fun register(
        @CurrentUserId userId: Long,
        @AuthenticationPrincipal jwt: Jwt,
        @Valid @RequestBody request: PushDeviceRequest,
    ): ResponseEntity<Void> {
        devices.register(userId, jwt.getClaimAsString("sid")?.toLongOrNull(), request.deviceUuid, request.platform, request.pushToken)
        return ResponseEntity.noContent().build()
    }

    @Operation(operationId = "API-302")
    @DeleteMapping("/{deviceUuid}")
    fun delete(
        @CurrentUserId userId: Long,
        @PathVariable @Pattern(regexp = GuestAuthRequest.UUID_PATTERN) deviceUuid: String,
    ): ResponseEntity<Void> {
        devices.delete(userId, deviceUuid)
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build()
    }
}
