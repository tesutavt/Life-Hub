package com.lifehub.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.ShelfDetails
import com.lifehub.app.data.ShelfFound
import com.lifehub.app.data.ShelfItem
import com.lifehub.app.data.ShikiState
import com.lifehub.app.data.ShikiSync
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.CoverImage
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.RelatedSection
import com.lifehub.app.ui.components.TagPicker
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.components.rememberTagOptions
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add
import java.net.URLEncoder

// Полка — как на ПК: книги и манга стоят корешками, аниме/фильмы/сериалы/игры — коробками, музыка — дисками.

private data class ShelfKind(val id: String, val label: String, val emoji: String, val verb: String)

private val SHELF_KINDS = listOf(
    ShelfKind("book", "Книги", "📚", "Читаю"), ShelfKind("manga", "Манга", "📖", "Читаю"), ShelfKind("anime", "Аниме", "🌸", "Смотрю"),
    ShelfKind("movie", "Фильмы", "🎬", "Смотрю"), ShelfKind("series", "Сериалы", "📺", "Смотрю"), ShelfKind("game", "Игры", "🎮", "Играю"),
    ShelfKind("music", "Музыка", "💿", "Слушаю"),
)
private val SHELF_STATUS = listOf("planned" to "🔖 Хочу", "active" to "⏳ В процессе", "paused" to "⏸️ Отложено", "done" to "✅ Готово", "dropped" to "💤 Брошено")
private val STATUS_RANK = mapOf("active" to 0, "paused" to 1, "planned" to 2, "done" to 3, "dropped" to 4)
private val SPINE_COLORS = listOf(0xFF7F1D1D, 0xFF1E3A8A, 0xFF14532D, 0xFF713F12, 0xFF4A044E, 0xFF0F766E, 0xFF7C2D12, 0xFF334155, 0xFF831843, 0xFF3F6212).map { Color(it) }
private val WOOD = Color(0xFF8A5A34)
private val WOOD_DARK = Color(0xFF5E3B20)
private val SHELF_BACK = Brush.verticalGradient(listOf(Color(0xFF3B2416), Color(0xFF2A180E)))

private fun kindOf(id: String) = SHELF_KINDS.firstOrNull { it.id == id } ?: SHELF_KINDS[0]
private fun isSpine(kind: String) = kind == "book" || kind == "manga"
private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShelfScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable { Api.get<Items<ShelfItem>>("/api/life/shelf").items }
    val tagOptions = rememberTagOptions()
    var kind by remember { mutableStateOf<String?>(null) }
    var status by remember { mutableStateOf<String?>(null) }
    var tagFilter by remember { mutableStateOf<Int?>(null) }
    var open by remember { mutableStateOf<ShelfItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    var integrations by remember { mutableStateOf(ShelfIntegrations()) }
    var syncing by remember { mutableStateOf(false) }
    val connected = listOfNotNull(integrations.shikimori.nickname?.let { "Shikimori" }, integrations.steam.steamId?.let { "Steam" })
    fun syncAll() = scope.launch {
        syncing = true
        runCatching { Api.post("/api/life/shelf/integrations/sync") }
        syncing = false
        state.reload()
        integrations = runCatching { Api.get<ShelfIntegrations>("/api/life/shelf/integrations") }.getOrDefault(integrations)
    }

    // Shikimori и Steam (подключаются в Настройках → Интеграции) меняются вне Life Hub — подтягиваем, если давно не обновляли
    LaunchedEffect(Unit) {
        integrations = runCatching { Api.get<ShelfIntegrations>("/api/life/shelf/integrations") }.getOrDefault(ShelfIntegrations())
        fun old(iso: String?) = System.currentTimeMillis() - (iso?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() } ?: 0L) > 15 * 60_000
        val stale = (integrations.shikimori.nickname != null && old(integrations.shikimori.syncedAt)) || (integrations.steam.steamId != null && old(integrations.steam.syncedAt))
        if (stale) syncAll()
    }

    fun replace(item: ShelfItem) {
        state.data = state.data?.map { if (it.id == item.id) item else it }
        if (open?.id == item.id) open = item
    }
    fun update(id: Int, body: JsonObject) = scope.launch {
        runCatching { Api.decode<ShelfItemEnvelope>(Api.put("/api/life/shelf/$id", body)).item }.getOrNull()?.let { replace(it) }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Полка", { nav.popBackStack() }) {
            Text(
                if (syncing) "↻ …" else if (connected.isNotEmpty()) "↻ ${connected.joinToString(" · ")}" else "🌸🎮 Подключить",
                color = Brand.Text, fontSize = 13.sp,
                modifier = Modifier.clip(CircleShape).border(1.dp, Brand.Ink.copy(alpha = 0.12f), CircleShape)
                    .clickable { if (connected.isNotEmpty()) syncAll() else nav.navigate("settings") }.padding(horizontal = 10.dp, vertical = 6.dp),
            )
            IconButton({ adding = true }) { Icon(Icons.Default.Add, "Добавить", tint = Brand.Text) }
        }
        LoadableContent(state) { all ->
            val filtered = all.filter { x ->
                (kind == null || x.kind == kind) && (status == null || x.status == status) && (tagFilter == null || x.tags.any { it.id == tagFilter })
            }
            val usedTags = tagOptions.filter { t -> all.any { x -> x.tags.any { it.id == t.id } } }
            LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                        Text(
                            if (all.isEmpty()) "Книги, манга, аниме, фильмы, игры и музыка — всё, что любите и хотите."
                            else "${all.size} на полке · ${all.count { it.status == "active" }} в процессе · ${all.count { it.status == "done" }} готово",
                            color = Brand.TextMuted, fontSize = 13.sp,
                        )
                    }
                }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        item { FilterPill("✨ Всё", kind == null) { kind = null } }
                        items(SHELF_KINDS) { k -> FilterPill("${k.emoji} ${k.label}", kind == k.id) { kind = if (kind == k.id) null else k.id } }
                    }
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        item { FilterPill("Любой статус", status == null, small = true) { status = null } }
                        items(SHELF_STATUS) { (id, label) -> FilterPill(label, status == id, small = true) { status = if (status == id) null else id } }
                    }
                    if (usedTags.isNotEmpty()) {
                        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(usedTags) { t ->
                                TagBadge(com.lifehub.app.data.PageTagRef(t.id, t.label, t.color), Modifier.clip(CircleShape).clickable { tagFilter = if (tagFilter == t.id) null else t.id }, selected = tagFilter == t.id)
                            }
                        }
                    }
                }
                if (filtered.isEmpty()) {
                    item { EmptyState("📚", if (all.isEmpty()) "Полка пока пустая" else "Ничего по фильтрам", "Нажмите «+», чтобы найти книгу, аниме или игру — обложка и описание подтянутся сами.") }
                }
                SHELF_KINDS.forEach { k ->
                    val list = filtered.filter { it.kind == k.id }.sortedBy { STATUS_RANK[it.status] ?: 9 }
                    if (list.isNotEmpty()) item(key = "shelf-${k.id}") { ShelfRow(k, list) { open = it } }
                }
            }
        }
    }

    open?.let { item ->
        ShelfItemSheet(
            item, tagOptions,
            onDismiss = { open = null },
            onUpdate = { body -> update(item.id, body) },
            onReplace = { replace(it) },
            onDelete = {
                open = null
                scope.launch { runCatching { Api.delete("/api/life/shelf/${item.id}") }; state.reload() }
            },
            onOpen = { route -> open = null; nav.navigate(route) },
        )
    }
    if (adding) {
        ShelfAddSheet(kind ?: "book", onDismiss = { adding = false }) { added ->
            adding = false
            state.data = (state.data ?: emptyList()) + added
        }
    }
}

@kotlinx.serialization.Serializable private data class ShelfItemEnvelope(val item: ShelfItem)

@Composable
private fun FilterPill(text: String, selected: Boolean, small: Boolean = false, onClick: () -> Unit) {
    Text(
        text, fontSize = if (small) 12.sp else 13.sp,
        color = if (selected) Brand.Text else Brand.TextMuted,
        modifier = Modifier.clip(CircleShape)
            .background(if (selected) Brand.Mint.copy(alpha = 0.22f) else Color.Transparent)
            .border(1.dp, if (selected) Brand.Mint else Brand.Ink.copy(alpha = 0.1f), CircleShape)
            .clickable(onClick = onClick).padding(horizontal = if (small) 10.dp else 12.dp, vertical = if (small) 5.dp else 7.dp),
    )
}

/** Одна полка стеллажа: подпись, вещи в ряд и деревянная доска под ними. */
@Composable
private fun ShelfRow(kind: ShelfKind, list: List<ShelfItem>, onOpen: (ShelfItem) -> Unit) {
    Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(18.dp)).background(SHELF_BACK)) {
        Text("${kind.emoji} ${kind.label.uppercase()} · ${list.size}", color = Color(0xFFFDE68A).copy(alpha = 0.55f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(start = 14.dp, top = 10.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 14.dp), horizontalArrangement = Arrangement.spacedBy(if (isSpine(kind.id)) 3.dp else 10.dp), verticalAlignment = Alignment.Bottom, modifier = Modifier.height(if (kind.id == "music") 150.dp else 182.dp).padding(top = 6.dp)) {
            items(list, key = { it.id }) { item -> if (isSpine(item.kind)) Spine(item) { onOpen(item) } else Case(item) { onOpen(item) } }
            item { Text(listOf("🪴", "🕯️", "☕", "🦉", "🧸", "🌵")[(list.size + kind.id.length) % 6], fontSize = 30.sp, modifier = Modifier.padding(start = 8.dp)) }
        }
        Box(Modifier.fillMaxWidth().height(10.dp).background(Brush.verticalGradient(listOf(WOOD, WOOD_DARK))))
    }
}

@Composable
private fun Spine(item: ShelfItem, onClick: () -> Unit) {
    val h = item.title.hashCode().let { if (it < 0) -it else it }
    val manga = item.kind == "manga"
    val height = (138 + h % 30).dp
    val width = if (manga) 30.dp else (32 + h % 14).dp
    val color = SPINE_COLORS[h % SPINE_COLORS.size]
    Box(
        Modifier.width(width).height(height).shadow(3.dp, RoundedCornerShape(3.dp)).clip(RoundedCornerShape(3.dp))
            .background(if (manga) Brush.horizontalGradient(listOf(Color(0xFFF5F0E6), Color(0xFFFFFAF0), Color(0xFFE9E1D2))) else Brush.horizontalGradient(listOf(color, color.copy(alpha = 0.85f), color)))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (manga) CoverImage(item.coverUrl, "", Modifier.align(Alignment.TopCenter).fillMaxWidth().height(42.dp), RoundedCornerShape(0.dp))
        else {
            Box(Modifier.align(Alignment.TopCenter).padding(top = 10.dp).fillMaxWidth().height(2.dp).background(Color(0xFFFCD34D).copy(alpha = 0.7f)))
            Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 12.dp).fillMaxWidth().height(2.dp).background(Color(0xFFFCD34D).copy(alpha = 0.7f)))
        }
        Text(
            item.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
            color = if (manga) Color(0xFF1E293B) else Color(0xFFFEF3C7),
            modifier = Modifier.requiredWidth(height - if (manga) 60.dp else 34.dp).rotate(90f).padding(top = 0.dp),
        )
        StatusSticker(item.status, Modifier.align(Alignment.TopEnd))
    }
}

@Composable
private fun Case(item: ShelfItem, onClick: () -> Unit) {
    val cd = item.kind == "music"
    Box(Modifier.width(if (cd) 128.dp else 108.dp).height(if (cd) 128.dp else 156.dp).shadow(6.dp, RoundedCornerShape(5.dp)).clickable(onClick = onClick)) {
        CoverImage(item.coverUrl, kindOf(item.kind).emoji, Modifier.fillMaxSize(), RoundedCornerShape(5.dp))
        if (!cd) Box(Modifier.width(7.dp).height(if (cd) 128.dp else 156.dp).background(Brush.horizontalGradient(listOf(Color.Black.copy(alpha = 0.6f), Color.Transparent))))
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color.White.copy(alpha = 0.18f), Color.Transparent, Color.Transparent))))
        StatusSticker(item.status, Modifier.align(Alignment.TopEnd).padding(3.dp))
    }
}

@Composable
private fun StatusSticker(status: String, modifier: Modifier) {
    if (status == "planned") return
    val badge = SHELF_STATUS.firstOrNull { it.first == status }?.second?.substringBefore(' ') ?: return
    Text(badge, fontSize = 10.sp, modifier = modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 3.dp, vertical = 1.dp))
}

@Composable
private fun Stars(value: Int, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        (1..10).forEach { i ->
            Icon(if (i <= value) Icons.Default.Star else Icons.Default.StarBorder, "$i/10", tint = if (i <= value) Color(0xFFFCD34D) else Brand.TextFaint,
                modifier = Modifier.size(26.dp).clip(CircleShape).clickable { onChange(if (i == value) 0 else i) }.padding(2.dp))
        }
        Text(if (value > 0) " $value/10" else " без оценки", color = Brand.TextMuted, fontSize = 12.sp)
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ShelfItemSheet(
    item: ShelfItem, tagOptions: List<PageTag>,
    onDismiss: () -> Unit, onUpdate: (JsonObject) -> Unit, onReplace: (ShelfItem) -> Unit, onDelete: () -> Unit, onOpen: (String) -> Unit,
) {
    val kind = kindOf(item.kind)
    val uri = LocalUriHandler.current
    var notes by remember(item.id) { mutableStateOf(item.notes.orEmpty()) }
    var details by remember(item.id) { mutableStateOf("idle") }
    var confirmDelete by remember { mutableStateOf(false) }
    val canFetch = item.source != null && item.externalId != null && item.source?.startsWith("wikipedia") != true
    val scope = rememberCoroutineScope()

    // Сведения с сайта сохраняются в Life Hub; у добавленного без описания (например, из Shikimori) — подтягиваем при открытии
    fun loadDetails() = scope.launch {
        if (!canFetch) return@launch
        details = "loading"
        val d = runCatching {
            Api.get<ShelfDetails>("/api/life/shelf/details?kind=${item.kind}&source=${enc(item.source!!)}&external_id=${enc(item.externalId!!)}&title=${enc(item.title)}&year=${item.year ?: ""}")
        }.getOrNull()
        details = when {
            d == null || d.error != null -> "failed"
            d.description.isNullOrBlank() -> "empty"
            else -> {
                val meta = Api.json.encodeToJsonElement(ShelfMetaMerge.serializer(), ShelfMetaMerge(item, d)).jsonObject
                onUpdate(buildJsonObject {
                    put("description", d.description)
                    put("author", item.author ?: d.author)
                    put("cover_url", item.coverUrl ?: d.coverUrl)
                    put("meta", meta)
                })
                "idle"
            }
        }
    }
    LaunchedEffect(item.id) { if (item.description.isNullOrBlank()) loadDetails() }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Brand.Night, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row {
                CoverImage(item.coverUrl, kind.emoji, Modifier.width(112.dp).aspectRatio(2f / 3f), RoundedCornerShape(14.dp))
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${kind.emoji} ${item.title}", fontSize = 19.sp, fontWeight = FontWeight.Bold)
                    item.meta.originalTitle?.takeIf { it != item.title }?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp) }
                    val total = if (item.kind == "anime") item.meta.episodes else item.meta.chapters
                    val facts = listOfNotNull(
                        item.year?.toString(), item.author,
                        item.meta.progress?.takeIf { it > 0 && item.status != "done" }?.let { "прогресс $it${total?.let { t -> "/$t" } ?: ""}" },
                        item.meta.episodes?.let { "$it эп." }, item.meta.chapters?.let { "$it гл." }, item.meta.pages?.let { "$it стр." },
                        item.meta.hours?.takeIf { it > 0 }?.let { "🎮 ${if (it % 1.0 == 0.0) it.toInt() else it} ч в игре" },
                        item.meta.score?.let { "★ $it" },
                    )
                    if (facts.isNotEmpty()) Text(facts.joinToString(" · "), color = Brand.TextMuted, fontSize = 13.sp)
                    if (item.meta.genres.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        item.meta.genres.take(6).forEach { g -> Text(g, fontSize = 11.sp, color = Brand.TextMuted, modifier = Modifier.border(1.dp, Brand.Ink.copy(alpha = 0.12f), CircleShape).padding(horizontal = 7.dp, vertical = 2.dp)) }
                    }
                    item.externalUrl?.let { url -> Text("Подробнее на сайте ↗", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clickable { runCatching { uri.openUri(url) } }) }
                }
            }
            when {
                details == "loading" -> Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp, color = Brand.Mint); Spacer(Modifier.width(8.dp)); Text("Загружаю описание…", color = Brand.TextMuted, fontSize = 13.sp)
                }
                !item.description.isNullOrBlank() -> Column {
                    Text(item.description!!, fontSize = 14.sp, lineHeight = 20.sp, color = Brand.Text.copy(alpha = 0.85f))
                    if (canFetch) Text("↻ обновить сведения с сайта", color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 4.dp).clickable { loadDetails() })
                }
                details == "failed" -> Text("Сайт сейчас не ответил. Повторить", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clickable { loadDetails() })
                else -> Text("Описания нет.", color = Brand.TextFaint, fontSize = 13.sp)
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SHELF_STATUS.forEach { (id, label) ->
                    FilterPill(if (id == "active") "⏳ ${kind.verb}" else label, item.status == id) { onReplace(item.copy(status = id)); onUpdate(buildJsonObject { put("status", id) }) }
                }
            }
            Stars(item.rating ?: 0) { r -> onReplace(item.copy(rating = r)); onUpdate(buildJsonObject { put("rating", r) }) }
            OutlinedTextField(notes, { notes = it }, label = { Text("Мои впечатления, цитаты…") }, minLines = 3, modifier = Modifier.fillMaxWidth())
            if (notes != item.notes.orEmpty()) TextButton(onClick = { onReplace(item.copy(notes = notes)); onUpdate(buildJsonObject { put("notes", notes) }) }) { Text("Сохранить заметку", color = Brand.Mint) }
            Text("ТЕГИ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            val selected = item.tags.map { it.id }.toSet()
            TagPicker(tagOptions, selected) { id ->
                val next = if (id in selected) selected - id else selected + id
                onUpdate(buildJsonObject { putJsonArray("tags") { next.forEach { add(it) } } })
            }
            RelatedSection("shelf", item.id, onOpen)
            Text(if (confirmDelete) "Точно убрать? Нажмите ещё раз" else "🗑 Убрать с полки", color = Brand.Rose, fontSize = 14.sp,
                modifier = Modifier.clip(CircleShape).clickable { if (confirmDelete) onDelete() else confirmDelete = true }.padding(vertical = 6.dp))
        }
    }
}

/** Мета из карточки + сведения с сайта (жанры, студия) — для сохранения на сервере. */
@kotlinx.serialization.Serializable
private data class ShelfMetaMerge(
    val score: Double? = null, val episodes: Int? = null, val chapters: Int? = null, val volumes: Int? = null, val pages: Int? = null,
    val progress: Int? = null, val genres: List<String> = emptyList(), val type: String? = null,
    @kotlinx.serialization.SerialName("original_title") val originalTitle: String? = null,
) {
    constructor(item: ShelfItem, d: ShelfDetails) : this(
        item.meta.score ?: d.meta?.score, item.meta.episodes, item.meta.chapters, item.meta.volumes, item.meta.pages, item.meta.progress,
        d.meta?.genres?.takeIf { it.isNotEmpty() } ?: item.meta.genres, item.meta.type, item.meta.originalTitle,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShelfAddSheet(defaultKind: String, onDismiss: () -> Unit, onAdded: (ShelfItem) -> Unit) {
    val scope = rememberCoroutineScope()
    var kind by remember { mutableStateOf(defaultKind) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ShelfFound>>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var picked by remember { mutableStateOf<ShelfFound?>(null) }
    var status by remember { mutableStateOf("planned") }

    LaunchedEffect(query, kind) {
        picked = null
        if (query.isBlank()) { results = emptyList(); return@LaunchedEffect }
        delay(450)
        busy = true; error = null
        runCatching { Api.get<Items<ShelfFound>>("/api/life/shelf/search?kind=$kind&q=${enc(query.trim())}").items }
            .onSuccess { results = it }.onFailure { error = it.message; results = emptyList() }
        busy = false
    }
    fun pick(r: ShelfFound) = scope.launch {
        picked = r
        if (r.description != null || r.source == null || r.externalId == null) return@launch
        val d = runCatching { Api.get<ShelfDetails>("/api/life/shelf/details?kind=$kind&source=${enc(r.source)}&external_id=${enc(r.externalId)}&title=${enc(r.title)}&year=${r.year ?: ""}") }.getOrNull()
        if (picked == r) picked = r.copy(description = d?.description ?: r.summaryEn, author = r.author ?: d?.author, coverUrl = r.coverUrl ?: d?.coverUrl, meta = r.meta.copy(genres = d?.meta?.genres?.takeIf { it.isNotEmpty() } ?: r.meta.genres))
    }
    fun add(r: ShelfFound?) = scope.launch {
        val body = if (r != null) {
            val obj = Api.json.encodeToJsonElement(ShelfFound.serializer(), r).jsonObject.toMutableMap()
            obj["kind"] = JsonPrimitive(kind); obj["status"] = JsonPrimitive(status)
            obj["meta"] = Api.json.encodeToJsonElement(com.lifehub.app.data.ShelfMeta.serializer(), r.meta.copy(originalTitle = r.originalTitle))
            JsonObject(obj)
        } else buildJsonObject { put("kind", kind); put("status", status); put("title", query.trim()) }
        runCatching { Api.decode<ShelfItemEnvelope>(Api.post("/api/life/shelf", body)).item }.onSuccess(onAdded).onFailure { error = it.message }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Brand.Night, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Добавить на полку", fontSize = 19.sp, fontWeight = FontWeight.Bold)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { items(SHELF_KINDS) { k -> FilterPill("${k.emoji} ${k.label}", kind == k.id) { kind = k.id } } }
            OutlinedTextField(query, { query = it }, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                trailingIcon = { if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Brand.Mint) })
            error?.let { Text(it, color = Brand.Rose, fontSize = 12.sp) }
            val p = picked
            if (p != null) {
                Row {
                    CoverImage(p.coverUrl, kindOf(kind).emoji, Modifier.width(96.dp).aspectRatio(2f / 3f))
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(p.title, fontWeight = FontWeight.SemiBold)
                        Text(listOfNotNull(p.originalTitle?.takeIf { it != p.title }, p.year?.toString(), p.author).joinToString(" · "), color = Brand.TextMuted, fontSize = 12.sp)
                        Text(p.description ?: "Загружаю описание…", fontSize = 13.sp, color = Brand.Text.copy(alpha = 0.8f), maxLines = 7, overflow = TextOverflow.Ellipsis)
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    SHELF_STATUS.filter { it.first in setOf("planned", "active", "done") }.forEach { (id, label) -> FilterPill(label, status == id, small = true) { status = id } }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { picked = null }) { Text("Назад", color = Brand.TextMuted) }
                    Spacer(Modifier.weight(1f))
                    Text("Поставить на полку", color = Brand.Deep, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(Brand.Mint).clickable { add(p) }.padding(horizontal = 16.dp, vertical = 10.dp))
                }
            } else {
                results.chunked(3).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { r ->
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Brand.Ink.copy(alpha = 0.04f)).clickable { pick(r) }) {
                                CoverImage(r.coverUrl, kindOf(kind).emoji, Modifier.fillMaxWidth().aspectRatio(2f / 3f), RoundedCornerShape(12.dp))
                                Text(r.title, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(6.dp))
                            }
                        }
                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
                if (query.isNotBlank() && !busy && results.isEmpty() && error == null) {
                    Text("Ничего не нашлось. Добавить «${query.trim()}» вручную", color = Brand.Mint, modifier = Modifier.clickable { add(null) }.padding(vertical = 8.dp))
                }
                Text("Сведения: Shikimori (аниме, манга), Open Library (книги), TVMaze (сериалы), Steam (игры), Википедия.", color = Brand.TextFaint, fontSize = 11.sp)
            }
        }
    }
}
