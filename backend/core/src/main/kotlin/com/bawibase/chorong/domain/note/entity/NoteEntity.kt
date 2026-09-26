package com.bawibase.chorong.domain.note.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.OffsetDateTime

@Entity
@Table(name = "notes")
class NoteEntity(
    @Column(nullable = false, length = 200)
    var title: String,

    @Column(columnDefinition = "text")
    var body: String? = null,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "note_id")
    var id: Long? = null

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null
}
