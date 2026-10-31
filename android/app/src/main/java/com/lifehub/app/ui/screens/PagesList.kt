package com.lifehub.app.ui.screens

import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Add
import android.widget.Toast
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageSummary
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.PageTagRef
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

private val DEFAULT_GRADIENT = listOf(Color(0xA63B82F6), Color(0x99EC4899))
private val TAG_COLORS = listOf("#22d3ee", "#34d399", "#a3e635", "#fbbf24", "#f472b6", "#a78bfa", "#60a5fa", "#f87171", "#94a3b8")

/** Цвет из CSS: #rgb, #rrggbb, rgb()/rgba(). */
fun cssColor(value: String?, fallback: Color = Brand.Mint): Color {
    val v = value?.trim().orEmpty()
    runCatching {
        if (v.startsWith("#")) {
            val hex = v.drop(1).let { if (it.length == 3) it.map { c -> "$c$c" }.joinToString("") else it }
            return when (hex.length) {
                6 -> Color(0xFF000000 or hex.toLong(16))
                8 -> Color(hex.substring(0, 6).toLong(16) or (hex.substring(6).toLong(16) shl 24))
                else -> fallback
            }
        }
        Regex("""rgba?\(([^)]+)\)""").find(v)?.let { m ->
            val p = m.groupValues[1].split(',').map { it.trim() }
            val a = p.getOrNull(3)?.toFloatOrNull() ?: 1f
            return Color(p[0].toFloat() / 255f, p[1].toFloat() / 255f, p[2].toFloat() / 255f, a)
        }
    }
    return fallback
}

/** Цвета CSS-градиента баннера (linear-gradient(…)) для отрисовки в Compose. */
fun cssGradientColors(css: String?): List<Color> {
    if (css.isNullOrBlank()) return DEFAULT_GRADIENT
    val colors = Regex("""#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)""").findAll(css).map { cssColor(it.value, Color.Transparent) }.toList()
    return if (colors.size >= 2) colors else if (colors.size == 1) listOf(colors[0], colors[0]) else DEFAULT_GRADIENT
}

/** Баннер страницы: картинка поверх градиента (если картинка не загрузится — останется градиент, как в веб). */
@Composable
fun PageBannerBackground(bannerUrl: String?, bannerGradient: String?, modifier: Modifier = Modifier) {
    Box(modifier.background(Brush.linearGradient(cssGradientColors(bannerGradient)))) {
        Api.fileUrl(bannerUrl)?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
    }
}

@Composable
fun TagBadge(tag: PageTagRef, modifier: Modifier = Modifier, selected: Boolean = true) {
    val c = cssColor(tag.color)
    Text(
        tag.label,
        color = if (selected) c else Brand.TextMuted,
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier.clip(CircleShape)
            .background(if (selected) c.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.05f))
            .border(1.dp, if (selected) c.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.12f), CircleShape)
            .padding(horizontal = 9.dp, vertical = 3.dp),
    )
}

/** ISO-время сервера (UTC) → местное «17.10.2026, 12:24», как в веб. */
private fun localStamp(iso: String?): String = iso?.let {
    runCatching {
        java.time.Instant.parse(it).atZone(java.time.ZoneId.systemDefault())
            .format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm"))
    }.getOrElse { _ -> it.take(16).replace('T', ' ') }
} ?: "—"

private data class PagesData(val pages: List<PageSummary>, val tags: List<PageTag>)

/** Страницы — как в веб: карточки с баннером, закрепление, теги и менеджер тегов. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PagesScreen(nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberLoadable {
        coroutineScope {
            val p = async { Api.get<Items<PageSummary>>("/api/life/pages").items }
            val t = async { runCatching { Api.get<Items<PageTag>>("/api/life/pages/tags").items }.getOrDefault(emptyList()) }
            PagesData(p.await(), t.await())
        }
    }
    var tab by remember { mutableStateOf(0) }
    var filter by remember { mutableStateOf<Int?>(null) }
    var tagsFor by remember { mutableStateOf<PageSummary?>(null) }
    var creating by remember { mutableStateOf(false) }

    fun act(block: suspend () -> Unit) = scope.launch {
        runCatching { block() }.onFailure { Toast.makeText(context, it.message ?: "Ошибка", Toast.LENGTH_SHORT).show() }
        state.reload()
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Страницы", { nav.popBackStack() }) {
            androidx.compose.material3.IconButton({ creating = true }) {
                androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Default.Add, "Новая страница", tint = Brand.Text)
            }
            androidx.compose.material3.IconButton({ nav.navigate("search") }) {
                androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Default.Search, "Поиск", tint = Brand.Text)
            }
        }
        TabRow(
            selectedTabIndex = tab, containerColor = Color.Transparent, contentColor = Brand.Mint,
            indicator = { TabRowDefaults.SecondaryIndicator(Modifier.tabIndicatorOffset(it[tab]), color = Brand.Mint) },
        ) {
            Tab(tab == 0, { tab = 0 }, text = { Text("Страницы") })
            Tab(tab == 1, { tab = 1 }, text = { Text("Теги") })
        }
        LoadableContent(state) { data ->
            if (tab == 1) {
                TagManager(data.tags, onCreate = { l, c -> act { Api.post("/api/life/pages/tags", buildJsonObject { put("label", l); put("color", c) }) } },
                    onEdit = { id, l, c -> act { Api.put("/api/life/pages/tags/$id", buildJsonObject { put("label", l); put("color", c) }) } },
                    onDelete = { id -> act { Api.delete("/api/life/pages/tags/$id"); if (filter == id) filter = null } })
                return@LoadableContent
            }
            val pages = data.pages.filter { p -> filter == null || p.tags.any { it.id == filter } }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (data.tags.isNotEmpty()) item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        TagBadge(PageTagRef(0, "Все", "#27e9b5"), Modifier.clickable { filter = null }, selected = filter == null)
                        data.tags.forEach { t ->
                            TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clickable { filter = if (filter == t.id) null else t.id }, selected = filter == t.id)
                        }
                    }
                }
                if (pages.isEmpty()) item { EmptyState("📝", "Страниц нет", "Заметки и конспекты создаются в веб-версии, здесь их удобно читать.") }
                items(pages, key = { it.id }) { p ->
                    PageCard(
                        p,
                        onOpen = { nav.navigate("page/${p.id}") },
                        onPin = { act { Api.put("/api/life/pages/${p.id}", buildJsonObject { put("pinned", !p.pinned) }) } },
                        onTags = { tagsFor = p },
                    )
                }
            }
            if (creating) NewPageDialog(data.tags, onDismiss = { creating = false }) { id -> creating = false; state.reload(); nav.navigate("page/$id") }
            tagsFor?.let { page ->
                PageTagsDialog(page, data.tags, onDismiss = { tagsFor = null }) { ids ->
                    tagsFor = null
                    act { Api.put("/api/life/pages/${page.id}/tags", buildJsonObject { putJsonArray("tags") { ids.forEach { add(it) } } }) }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageCard(p: PageSummary, onOpen: () -> Unit, onPin: () -> Unit, onTags: () -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Box(Modifier.fillMaxWidth().height(128.dp).clip(shape).border(1.dp, Color.White.copy(alpha = 0.1f), shape).clickable(onClick = onOpen)) {
        PageBannerBackground(p.bannerUrl, p.bannerGradient, Modifier.matchParentSize())
        Box(Modifier.matchParentSize().background(Brush.linearGradient(listOf(Color(0xB3000000), Color(0x66000000), Color(0xB3000000)))))
        Column(Modifier.fillMaxSize().padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Text("Обновлено: ${localStamp(p.updatedAt)}", color = Color.White.copy(alpha = 0.8f), fontSize = 11.sp, modifier = Modifier.weight(1f))
                RoundIcon(if (p.pinned) "📌" else "📍", p.pinned, onPin)
                Spacer(Modifier.width(6.dp))
                RoundIcon("🏷️", false, onTags)
            }
            Spacer(Modifier.weight(1f))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(p.title?.ifBlank { null } ?: "Без названия", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (p.pinned) {
                    Spacer(Modifier.width(8.dp))
                    Text("ЗАКРЕПЛЕНО", color = Color.Black, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(CircleShape).background(Color(0xE6FCD34D)).padding(horizontal = 7.dp, vertical = 2.dp))
                }
            }
            if (p.tags.isNotEmpty()) {
                Spacer(Modifier.height(5.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp)) { p.tags.forEach { TagBadge(it) } }
            }
        }
    }
}

@Composable
private fun RoundIcon(emoji: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(34.dp).clip(CircleShape)
            .background(if (active) Color(0xFFFCD34D) else Color(0x66000000))
            .border(1.dp, Color.White.copy(alpha = 0.15f), CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(emoji, fontSize = 15.sp) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageTagsDialog(page: PageSummary, tags: List<PageTag>, onDismiss: () -> Unit, onSave: (List<Int>) -> Unit) {
    val selected = remember(page.id) { mutableStateListOf<Int>().apply { addAll(page.tags.map { it.id }) } }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Brand.Card,
        title = { Text("Теги: ${page.title ?: "страница"}", color = Brand.Text, fontSize = 17.sp) },
        text = {
            if (tags.isEmpty()) Text("Тегов пока нет — создайте их на вкладке «Теги».", color = Brand.TextMuted)
            else FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                tags.forEach { t ->
                    val on = t.id in selected
                    TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clickable { if (on) selected.remove(t.id) else selected.add(t.id) }, selected = on)
                }
            }
        },
        confirmButton = { TextButton({ onSave(selected.toList()) }) { Text("Сохранить", color = Brand.Mint) } },
        dismissButton = { TextButton(onDismiss) { Text("Отмена", color = Brand.TextMuted) } },
    )
}

@Composable
private fun ColorPicker(value: String, onChange: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        TAG_COLORS.forEach { c ->
            Box(
                Modifier.size(24.dp).clip(CircleShape).background(cssColor(c))
                    .border(2.dp, if (c.equals(value, true)) Color.White else Color.Transparent, CircleShape)
                    .clickable { onChange(c) },
            )
        }
    }
}

/** Менеджер тегов, как в веб: создать, переименовать/перекрасить, удалить. */
@Composable
private fun TagManager(tags: List<PageTag>, onCreate: (String, String) -> Unit, onEdit: (Int, String, String) -> Unit, onDelete: (Int) -> Unit) {
    var label by remember { mutableStateOf("") }
    var color by remember { mutableStateOf(TAG_COLORS[0]) }
    var editing by remember { mutableStateOf<PageTag?>(null) }
    var deleting by remember { mutableStateOf<PageTag?>(null) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            LhCard(Modifier.fillMaxWidth()) {
                Text("Новый тег", color = Brand.Mint, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(label, { label = it.take(40) }, placeholder = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(8.dp))
                ColorPicker(color) { color = it }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Создать", color = Color(0xFF02221A), fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (label.isBlank()) Brand.Mint.copy(alpha = 0.4f) else Brand.Mint)
                        .clickable(enabled = label.isNotBlank()) { onCreate(label.trim(), color); label = "" }
                        .padding(horizontal = 18.dp, vertical = 9.dp),
                )
            }
        }
        item { Text("СПИСОК ТЕГОВ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp)) }
        if (tags.isEmpty()) item { Text("Тегов пока нет", color = Brand.TextMuted) }
        items(tags, key = { it.id }) { t ->
            LhCard(Modifier.fillMaxWidth(), padding = PaddingValues(start = 14.dp, end = 4.dp, top = 2.dp, bottom = 2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TagBadge(PageTagRef(t.id, t.label, t.color))
                    Spacer(Modifier.width(8.dp))
                    Text("${t.pageCount} стр.", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                    TextButton({ editing = t }) { Text("Изменить", color = Brand.Text, fontSize = 12.sp) }
                    TextButton({ deleting = t }) { Text("Удалить", color = Color(0xFFF87171), fontSize = 12.sp) }
                }
            }
        }
    }
    editing?.let { t ->
        var l by remember(t.id) { mutableStateOf(t.label) }
        var c by remember(t.id) { mutableStateOf(t.color ?: TAG_COLORS[0]) }
        AlertDialog(
            onDismissRequest = { editing = null }, containerColor = Brand.Card,
            title = { Text("Тег", color = Brand.Text) },
            text = {
                Column {
                    OutlinedTextField(l, { l = it.take(40) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.height(10.dp))
                    ColorPicker(c) { c = it }
                }
            },
            confirmButton = { TextButton({ if (l.isNotBlank()) { onEdit(t.id, l.trim(), c); editing = null } }) { Text("Сохранить", color = Brand.Mint) } },
            dismissButton = { TextButton({ editing = null }) { Text("Отмена", color = Brand.TextMuted) } },
        )
    }
    deleting?.let { t ->
        AlertDialog(
            onDismissRequest = { deleting = null }, containerColor = Brand.Card,
            title = { Text("Удалить тег «${t.label}»?", color = Brand.Text) },
            text = { Text("Тег снимется со всех страниц.", color = Brand.TextMuted) },
            confirmButton = { TextButton({ onDelete(t.id); deleting = null }) { Text("Удалить", color = Color(0xFFF87171)) } },
            dismissButton = { TextButton({ deleting = null }) { Text("Отмена", color = Brand.TextMuted) } },
        )
    }
}

/** Быстрая заметка с телефона: страница с одним текстовым блоком (как новая страница в веб). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NewPageDialog(allTags: List<PageTag>, onDismiss: () -> Unit, onCreated: (Int) -> Unit) {
    val scope = rememberCoroutineScope()
    var title by remember { mutableStateOf("") }
    var text by remember { mutableStateOf("") }
    val tags = remember { mutableStateListOf<Int>() }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = Brand.Card,
        title = { Text("Новая страница", color = Brand.Text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(text, { text = it }, label = { Text("Текст") }, minLines = 4, modifier = Modifier.fillMaxWidth())
                if (allTags.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    allTags.forEach { t ->
                        val on = t.id in tags
                        TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clickable { if (on) tags.remove(t.id) else tags.add(t.id) }, selected = on)
                    }
                }
                Text("Блоки, картинки и PDF добавляются в веб-редакторе.", color = Brand.TextFaint, fontSize = 11.sp)
                error?.let { Text(it, color = Brand.Rose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = !busy && (title.isNotBlank() || text.isNotBlank()), onClick = {
                busy = true
                val html = text.trim().split("\n").joinToString("<br>") { line ->
                    line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                }
                scope.launch {
                    runCatching {
                        val res = Api.post("/api/life/pages", kotlinx.serialization.json.buildJsonObject {
                            put("title", title.trim().ifBlank { "Заметка" })
                            putJsonArray("tags") { tags.forEach { add(it) } }
                            putJsonArray("blocks") {
                                add(kotlinx.serialization.json.buildJsonObject {
                                    put("id", java.util.UUID.randomUUID().toString()); put("type", "text"); put("text", text.trim()); put("checked", false); put("url", "")
                                    put("meta", kotlinx.serialization.json.buildJsonObject {
                                        put("html", html)
                                        put("layout", kotlinx.serialization.json.buildJsonObject { put("x", 120); put("y", 140); put("w", 520); put("h", 260) })
                                    })
                                })
                            }
                        })
                        (res as kotlinx.serialization.json.JsonObject)["id"]!!.toString().toInt()
                    }.onSuccess(onCreated).onFailure { error = it.message; busy = false }
                }
            }) { Text(if (busy) "Создаю…" else "Создать", color = Brand.Mint) }
        },
        dismissButton = { TextButton({ onDismiss() }, enabled = !busy) { Text("Отмена", color = Brand.TextMuted) } },
    )
}
