package com.bawibase.chorong.domain.community

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.PageMeta
import com.bawibase.chorong.common.api.PagedResponse
import com.fasterxml.jackson.annotation.JsonInclude
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Instant
import java.util.Base64

@JsonInclude(JsonInclude.Include.NON_NULL)
data class BlockedUser(
    val userId: Long,
    val nickname: String?,
    val blockedAt: Instant,
)

data class BlockedUsersData(
    val users: List<BlockedUser>,
)

@Service
class UserBlockService(
    private val jdbc: JdbcTemplate,
) {
    @Transactional
    fun block(
        userId: Long,
        targetUserId: Long,
    ) {
        requireActiveMember(userId)
        validateTarget(userId, targetUserId)
        val inserted =
            jdbc.update(
                """INSERT INTO user_block(user_id,blocked_user_id)
                   SELECT ?,user_id FROM app_user WHERE user_id=? AND status='ACTIVE'
                   ON CONFLICT (user_id,blocked_user_id) DO NOTHING""",
                userId,
                targetUserId,
            )
        if (inserted == 0) {
            val targetExists =
                jdbc
                    .query(
                        "SELECT user_id FROM app_user WHERE user_id=? AND status='ACTIVE'",
                        { rs, _ -> rs.getLong(1) },
                        targetUserId,
                    ).isNotEmpty()
            if (!targetExists) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        }
    }

    @Transactional
    fun unblock(
        userId: Long,
        targetUserId: Long,
    ) {
        requireActiveMember(userId)
        requireId(targetUserId)
        jdbc.update("DELETE FROM user_block WHERE user_id=? AND blocked_user_id=?", userId, targetUserId)
    }

    @Transactional(readOnly = true)
    fun list(
        userId: Long,
        cursor: String?,
        size: Int?,
    ): PagedResponse<BlockedUsersData> {
        requireActiveMember(userId)
        val pageSize = size ?: DEFAULT_PAGE_SIZE
        if (pageSize !in 1..MAX_PAGE_SIZE) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        val position = cursor?.let(::decodeCursor)
        val rows =
            if (position == null) {
                jdbc.query(LIST_SQL, blockMapper, userId, pageSize + 1)
            } else {
                jdbc.query(LIST_AFTER_CURSOR_SQL, blockMapper, userId, position.timestamp, position.id, pageSize + 1)
            }
        val hasNext = rows.size > pageSize
        val page = rows.take(pageSize)
        val nextCursor = page.lastOrNull()?.takeIf { hasNext }?.let { encodeCursor(it.blockedAt, it.blockId) }
        return PagedResponse(BlockedUsersData(page.map { it.user }), PageMeta(nextCursor))
    }

    @Transactional(readOnly = true)
    fun isBlockedEitherDirection(
        firstUserId: Long,
        secondUserId: Long,
    ): Boolean {
        if (firstUserId <= 0 || secondUserId <= 0 || firstUserId == secondUserId) return false
        return jdbc.queryForObject(
            """SELECT EXISTS (SELECT 1 FROM user_block
               WHERE (user_id=? AND blocked_user_id=?) OR (user_id=? AND blocked_user_id=?))""",
            Boolean::class.java,
            firstUserId,
            secondUserId,
            secondUserId,
            firstUserId,
        ) ?: false
    }

    private fun requireActiveMember(userId: Long) {
        requireId(userId)
        val active =
            jdbc
                .query(
                    "SELECT status='ACTIVE' FROM app_user WHERE user_id=?",
                    { rs, _ -> rs.getBoolean(1) },
                    userId,
                ).firstOrNull() ?: throw ApiV1Exception(ApiErrorCode.UNAUTHORIZED)
        if (!active) throw ApiV1Exception(ApiErrorCode.MEMBER_ONLY)
    }

    private fun validateTarget(
        userId: Long,
        targetUserId: Long,
    ) {
        requireId(targetUserId)
        if (userId == targetUserId) throw ApiV1Exception(ApiErrorCode.SELF_TARGET)
    }

    private fun requireId(id: Long) {
        if (id <= 0) throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
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
            CursorPosition(Timestamp.from(Instant.ofEpochSecond(seconds, nanos)), id)
        } catch (_: RuntimeException) {
            throw ApiV1Exception(ApiErrorCode.VALIDATION_FAILED)
        }

    private data class CursorPosition(
        val timestamp: Timestamp,
        val id: Long,
    )

    private data class BlockRow(
        val blockId: Long,
        val blockedAt: Instant,
        val user: BlockedUser,
    )

    companion object {
        private const val DEFAULT_PAGE_SIZE = 20
        private const val MAX_PAGE_SIZE = 100
        private const val MAX_CURSOR_LENGTH = 128
        private const val LIST_SQL =
            """SELECT b.block_id,b.blocked_user_id,u.nickname,b.blocked_at FROM user_block b
               JOIN app_user u ON u.user_id=b.blocked_user_id AND u.status='ACTIVE'
               WHERE b.user_id=? ORDER BY b.blocked_at DESC,b.block_id DESC LIMIT ?"""
        private const val LIST_AFTER_CURSOR_SQL =
            """SELECT b.block_id,b.blocked_user_id,u.nickname,b.blocked_at FROM user_block b
               JOIN app_user u ON u.user_id=b.blocked_user_id AND u.status='ACTIVE'
               WHERE b.user_id=? AND (b.blocked_at,b.block_id) < (?,?)
               ORDER BY b.blocked_at DESC,b.block_id DESC LIMIT ?"""
        private val blockMapper =
            org.springframework.jdbc.core.RowMapper<BlockRow> { rs, _ ->
                val blockedAt = rs.getTimestamp("blocked_at").toInstant()
                BlockRow(
                    blockId = rs.getLong("block_id"),
                    blockedAt = blockedAt,
                    user = BlockedUser(rs.getLong("blocked_user_id"), rs.getString("nickname"), blockedAt),
                )
            }
    }
}
