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
                    DEVICE_ID,
                    SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .`in`(SecurityScheme.In.HEADER)
                        .name("X-Device-Id")
                        .description("기기별 UUID. 처음 보는 값이면 유저를 만든다."),
                ),
            )

    companion object {
        const val DEVICE_ID = "deviceId"
    }
}
