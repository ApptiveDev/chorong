package com.bawibase.chorong.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.authorization.AuthorizationDecision
import org.springframework.security.authorization.AuthorizationManager
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.access.intercept.RequestAuthorizationContext
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource

@Configuration
class SecurityConfig(
    @Value("\${app.cors.origins}") private val corsOrigins: String,
    private val apiSecurityErrors: ApiSecurityErrors,
    private val userJwtAuthenticationConverter: UserJwtAuthenticationConverter,
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
                    .requestMatchers(HttpMethod.GET, "/api/v1/housings/me")
                    .authenticated()
                    .requestMatchers(HttpMethod.DELETE, "/api/v1/users/me")
                    .access(memberOnly())
                    .requestMatchers(
                        "/api/v1/auth/link/**",
                        "/api/v1/housings/explore",
                        "/api/v1/housings/*/like",
                        "/api/v1/reports",
                        "/api/v1/blocks",
                        "/api/v1/blocks/**",
                    ).access(memberOnly())
                    .requestMatchers(HttpMethod.GET, "/api/v1/housings/*")
                    .access(memberOnly())
                    .anyRequest()
                    .authenticated()
            }.oauth2ResourceServer { rs ->
                rs.jwt { it.jwtAuthenticationConverter(userJwtAuthenticationConverter) }
                rs.authenticationEntryPoint(apiSecurityErrors.authenticationEntryPoint)
                rs.accessDeniedHandler(apiSecurityErrors.accessDeniedHandler)
            }.exceptionHandling {
                it.authenticationEntryPoint(apiSecurityErrors.authenticationEntryPoint)
                it.accessDeniedHandler(apiSecurityErrors.accessDeniedHandler)
            }.build()

    @Bean
    fun passwordEncoder(): PasswordEncoder = BCryptPasswordEncoder()

    private fun memberOnly(): AuthorizationManager<RequestAuthorizationContext> =
        AuthorizationManager { authentication, context ->
            context.request.setAttribute(ApiSecurityErrors.MEMBER_REQUIRED, true)
            AuthorizationDecision(authentication.get().authorities.any { it.authority == "ROLE_MEMBER" })
        }

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
}
