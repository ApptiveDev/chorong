package com.bawibase.chorong.domain.notification

import com.bawibase.chorong.common.api.ApiErrorCode
import com.bawibase.chorong.common.api.ApiV1Exception
import com.bawibase.chorong.common.api.CursorCodec
import com.bawibase.chorong.common.api.CursorPagination
import com.bawibase.chorong.common.api.CursorPosition
import com.bawibase.chorong.common.api.CursorSort
import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.domain.user.UserNicknamePolicy
import com.bawibase.chorong.domain.user.UserStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.sql.Timestamp
import java.time.Instant

enum class NotificationType { HOUSING_LIKE }

data class NotificationActor(
    val userId: Long,
    val nickname: String,
)

data class NotificationItem(
    val notificationId: Long,
    val type: NotificationType,
    val actor: NotificationActor,
    val read: Boolean,
    val createdAt: Instant,
)

data class NotificationsData(
    val notifications: List<NotificationItem>,
)

/** 앱 내 알림함(API-303·304). 목록·닷·읽음 처리는 같은 보이기 규칙(VISIBLE)을 쓴다. */
@Service
class NotificationService(
    private val jdbc: JdbcTemplate,
    private val cursors: CursorCodec,
) {
    /** 같은 사람의 좋아요 알림은 한 번만 만든다. 이미 있으면 아무것도 하지 않는다. */
    fun recordHousingLike(
        ownerUserId: Long,
        actorUserId: Long,
    ) {
        jdbc.update(
            """INSERT INTO user_notification(user_id,type,actor_user_id) VALUES (?,?,?)
               ON CONFLICT (user_id,type,actor_user_id) DO NOTHING""",
            ownerUserId,
            NotificationType.HOUSING_LIKE.name,
            actorUserId,
        )
    }

    @Transactional(readOnly = true)
    fun list(
        userId: Long,
        cursor: String?,
        size: Int?,
    ): PagedResponse<NotificationsData> {
        val limit = CursorPagination.size(size ?: DEFAULT_PAGE_SIZE)
        val after = cursors.decode(cursor, CURSOR_SCOPE, CursorSort.INSTANT)
        val rows =
            if (after == null) {
                jdbc.query("$LIST_SQL $ORDER_LIMIT", mapper, userId, limit + 1)
            } else {
                jdbc.query(
                    "$LIST_SQL AND (n.created_at,n.notification_id) < (?,?) $ORDER_LIMIT",
                    mapper,
                    userId,
                    Timestamp.from(Instant.parse(after.sortValue)),
                    after.id,
                    limit + 1,
                )
            }
        val page =
            CursorPagination.page(rows, limit) {
                cursors.encode(CURSOR_SCOPE, CursorSort.INSTANT, CursorPosition(it.createdAt.toString(), it.notificationId))
            }
        return PagedResponse(NotificationsData(page.items), page.meta)
    }

    fun hasUnread(userId: Long): Boolean =
        jdbc.queryForObject(
            """SELECT EXISTS (SELECT 1 FROM user_notification n
               WHERE n.user_id=? AND n.read_at IS NULL AND $VISIBLE)""",
            Boolean::class.java,
            userId,
        ) ?: false

    @Transactional
    fun markRead(
        userId: Long,
        notificationId: Long,
    ) {
        if (notificationId <= 0) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
        val updated =
            jdbc.update(
                """UPDATE user_notification n SET read_at=COALESCE(n.read_at,now())
                   WHERE n.notification_id=? AND n.user_id=? AND $VISIBLE""",
                notificationId,
                userId,
            )
        if (updated == 0) throw ApiV1Exception(ApiErrorCode.NOT_FOUND)
    }

    companion object {
        private const val DEFAULT_PAGE_SIZE = 20
        private const val CURSOR_SCOPE = "notifications"

        /** 30일 이내이고, 보낸 사람이 탈퇴·정지·차단 관계가 아닌 알림. */
        private const val VISIBLE =
            """n.created_at > now() - interval '30 days'
               AND EXISTS (SELECT 1 FROM app_user a WHERE a.user_id=n.actor_user_id AND a.status='ACTIVE')
               AND NOT EXISTS (SELECT 1 FROM housing_moderation_hide h
                 WHERE h.housing_user_id=n.actor_user_id AND h.hidden_until>now())
               AND NOT EXISTS (SELECT 1 FROM user_block b
                 WHERE (b.user_id=n.user_id AND b.blocked_user_id=n.actor_user_id)
                    OR (b.user_id=n.actor_user_id AND b.blocked_user_id=n.user_id))"""

        private const val LIST_SQL =
            """SELECT n.notification_id,n.type,n.actor_user_id,a.nickname,n.read_at,n.created_at
               FROM user_notification n JOIN app_user a ON a.user_id=n.actor_user_id
               WHERE n.user_id=? AND $VISIBLE"""
        private const val ORDER_LIMIT = "ORDER BY n.created_at DESC,n.notification_id DESC LIMIT ?"

        private val mapper =
            RowMapper { rs, _ ->
                NotificationItem(
                    notificationId = rs.getLong("notification_id"),
                    type = NotificationType.valueOf(rs.getString("type")),
                    actor =
                        NotificationActor(
                            rs.getLong("actor_user_id"),
                            UserNicknamePolicy.displayName(rs.getString("nickname"), UserStatus.ACTIVE),
                        ),
                    read = rs.getTimestamp("read_at") != null,
                    createdAt = rs.getTimestamp("created_at").toInstant(),
                )
            }
    }
}
