package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import com.bawibase.chorong.domain.housing.service.HousingLikeService
import com.bawibase.chorong.domain.housing.service.LikeStateResponse
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/housings/{housingId}/like")
class HousingLikeController(
    private val likes: HousingLikeService,
) {
    @PostMapping
    @Operation(operationId = "API-803", summary = "하우징 좋아요")
    fun like(
        @CurrentUserId userId: Long,
        @PathVariable housingId: Long,
    ): ApiResponse<LikeStateResponse> = ApiResponse(likes.like(userId, housingId))

    @DeleteMapping
    @Operation(operationId = "API-804", summary = "하우징 좋아요 취소")
    fun unlike(
        @CurrentUserId userId: Long,
        @PathVariable housingId: Long,
    ): ApiResponse<LikeStateResponse> = ApiResponse(likes.unlike(userId, housingId))
}
