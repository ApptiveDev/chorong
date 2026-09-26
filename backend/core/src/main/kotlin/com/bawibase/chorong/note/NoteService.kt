package com.bawibase.chorong.note

import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class NoteService(
    private val repository: NoteRepository,
) {
    @Transactional(readOnly = true)
    fun list(): List<Note> = repository.findAllByOrderByIdDesc()

    @Transactional(readOnly = true)
    fun get(id: Long): Note =
        repository.findById(id).orElseThrow { NoSuchElementException("note $id not found") }

    @Transactional
    fun create(request: NoteRequest): Note =
        repository.save(Note(title = request.title, body = request.body))

    @Transactional
    fun update(id: Long, request: NoteRequest): Note {
        val note = get(id)
        note.title = request.title
        note.body = request.body
        return note
    }

    @Transactional
    fun delete(id: Long) {
        repository.delete(get(id))
    }
}
