package com.bawibase.chorong.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun openApi(): OpenAPI =
        OpenAPI()
            .info(Info().title("chorong API").version("v1"))
            .components(
                Components().addSecuritySchemes(
                    BEARER,
                    SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")
                        .description("/api/auth/* 로 받은 accessToken."),
                ),
            )

    companion object {
        const val BEARER = "bearer"
    }
}
