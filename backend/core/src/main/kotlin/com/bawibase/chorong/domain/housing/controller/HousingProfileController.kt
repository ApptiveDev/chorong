package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.housing.dto.HousingDetailResponse
import com.bawibase.chorong.domain.housing.dto.HousingProfilePatchRequest
import com.bawibase.chorong.domain.housing.dto.HousingResponse
import com.bawibase.chorong.domain.housing.service.HousingService
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/housings/me")
class HousingProfileController(
    private val housing: HousingService,
) {
    @Operation(operationId = "API-701", summary = "내 하우징 조회")
    @GetMapping
    fun me(
        @CurrentUserId userId: Long,
    ): ApiResponse<HousingDetailResponse> = ApiResponse(housing.v1Me(userId))

    @Operation(operationId = "API-703", summary = "하우징 이름 또는 공개 여부 변경")
    @PatchMapping
    fun update(
        @CurrentUserId userId: Long,
        @RequestBody request: HousingProfilePatchRequest,
    ): ApiResponse<HousingResponse> = ApiResponse(housing.updateProfile(userId, request.name, request.isPublic))
}
