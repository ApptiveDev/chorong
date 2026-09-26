package com.bawibase.chorong.domain.note.service

import com.bawibase.chorong.domain.note.dto.NoteRequest
import com.bawibase.chorong.domain.note.entity.NoteEntity
import com.bawibase.chorong.domain.note.repository.NoteRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Transactional
class NoteService(
    private val notes: NoteRepository,
) {
    @Transactional(readOnly = true)
    fun list(): List<NoteEntity> = notes.findAllByOrderByIdDesc()

    @Transactional(readOnly = true)
    fun get(id: Long): NoteEntity = notes.findById(id).orElseThrow { NoSuchElementException("note $id not found") }

    fun create(request: NoteRequest): NoteEntity = notes.save(NoteEntity(title = request.title, body = request.body))

    fun update(
        id: Long,
        request: NoteRequest,
    ): NoteEntity {
        val note = get(id)
        note.title = request.title
        note.body = request.body
        return note
    }

    fun delete(id: Long) {
        notes.delete(get(id))
    }
}
