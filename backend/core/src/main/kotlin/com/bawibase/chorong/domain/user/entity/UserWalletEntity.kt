package com.bawibase.chorong.domain.user.entity

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.hibernate.annotations.CreationTimestamp
import org.hibernate.annotations.UpdateTimestamp
import java.time.LocalDate
import java.time.OffsetDateTime

@Entity
@Table(name = "user_wallet")
class UserWalletEntity(
    @Id
    @Column(name = "user_id")
    var userId: Long,
    @Column(nullable = false)
    var coin: Long = 0,
    @Column(nullable = false)
    var star: Long = 0,
    @Column(nullable = false)
    var stardust: Long = 0,
    @Column(nullable = false)
    var energy: Int = UserWalletEntity.MAX_ENERGY,
    /** 마지막으로 에너지를 쓴 날(KST). 오늘이 아니면 에너지는 MAX_ENERGY 다. */
    @Column(name = "energy_date")
    var energyDate: LocalDate? = null,
) {
    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    var createdAt: OffsetDateTime? = null

    @UpdateTimestamp
    @Column(name = "modified_at", nullable = false)
    var modifiedAt: OffsetDateTime? = null

    companion object {
        const val MAX_ENERGY = 5
    }
}
