package com.bawibase.chorong.config

import org.springframework.core.MethodParameter
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.jwt.Jwt
import org.springframework.stereotype.Component
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/** 컨트롤러 파라미터에 붙이면 Bearer 토큰의 sub(유저 ID)를 Long 으로 넣어준다. */
@Target(AnnotationTarget.VALUE_PARAMETER)
@Retention(AnnotationRetention.RUNTIME)
annotation class CurrentUserId

@Component
class CurrentUserIdResolver :
    HandlerMethodArgumentResolver,
    WebMvcConfigurer {
    override fun supportsParameter(parameter: MethodParameter): Boolean = parameter.hasParameterAnnotation(CurrentUserId::class.java)

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): Long {
        val jwt = SecurityContextHolder.getContext().authentication?.principal as? Jwt
        return jwt?.subject?.toLongOrNull() ?: throw UnauthorizedException()
    }

    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(this)
    }
}

class UnauthorizedException : RuntimeException("인증이 필요합니다.")
