package com.bawibase.chorong.config

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.instrumentation.logback.appender.v1_0.OpenTelemetryAppender
import org.springframework.beans.factory.InitializingBean
import org.springframework.stereotype.Component

/** Logback 의 OpenTelemetryAppender 에 Boot 가 만든 OpenTelemetry 를 연결한다. 연결 전 로그는 버려진다. */
@Component
class OpenTelemetryAppenderInitializer(
    private val openTelemetry: OpenTelemetry,
) : InitializingBean {
    override fun afterPropertiesSet() {
        OpenTelemetryAppender.install(openTelemetry)
    }
}
