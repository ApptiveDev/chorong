package com.bawibase.chorong.note

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

data class NoteRequest(
    @field:NotBlank
    @field:Size(max = 200)
    val title: String,
    val body: String? = null,
)

data class NoteResponse(
    val id: Long,
    val title: String,
    val body: String?,
    val createdAt: Instant?,
) {
    companion object {
        fun from(note: Note) = NoteResponse(note.id, note.title, note.body, note.createdAt)
    }
}
