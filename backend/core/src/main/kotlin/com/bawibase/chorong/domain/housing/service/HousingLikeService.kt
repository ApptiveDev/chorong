package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

data class LikeStateResponse(
    val housingId: Long,
    val likeCount: Int,
    val likedByMe: Boolean,
)

@Service
class HousingLikeService(
    private val jdbc: JdbcTemplate,
) {
    @Transactional
    fun like(
        userId: Long,
        housingId: Long,
    ): LikeStateResponse {
        validateIds(userId, housingId)
        if (userId == housingId) throw ApiV1Exception(ApiErrorCode.SELF_TARGET)
        requireVisible(userId, housingId)
        jdbc.update(
            "INSERT INTO housing_like(housing_user_id,liker_user_id) VALUES (?,?) ON CONFLICT DO NOTHING",
            housingId,
            userId,
        )
        return state(userId, housingId)
    }

    @Transactional
    fun unlike(
        userId: Long,
        housingId: Long,
    ): LikeStateResponse {
        validateIds(userId, housingId)
        if (userId == housingId) throw ApiV1Exception(ApiErrorCode.SELF_TARGET)
        requireVisible(userId, housingId)
        jdbc.update("DELETE FROM housing_like WHERE housing_user_id=? AND liker_user_id=?", housingId, userId)
        return state(userId, housingId)
    }

    private fun requireVisible(
        userId: Long,
        housingId: Long,
    ) {
        val visible =
            jdbc.queryForObject(
                """SELECT EXISTS (
                   SELECT 1 FROM housing_profile p JOIN app_user u ON u.user_id=p.user_id
                   WHERE p.user_id=? AND p.is_public AND u.status='ACTIVE'
                     AND NOT EXISTS (SELECT 1 FROM housing_moderation_hide h
                       WHERE h.housing_user_id=p.user_id AND h.hidden_until>now())
                     AND NOT EXISTS (SELECT 1 FROM user_block b
                       WHERE (b.user_id=? AND b.blocked_user_id=p.user_id)
                          OR (b.user_id=p.user_id AND b.blocked_user_id=?))
               )""",
                Boolean::class.java,
                housingId,
                userId,
                userId,
            ) ?: false
        if (!visible) throw ApiV1Exception(ApiErrorCode.HOUSING_NOT_VISIBLE)
    }

    private fun state(
        userId: Long,
        housingId: Long,
    ): LikeStateResponse =
        jdbc
            .queryForObject(
                """SELECT COUNT(*)::int AS like_count,
                      COUNT(*) FILTER (WHERE liker_user_id=?) > 0 AS liked_by_me
                   FROM housing_like WHERE housing_user_id=?""",
                { rs, _ -> LikeStateResponse(housingId, rs.getInt("like_count"), rs.getBoolean("liked_by_me")) },
                userId,
                housingId,
            ) ?: LikeStateResponse(housingId, 0, false)

    private fun validateIds(
        userId: Long,
        housingId: Long,
    ) {
        if (userId <= 0 || housingId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }
}
