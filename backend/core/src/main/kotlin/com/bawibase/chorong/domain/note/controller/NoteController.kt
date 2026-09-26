package com.bawibase.chorong.domain.note.controller

import com.bawibase.chorong.domain.note.dto.NoteRequest
import com.bawibase.chorong.domain.note.dto.NoteResponse
import com.bawibase.chorong.domain.note.service.NoteService
import io.swagger.v3.oas.annotations.tags.Tag
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

@RestController
@Tag(name = "메모 (데이터베이스 연동 테스트용 샘플)")
@RequestMapping("/api/notes")
class NoteController(
    private val service: NoteService,
) {
    @GetMapping
    fun list(): List<NoteResponse> = service.list().map(NoteResponse::from)

    @GetMapping("/{id}")
    fun get(
        @PathVariable id: Long,
    ): NoteResponse = NoteResponse.from(service.get(id))

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        @Valid @RequestBody request: NoteRequest,
    ): NoteResponse = NoteResponse.from(service.create(request))

    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @Valid @RequestBody request: NoteRequest,
    ): NoteResponse = NoteResponse.from(service.update(id, request))

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(
        @PathVariable id: Long,
    ) = service.delete(id)
}
