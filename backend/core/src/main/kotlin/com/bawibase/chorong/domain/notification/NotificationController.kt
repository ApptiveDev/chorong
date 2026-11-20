package com.bawibase.chorong.domain.notification

import com.bawibase.chorong.common.api.PagedResponse
import com.bawibase.chorong.config.CurrentUserId
import io.swagger.v3.oas.annotations.Operation
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/notifications")
class NotificationController(
    private val notifications: NotificationService,
) {
    @GetMapping
    @Operation(operationId = "API-303", summary = "알림함 목록")
    fun list(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) size: Int?,
    ): PagedResponse<NotificationsData> = notifications.list(userId, cursor, size)

    @PostMapping("/{notificationId}/read")
    @Operation(operationId = "API-304", summary = "알림 읽음 처리")
    fun read(
        @CurrentUserId userId: Long,
        @PathVariable notificationId: Long,
    ): ResponseEntity<Void> {
        notifications.markRead(userId, notificationId)
        return ResponseEntity.noContent().build()
    }
}
