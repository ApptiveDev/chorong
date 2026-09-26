package com.bawibase.chorong.domain.note.repository

import com.bawibase.chorong.domain.note.entity.NoteEntity
import org.springframework.data.jpa.repository.JpaRepository

interface NoteRepository : JpaRepository<NoteEntity, Long> {
    fun findAllByOrderByIdDesc(): List<NoteEntity>
}
