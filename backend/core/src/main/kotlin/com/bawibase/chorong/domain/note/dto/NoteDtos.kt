package com.bawibase.chorong.domain.note.dto

import com.bawibase.chorong.domain.note.entity.NoteEntity
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.OffsetDateTime

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
    val createdAt: OffsetDateTime?,
    val modifiedAt: OffsetDateTime?,
) {
    companion object {
        fun from(note: NoteEntity) =
            NoteResponse(
                id = checkNotNull(note.id),
                title = note.title,
                body = note.body,
                createdAt = note.createdAt,
                modifiedAt = note.modifiedAt,
            )
    }
}
