package com.bawibase.chorong.note

import org.springframework.data.jpa.repository.JpaRepository

interface NoteRepository : JpaRepository<Note, Long> {
    fun findAllByOrderByIdDesc(): List<Note>
}
