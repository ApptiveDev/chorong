package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.domain.housing.dto.CatalogResponse
import com.bawibase.chorong.domain.housing.service.HousingCatalogService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "하우징 (카탈로그)")
@RequestMapping("/api/housing/catalog")
class HousingCatalogController(
    private val catalogService: HousingCatalogService,
) {
    @Operation(description = "하우징 시스템을 구성하는 모든 요소 (방, 가구, 아바타)를 카탈로그라 정의하고 이를 조회합니다. 서비스 시작 시점에 값을 조회하고 캐싱하여 사용해야 합니다.")
    @GetMapping
    fun catalog(): CatalogResponse = catalogService.catalog()
}
