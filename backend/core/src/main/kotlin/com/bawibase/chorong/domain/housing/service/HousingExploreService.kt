package com.bawibase.chorong.domain.housing.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.PageMeta
import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.domain.housing.dto.PlacementResponse
import com.bawibase.chorong.domain.housing.dto.PublicHousingDetailResponse
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Instant
import java.util.Base64

data class HousingExploreCard(
    val housingId: Long,
    val ownerNickname: String?,
    val name: String,
    val likeCount: Int,
    val likedByMe: Boolean,
    val preview: List<PlacementResponse>,
)

data class HousingExploreData(
    val housings: List<HousingExploreCard>,
)

@Service
class HousingExploreService(
    private val jdbc: JdbcTemplate,
    private val housing: HousingService,
    private val catalog: HousingCatalogService,
) {
    @Transactional(readOnly = true)
    fun explore(
        userId: Long,
        sort: String,
        cursor: String?,
        size: Int?,
    ): PagedResponse<HousingExploreData> {
        requireId(userId)
        if (sort !in SORTS) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        requirePublicSelf(userId)
        val pageSize = size ?: DEFAULT_PAGE_SIZE
        if (pageSize !in 1..MAX_PAGE_SIZE) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val position = cursor?.let { decodeCursor(it, sort) }
        val rows =
            when {
                sort == RECENT && position == null -> {
                    jdbc.query(RECENT_SQL, cardMapper, userId, userId, userId, userId, pageSize + 1)
                }

                sort == RECENT -> {
                    jdbc.query(
                        RECENT_AFTER_CURSOR_SQL,
                        cardMapper,
                        userId,
                        userId,
                        userId,
                        userId,
                        position!!.timestamp,
                        position.userId,
                        pageSize + 1,
                    )
                }

                position == null -> {
                    jdbc.query(POPULAR_SQL, cardMapper, userId, userId, userId, userId, pageSize + 1)
                }

                else -> {
                    jdbc.query(
                        POPULAR_AFTER_CURSOR_SQL,
                        cardMapper,
                        userId,
                        userId,
                        userId,
                        userId,
                        position!!.likeCount,
                        position.timestamp,
                        position.userId,
                        pageSize + 1,
                    )
                }
            }
        val hasNext = rows.size > pageSize
        val page = rows.take(pageSize)
        val catalogSnapshot = catalog.snapshot()
        val previews = housing.publicPreviews(page.map { it.userId }, catalogSnapshot)
        val cards = page.map { it.toCard(previews[it.userId].orEmpty()) }
        val nextCursor = page.lastOrNull()?.takeIf { hasNext }?.let { encodeCursor(sort, it.likeCount, it.modifiedAt, it.userId) }
        return PagedResponse(HousingExploreData(cards), PageMeta(nextCursor))
    }

    @Transactional(readOnly = true)
    fun getPublicHousing(
        userId: Long,
        housingId: Long,
    ): PublicHousingDetailResponse {
        requireId(userId)
        requireId(housingId)
        if (userId == housingId) throw ApiV1Exception(ApiErrorCode.HOUSING_NOT_VISIBLE)
        val owner =
            jdbc
                .query(
                    """SELECT u.nickname,
                         (SELECT COUNT(*)::int FROM housing_like l WHERE l.housing_user_id=u.user_id) AS like_count,
                         EXISTS (SELECT 1 FROM housing_like l WHERE l.housing_user_id=u.user_id AND l.liker_user_id=?) AS liked_by_me
                       FROM app_user u JOIN housing_profile p ON p.user_id=u.user_id
                       WHERE u.user_id=? AND u.status='ACTIVE' AND p.is_public
                         AND NOT EXISTS (SELECT 1 FROM housing_moderation_hide h WHERE h.housing_user_id=u.user_id AND h.hidden_until>now())
                         AND NOT EXISTS (SELECT 1 FROM user_block b
                           WHERE (b.user_id=? AND b.blocked_user_id=u.user_id)
                              OR (b.user_id=u.user_id AND b.blocked_user_id=?))""",
                    { rs, _ -> PublicOwner(rs.getString("nickname"), rs.getInt("like_count"), rs.getBoolean("liked_by_me")) },
                    userId,
                    housingId,
                    userId,
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.HOUSING_NOT_VISIBLE)
        return housing.publicDetail(housingId, owner.nickname, owner.likedByMe, owner.likeCount)
    }

    private fun requirePublicSelf(userId: Long) {
        val isPublic =
            jdbc
                .query(
                    """SELECT p.is_public FROM app_user u JOIN housing_profile p ON p.user_id=u.user_id
                       WHERE u.user_id=? AND u.status='ACTIVE'""",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: false
        if (!isPublic) throw ApiV1Exception(ApiErrorCode.HOUSING_PRIVATE_SELF)
    }

    private fun encodeCursor(
        sort: String,
        likeCount: Int,
        modifiedAt: Instant,
        userId: Long,
    ): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(
            "$sort:$likeCount:${modifiedAt.epochSecond}:${modifiedAt.nano}:$userId".toByteArray(Charsets.UTF_8),
        )

    private fun decodeCursor(
        cursor: String,
        expectedSort: String,
    ): ExploreCursor =
        try {
            if (cursor.length > MAX_CURSOR_LENGTH) throw IllegalArgumentException()
            val parts = String(Base64.getUrlDecoder().decode(cursor), Charsets.UTF_8).split(':')
            if (parts.size != 5 || parts[0] != expectedSort) throw IllegalArgumentException()
            val likeCount = parts[1].toInt()
            val seconds = parts[2].toLong()
            val nanos = parts[3].toLong()
            val userId = parts[4].toLong()
            if (likeCount < 0 || nanos !in 0..999_999_999 || userId <= 0) throw IllegalArgumentException()
            ExploreCursor(likeCount, Timestamp.from(Instant.ofEpochSecond(seconds, nanos)), userId)
        } catch (_: RuntimeException) {
            throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
    }

    private data class ExploreCursor(
        val likeCount: Int,
        val timestamp: Timestamp,
        val userId: Long,
    )

    private data class PublicOwner(
        val nickname: String?,
        val likeCount: Int,
        val likedByMe: Boolean,
    )

    private data class HousingRow(
        val userId: Long,
        val nickname: String?,
        val name: String,
        val likeCount: Int,
        val modifiedAt: Instant,
        val likedByMe: Boolean,
    ) {
        fun toCard(preview: List<PlacementResponse>) = HousingExploreCard(userId, nickname, name, likeCount, likedByMe, preview = preview)
    }

    companion object {
        private const val RECENT = "recent"
        private const val POPULAR = "popular"
        private val SORTS = setOf(RECENT, POPULAR)
        private const val DEFAULT_PAGE_SIZE = 20
        private const val MAX_PAGE_SIZE = 100
        private const val MAX_CURSOR_LENGTH = 128

        private const val BASE_SQL =
            """SELECT u.user_id,u.nickname,p.name,p.modified_at,l.like_count,l.liked_by_me
               FROM housing_profile p JOIN app_user u ON u.user_id=p.user_id
               CROSS JOIN LATERAL (
                 SELECT COUNT(*)::int AS like_count,
                        COUNT(*) FILTER (WHERE liker_user_id=?) > 0 AS liked_by_me
                 FROM housing_like WHERE housing_user_id=u.user_id
               ) l
               WHERE u.status='ACTIVE' AND p.is_public AND u.user_id<>?
                 AND NOT EXISTS (SELECT 1 FROM housing_moderation_hide h WHERE h.housing_user_id=u.user_id AND h.hidden_until>now())
                 AND NOT EXISTS (SELECT 1 FROM user_block b WHERE b.user_id=? AND b.blocked_user_id=u.user_id)
                 AND NOT EXISTS (SELECT 1 FROM user_block b WHERE b.user_id=u.user_id AND b.blocked_user_id=?)"""
        private const val RECENT_SQL = "$BASE_SQL ORDER BY p.modified_at DESC,u.user_id DESC LIMIT ?"
        private const val RECENT_AFTER_CURSOR_SQL =
            "$BASE_SQL AND (p.modified_at,u.user_id) < (?,?) ORDER BY p.modified_at DESC,u.user_id DESC LIMIT ?"
        private const val POPULAR_SQL = "$BASE_SQL ORDER BY like_count DESC,p.modified_at DESC,u.user_id DESC LIMIT ?"
        private const val POPULAR_AFTER_CURSOR_SQL =
            "$BASE_SQL AND (l.like_count,p.modified_at,u.user_id) < (?,?,?) ORDER BY l.like_count DESC,p.modified_at DESC,u.user_id DESC LIMIT ?"

        private val cardMapper =
            org.springframework.jdbc.core.RowMapper<HousingRow> { rs, _ ->
                HousingRow(
                    userId = rs.getLong("user_id"),
                    nickname = rs.getString("nickname"),
                    name = rs.getString("name"),
                    likeCount = rs.getInt("like_count"),
                    modifiedAt = rs.getTimestamp("modified_at").toInstant(),
                    likedByMe = rs.getBoolean("liked_by_me"),
                )
            }
    }
}
