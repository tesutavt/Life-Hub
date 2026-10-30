package com.lifehub.app.ui.screens.pages

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageBackground
import com.lifehub.app.data.PageBlock
import com.lifehub.app.data.PageSummary
import com.lifehub.app.data.PageTag
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.screens.PageBannerBackground
import com.lifehub.app.ui.screens.cssColor
import com.lifehub.app.ui.screens.cssGradientColors
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put
import java.time.YearMonth

// Фон блока — из текущей темы (полупрозрачная карточка)
private val BLOCK_BG get() = Brand.Card.copy(alpha = 0.9f)
private const val HEADER_H = 45f
private val BANNER_H = 200f

/** Справочники для блоков: другие страницы, теги, события календаря текущего месяца. */
private data class PageAux(val pages: List<PageSummary>, val tags: List<PageTag>, val events: List<CalendarEvent>)

/**
 * Страница — как веб-редактор: холст с блоками на своих местах, всё содержимое рабочее.
 * Режим «Редактировать»: первый тап выделяет блок, ручки — двигать и растягивать, «+» — новый блок,
 * панель снизу — действия с блоком. Изменения сохраняются сами.
 */
@OptIn(ExperimentalMaterial3Api::class, DelicateCoroutinesApi::class)
@Composable
fun PageViewScreen(pageId: Int, nav: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = remember(pageId) { PageEditorState(pageId) }
    var aux by remember { mutableStateOf(PageAux(emptyList(), emptyList(), emptyList())) }
    var editMode by remember { mutableStateOf(false) }
    var listMode by remember { mutableStateOf(false) }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    var pageSettings by remember { mutableStateOf(false) }
    var editingId by remember { mutableStateOf<String?>(null) }
    var dialog by remember { mutableStateOf<String?>(null) } // appearance | tabs | link | delete
    var loadError by remember { mutableStateOf<String?>(null) }
    var uploadTarget by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    // Центр видимой области холста — сюда ставим новые блоки
    var viewCenter by remember { mutableStateOf(Offset(160f, 200f)) }

    LaunchedEffect(pageId) {
        runCatching { state.load() }.onFailure { loadError = it.message }
        aux = coroutineScope {
            val pages = async { runCatching { Api.get<Items<PageSummary>>("/api/life/pages").items }.getOrDefault(emptyList()) }
            val tags = async { runCatching { Api.get<Items<PageTag>>("/api/life/pages/tags").items }.getOrDefault(emptyList()) }
            val events = async {
                val m = YearMonth.now()
                runCatching { Api.get<Items<CalendarEvent>>("/api/life/calendar?y=${m.year}&m=${m.monthValue}").items }.getOrDefault(emptyList())
            }
            PageAux(pages.await(), tags.await(), events.await())
        }
    }
    // Автосохранение: через секунду после последней правки
    LaunchedEffect(state.version) {
        if (!state.loaded || !state.dirty) return@LaunchedEffect
        delay(1200)
        state.save()
    }
    // Ушли со страницы с несохранёнными правками — дописываем в фоне
    DisposableEffect(state) { onDispose { if (state.dirty) GlobalScope.launch { state.save() } } }

    fun upload(uri: Uri, kind: String, apply: (String, String) -> Unit) {
        busy = if (kind == "pdf") "Загружаю PDF…" else "Загружаю картинку…"
        scope.launch {
            runCatching { uploadFile(context, uri, kind) }
                .onSuccess { (url, name) -> apply(url, name) }
                .onFailure { state.error = "Не удалось загрузить: ${it.message}" }
            busy = null
        }
    }
    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val target = uploadTarget ?: return@rememberLauncherForActivityResult
        uri ?: return@rememberLauncherForActivityResult
        upload(uri, "image") { url, _ -> state.update(target) { it.with("url", JsonPrimitive(url)) } }
    }
    val pdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        val target = uploadTarget ?: return@rememberLauncherForActivityResult
        uri ?: return@rememberLauncherForActivityResult
        upload(uri, "pdf") { url, name ->
            state.update(target) { raw ->
                raw.with("url", JsonPrimitive(url))
                    .with("text", JsonPrimitive(raw.str("text")?.ifBlank { null } ?: name.removeSuffix(".pdf")))
                    .withMeta("originalName", JsonPrimitive(name))
            }
        }
    }
    val backgroundPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        upload(uri, "image") { url, _ -> state.background = (state.background ?: PageBackground()).copy(url = url); state.touchPage() }
    }

    val ctx = BlockContext(
        state = state, editMode = editMode, pages = aux.pages, tags = aux.tags, events = aux.events, nav = nav,
        pickImage = { id -> selectedId = id; uploadTarget = id; imagePicker.launch("image/*") },
        editBlock = { id -> selectedId = id; editingId = id },
    )

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar(state.title.ifBlank { "Страница" }, { nav.popBackStack() }) {
            SaveStatus(state)
            TextButton(onClick = { listMode = !listMode }) { Text(if (listMode) "Холст" else "Список", color = Brand.Mint, fontSize = 13.sp) }
            if (editMode) IconButton({ pageSettings = true }) { Icon(Icons.Default.Settings, "Настройки страницы", tint = Brand.Text) }
            IconButton({ editMode = !editMode; selectedId = null }) {
                Icon(if (editMode) Icons.Default.Check else Icons.Default.Edit, if (editMode) "Готово" else "Редактировать", tint = if (editMode) Brand.Mint else Brand.Text)
            }
        }
        if (!state.loaded) {
            Text(loadError?.let { "Не удалось открыть страницу: $it" } ?: "Загрузка…", color = Brand.TextMuted, modifier = Modifier.padding(16.dp))
            return@Column
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val parsed = state.blocks.map { state.parsed(it) }
            val visible = visibleBlocks(parsed)
            if (listMode) ListView(state, visible, ctx, selectedId, editMode) { selectedId = it }
            else PageCanvas(state, parsed, visible, ctx, selectedId, editMode, onSelect = { selectedId = it }, onViewCenter = { viewCenter = it })

            if (editMode) {
                FloatingActionButton(
                    onClick = { adding = true }, containerColor = Brand.Mint, contentColor = Brand.Deep,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(end = 16.dp, bottom = if (selectedId != null) 76.dp else 16.dp),
                ) { Icon(Icons.Default.Add, "Добавить блок") }
            }
            busy?.let {
                Text(it, color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.TopCenter).padding(8.dp)
                    .clip(CircleShape).background(Color.Black.copy(alpha = 0.7f)).padding(horizontal = 14.dp, vertical = 6.dp))
            }
            state.error?.let {
                Text(it, color = Color.White, fontSize = 12.sp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 40.dp)
                    .clip(RoundedCornerShape(10.dp)).background(Brand.Rose.copy(alpha = 0.85f)).clickable { state.error = null }.padding(horizontal = 12.dp, vertical = 6.dp))
            }
            val sel = selectedId?.let { id -> parsed.firstOrNull { it.id == id } }
            if (editMode && sel != null) {
                BlockActionBar(
                    sel, Modifier.align(Alignment.BottomCenter),
                    onEdit = { editingId = sel.id },
                    onImage = { uploadTarget = sel.id; imagePicker.launch("image/*") },
                    onPdf = { uploadTarget = sel.id; pdfPicker.launch("application/pdf") },
                    onDuplicate = { state.duplicate(sel.id) },
                    onDialog = { dialog = it },
                )
            }
        }
    }

    if (adding) {
        ModalBottomSheet(onDismissRequest = { adding = false }, containerColor = Brand.Night) {
            AddBlockSheet { type ->
                adding = false
                val maxY = state.blocks.maxOfOrNull { it.layout().let { l -> l.y + l.h } } ?: 0f
                val p = presetOf(type)
                val block = if (listMode) createBlock(type, 40f, maxY + 40f)
                else createBlock(type, (viewCenter.x - p.w / 2f).coerceAtLeast(0f), (viewCenter.y - p.h / 2f).coerceAtLeast(0f))
                state.add(block)
                selectedId = block.str("id")
            }
        }
    }
    if (pageSettings) {
        ModalBottomSheet(onDismissRequest = { pageSettings = false }, containerColor = Brand.Night) {
            PageSettingsSheet(state, onPickBackground = { backgroundPicker.launch("image/*") })
        }
    }
    editingId?.let { id ->
        val raw = state.raw(id)
        if (raw == null) editingId = null else EditBlockDialog(raw, state) { editingId = null }
    }
    val selRaw = selectedId?.let { state.raw(it) }
    when (dialog) {
        "appearance" -> if (selRaw != null) AppearanceDialog(selRaw, state) { dialog = null }
        "tabs" -> if (selRaw != null) TabsAssignDialog(selRaw, state) { dialog = null }
        "link" -> if (selRaw != null) LinkDialog(selRaw, state) { dialog = null }
        "delete" -> if (selRaw != null) AlertDialog(
            onDismissRequest = { dialog = null }, containerColor = Brand.Night,
            title = { Text("Удалить блок?") },
            confirmButton = { TextButton({ state.remove(selRaw.str("id").orEmpty()); selectedId = null; dialog = null }) { Text("Удалить", color = Brand.Rose) } },
            dismissButton = { TextButton({ dialog = null }) { Text("Отмена") } },
        )
    }
}

/** Блоки, которые видны с учётом активных вкладок (как isBlockVisibleForTabs в веб). */
private fun visibleBlocks(all: List<PageBlock>): List<PageBlock> = all.filter { b ->
    val group = b.meta?.tabGroupId
    val tab = b.meta?.tabId
    if (b.type == "tabs" || group == null || tab == null) true
    else all.firstOrNull { it.id == group && it.type == "tabs" }?.let { t ->
        (t.meta?.activeTabId?.takeIf { a -> t.meta.tabs.any { it.id == a } } ?: t.meta?.tabs?.firstOrNull()?.id) == tab
    } ?: true
}

@Composable
private fun SaveStatus(state: PageEditorState) {
    val text = when {
        state.saving -> "сохраняю…"
        state.dirty -> "•"
        state.version > 0 -> "✓"
        else -> ""
    }
    if (text.isNotEmpty()) Text(text, color = if (state.dirty) Brand.Amber else Brand.Mint, fontSize = 12.sp, modifier = Modifier.padding(end = 4.dp))
}

/** Фон страницы: цвет → градиент → картинка с затемнением. */
@Composable
private fun PageBackgroundLayer(bg: PageBackground?, modifier: Modifier) {
    val base = bg?.color?.let { cssColor(it, Brand.Card) } ?: Brand.Card
    Box(modifier.background(base)) {
        if (bg?.url.isNullOrBlank() && !bg?.gradient.isNullOrBlank()) Box(Modifier.matchParentSize().background(Brush.linearGradient(cssGradientColors(bg?.gradient))))
        Api.fileUrl(bg?.url?.ifBlank { null })?.let { url ->
            AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
            Box(Modifier.matchParentSize().background(Color(0xFF081018).copy(alpha = bg?.dim?.toFloat() ?: 0.35f)))
        }
    }
}

// ───────────── Холст ─────────────
@Composable
private fun PageCanvas(
    state: PageEditorState,
    all: List<PageBlock>,
    visible: List<PageBlock>,
    ctx: BlockContext,
    selectedId: String?,
    editMode: Boolean,
    onSelect: (String?) -> Unit,
    onViewCenter: (Offset) -> Unit,
) {
    val density = LocalDensity.current.density
    val hasBanner = !state.bannerUrl.isNullOrBlank() || !state.bannerGradient.isNullOrBlank()
    val bannerH = if (hasBanner) BANNER_H else 0f
    val layouts = state.blocks.associate { it.str("id").orEmpty() to it.layout() }
    val canvasW = ((layouts.values.maxOfOrNull { it.x + it.w } ?: 400f) + 120f).coerceAtLeast(1280f)
    val canvasH = bannerH + ((layouts.values.maxOfOrNull { it.y + it.h } ?: 400f) + 200f).coerceAtLeast(900f)

    BoxWithConstraints(Modifier.fillMaxSize().clipToBounds().background(Brand.Deep)) {
        val viewW = constraints.maxWidth.toFloat()
        val viewH = constraints.maxHeight.toFloat()
        val contentW = canvasW * density
        val contentH = canvasH * density
        val fit = (viewW / contentW).coerceAtMost(1f)
        var scale by remember(state.pageId) { mutableStateOf(fit) }
        var offset by remember(state.pageId) { mutableStateOf(Offset.Zero) }
        fun clamp(o: Offset, s: Float): Offset {
            val minX = (viewW - contentW * s).coerceAtMost(0f)
            val minY = (viewH - contentH * s).coerceAtMost(0f)
            return Offset(o.x.coerceIn(minX, 0f), o.y.coerceIn(minY, 0f))
        }
        LaunchedEffect(scale, offset) {
            onViewCenter(Offset(((viewW / 2 - offset.x) / scale) / density, ((viewH / 2 - offset.y) / scale) / density - bannerH))
        }

        Box(
            Modifier.fillMaxSize()
                .pointerInput(state.pageId) {
                    detectTransformGestures { centroid, pan, zoom, _ ->
                        val newScale = (scale * zoom).coerceIn(fit * 0.9f, 3f)
                        offset = clamp(centroid - (centroid - offset) * (newScale / scale) + pan, newScale)
                        scale = newScale
                    }
                }
                .pointerInput(state.pageId, editMode) {
                    detectTapGestures(
                        onTap = { onSelect(null) },
                        onDoubleTap = { tap ->
                            val target = if (scale < 0.95f) 1f else fit
                            offset = clamp(tap - (tap - offset) * (target / scale), target)
                            scale = target
                        },
                    )
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
                PageBackgroundLayer(state.background, Modifier.matchParentSize().clip(RoundedCornerShape(30.dp)))
                if (hasBanner) PageBannerBackground(state.bannerUrl, state.bannerGradient, Modifier.fillMaxWidth().height(bannerH.dp))
                // Связи между блоками — кривые, как на компьютере
                Canvas(Modifier.matchParentSize()) {
                    visible.forEach { b ->
                        val from = layouts[b.id] ?: return@forEach
                        b.meta?.links.orEmpty().forEach { target ->
                            val to = layouts[target]
                            if (to != null && visible.any { it.id == target }) {
                                val x1 = (from.x + from.w / 2) * density; val y1 = (bannerH + from.y + from.h / 2) * density
                                val x2 = (to.x + to.w / 2) * density; val y2 = (bannerH + to.y + to.h / 2) * density
                                drawPath(Path().apply { moveTo(x1, y1); cubicTo(x1 + 120 * density, y1, x2 - 120 * density, y2, x2, y2) },
                                    Brand.Ink.copy(alpha = 0.18f), style = Stroke(2.5f * density))
                            }
                        }
                    }
                }
                visible.forEach { b ->
                    val raw = state.raw(b.id) ?: return@forEach
                    val l = raw.layout()
                    val selected = b.id == selectedId
                    BlockFrame(
                        b, raw, ctx, selected, editMode,
                        Modifier.offset(l.x.dp, (bannerH + l.y).dp).size(l.w.dp, l.h.dp),
                        onSelect = { onSelect(b.id) },
                    )
                }
                // Ручки выделенного блока: двигать (сверху) и растягивать (угол)
                val sel = selectedId?.let { id -> visible.firstOrNull { it.id == id } }
                if (editMode && sel != null && sel.meta?.display?.locked != true) {
                    val l = state.raw(sel.id)?.layout()
                    if (l != null) {
                        Handle("✥", Modifier.offset((l.x + l.w / 2 - 22).dp, (bannerH + l.y - 22).dp)) { drag ->
                            state.update(sel.id) { r -> val cur = r.layout(); r.withLayout(cur.copy(x = (cur.x + drag.x / (scale * density)).coerceAtLeast(0f), y = (cur.y + drag.y / (scale * density)).coerceAtLeast(0f))) }
                        }
                        Handle("⤡", Modifier.offset((l.x + l.w - 22).dp, (bannerH + l.y + l.h - 22).dp)) { drag ->
                            state.update(sel.id) { r ->
                                val cur = r.layout()
                                val minW = if (sel.type == "image") 80f else 160f
                                val minH = if (sel.type == "divider") 36f else 80f
                                r.withLayout(cur.copy(w = (cur.w + drag.x / (scale * density)).coerceAtLeast(minW), h = (cur.h + drag.y / (scale * density)).coerceAtLeast(minH)))
                            }
                        }
                    }
                }
            }
            if (editMode && selectedId == null) {
                Text("Нажмите на блок, чтобы выделить · «+» — новый блок", color = Brand.Ink.copy(alpha = 0.7f), fontSize = 11.sp,
                    modifier = Modifier.align(Alignment.TopCenter).padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).padding(horizontal = 10.dp, vertical = 4.dp))
            }
        }
    }
}

@Composable
private fun Handle(label: String, modifier: Modifier, onDrag: (Offset) -> Unit) {
    Box(
        modifier.size(44.dp).clip(CircleShape).background(Brand.Mint).border(3.dp, Brand.Deep, CircleShape)
            .pointerInput(Unit) { detectDragGestures { change, amount -> change.consume(); onDrag(amount) } },
        contentAlignment = Alignment.Center,
    ) { Text(label, color = Brand.Deep, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
}

/** Рамка блока: карточка с заголовком, как на компьютере. Картинка — всегда без рамки и подписи. */
@Composable
private fun BlockFrame(b: PageBlock, raw: JsonObject, ctx: BlockContext, selected: Boolean, editMode: Boolean, modifier: Modifier, onSelect: () -> Unit) {
    val d = b.meta?.display
    val isImage = b.type == "image"
    val chrome = d?.hideChrome != true && !isImage
    val header = d?.hideHeader != true && !isImage
    val title = d?.customTitle?.trim()?.ifBlank { null } ?: b.text?.trim()?.ifBlank { null }?.takeIf { b.type !in setOf("text", "todo", "heading") }
        ?: presetOf(b.type).label
    val shape = RoundedCornerShape(24.dp)
    Box(
        modifier.clip(shape)
            .then(if (chrome) Modifier.background(BLOCK_BG).border(1.dp, Brand.Ink.copy(alpha = 0.1f), shape) else Modifier)
            .then(if (selected) Modifier.border(2.dp, Color(0xFF67E8F9), shape) else Modifier),
    ) {
        Column(Modifier.fillMaxSize()) {
            if (header) {
                Row(Modifier.fillMaxWidth().height(HEADER_H.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(title.uppercase(), color = Brand.Ink.copy(alpha = 0.5f), fontSize = 11.sp, letterSpacing = 2.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (d?.locked == true) Text("🔒", fontSize = 11.sp)
                }
                if (chrome) Box(Modifier.fillMaxWidth().height(1.dp).background(Brand.Ink.copy(alpha = 0.1f)))
            }
            Box(Modifier.fillMaxSize()) { BlockContent(raw, b, ctx) }
        }
        // В режиме редактирования первый тап выделяет блок, второй — работает с содержимым
        if (editMode && !selected) {
            Box(Modifier.matchParentSize().pointerInput(b.id) { detectTapGestures { onSelect() } })
        }
    }
}

// ───────────── Список: блоки по порядку на всю ширину ─────────────
@Composable
private fun ListView(state: PageEditorState, visible: List<PageBlock>, ctx: BlockContext, selectedId: String?, editMode: Boolean, onSelect: (String?) -> Unit) {
    Box(Modifier.fillMaxSize()) {
        PageBackgroundLayer(state.background, Modifier.matchParentSize())
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp).padding(bottom = 140.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (!state.bannerUrl.isNullOrBlank() || !state.bannerGradient.isNullOrBlank())
                PageBannerBackground(state.bannerUrl, state.bannerGradient, Modifier.fillMaxWidth().height(140.dp).clip(RoundedCornerShape(18.dp)))
            visible.sortedWith(compareBy({ state.raw(it.id)?.layout()?.y ?: 0f }, { state.raw(it.id)?.layout()?.x ?: 0f })).forEach { b ->
                val raw = state.raw(b.id) ?: return@forEach
                val h = raw.layout().h
                val mod = if (b.type == "image") Modifier.fillMaxWidth().height((h.coerceIn(120f, 420f)).dp)
                else Modifier.fillMaxWidth().heightIn(min = 60.dp, max = h.coerceAtLeast(90f).coerceAtMost(640f).dp).height(h.coerceIn(60f, 640f).dp)
                BlockFrame(b, raw, ctx, b.id == selectedId, editMode, mod) { onSelect(b.id) }
            }
            if (visible.isEmpty()) Text(if (editMode) "Пустая страница — нажмите «+»" else "Пустая страница", color = Brand.TextMuted)
        }
    }
}

// ───────────── Панель действий выделенного блока (как ПКМ на компьютере) ─────────────
@Composable
private fun BlockActionBar(b: PageBlock, modifier: Modifier, onEdit: () -> Unit, onImage: () -> Unit, onPdf: () -> Unit, onDuplicate: () -> Unit, onDialog: (String) -> Unit) {
    val actions = buildList {
        when (b.type) {
            "image" -> add("🖼 Картинка" to onImage)
            "pdf" -> { add("📕 Загрузить PDF" to onPdf); add("✏️ Название" to onEdit) }
            "kana", "calendar", "pageNav", "divider", "tabs" -> {}
            else -> add("✏️ Изменить" to onEdit)
        }
        add("🎨 Вид" to { onDialog("appearance") })
        if (b.type != "tabs") add("🗂 Во вкладку" to { onDialog("tabs") })
        add("🔗 Связи" to { onDialog("link") })
        add("⧉ Копия" to onDuplicate)
        add("🗑 Удалить" to { onDialog("delete") })
    }
    Row(
        modifier.fillMaxWidth().background(Brand.Night).navigationBarsPadding().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        actions.forEach { (label, action) ->
            Text(label, fontSize = 13.sp, color = if (label.startsWith("🗑")) Brand.Rose else Brand.Text,
                modifier = Modifier.clip(CircleShape).background(Brand.Ink.copy(alpha = 0.07f)).clickable(onClick = action).padding(horizontal = 12.dp, vertical = 8.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AddBlockSheet(onAdd: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
        Text("Добавить блок", fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(bottom = 12.dp))
        BLOCK_PRESETS.chunked(3).forEach { row ->
            Row(Modifier.padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { p ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Brand.Ink.copy(alpha = 0.05f)).clickable { onAdd(p.type) }.padding(vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(p.emoji, fontSize = 24.sp)
                        Spacer(Modifier.height(4.dp))
                        Text(p.label, fontSize = 12.sp)
                    }
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

// ───────────── Диалоги ─────────────

/** Правка содержимого: текст, заголовок, задача, таймер, название PDF. */
@Composable
private fun EditBlockDialog(raw: JsonObject, state: PageEditorState, onDone: () -> Unit) {
    val id = raw.str("id").orEmpty()
    val type = raw.str("type") ?: "text"
    if (type == "timer") {
        val timer = raw.obj("meta").obj("countdownTimer")
        var title by remember { mutableStateOf(timer.str("title").orEmpty()) }
        val target = timer.str("target").orEmpty()
        var date by remember { mutableStateOf(target.take(10)) }
        var time by remember { mutableStateOf(target.drop(11).take(5).ifBlank { "00:00" }) }
        AlertDialog(
            onDismissRequest = onDone, containerColor = Brand.Night,
            title = { Text("Таймер") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true)
                    OutlinedTextField(date, { date = it.take(10) }, label = { Text("Дата ГГГГ-ММ-ДД") }, singleLine = true,
                        isError = date.isNotBlank() && runCatching { java.time.LocalDate.parse(date) }.isFailure)
                    OutlinedTextField(time, { time = it.take(5) }, label = { Text("Время ЧЧ:ММ") }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton({
                    val t = if (date.isBlank()) "" else "${date}T${time.ifBlank { "00:00" }}"
                    state.update(id) { it.withMeta("countdownTimer", buildJsonObject { put("title", title); put("target", t) }) }
                    onDone()
                }) { Text("Сохранить", color = Brand.Mint) }
            },
            dismissButton = { TextButton(onDone) { Text("Отмена") } },
        )
        return
    }
    val initial = raw.str("text")?.takeIf { it.isNotBlank() }
        ?: raw.obj("meta").str("html")?.let { androidx.core.text.HtmlCompat.fromHtml(it, androidx.core.text.HtmlCompat.FROM_HTML_MODE_COMPACT).toString().trim() }.orEmpty()
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDone, containerColor = Brand.Night,
        title = { Text(when (type) { "heading" -> "Заголовок"; "todo" -> "Задача"; "pdf" -> "Название PDF"; else -> "Текст" }) },
        text = {
            OutlinedTextField(
                text, { text = it }, minLines = if (type == "text") 6 else 1, maxLines = if (type == "text") 14 else 3,
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton({
                // Текст правится в поле text, старое HTML-оформление убираем, чтобы показывался новый текст
                state.update(id) { r -> r.with("text", JsonPrimitive(text)).withMeta("html", null) }
                onDone()
            }) { Text("Сохранить", color = Brand.Mint) }
        },
        dismissButton = { TextButton(onDone) { Text("Отмена") } },
    )
}

/** Вид блока: своё название, рамка, заголовок, фиксация. */
@Composable
private fun AppearanceDialog(raw: JsonObject, state: PageEditorState, onDone: () -> Unit) {
    val id = raw.str("id").orEmpty()
    val d = raw.obj("meta").obj("display")
    fun flag(k: String) = (d[k] as? JsonPrimitive)?.contentOrNull == "true"
    var title by remember { mutableStateOf(d.str("customTitle").orEmpty()) }
    var hideChrome by remember { mutableStateOf(flag("hideChrome")) }
    var hideHeader by remember { mutableStateOf(flag("hideHeader")) }
    var locked by remember { mutableStateOf(flag("locked")) }
    AlertDialog(
        onDismissRequest = onDone, containerColor = Brand.Night,
        title = { Text("Вид блока") },
        text = {
            Column {
                OutlinedTextField(title, { title = it }, label = { Text("Своё название блока") }, singleLine = true)
                Toggle("Без рамки и фона", hideChrome) { hideChrome = it }
                Toggle("Без заголовка", hideHeader) { hideHeader = it }
                Toggle("Зафиксировать (не двигать)", locked) { locked = it }
            }
        },
        confirmButton = {
            TextButton({
                state.update(id) { r -> r.withDisplay { it.with("customTitle", JsonPrimitive(title)).with("hideChrome", JsonPrimitive(hideChrome)).with("hideHeader", JsonPrimitive(hideHeader)).with("locked", JsonPrimitive(locked)) } }
                onDone()
            }) { Text("Готово", color = Brand.Mint) }
        },
        dismissButton = { TextButton(onDone) { Text("Отмена") } },
    )
}

@Composable
private fun Toggle(label: String, value: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, fontSize = 14.sp, modifier = Modifier.weight(1f))
        Switch(value, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint))
    }
}

/** Добавить блок в активную вкладку одного из блоков «Вкладки» или убрать из вкладок. */
@Composable
private fun TabsAssignDialog(raw: JsonObject, state: PageEditorState, onDone: () -> Unit) {
    val id = raw.str("id").orEmpty()
    val tabsBlocks = state.blocks.map { state.parsed(it) }.filter { it.type == "tabs" }
    AlertDialog(
        onDismissRequest = onDone, containerColor = Brand.Night,
        title = { Text("Во вкладку") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (tabsBlocks.isEmpty()) Text("На странице нет блока «Вкладки» — добавьте его через «+».", color = Brand.TextMuted)
                tabsBlocks.forEach { t ->
                    val title = t.meta?.display?.customTitle?.ifBlank { null } ?: t.text?.ifBlank { null } ?: "Вкладки"
                    t.meta?.tabs.orEmpty().forEach { tab ->
                        Text("$title / ${tab.title}", fontSize = 14.sp,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.05f)).clickable {
                                state.update(id) { it.withMeta("tabGroupId", JsonPrimitive(t.id)).withMeta("tabId", JsonPrimitive(tab.id)) }
                                onDone()
                            }.padding(12.dp))
                    }
                }
            }
        },
        confirmButton = { TextButton({ state.update(id) { it.withMeta("tabGroupId", null).withMeta("tabId", null) }; onDone() }) { Text("Убрать из вкладок", color = Brand.TextMuted) } },
        dismissButton = { TextButton(onDone) { Text("Закрыть") } },
    )
}

/** Связи блока с другими блоками — линии на холсте. */
@Composable
private fun LinkDialog(raw: JsonObject, state: PageEditorState, onDone: () -> Unit) {
    val id = raw.str("id").orEmpty()
    val links = (raw.obj("meta")["links"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.orEmpty()
    val others = state.blocks.map { state.parsed(it) }.filter { it.id != id }
    AlertDialog(
        onDismissRequest = onDone, containerColor = Brand.Night,
        title = { Text("Связи блока") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                others.forEach { o ->
                    val on = o.id in links
                    val label = o.meta?.display?.customTitle?.ifBlank { null } ?: o.text?.ifBlank { null }?.take(40) ?: presetOf(o.type).label
                    Text((if (on) "🔗 " else "○ ") + label, fontSize = 14.sp, color = if (on) Brand.Mint else Brand.Text,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.05f)).clickable {
                            val next = if (on) links - o.id else links + o.id
                            state.update(id) { r -> r.withMeta("links", JsonArray(next.map { JsonPrimitive(it) })).with("relation", next.firstOrNull()?.let { JsonPrimitive(it) } ?: JsonNull) }
                        }.padding(12.dp))
                }
            }
        },
        confirmButton = { TextButton(onDone) { Text("Готово", color = Brand.Mint) } },
    )
}

/** Настройки страницы: название, дата, закрепление, шапка и фон. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PageSettingsSheet(state: PageEditorState, onPickBackground: () -> Unit) {
    val bg = state.background ?: PageBackground()
    fun setBg(next: PageBackground) { state.background = next; state.touchPage() }
    Column(
        Modifier.fillMaxWidth().navigationBarsPadding().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text("Настройки страницы", fontWeight = FontWeight.Bold, fontSize = 17.sp)
        OutlinedTextField(state.title, { state.title = it; state.touchPage() }, label = { Text("Название") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(state.pageDate.orEmpty(), { state.pageDate = it.take(10); state.touchPage() }, label = { Text("Дата ГГГГ-ММ-ДД") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Toggle("📌 Закрепить страницу", state.pinned) { state.pinned = it; state.touchPage() }

        Text("ШАПКА", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
        OutlinedTextField(state.bannerUrl.orEmpty(), { state.bannerUrl = it; state.touchPage() }, label = { Text("Ссылка на картинку шапки") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(state.bannerGradient.orEmpty(), { state.bannerGradient = it; state.touchPage() }, label = { Text("CSS-градиент шапки") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        Text("ФОН СТРАНИЦЫ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 6.dp))
        Box(Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Brand.Ink.copy(alpha = 0.1f), RoundedCornerShape(16.dp)).clickable(onClick = onPickBackground)) {
            PageBackgroundLayer(state.background, Modifier.matchParentSize())
            Text("🖼 Выбрать картинку", color = Color.White, fontSize = 13.sp, modifier = Modifier.align(Alignment.Center)
                .clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).padding(horizontal = 12.dp, vertical = 6.dp))
        }
        Text("Цвет", color = Brand.TextMuted, fontSize = 12.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("#10202c", "#0b1120", "#1e1b4b", "#3b0764", "#4a044e", "#0c4a6e", "#064e3b", "#422006", "#1c1917", "#f5f0e6").forEach { c ->
                Box(Modifier.size(32.dp).clip(CircleShape).background(cssColor(c)).border(2.dp, if (bg.color.equals(c, true)) Color.White else Color.Transparent, CircleShape)
                    .clickable { setBg(bg.copy(color = c)) })
            }
        }
        Text("Градиент (если нет картинки)", color = Brand.TextMuted, fontSize = 12.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(
                "linear-gradient(135deg, #0f172a, #1e3a8a)", "linear-gradient(135deg, #312e81, #be185d)", "linear-gradient(135deg, #064e3b, #0e7490)",
                "linear-gradient(135deg, #7c2d12, #be123c)", "linear-gradient(135deg, #1f2937, #4b5563)",
            ).forEach { g ->
                Box(Modifier.size(44.dp, 32.dp).clip(RoundedCornerShape(10.dp)).background(Brush.linearGradient(cssGradientColors(g)))
                    .border(2.dp, if (bg.gradient == g) Color.White else Color.Transparent, RoundedCornerShape(10.dp)).clickable { setBg(bg.copy(gradient = g, url = null)) })
            }
        }
        if (!bg.url.isNullOrBlank()) {
            Text("Затемнение картинки: ${(bg.dim * 100).toInt()}%", color = Brand.TextMuted, fontSize = 12.sp)
            Slider(bg.dim.toFloat(), { setBg(bg.copy(dim = it.toDouble())) }, valueRange = 0f..0.9f,
                colors = SliderDefaults.colors(thumbColor = Brand.Mint, activeTrackColor = Brand.Mint))
        }
        TextButton(onClick = { setBg(PageBackground()) }) { Text("Сбросить фон", color = Brand.TextMuted) }
        Text("Изменения сохраняются автоматически.", color = Brand.TextFaint, fontSize = 11.sp)
    }
}
