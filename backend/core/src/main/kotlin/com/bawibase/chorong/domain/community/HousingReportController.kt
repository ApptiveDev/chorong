package com.bawibase.chorong.domain.community

import com.bawibase.chorong.common.api.ApiResponse
import com.bawibase.chorong.config.CurrentUserId
import io.swagger.v3.oas.annotations.Operation
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/reports")
class HousingReportController(
    private val reports: HousingReportService,
) {
    @PostMapping
    @Operation(operationId = "API-805", summary = "하우징 신고")
    fun report(
        @CurrentUserId userId: Long,
        @RequestBody request: HousingReportRequest,
    ): ApiResponse<HousingReportResponse> = ApiResponse(reports.report(userId, request))
}
