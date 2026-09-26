package com.bawibase.chorong.config

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.AuthenticationEntryPoint
import org.springframework.security.web.SecurityFilterChain
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
class SecurityConfig(
    @Value("\${app.cors.origins}") private val corsOrigins: String,
    private val objectMapper: ObjectMapper,
) {
    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .csrf { it.disable() }
            .cors { }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it
                    .requestMatchers(HttpMethod.OPTIONS, "/**")
                    .permitAll()
                    // TODO(auth): 소셜 로그인 개방 시 /api/auth/social/** 추가
                    .requestMatchers(
                        "/api/health",
                        "/api-docs/**",
                        "/docs",
                        "/api/auth/guest/**",
                        "/api/auth/password/**",
                        "/api/auth/refresh",
                    ).permitAll()
                    .requestMatchers("/api/housing/catalog/**", "/api/notes/**")
                    .permitAll()
                    .anyRequest()
                    .authenticated()
            }.oauth2ResourceServer { rs ->
                rs.jwt { }
                rs.authenticationEntryPoint(unauthorizedEntryPoint())
            }.exceptionHandling { it.authenticationEntryPoint(unauthorizedEntryPoint()) }
            .build()

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val config =
            CorsConfiguration().apply {
                allowedOrigins = corsOrigins.split(",").map { it.trim() }.filter { it.isNotEmpty() }
                allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                allowedHeaders = listOf("*")
                exposedHeaders = listOf(RequestIdFilter.HEADER)
                allowCredentials = true
            }
        return UrlBasedCorsConfigurationSource().apply {
            registerCorsConfiguration("/**", config)
        }
    }

    private fun unauthorizedEntryPoint() =
        AuthenticationEntryPoint { _, response, _ ->
            response.status = 401
            response.contentType = MediaType.APPLICATION_JSON_VALUE
            response.characterEncoding = "UTF-8"
            response.writer.write(objectMapper.writeValueAsString(mapOf("code" to "UNAUTHORIZED", "message" to "인증이 필요합니다.")))
        }
}
