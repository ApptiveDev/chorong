package com.bawibase.chorong.domain.quiz.entity

import jakarta.persistence.Column
import jakarta.persistence.Convert
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.JdbcTypeCode
import org.hibernate.type.SqlTypes
import java.time.OffsetDateTime

@Entity
@Table(name = "quiz_attempt")
class QuizAttemptEntity(
    @Column(name = "quiz_id", nullable = false)
    var quizId: Long,
    @Column(name = "user_id", nullable = false)
    var userId: Long,
    @Convert(converter = QuizJsonConverter::class)
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    var response: Map<String, Any?>,
    @Column(nullable = false)
    var graded: Boolean,
    @Column
    var correct: Boolean?,
    @Column(nullable = false)
    var completed: Boolean,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "attempt_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false, updatable = false)
    var submittedAt: OffsetDateTime? = null
}
