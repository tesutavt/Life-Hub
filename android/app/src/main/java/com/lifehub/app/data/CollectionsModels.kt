package com.lifehub.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

// ───── Полка (книги, манга, аниме, фильмы, сериалы, игры, музыка) ─────

@Serializable
data class ShelfMeta(
    val score: Double? = null,
    val episodes: Int? = null,
    val chapters: Int? = null,
    val volumes: Int? = null,
    val pages: Int? = null,
    val progress: Int? = null,
    val hours: Double? = null,
    val genres: List<String> = emptyList(),
    val type: String? = null,
    @SerialName("original_title") val originalTitle: String? = null,
)

@Serializable
data class ShelfItem(
    val id: Int,
    val kind: String = "book",
    val title: String = "",
    val author: String? = null,
    val year: Int? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    val description: String? = null,
    val source: String? = null,
    @SerialName("external_id") val externalId: String? = null,
    @SerialName("external_url") val externalUrl: String? = null,
    val status: String = "planned",
    val rating: Int? = null,
    val notes: String? = null,
    val meta: ShelfMeta = ShelfMeta(),
    val tags: List<PageTagRef> = emptyList(),
)

/** Результат поиска по внешним базам — тот же формат, что принимает POST /api/life/shelf. */
@Serializable
data class ShelfFound(
    val title: String = "",
    @SerialName("original_title") val originalTitle: String? = null,
    val author: String? = null,
    val year: Int? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    val description: String? = null,
    val source: String? = null,
    @SerialName("external_id") val externalId: String? = null,
    @SerialName("external_url") val externalUrl: String? = null,
    @SerialName("summary_en") val summaryEn: String? = null,
    val meta: ShelfMeta = ShelfMeta(),
)

@Serializable
data class ShelfDetails(
    val description: String? = null,
    val author: String? = null,
    val year: Int? = null,
    @SerialName("cover_url") val coverUrl: String? = null,
    val meta: ShelfMeta? = null,
    val error: String? = null,
)

@Serializable data class ShikiState(val nickname: String? = null, @SerialName("synced_at") val syncedAt: String? = null)
@Serializable data class ShikiSync(val nickname: String? = null, val added: Int = 0, val updated: Int = 0, val total: Int = 0, @SerialName("synced_at") val syncedAt: String? = null)

// ───── Вишлист ─────

@Serializable
data class WishItem(
    val id: Int,
    val title: String = "",
    @SerialName("image_url") val imageUrl: String? = null,
    val link: String? = null,
    val price: Double? = null,
    val saved: Double = 0.0,
    val currency: String = "RUB",
    val priority: Int = 2,
    val category: String? = null,
    val note: String? = null,
    val status: String = "want",
    @SerialName("got_at") val gotAt: String? = null,
    val tags: List<PageTagRef> = emptyList(),
)

@Serializable data class WishPreview(val title: String? = null, @SerialName("image_url") val imageUrl: String? = null, val price: Double? = null, val currency: String? = null, val error: String? = null)

// ───── Связи между разделами ─────

@Serializable
data class RelatedExtra(val price: Double? = null, val saved: Double? = null, val currency: String? = null, val status: String? = null, val kind: String? = null)

@Serializable
data class RelatedItem(
    val type: String = "",
    @SerialName("type_label") val typeLabel: String = "",
    val id: Int = 0,
    val title: String = "",
    val subtitle: String? = null,
    val image: String? = null,
    val url: String = "",
    val extra: RelatedExtra = RelatedExtra(),
    @SerialName("via_tags") val viaTags: List<PageTagRef> = emptyList(),
    val linked: Boolean = false,
)

// ───── Карта путешествий ─────

@Serializable data class GeoPlace(val name: String = "", val label: String = "", val lat: Double = 0.0, val lon: Double = 0.0, val country: String? = null, val city: String? = null)
@Serializable data class GeoReverse(val place: GeoPlace? = null)
