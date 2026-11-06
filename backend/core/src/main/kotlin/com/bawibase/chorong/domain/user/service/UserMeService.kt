package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.domain.user.AuthProvider
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.controller.WalletBalancesResponse
import com.bawibase.chorong.domain.user.entity.UserEntity
import com.bawibase.chorong.domain.user.repository.UserAuthRepository
import com.bawibase.chorong.domain.user.repository.UserRepository
import com.fasterxml.jackson.databind.JsonNode
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class UserMeProgress(
    val completedLessons: Int,
    val totalLessons: Int,
)

data class UserMeHousing(
    val isPublic: Boolean,
    val likeCount: Int,
)

data class UserMeResponse(
    val userId: Long,
    val nickname: String,
    val status: String,
    val providers: List<String>,
    val wallet: WalletBalancesResponse,
    val progress: UserMeProgress,
    val housing: UserMeHousing,
    val onboardingCompleted: Boolean,
    val pushEnabled: Boolean,
    val streakDays: Int,
    val lastStudyDate: java.time.LocalDate?,
)

@Service
class UserMeService(
    private val jdbc: JdbcTemplate,
    private val users: UserRepository,
    private val auths: UserAuthRepository,
    private val wallets: UserWalletService,
) {
    @Transactional
    fun get(userId: Long): UserMeResponse {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val user = findAvailableUser(userId)
        val wallet = wallets.ensureWallet(userId)
        val providers =
            auths
                .findAllByUserId(userId)
                .map { if (it.provider == AuthProvider.PASSWORD) "EMAIL" else it.provider.name }
                .distinct()
                .sorted()
        val progress =
            jdbc
                .query(
                    """SELECT COUNT(DISTINCT lp.lesson_id) FILTER (WHERE lp.status='COMPLETED')::int AS completed,
                          COUNT(DISTINCT l.lesson_id)::int AS total
                   FROM course c JOIN lesson l ON l.course_id=c.course_id
                   LEFT JOIN lesson_progress lp ON lp.user_id=? AND lp.lesson_id=l.lesson_id
                   WHERE NOT c.is_onboarding""",
                    { rs, _ -> UserMeProgress(rs.getInt("completed"), rs.getInt("total")) },
                    userId,
                ).single()
        val isPublic =
            jdbc
                .query(
                    "SELECT is_public FROM housing_profile WHERE user_id=?",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: false
        val likeCount =
            jdbc.queryForObject(
                "SELECT COUNT(*)::int FROM housing_like WHERE housing_user_id=?",
                Int::class.java,
                userId,
            ) ?: 0
        return UserMeResponse(
            userId = userId,
            nickname = UserNicknamePolicy.displayName(user.nickname, user.status),
            status = user.status.name,
            providers = providers,
            wallet = WalletBalancesResponse(wallet.stardust),
            progress = progress,
            housing = UserMeHousing(isPublic, likeCount),
            onboardingCompleted = user.onboardingCompleted,
            pushEnabled = user.pushEnabled,
            streakDays = user.streakDays,
            lastStudyDate = user.lastStudyDate,
        )
    }

    @Transactional
    fun update(
        userId: Long,
        patch: JsonNode,
    ): UserMeResponse {
        if (userId <= 0 || !patch.isObject) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        var nickname: String? = null
        var updateNickname = false
        if (patch.has("nickname") && !patch.get("nickname").isNull) {
            val value = patch.get("nickname")
            if (!value.isTextual) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
            nickname = UserNicknamePolicy.validate(value.textValue())
            updateNickname = true
        }
        var pushEnabled: Boolean? = null
        if (patch.has("pushEnabled") && !patch.get("pushEnabled").isNull) {
            val value = patch.get("pushEnabled")
            if (!value.isBoolean) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
            pushEnabled = value.booleanValue()
        }
        if (!updateNickname && pushEnabled == null) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)

        val user = findAvailableUserForUpdate(userId)
        if (updateNickname) user.nickname = nickname
        pushEnabled?.let { user.pushEnabled = it }
        users.save(user)
        return get(userId)
    }

    private fun findAvailableUser(userId: Long): UserEntity {
        val user = users.findById(userId).orElseThrow { ApiV1Exception(ApiErrorCode.UNAUTHORIZED) }
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        return user
    }

    private fun findAvailableUserForUpdate(userId: Long): UserEntity {
        val user = users.findByIdForUpdate(userId) ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!user.status.available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        return user
    }
}
