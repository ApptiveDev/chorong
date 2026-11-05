package com.bawibase.chorong.config

import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class ApiDocsConfig : WebMvcConfigurer {
    override fun addResourceHandlers(registry: ResourceHandlerRegistry) {
        registry
            .addResourceHandler("/docs/sequence/**")
            .addResourceLocations("classpath:/sequence-docs/")
        registry
            .addResourceHandler("/docs/**")
            .addResourceLocations("classpath:/api-docs/")
    }

    override fun addViewControllers(registry: ViewControllerRegistry) {
        registry.addRedirectViewController("/docs", "/docs/index.html")
        registry.addRedirectViewController("/docs/sequence", "/docs/sequence/index.html")
    }
}
