package com.bawibase.chorong.domain.quiz.config

import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.core.env.Environment
import org.springframework.core.type.AnnotatedTypeMetadata

class QuizPreviewCondition : Condition {
    override fun matches(
        context: ConditionContext,
        metadata: AnnotatedTypeMetadata,
    ): Boolean = enabled(context.environment)

    companion object {
        fun enabled(environment: Environment): Boolean =
            environment.getProperty("app.quiz-preview.enabled", Boolean::class.java, false) &&
                environment.getProperty("spring.jpa.properties.hibernate.default_schema") == "chorong_dev"
    }
}
