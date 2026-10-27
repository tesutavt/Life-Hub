package com.lifehub.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.fromHtml
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.PageBlock
import com.lifehub.app.data.PageFull
import com.lifehub.app.data.PageResponse
import com.lifehub.app.data.PageSummary
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId

private val BLOCK_LABELS = mapOf(
    "text" to "Текст", "heading" to "Заголовок", "todo" to "Задача", "image" to "Изображение", "pdf" to "PDF",
    "kana" to "Kana", "timer" to "Таймер", "divider" to "Разделитель", "calendar" to "Календарь", "pageNav" to "Навигация", "tabs" to "Tabs",
)
private val BLOCK_BG = Color(0xE610202C)
private const val HEADER_H = 45f

private data class PageData(val page: PageFull, val pages: List<PageSummary>)

/**
 * Страница, как в веб-редакторе: блоки на холсте на своих местах и своих размеров.
 * Щипок — масштаб, двойной тап — приблизить/отдалить; «Списком» — блоки по порядку на всю ширину.
 */
@Composable
fun PageViewScreen(pageId: Int, nav: NavController) {
    val state = rememberLoadable(pageId) {
        coroutineScope {
            val page = async { Api.get<PageResponse>("/api/life/pages/$pageId").page }
            val pages = async { runCatching { Api.get<Items<PageSummary>>("/api/life/pages").items }.getOrDefault(emptyList()) }
            PageData(page.await(), pages.await())
        }
    }
    var listMode by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val activeTabs = remember(pageId) { mutableStateMapOf<String, String>() }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar(state.data?.page?.title ?: "Страница", { nav.popBackStack() }) {
            TextButton(onClick = { listMode = !listMode }) { Text(if (listMode) "Холстом" else "Списком", color = Brand.Mint) }
            androidx.compose.material3.IconButton({ deleting = true }) {
                androidx.compose.material3.Icon(androidx.compose.material.icons.Icons.Default.Delete, "Удалить", tint = Brand.TextFaint)
            }
        }
        if (deleting) {
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { deleting = false },
                containerColor = Brand.Night,
                title = { Text("Удалить страницу?") },
                text = { Text("«${state.data?.page?.title ?: "Страница"}» удалится вместе с блоками.", color = Brand.TextMuted) },
                confirmButton = {
                    TextButton(onClick = {
                        deleting = false
                        scope.launch { runCatching { Api.delete("/api/life/pages/$pageId") }; nav.popBackStack() }
                    }) { Text("Удалить", color = Brand.Rose) }
                },
                dismissButton = { TextButton(onClick = { deleting = false }) { Text("Отмена") } },
            )
        }
        LoadableContent(state) { data ->
            val blocks = data.page.blocks
            // Активная вкладка каждой группы: выбранная на телефоне → сохранённая → первая
            fun activeTab(tabsBlock: PageBlock): String? =
                activeTabs[tabsBlock.id] ?: tabsBlock.meta?.activeTabId ?: tabsBlock.meta?.tabs?.firstOrNull()?.id
            val visible = blocks.filter { b ->
                val group = b.meta?.tabGroupId
                val tab = b.meta?.tabId
                if (b.type == "tabs" || group == null || tab == null) true
                else blocks.firstOrNull { it.id == group && it.type == "tabs" }?.let { activeTab(it) == tab } ?: true
            }
            val render: @Composable (PageBlock) -> Unit = { b ->
                BlockBody(b, data.pages, nav, activeTab = if (b.type == "tabs") activeTab(b) else null, onTab = { id -> activeTabs[b.id] = id })
            }
            if (listMode) {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Banner(data.page, Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(18.dp)))
                    visible.sortedWith(compareBy({ it.meta?.layout?.y ?: 0.0 }, { it.meta?.layout?.x ?: 0.0 })).forEach { b ->
                        val h = (b.meta?.layout?.h ?: 190.0).toFloat()
                        BlockChrome(b, Modifier.fillMaxWidth().heightIn(min = 60.dp, max = (h.coerceAtLeast(80f)).dp), render)
                    }
                    if (visible.isEmpty()) Text("Пустая страница", color = Brand.TextMuted)
                }
            } else {
                Canvas(data.page, visible, render)
            }
        }
    }
}

@Composable
private fun Banner(page: PageFull, modifier: Modifier) {
    if (page.bannerUrl.isNullOrBlank() && page.bannerGradient.isNullOrBlank()) return
    PageBannerBackground(page.bannerUrl, page.bannerGradient, modifier)
}

@Composable
private fun Canvas(page: PageFull, blocks: List<PageBlock>, render: @Composable (PageBlock) -> Unit) {
    val density = LocalDensity.current
    val bannerH = if (page.bannerUrl != null || !page.bannerGradient.isNullOrBlank()) 200f else 0f
    val canvasW = (blocks.maxOfOrNull { (it.meta?.layout?.let { l -> l.x + l.w } ?: 400.0) } ?: 400.0).toFloat().coerceAtLeast(360f) + 30f
    val canvasH = bannerH + (blocks.maxOfOrNull { (it.meta?.layout?.let { l -> l.y + l.h } ?: 200.0) } ?: 200.0).toFloat() + 30f

    BoxWithConstraints(Modifier.fillMaxSize().clipToBounds().background(Color(0xFF07131C))) {
        val viewW = constraints.maxWidth.toFloat()
        val viewH = constraints.maxHeight.toFloat()
        val contentW = with(density) { canvasW.dp.toPx() }
        val contentH = with(density) { canvasH.dp.toPx() }
        val fit = (viewW / contentW).coerceAtMost(1f)
        var scale by remember(page.id) { mutableStateOf(fit) }
        var offset by remember(page.id) { mutableStateOf(Offset.Zero) }

        fun clamp(o: Offset, s: Float): Offset {
            val minX = (viewW - contentW * s).coerceAtMost(0f)
            val minY = (viewH - contentH * s).coerceAtMost(0f)
            return Offset(o.x.coerceIn(minX, 0f), o.y.coerceIn(minY, 0f))
        }

        Box(
            Modifier.fillMaxSize()
                .pointerInput(page.id) {
                    detectTransformGestures { centroid, pan, zoom, _ ->
                        val newScale = (scale * zoom).coerceIn(fit * 0.9f, 3f)
                        val o = centroid - (centroid - offset) * (newScale / scale) + pan
                        scale = newScale
                        offset = clamp(o, newScale)
                    }
                }
                .pointerInput(page.id) {
                    detectTapGestures(onDoubleTap = { tap ->
                        val target = if (scale < 0.95f) 1f else fit
                        val o = tap - (tap - offset) * (target / scale)
                        scale = target
                        offset = clamp(o, target)
                    })
                },
        ) {
            Box(
                Modifier.wrapContentSize(Alignment.TopStart, unbounded = true)
                    .requiredSize(canvasW.dp, canvasH.dp)
                    .graphicsLayer {
                        transformOrigin = TransformOrigin(0f, 0f)
                        scaleX = scale; scaleY = scale
                        translationX = offset.x; translationY = offset.y
                    },
            ) {
                Banner(page, Modifier.fillMaxWidth().height(bannerH.dp))
                blocks.forEach { b ->
                    val l = b.meta?.layout
                    BlockChrome(
                        b,
                        Modifier.offset(((l?.x ?: 0.0).toFloat()).dp, (bannerH + (l?.y ?: 0.0).toFloat()).dp)
                            .size(((l?.w ?: 360.0).toFloat()).dp, ((l?.h ?: 190.0).toFloat()).dp),
                        render,
                    )
                }
            }
            if (scale < 0.6f) {
                Text(
                    "Щипок — масштаб · двойной тап — приблизить",
                    color = Brand.TextFaint, fontSize = 11.sp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(10.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
    }
}

/** Рамка блока как на компьютере: скруглённая карточка с заголовком (если не скрыты). */
@Composable
private fun BlockChrome(b: PageBlock, modifier: Modifier, render: @Composable (PageBlock) -> Unit) {
    val d = b.meta?.display
    val chrome = d?.hideChrome != true
    val header = d?.hideHeader != true
    val title = d?.customTitle?.trim()?.ifBlank { null } ?: b.text?.trim()?.ifBlank { null }?.takeIf { b.type !in setOf("text", "todo", "heading") }
        ?: BLOCK_LABELS[b.type] ?: b.type
    Column(
        modifier.clip(RoundedCornerShape(24.dp))
            .then(if (chrome) Modifier.background(BLOCK_BG).border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(24.dp)) else Modifier),
    ) {
        if (header) {
            Text(
                title.uppercase(), color = Color.White.copy(alpha = 0.5f), fontSize = 11.sp, letterSpacing = 2.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().height(HEADER_H.dp).padding(horizontal = 16.dp, vertical = 14.dp),
            )
            if (chrome) Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.1f)))
        }
        Box(Modifier.fillMaxSize()) { render(b) }
    }
}

private fun html(b: PageBlock): AnnotatedString {
    val raw = b.meta?.html?.takeIf { it.isNotBlank() } ?: (b.text ?: "")
    return runCatching { AnnotatedString.fromHtml(raw.replace("\n", "<br>")) }.getOrDefault(AnnotatedString(raw))
}

@Composable
private fun BlockBody(b: PageBlock, pages: List<PageSummary>, nav: NavController, activeTab: String?, onTab: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    when (b.type) {
        "heading" -> Text(html(b), color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(16.dp))
        "text" -> Text(html(b), color = Color.White.copy(alpha = 0.9f), fontSize = 15.sp, lineHeight = 21.sp, modifier = Modifier.padding(16.dp).verticalScroll(rememberScrollState()))
        "todo" -> Row(Modifier.padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Checkbox(b.checked, null, colors = CheckboxDefaults.colors(checkedColor = Brand.Mint, uncheckedColor = Color.White.copy(alpha = 0.4f)))
            Text(html(b), color = if (b.checked) Color.White.copy(alpha = 0.5f) else Color.White, fontSize = 15.sp,
                textDecoration = if (b.checked) TextDecoration.LineThrough else null)
        }
        "image" -> {
            val url = Api.fileUrl(b.url?.ifBlank { null })
            if (url != null) AsyncImage(url, b.meta?.originalName, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize().padding(8.dp).clip(RoundedCornerShape(14.dp)))
            else Text("Картинка не выбрана", color = Brand.TextFaint, modifier = Modifier.padding(16.dp))
        }
        "pdf" -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📕", fontSize = 48.sp)
            Text(b.meta?.originalName ?: b.text ?: "PDF", color = Color.White, fontWeight = FontWeight.SemiBold, maxLines = 2)
            Api.fileUrl(b.url?.ifBlank { null })?.let { url ->
                TextButton(onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }) { Text("Открыть PDF", color = Brand.Mint) }
            }
        }
        "kana" -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("あ", fontSize = 72.sp, color = Color.White)
            Text("Кана-тренажёр", color = Color.White, fontWeight = FontWeight.SemiBold)
            TextButton(onClick = {
                scope.launch {
                    val langs = runCatching { Api.get<Items<Language>>("/api/life/languages").items }.getOrDefault(emptyList())
                    val ja = langs.firstOrNull { Regex("япон|japan|日本", RegexOption.IGNORE_CASE).containsMatchIn(it.name) } ?: langs.firstOrNull()
                    ja?.let { nav.navigate("kana/${it.id}") }
                }
            }) { Text("Тренироваться", color = Brand.Mint) }
        }
        "timer" -> TimerBody(b)
        "divider" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(Color.White.copy(alpha = 0.2f))) }
        "calendar" -> Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📅", fontSize = 48.sp)
            TextButton(onClick = { nav.navigate("calendar") }) { Text("Открыть календарь", color = Brand.Mint) }
        }
        "pageNav" -> {
            val tagIds = b.meta?.selectedTagIds.orEmpty()
            val list = pages.filter { p -> tagIds.isEmpty() || p.tags.any { it.id in tagIds } }
            Column(Modifier.fillMaxSize().padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (tagIds.isEmpty()) Text("Показаны все страницы", color = Color.White.copy(alpha = 0.45f), fontSize = 12.sp)
                list.forEach { p ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.03f))
                            .border(1.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                            .clickable { nav.navigate("page/${p.id}") }.padding(12.dp),
                    ) {
                        Text(p.title?.ifBlank { null } ?: "Без названия", color = Color.White.copy(alpha = 0.85f), fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (p.pinned) Text("📌", fontSize = 13.sp)
                    }
                }
                if (list.isEmpty()) Text("Нет страниц по выбранным тегам", color = Brand.TextMuted, fontSize = 13.sp)
            }
        }
        "tabs" -> Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            b.meta?.tabs.orEmpty().forEach { tab ->
                val on = tab.id == activeTab
                Text(
                    tab.title.ifBlank { "Вкладка" }, fontSize = 14.sp,
                    color = if (on) Color(0xFF020617) else Color.White.copy(alpha = 0.75f),
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) Color.White else Color.White.copy(alpha = 0.03f))
                        .border(1.dp, if (on) Color.White else Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                        .clickable { onTab(tab.id) }.padding(horizontal = 12.dp, vertical = 8.dp),
                )
            }
        }
        else -> Text(html(b), color = Color.White, modifier = Modifier.padding(16.dp))
    }
}

@Composable
private fun TimerBody(b: PageBlock) {
    val timer = b.meta?.countdownTimer
    val target = timer?.target?.let { t ->
        runCatching { OffsetDateTime.parse(t).toInstant() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(t).atZone(ZoneId.systemDefault()).toInstant() }.getOrNull()
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(b.id) {
        while (true) {
            delay(1000)
            now = System.currentTimeMillis()
        }
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(timer?.title?.ifBlank { null } ?: "Таймер", color = Color.White.copy(alpha = 0.7f), fontSize = 14.sp)
        Spacer(Modifier.height(6.dp))
        if (target == null) Text("Дата не выбрана", color = Brand.TextFaint)
        else {
            val left = Duration.ofMillis((target.toEpochMilli() - now).coerceAtLeast(0))
            Text(
                if (left.isZero) "Время пришло 🎉" else "%d д %02d:%02d:%02d".format(left.toDays(), left.toHours() % 24, left.toMinutes() % 60, left.seconds % 60),
                color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}
