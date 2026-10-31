package com.lifehub.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Link
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.PageTagRef
import com.lifehub.app.data.RelatedItem
import com.lifehub.app.ui.screens.TagBadge
import com.lifehub.app.ui.screens.cssColor
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.net.URLEncoder

// Общие кусочки для полки, вишлиста и путешествий: теги, «Связано», копилка.

/** Общие теги приложения (те же, что у страниц, поездок, целей). */
@Composable
fun rememberTagOptions(): List<PageTag> {
    var tags by remember { mutableStateOf<List<PageTag>>(emptyList()) }
    LaunchedEffect(Unit) { tags = runCatching { Api.get<Items<PageTag>>("/api/life/pages/tags").items }.getOrDefault(emptyList()) }
    return tags
}

/** Выбор тегов: нажатие на тег включает/выключает его. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagPicker(all: List<PageTag>, selected: Set<Int>, onToggle: (Int) -> Unit) {
    if (all.isEmpty()) {
        Text("Тегов пока нет — создайте их в «Страницах».", color = Brand.TextFaint, fontSize = 12.sp)
        return
    }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        all.forEach { t ->
            TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clip(CircleShape).clickable { onToggle(t.id) }, selected = t.id in selected)
        }
    }
}

/** Картинка с заглушкой: если сайт недоступен — эмодзи, а не пустое место. */
@Composable
fun CoverImage(url: String?, emoji: String, modifier: Modifier, shape: RoundedCornerShape = RoundedCornerShape(10.dp)) {
    val src = Api.fileUrl(url)
    Box(modifier.clip(shape).background(Brand.Ink.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) {
        if (src == null) Text(emoji, fontSize = 26.sp)
        else SubcomposeAsyncImage(
            model = src, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize(),
            error = { Box(Modifier.matchParentSize(), contentAlignment = Alignment.Center) { Text(emoji, fontSize = 26.sp) } },
        )
    }
}

fun currencySign(c: String?) = when (c) { null, "", "RUB" -> "₽"; "USD" -> "$"; "EUR" -> "€"; "KZT" -> "₸"; "UAH" -> "₴"; "BYN" -> "Br"; "JPY", "CNY" -> "¥"; else -> c }
fun money(v: Double?, c: String?) = if (v == null) "" else "%,d".format(v.toLong()).replace(',', ' ') + " " + currencySign(c)

/** Полоска копилки: сколько отложено из цены. */
@Composable
fun SavingsBar(price: Double?, saved: Double?, currency: String?, light: Boolean = false) {
    if (price == null || price <= 0) return
    val pct = ((saved ?: 0.0) / price).coerceIn(0.0, 1.0)
    Column(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(if (light) Color(0xFFE2E8F0) else Brand.Ink.copy(alpha = 0.1f))) {
            Box(Modifier.fillMaxWidth(pct.toFloat()).height(6.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFFFBBF24), Color(0xFF10B981)))))
        }
        Text(
            if (pct >= 1.0) "Накоплено! 🎉" else "${money(saved ?: 0.0, currency)} из ${money(price, currency)} · ${(pct * 100).toInt()}%",
            fontSize = 11.sp, color = if (light) Color(0xFF64748B) else Brand.TextMuted,
        )
    }
}

private val TYPE_EMOJI = mapOf(
    "page" to "📄", "travel" to "🗺️", "wish" to "🎁", "shelf" to "📚", "goal" to "🎯", "habit" to "🔁",
    "course" to "🎓", "language" to "🗣️", "calendar_event" to "📅", "loan" to "💳",
)

/** Куда вести по нажатию на связанную вещь (маршруты телефона). */
fun relatedRoute(item: RelatedItem): String = when (item.type) {
    "page" -> "page/${item.id}"
    "travel" -> "travel"
    "wish" -> "wishlist"
    "shelf" -> "shelf"
    "goal" -> "goals"
    "habit" -> "habits"
    "course", "language" -> "learn"
    "calendar_event" -> "calendar"
    "loan" -> "finance"
    else -> "home"
}

/**
 * «Связано»: всё с теми же тегами из любых разделов + ручные привязки.
 * Например, у мечты «Токио» с тегом #Япония — копилка «Поездка в Японию» и аниме с полки.
 */
@Composable
fun RelatedSection(type: String, id: Int, onOpen: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var items by remember(type, id) { mutableStateOf<List<RelatedItem>?>(null) }
    var version by remember { mutableStateOf(0) }
    var adding by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var candidates by remember { mutableStateOf<List<RelatedItem>>(emptyList()) }
    LaunchedEffect(type, id, version) {
        items = runCatching { Api.get<Items<RelatedItem>>("/api/life/links/related?type=$type&id=$id").items }.getOrDefault(emptyList())
    }
    LaunchedEffect(query) {
        if (query.isBlank()) { candidates = emptyList(); return@LaunchedEffect }
        delay(300)
        candidates = runCatching { Api.get<Items<RelatedItem>>("/api/life/links/candidates?q=" + URLEncoder.encode(query.trim(), "UTF-8")).items }
            .getOrDefault(emptyList()).filter { !(it.type == type && it.id == id) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Link, null, tint = Brand.TextMuted, modifier = Modifier.size(15.dp))
            Spacer(Modifier.width(4.dp))
            Text("СВЯЗАНО", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Row(Modifier.clip(CircleShape).clickable { adding = !adding }.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Add, null, tint = Brand.Mint, modifier = Modifier.size(15.dp))
                Text("Привязать", color = Brand.Mint, fontSize = 12.sp)
            }
        }
        if (adding) {
            OutlinedTextField(query, { query = it }, placeholder = { Text("Страница, поездка, желание, книга…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            candidates.forEach { c ->
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable {
                        scope.launch {
                            runCatching {
                                Api.post("/api/life/links", kotlinx.serialization.json.buildJsonObject {
                                    put("a_type", kotlinx.serialization.json.JsonPrimitive(type)); put("a_id", kotlinx.serialization.json.JsonPrimitive(id))
                                    put("b_type", kotlinx.serialization.json.JsonPrimitive(c.type)); put("b_id", kotlinx.serialization.json.JsonPrimitive(c.id))
                                })
                            }
                            adding = false; query = ""; version++
                        }
                    }.padding(horizontal = 8.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(TYPE_EMOJI[c.type] ?: "•")
                    Spacer(Modifier.width(8.dp))
                    Text(c.title, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 14.sp)
                    Text(c.typeLabel, color = Brand.TextFaint, fontSize = 11.sp)
                }
            }
        }
        val list = items
        when {
            list == null -> Text("…", color = Brand.TextFaint)
            list.isEmpty() -> Text("Пока ничего. Поставьте такой же тег, как у страницы, поездки или цели, — или привяжите вручную.", color = Brand.TextFaint, fontSize = 12.sp)
            else -> list.forEach { it ->
                RelatedRow(it, onOpen = { onOpen(relatedRoute(it)) }, onUnlink = if (it.linked) ({
                    scope.launch {
                        runCatching { Api.delete("/api/life/links?a_type=$type&a_id=$id&b_type=${it.type}&b_id=${it.id}") }
                        version++
                    }
                }) else null)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RelatedRow(it: RelatedItem, onOpen: () -> Unit, onUnlink: (() -> Unit)?) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(Brand.Ink.copy(alpha = 0.04f)).border(1.dp, Brand.Ink.copy(alpha = 0.08f), shape)
            .clickable(onClick = onOpen).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CoverImage(it.image, TYPE_EMOJI[it.type] ?: "•", Modifier.size(38.dp), RoundedCornerShape(8.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(it.title, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(listOfNotNull(it.typeLabel, it.subtitle?.ifBlank { null }).joinToString(" · ") + if (it.linked) " · 🔗" else "", color = Brand.TextMuted, fontSize = 11.sp)
                it.viaTags.forEach { t -> Text("#${t.label}", color = cssColor(t.color), fontSize = 11.sp) }
            }
            if (it.type == "wish" && it.extra.status != "got") SavingsBar(it.extra.price, it.extra.saved, it.extra.currency)
        }
        if (onUnlink != null) {
            Icon(Icons.Default.Close, "Отвязать", tint = Brand.TextFaint, modifier = Modifier.size(28.dp).clip(CircleShape).clickable(onClick = onUnlink).padding(6.dp))
        }
    }
}
