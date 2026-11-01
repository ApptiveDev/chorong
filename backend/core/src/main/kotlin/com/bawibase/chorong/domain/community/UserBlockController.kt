package com.bawibase.chorong.domain.community

import com.bawibase.chorong.config.CurrentUserId
import io.swagger.v3.oas.annotations.Operation
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/blocks")
class UserBlockController(
    private val blocks: UserBlockService,
) {
    @PostMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "API-806", summary = "사용자 차단")
    fun block(
        @CurrentUserId currentUserId: Long,
        @PathVariable userId: Long,
    ) = blocks.block(currentUserId, userId)

    @DeleteMapping("/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "API-807", summary = "차단 풀기")
    fun unblock(
        @CurrentUserId currentUserId: Long,
        @PathVariable userId: Long,
    ) = blocks.unblock(currentUserId, userId)

    @GetMapping
    @Operation(operationId = "API-808", summary = "차단한 사용자 목록")
    fun list(
        @CurrentUserId userId: Long,
        @RequestParam(required = false) cursor: String?,
        @RequestParam(required = false) size: Int?,
    ) = blocks.list(userId, cursor, size)
}
