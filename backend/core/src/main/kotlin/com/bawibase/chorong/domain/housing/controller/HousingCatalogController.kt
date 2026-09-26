package com.bawibase.chorong.domain.housing.controller

import com.bawibase.chorong.domain.housing.dto.CatalogResponse
import com.bawibase.chorong.domain.housing.service.HousingCatalogService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/housing/catalog")
class HousingCatalogController(
    private val catalogService: HousingCatalogService,
) {
    @GetMapping
    fun catalog(): CatalogResponse = catalogService.catalog()
}
