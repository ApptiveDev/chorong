package com.bawibase.chorong.domain.user.service

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.PageMeta
import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.domain.learning.LearningArtwork
import com.bawibase.chorong.domain.learning.LearningRewardBadge
import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Instant
import java.util.Base64

@JsonInclude(JsonInclude.Include.NON_NULL)
data class RewardSource(
    val courseId: Long? = null,
    val lessonId: Long? = null,
    val courseTitle: String? = null,
    val lessonTitle: String? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class RewardRecordResponse(
    val type: String,
    val currency: String? = null,
    val amount: Long? = null,
    val itemId: Long? = null,
    val badge: LearningRewardBadge? = null,
    val artwork: LearningArtwork? = null,
    val source: RewardSource = RewardSource(),
    val grantedAt: Instant,
)

data class RewardPageData(
    val rewards: List<RewardRecordResponse>,
)

data class ArtworkPageData(
    val artworks: List<LearningArtwork>,
)

data class InventoryCopy(
    val inventoryId: String,
    val acquiredVia: String,
    val acquiredAt: Instant,
    val placed: Boolean,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class InventoryItemResponse(
    val itemId: Long,
    val itemType: String,
    val name: String,
    val optionId: Long?,
    val option: Map<String, Any?>?,
    val ownedCount: Int,
    val placedCount: Int,
    val availableCount: Int,
    val copies: List<InventoryCopy>,
)

data class InventoryData(
    val items: List<InventoryItemResponse>,
)

data class ConstellationResponse(
    val constellationId: Long,
    val courseId: Long,
    val name: String,
    val starCount: Int,
    val earnedStars: Int,
    val badgeEarned: Boolean,
    val imageUrl: String? = null,
)

data class ConstellationData(
    val constellations: List<ConstellationResponse>,
)

@Service
class RewardReadService(
    private val jdbc: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    @Transactional(readOnly = true)
    fun artworks(
        userId: Long,
        cursor: String?,
        size: Int?,
    ): PagedResponse<ArtworkPageData> {
        requireUser(userId)
        val pageSize = size ?: DEFAULT_PAGE_SIZE
        if (pageSize !in 1..MAX_PAGE_SIZE) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val position = cursor?.let(::decodeCursor)
        val mapper =
            org.springframework.jdbc.core.RowMapper<LearningArtwork> { rs, _ ->
                LearningArtwork(
                    rs.getLong("artwork_id"),
                    rs.getLong("lesson_id"),
                    rs.getString("image_url"),
                    rs.getTimestamp("completed_at").toInstant(),
                )
            }
        val rows =
            if (position == null) {
                jdbc.query(
                    "SELECT * FROM learning_artwork WHERE user_id=? ORDER BY completed_at DESC, artwork_id DESC LIMIT ?",
                    mapper,
                    userId,
                    pageSize + 1,
                )
            } else {
                jdbc.query(
                    "SELECT * FROM learning_artwork WHERE user_id=? AND (completed_at,artwork_id) < (?,?) ORDER BY completed_at DESC,artwork_id DESC LIMIT ?",
                    mapper,
                    userId,
                    position.timestamp,
                    position.id,
                    pageSize + 1,
                )
            }
        val page = rows.take(pageSize)
        val next = page.lastOrNull()?.takeIf { rows.size > pageSize }?.let { encodeCursor(it.completedAt, it.artworkId) }
        return PagedResponse(ArtworkPageData(page), PageMeta(next))
    }

    @Transactional(readOnly = true)
    fun rewards(
        userId: Long,
        cursor: String?,
        size: Int?,
    ): PagedResponse<RewardPageData> {
        requireUser(userId)
        val pageSize = size ?: DEFAULT_PAGE_SIZE
        if (pageSize !in 1..MAX_PAGE_SIZE) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val position = cursor?.let(::decodeCursor)
        val rows =
            if (position == null) {
                jdbc.query(REWARDS_SQL, rewardMapper, userId, pageSize + 1)
            } else {
                jdbc.query(REWARDS_AFTER_CURSOR_SQL, rewardMapper, userId, position.timestamp, position.id, pageSize + 1)
            }
        val hasNext = rows.size > pageSize
        val page = rows.take(pageSize)
        val nextCursor = page.lastOrNull()?.takeIf { hasNext }?.let { encodeCursor(it.grantedAt, it.rewardLedgerId) }
        return PagedResponse(RewardPageData(page.map { it.record }), PageMeta(nextCursor))
    }

    @Transactional(readOnly = true)
    fun constellations(userId: Long): ConstellationData {
        requireUser(userId)
        val rows =
            jdbc.query(
                """SELECT c.constellation_id, c.course_id, c.title,
                          COUNT(DISTINCT l.lesson_id)::int AS star_count,
                          COUNT(DISTINCT l.lesson_id) FILTER (WHERE r.reward_ledger_id IS NOT NULL)::int AS earned_stars,
                          EXISTS (SELECT 1 FROM reward_ledger badge
                                  WHERE badge.user_id=? AND badge.source_type='COURSE'
                                    AND badge.source_id=c.course_id AND badge.reward_type='CONSTELLATION'
                                    AND badge.constellation_id=c.constellation_id) AS badge_earned
                   FROM course c
                   LEFT JOIN lesson l ON l.course_id=c.course_id
                   LEFT JOIN reward_ledger r ON r.user_id=? AND r.source_type='LESSON'
                     AND r.source_id=l.lesson_id AND r.reward_type='WALLET' AND r.currency IN ('STAR','STARDUST')
                   WHERE c.constellation_id IS NOT NULL
                   GROUP BY c.course_id ORDER BY c.course_order,c.course_id""",
                { rs, _ ->
                    ConstellationResponse(
                        constellationId = rs.getLong("constellation_id"),
                        courseId = rs.getLong("course_id"),
                        name = rs.getString("title"),
                        starCount = rs.getInt("star_count"),
                        earnedStars = rs.getInt("earned_stars"),
                        badgeEarned = rs.getBoolean("badge_earned"),
                    )
                },
                userId,
                userId,
            )
        return ConstellationData(rows)
    }

    @Transactional(readOnly = true)
    fun inventory(
        userId: Long,
        itemType: String?,
    ): InventoryData {
        requireUser(userId)
        val filter = itemType
        if (filter != null && filter !in INVENTORY_TYPES) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val rows =
            jdbc.query(
                INVENTORY_SQL,
                { rs, _ ->
                    InventoryRow(
                        ownedItemId = rs.getLong("owned_item_id"),
                        itemId = rs.getLong("item_id"),
                        itemType = rs.getString("item_type"),
                        name = rs.getString("item_name"),
                        acquiredVia = rs.getString("acquired_via"),
                        acquiredAt = rs.getTimestamp("created_at").toInstant(),
                        placed = rs.getBoolean("placed"),
                    )
                },
                userId,
            )
        val legacyItems =
            rows
                .asSequence()
                .filter { it.name != null }
                .filter {
                    filter == null || (filter == FURNITURE && it.itemType == "FURNITURE") ||
                        (filter == OBJECT && it.itemType != "FURNITURE")
                }.map(::legacyEntry)
                .toList()
        val optionType = object : TypeReference<Map<String, Any?>>() {}
        val storeItems =
            jdbc
                .query(
                    STORE_INVENTORY_SQL,
                    { rs, _ ->
                        val copy =
                            InventoryCopy(
                                "store:${rs.getLong("inventory_id")}",
                                rs.getString("acquired_via"),
                                rs.getTimestamp("acquired_at").toInstant(),
                                rs.getBoolean("placed"),
                            )
                        InventoryEntry(
                            rs.getLong("item_id"),
                            rs.getString("item_type"),
                            rs.getString("item_name"),
                            rs.getLong("option_id"),
                            objectMapper.readValue(rs.getString("option_json"), optionType),
                            copy,
                        )
                    },
                    userId,
                ).filter { filter == null || it.itemType == filter }
        val groupedEntries = (legacyItems + storeItems).groupBy { Triple(it.itemType, it.itemId, it.optionId) }
        val copyOrder = compareByDescending<InventoryCopy> { it.acquiredAt }.thenBy { it.inventoryId }
        val groups =
            groupedEntries.values
                .map { entries ->
                    val first = entries.first()
                    val copies = entries.map { it.copy }.sortedWith(copyOrder)
                    val placed = copies.count { it.placed }
                    InventoryItemResponse(
                        first.itemId,
                        if (first.itemType == FURNITURE) FURNITURE else OBJECT,
                        first.name,
                        first.optionId,
                        first.option,
                        copies.size,
                        placed,
                        copies.size - placed,
                        copies,
                    )
                }.sortedByDescending { it.copies.first().acquiredAt }
        return InventoryData(groups)
    }

    private fun legacyEntry(row: InventoryRow): InventoryEntry {
        val copy = InventoryCopy(row.ownedItemId.toString(), row.acquiredVia, row.acquiredAt, row.placed)
        return InventoryEntry(row.itemId, row.itemType, checkNotNull(row.name), null, null, copy)
    }

    private fun requireUser(userId: Long) {
        if (userId <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val available =
            jdbc
                .query(
                    "SELECT status <> 'WITHDRAWN' FROM app_user WHERE user_id=?",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!available) throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
    }

    private fun encodeCursor(
        instant: Instant,
        id: Long,
    ): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString("${instant.epochSecond}:${instant.nano}:$id".toByteArray(Charsets.UTF_8))

    private fun decodeCursor(cursor: String): CursorPosition =
        try {
            if (cursor.length > MAX_CURSOR_LENGTH) throw IllegalArgumentException()
            val parts = String(Base64.getUrlDecoder().decode(cursor), Charsets.UTF_8).split(':')
            if (parts.size != 3) throw IllegalArgumentException()
            val seconds = parts[0].toLong()
            val nanos = parts[1].toLong()
            val id = parts[2].toLong()
            if (nanos !in 0..999_999_999 || id <= 0) throw IllegalArgumentException()
            val instant = Instant.ofEpochSecond(seconds, nanos)
            CursorPosition(Timestamp.from(instant), id)
        } catch (_: RuntimeException) {
            throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }

    private data class CursorPosition(
        val timestamp: Timestamp,
        val id: Long,
    )

    private data class RewardRow(
        val rewardLedgerId: Long,
        val grantedAt: Instant,
        val record: RewardRecordResponse,
    )

    private data class InventoryRow(
        val ownedItemId: Long,
        val itemId: Long,
        val itemType: String,
        val name: String?,
        val acquiredVia: String,
        val acquiredAt: Instant,
        val placed: Boolean,
    )

    private data class InventoryEntry(
        val itemId: Long,
        val itemType: String,
        val name: String,
        val optionId: Long?,
        val option: Map<String, Any?>?,
        val copy: InventoryCopy,
    )

    companion object {
        private const val DEFAULT_PAGE_SIZE = 20
        private const val MAX_PAGE_SIZE = 100
        private const val MAX_CURSOR_LENGTH = 128
        private const val FURNITURE = "FURNITURE"
        private const val OBJECT = "OBJECT"
        private val INVENTORY_TYPES = setOf(FURNITURE, OBJECT)

        private const val REWARD_SELECT =
            """SELECT r.reward_ledger_id, r.created_at, r.reward_type, r.currency, r.amount, r.item_id,
                      r.constellation_id, r.badge_type, l.lesson_id, l.title AS lesson_title, c.course_id, c.title AS course_title,
                      a.artwork_id, a.lesson_id AS artwork_lesson_id, a.image_url AS artwork_image_url, a.completed_at AS artwork_completed_at,
                      CASE WHEN r.reward_type='CONSTELLATION' THEN r.constellation_id END AS badge_constellation_id
               FROM reward_ledger r
               LEFT JOIN learning_artwork a ON a.artwork_id=r.artwork_id AND a.user_id=r.user_id
               LEFT JOIN review_session s ON r.source_type='REVIEW' AND s.review_session_id=r.source_id
               LEFT JOIN lesson l ON l.lesson_id=CASE
                 WHEN r.source_type IN ('LESSON','ONBOARDING') THEN r.source_id
                 WHEN r.source_type='REVIEW' THEN s.lesson_id END
               LEFT JOIN course c ON c.course_id=CASE WHEN r.source_type='COURSE' THEN r.source_id ELSE l.course_id END
               WHERE r.user_id=? AND (r.currency IS NULL OR r.currency <> 'STAR')"""

        private const val REWARDS_SQL = "$REWARD_SELECT ORDER BY r.created_at DESC,r.reward_ledger_id DESC LIMIT ?"
        private const val REWARDS_AFTER_CURSOR_SQL =
            "$REWARD_SELECT AND (r.created_at,r.reward_ledger_id) < (?,?) ORDER BY r.created_at DESC,r.reward_ledger_id DESC LIMIT ?"

        private val rewardMapper =
            org.springframework.jdbc.core.RowMapper<RewardRow> { rs, _ ->
                val courseId = rs.getLong("course_id").let { if (rs.wasNull()) null else it }
                val lessonId = rs.getLong("lesson_id").let { if (rs.wasNull()) null else it }
                val constellationId = rs.getLong("badge_constellation_id").let { if (rs.wasNull()) null else it }
                val courseTitle = rs.getString("course_title")
                val lessonTitle = rs.getString("lesson_title")
                val source = RewardSource(courseId, lessonId, courseTitle, lessonTitle)
                val grantedAt = rs.getTimestamp("created_at").toInstant()
                RewardRow(
                    rewardLedgerId = rs.getLong("reward_ledger_id"),
                    grantedAt = grantedAt,
                    record =
                        RewardRecordResponse(
                            type = rs.getString("reward_type"),
                            currency = rs.getString("currency"),
                            amount = rs.getLong("amount").let { if (rs.wasNull()) null else it },
                            itemId = rs.getLong("item_id").let { if (rs.wasNull()) null else it },
                            badge =
                                constellationId?.let {
                                    LearningRewardBadge(
                                        rs.getString("badge_type"),
                                        it,
                                        lessonId.takeIf {
                                            rs.getString("badge_type") ==
                                                "STAR"
                                        },
                                    )
                                },
                            artwork =
                                rs.getLong("artwork_id").let { artworkId ->
                                    if (rs.wasNull()) {
                                        null
                                    } else {
                                        LearningArtwork(
                                            artworkId,
                                            rs.getLong("artwork_lesson_id"),
                                            rs.getString("artwork_image_url"),
                                            rs.getTimestamp("artwork_completed_at").toInstant(),
                                        )
                                    }
                                },
                            source = source,
                            grantedAt = grantedAt,
                        ),
                )
            }

        private const val INVENTORY_SQL =
            """SELECT o.owned_item_id,o.item_id,o.item_type,o.created_at,o.acquired_via,
                      COALESCE(f.name,b.name,w.name,fl.name,a.name,rm.name) AS item_name,
                      CASE WHEN EXISTS (SELECT 1 FROM housing_coordinate_placement cp WHERE cp.owned_item_id=o.owned_item_id) THEN TRUE
                      WHEN o.owned_item_id <> (SELECT MIN(first_owned.owned_item_id) FROM housing_owned_item first_owned
                           WHERE first_owned.user_id=o.user_id AND first_owned.item_type=o.item_type AND first_owned.item_id=o.item_id) THEN FALSE
                      ELSE CASE o.item_type
                        WHEN 'FURNITURE' THEN EXISTS (SELECT 1 FROM housing_layout_placement p JOIN housing_room_layout x ON x.layout_id=p.layout_id WHERE x.user_id=o.user_id AND p.furniture_id=o.item_id)
                        WHEN 'BACKGROUND' THEN EXISTS (SELECT 1 FROM housing_room_layout x WHERE x.user_id=o.user_id AND x.background_id=o.item_id)
                        WHEN 'AVATAR' THEN EXISTS (SELECT 1 FROM housing_room_layout x WHERE x.user_id=o.user_id AND x.avatar_id=o.item_id)
                        WHEN 'ROOM' THEN EXISTS (SELECT 1 FROM housing_profile hp WHERE hp.user_id=o.user_id AND hp.active_room_id=o.item_id)
                        WHEN 'WALL' THEN EXISTS (SELECT 1 FROM housing_layout_surface_skin s JOIN housing_room_layout x ON x.layout_id=s.layout_id WHERE x.user_id=o.user_id AND s.skin_type='WALL' AND s.skin_id=o.item_id)
                        WHEN 'FLOOR' THEN EXISTS (SELECT 1 FROM housing_layout_surface_skin s JOIN housing_room_layout x ON x.layout_id=s.layout_id WHERE x.user_id=o.user_id AND s.skin_type='FLOOR' AND s.skin_id=o.item_id)
                        ELSE FALSE END END AS placed
               FROM housing_owned_item o
               LEFT JOIN housing_furniture f ON o.item_type='FURNITURE' AND f.furniture_id=o.item_id
               LEFT JOIN housing_background b ON o.item_type='BACKGROUND' AND b.background_id=o.item_id
               LEFT JOIN housing_wall w ON o.item_type='WALL' AND w.wall_id=o.item_id
               LEFT JOIN housing_floor fl ON o.item_type='FLOOR' AND fl.floor_id=o.item_id
               LEFT JOIN housing_avatar a ON o.item_type='AVATAR' AND a.avatar_id=o.item_id
               LEFT JOIN housing_room rm ON o.item_type='ROOM' AND rm.room_id=o.item_id
               WHERE o.user_id=? ORDER BY o.created_at DESC,o.owned_item_id DESC"""

        private const val STORE_INVENTORY_SQL =
            """SELECT own.inventory_id,own.acquired_via,item.item_id,item.item_type,item.name AS item_name,option.option_id,
                      option.option_json::text AS option_json,own.acquired_at,
                      EXISTS (SELECT 1 FROM housing_coordinate_placement placement
                              WHERE placement.store_inventory_id=own.inventory_id) AS placed
               FROM housing_store_owned_option own
               JOIN housing_store_option option ON option.option_id=own.option_id
               JOIN housing_store_item item ON item.item_id=option.item_id
               WHERE own.user_id=? ORDER BY own.acquired_at DESC,own.inventory_id DESC"""
    }
}
