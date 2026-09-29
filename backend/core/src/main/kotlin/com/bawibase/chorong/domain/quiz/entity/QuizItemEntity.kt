package com.bawibase.chorong.domain.quiz.entity

import com.bawibase.chorong.domain.quiz.QuizInteractionType
import jakarta.persistence.Column
import jakarta.persistence.Convert
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.annotations.UpdateTimestamp
import org.hibernate.type.SqlTypes
import java.time.OffsetDateTime

@Entity
@Table(name = "quiz_item")
class QuizItemEntity(
    @Column(name = "lesson_id", nullable = false)
    var lessonId: Long,
    @Column(nullable = false, columnDefinition = "text")
    var question: String,
    @Column(nullable = false, columnDefinition = "text")
    var instruction: String,
    @Enumerated(EnumType.STRING)
    @Column(name = "interaction_type", nullable = false, length = 30)
    var interactionType: QuizInteractionType,
    @Convert(converter = QuizJsonConverter::class)
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    var config: Map<String, Any?>,
    @Convert(converter = QuizJsonConverter::class)
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    var answer: Map<String, Any?>?,
    @Column(nullable = false, columnDefinition = "text")
    var explanation: String,
    @Column(nullable = false, length = 30)
    var difficulty: String,
    @Column(name = "quiz_order", nullable = false)
    var quizOrder: Int,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "quiz_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
