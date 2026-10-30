package com.bawibase.chorong.domain.user.entity

import com.bawibase.chorong.domain.user.UserStatus
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDate
import java.time.OffsetDateTime

@Entity
@Table(name = "app_user")
class UserEntity(
    @Column(length = 40)
    var nickname: String? = null,
    @Column(length = 255)
    var email: String? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    var id: Long? = null

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    var status: UserStatus = UserStatus.GUEST

    @Column(name = "push_enabled", nullable = false)
    var pushEnabled: Boolean = false

    @Column(name = "onboarding_completed", nullable = false)
    var onboardingCompleted: Boolean = false

    @Column(name = "last_study_date")
    var lastStudyDate: LocalDate? = null

    @Column(name = "streak_days", nullable = false)
    var streakDays: Int = 0

    @Column(name = "withdrawn_at")
    var withdrawnAt: OffsetDateTime? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
