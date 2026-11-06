package com.bawibase.chorong.domain.housing.service

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
class StarterFurnitureService(
    private val jdbc: JdbcTemplate,
) {
    fun grant(userId: Long) {
        jdbc.update(
            """INSERT INTO housing_owned_item(user_id,item_type,item_id,acquired_via)
               SELECT ?, 'FURNITURE', f.furniture_id, 'STARTER' FROM housing_furniture f
               WHERE f.code IN ('starter_cat','starter_desk','starter_chair')
                 AND NOT EXISTS (SELECT 1 FROM housing_owned_item o
                                 WHERE o.user_id=? AND o.item_type='FURNITURE' AND o.item_id=f.furniture_id)""",
            userId,
            userId,
        )
    }
}
