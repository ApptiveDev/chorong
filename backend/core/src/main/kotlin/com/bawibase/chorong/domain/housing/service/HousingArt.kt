package com.bawibase.chorong.domain.housing.service

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/** 하우징 아이템 그림. 그림이 없으면 imageUrl·크기는 null. category 는 FLOOR·WALL 이면 null. */
data class ItemArt(
    val imageUrl: String?,
    val width: Int?,
    val height: Int?,
    val category: String?,
)

/** DB 의 미디어 경로에 app.media-base-url 을 붙인다. 이미 http(s) 주소면 그대로 둔다. */
@Component
class MediaUrls(
    @Value("\${app.media-base-url}") baseUrl: String,
) {
    private val base = baseUrl.trim().let { if (it.endsWith("/")) it else "$it/" }

    fun url(path: String?): String? {
        val value = path?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (value.startsWith("http://") || value.startsWith("https://")) return value
        return base + value.removePrefix("/")
    }
}
