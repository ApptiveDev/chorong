package com.bawibase.chorong.config

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.MDC
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

/** 요청마다 `X-Request-Id` 를 MDC 와 응답 헤더에 넣는다. 클라이언트가 보낸 값이 있으면 그대로 쓴다. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
class RequestIdFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val requestId =
            request
                .getHeader(HEADER)
                ?.trim()
                ?.takeIf { it.isNotEmpty() && it.length <= MAX_LENGTH }
                ?: UUID.randomUUID().toString()
        MDC.put(MDC_KEY, requestId)
        response.setHeader(HEADER, requestId)
        try {
            filterChain.doFilter(request, response)
        } finally {
            MDC.remove(MDC_KEY)
            MDC.remove(MDC_USER_ID)
        }
    }

    companion object {
        const val HEADER = "X-Request-Id"
        const val MDC_KEY = "requestId"
        const val MDC_USER_ID = "userId"
        private const val MAX_LENGTH = 128
    }
}
