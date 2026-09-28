package com.bawibase.chorong.domain.quiz.config

import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.annotation.Order
import org.springframework.core.env.Environment
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain

@Configuration
class QuizPreviewSecurityConfig(
    environment: Environment,
) {
    private val enabled = QuizPreviewCondition.enabled(environment)

    @Bean
    @Order(1)
    fun quizPreviewFilterChain(http: HttpSecurity): SecurityFilterChain =
        http
            .securityMatcher("/api/dev/quizzes", "/api/dev/quizzes/**")
            .csrf { it.disable() }
            .cors { }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .authorizeHttpRequests {
                it.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                if (enabled) it.anyRequest().permitAll() else it.anyRequest().denyAll()
            }.exceptionHandling {
                it.authenticationEntryPoint { _, response, _ -> unavailable(response) }
                it.accessDeniedHandler { _, response, _ -> unavailable(response) }
            }.build()

    private fun unavailable(response: HttpServletResponse) {
        response.status = HttpServletResponse.SC_NOT_FOUND
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.characterEncoding = "UTF-8"
        response.writer.write("""{"code":"QUIZ_PREVIEW_DISABLED","message":"이 환경에서는 퀴즈 테스트를 사용할 수 없습니다."}""")
    }
}
