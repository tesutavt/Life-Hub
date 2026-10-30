package com.lifehub.app.ui.screens.pages

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.fromHtml
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.PageBlock
import com.lifehub.app.data.PageSummary
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.PageTagRef
import com.lifehub.app.ui.screens.TagBadge
import com.lifehub.app.ui.screens.learn.KANA_BASE_URL
import com.lifehub.app.ui.screens.learn.KANA_GROUPS
import com.lifehub.app.ui.screens.learn.KANA_REPLACEMENTS
import com.lifehub.app.ui.screens.learn.KANA_SETS
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import java.io.File
import java.net.URL
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId

/** Всё, что нужно блокам: состояние страницы, справочники и действия экрана. */
class BlockContext(
    val state: PageEditorState,
    val editMode: Boolean,
    val pages: List<PageSummary>,
    val tags: List<PageTag>,
    val events: List<CalendarEvent>,
    val nav: NavController,
    val pickImage: (String) -> Unit,
    val editBlock: (String) -> Unit,
)

fun blockHtml(b: PageBlock): AnnotatedString {
    // Текст редактируется в поле text; meta.html — оформление из старой версии редактора
    val raw = b.text?.takeIf { it.isNotBlank() } ?: b.meta?.html.orEmpty()
    val isHtml = b.text.isNullOrBlank() && !b.meta?.html.isNullOrBlank()
    return if (isHtml) runCatching { AnnotatedString.fromHtml(raw) }.getOrDefault(AnnotatedString(raw)) else AnnotatedString(raw)
}

@Composable
fun BlockContent(raw: JsonObject, b: PageBlock, ctx: BlockContext) {
    val id = b.id
    when (b.type) {
        "heading" -> Text(
            blockHtml(b).ifEmpty { AnnotatedString("Заголовок") }, color = Brand.Text, fontSize = 28.sp, fontWeight = FontWeight.SemiBold, lineHeight = 32.sp,
            modifier = Modifier.fillMaxSize().clickable(enabled = ctx.editMode) { ctx.editBlock(id) }.padding(16.dp),
        )
        "text" -> Text(
            blockHtml(b).ifEmpty { AnnotatedString(if (ctx.editMode) "Нажмите, чтобы написать текст" else "") },
            color = if (b.text.isNullOrBlank() && b.meta?.html.isNullOrBlank()) Brand.Ink.copy(alpha = 0.35f) else Brand.Ink.copy(alpha = 0.92f),
            fontSize = 15.sp, lineHeight = 22.sp,
            modifier = Modifier.fillMaxSize().clickable(enabled = ctx.editMode) { ctx.editBlock(id) }.padding(16.dp).verticalScroll(rememberScrollState()),
        )
        "todo" -> Row(Modifier.fillMaxSize().padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.Top) {
            // Галочка работает всегда, как на компьютере
            Checkbox(b.checked, { v -> ctx.state.update(id) { it.with("checked", JsonPrimitive(v)) } },
                colors = CheckboxDefaults.colors(checkedColor = Brand.Mint, uncheckedColor = Brand.Ink.copy(alpha = 0.4f), checkmarkColor = Brand.Deep))
            Text(
                blockHtml(b).ifEmpty { AnnotatedString("Описание задачи") },
                color = if (b.checked) Brand.Ink.copy(alpha = 0.5f) else Brand.Text, fontSize = 15.sp,
                textDecoration = if (b.checked) TextDecoration.LineThrough else null,
                modifier = Modifier.weight(1f).padding(top = 12.dp).clickable(enabled = ctx.editMode) { ctx.editBlock(id) },
            )
        }
        "image" -> ImageBlock(b, ctx)
        "pdf" -> PdfBlock(b, ctx)
        "kana" -> KanaBlock(raw, ctx)
        "timer" -> TimerBlock(b, ctx)
        "divider" -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp).height(1.dp).background(Brand.Ink.copy(alpha = 0.3f)))
        }
        "calendar" -> CalendarBlock(b, ctx)
        "pageNav" -> PageNavBlock(b, ctx)
        "tabs" -> TabsBlock(b, ctx)
        else -> Text(blockHtml(b), color = Brand.Text, modifier = Modifier.padding(16.dp))
    }
}

// ───────────── Картинка: просто изображение на весь блок, нажатие — выбор файла ─────────────
@Composable
private fun ImageBlock(b: PageBlock, ctx: BlockContext) {
    val url = Api.fileUrl(b.url?.ifBlank { null })
    Box(
        Modifier.fillMaxSize().clickable(enabled = ctx.editMode || url == null) { ctx.pickImage(b.id) },
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Column(
            Modifier.fillMaxSize().border(2.dp, Brand.Ink.copy(alpha = 0.15f), RoundedCornerShape(24.dp)),
            verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("🖼️", fontSize = 34.sp)
            Text("Нажмите, чтобы выбрать картинку", color = Brand.Ink.copy(alpha = 0.45f), fontSize = 13.sp, textAlign = TextAlign.Center)
        }
    }
}

// ───────────── PDF прямо в блоке: страницы, листание, закладки ─────────────
@Composable
private fun PdfBlock(b: PageBlock, ctx: BlockContext) {
    val context = LocalContext.current
    val url = Api.fileUrl(b.url?.ifBlank { null })
    var file by remember(url) { mutableStateOf<File?>(null) }
    var error by remember(url) { mutableStateOf<String?>(null) }
    var pageIndex by remember(b.id) { mutableIntStateOf(0) }
    var pageCount by remember(url) { mutableIntStateOf(0) }
    var bitmap by remember(url) { mutableStateOf<Bitmap?>(null) }
    var addingMarker by remember { mutableStateOf(false) }

    if (url == null) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("📕", fontSize = 40.sp)
            Text(if (ctx.editMode) "Меню блока → «Загрузить PDF»" else "PDF не выбран", color = Brand.Ink.copy(alpha = 0.5f), fontSize = 13.sp)
        }
        return
    }
    LaunchedEffect(url) {
        file = withContext(Dispatchers.IO) {
            runCatching {
                val cached = File(context.cacheDir, "pdf_" + url.hashCode().toString(16) + ".pdf")
                if (!cached.exists() || cached.length() == 0L) URL(url).openStream().use { input -> cached.outputStream().use { input.copyTo(it) } }
                cached
            }.onFailure { error = it.message }.getOrNull()
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val widthPx = with(LocalDensity.current) { maxWidth.toPx() }.toInt().coerceIn(200, 1600)
        LaunchedEffect(file, pageIndex, widthPx) {
            val f = file ?: return@LaunchedEffect
            bitmap = withContext(Dispatchers.IO) {
                runCatching {
                    ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                        PdfRenderer(fd).use { renderer ->
                            pageCount = renderer.pageCount
                            val idx = pageIndex.coerceIn(0, renderer.pageCount - 1)
                            renderer.openPage(idx).use { page ->
                                val h = (widthPx.toFloat() * page.height / page.width).toInt()
                                Bitmap.createBitmap(widthPx, h, Bitmap.Config.ARGB_8888).also {
                                    it.eraseColor(android.graphics.Color.WHITE)
                                    page.render(it, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                }
                            }
                        }
                    }
                }.onFailure { error = it.message }.getOrNull()
            }
        }
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                PdfButton("◀", pageIndex > 0) { pageIndex-- }
                Text(if (pageCount > 0) "${pageIndex + 1} / $pageCount" else "…", color = Brand.Ink.copy(alpha = 0.7f), fontSize = 13.sp,
                    modifier = Modifier.padding(horizontal = 8.dp))
                PdfButton("▶", pageIndex < pageCount - 1) { pageIndex++ }
                Spacer(Modifier.weight(1f))
                PdfButton("🔖 +", true) { addingMarker = true }
            }
            if (b.meta?.markers.orEmpty().isNotEmpty()) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    b.meta?.markers.orEmpty().forEach { m -> MarkerChip(b, m, ctx) { pageIndex = (m.page - 1).coerceAtLeast(0) } }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()), contentAlignment = Alignment.TopCenter) {
                when {
                    bitmap != null -> Image(bitmap!!.asImageBitmap(), null, modifier = Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth)
                    error != null -> Text("Не удалось открыть PDF: $error", color = Brand.Rose, fontSize = 12.sp, modifier = Modifier.padding(12.dp))
                    else -> Text("Загрузка PDF…", color = Brand.Ink.copy(alpha = 0.5f), modifier = Modifier.padding(16.dp))
                }
            }
        }
    }
    if (addingMarker) {
        var title by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { addingMarker = false }, containerColor = Brand.Night,
            title = { Text("Закладка на стр. ${pageIndex + 1}") },
            text = { OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = {
                    addingMarker = false
                    ctx.state.update(b.id) { raw ->
                        val list = (raw.obj("meta")["markers"] as? JsonArray).orEmpty()
                        raw.withMeta("markers", JsonArray(list + buildJsonObject {
                            put("id", newId()); put("title", title.ifBlank { "Стр. ${pageIndex + 1}" }); put("page", pageIndex + 1); put("done", false)
                        }))
                    }
                }) { Text("Добавить", color = Brand.Mint) }
            },
            dismissButton = { TextButton({ addingMarker = false }) { Text("Отмена") } },
        )
    }
}

@Composable
private fun PdfButton(label: String, enabled: Boolean, onClick: () -> Unit) {
    Text(label, color = if (enabled) Brand.Text else Brand.Ink.copy(alpha = 0.25f), fontSize = 13.sp,
        modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = 0.06f)).clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp))
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MarkerChip(b: PageBlock, m: com.lifehub.app.data.PdfMarker, ctx: BlockContext, onOpen: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Text(
        (if (m.done) "✓ " else "🔖 ") + "${m.title} · ${m.page}", fontSize = 12.sp,
        color = if (m.done) Brand.Ink.copy(alpha = 0.45f) else Brand.Text,
        modifier = Modifier.clip(CircleShape).background(Brand.Amber.copy(alpha = 0.15f)).combinedClickable(onClick = onOpen, onLongClick = { menu = true })
            .padding(horizontal = 10.dp, vertical = 5.dp),
    )
    if (menu) {
        fun edit(transform: (JsonObject) -> JsonObject?) {
            menu = false
            ctx.state.update(b.id) { raw ->
                val list = (raw.obj("meta")["markers"] as? JsonArray).orEmpty().mapNotNull { el ->
                    val o = el as? JsonObject ?: return@mapNotNull el
                    if (o.str("id") == m.id) transform(o) else o
                }
                raw.withMeta("markers", JsonArray(list))
            }
        }
        AlertDialog(
            onDismissRequest = { menu = false }, containerColor = Brand.Night,
            title = { Text(m.title) },
            text = { Text("Страница ${m.page}", color = Brand.TextMuted) },
            confirmButton = { TextButton({ edit { it.with("done", JsonPrimitive(!m.done)) } }) { Text(if (m.done) "Не прочитано" else "Прочитано ✓", color = Brand.Mint) } },
            dismissButton = { TextButton({ edit { null } }) { Text("Удалить", color = Brand.Rose) } },
        )
    }
}

// ───────────── Кана-тренажёр прямо на странице (состояние — в meta.kanaTrainer, как в веб) ─────────────
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun KanaBlock(raw: JsonObject, ctx: BlockContext) {
    val id = raw.str("id").orEmpty()
    val trainer = raw.obj("meta")["kanaTrainer"] as? JsonObject ?: JsonObject(emptyMap())
    val sets = (trainer["enabledSetIds"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.filter { it in KANA_SETS }.orEmpty().ifEmpty { listOf("hsingle") }
    val mistakes = (trainer["mistakes"] as? JsonObject)?.mapValues { (_, v) -> (v as? JsonPrimitive)?.intOrNull ?: 0 }.orEmpty()
    val total = (trainer["totalAnswered"] as? JsonPrimitive)?.intOrNull ?: 0
    val correct = (trainer["totalCorrect"] as? JsonPrimitive)?.intOrNull ?: 0
    val pool = sets.flatMap { KANA_SETS.getValue(it).entries }
    fun pick(exclude: String?): Pair<String, String> {
        val weighted = pool + pool.filter { (mistakes[it.first] ?: 0) > 0 } + pool.filter { (mistakes[it.first] ?: 0) > 2 }
        return weighted.filter { it.first != exclude }.ifEmpty { weighted }.random()
    }
    val currentKana = trainer.str("currentKana")
    val current = pool.firstOrNull { it.first == currentKana } ?: remember(sets) { pick(null) }
    var input by remember(current.first) { mutableStateOf("") }
    var wrong by remember(current.first) { mutableStateOf(false) }
    var peek by remember(current.first) { mutableStateOf(false) }
    var chooseSets by remember { mutableStateOf(false) }

    fun save(next: JsonObject) = ctx.state.update(id) { it.withMeta("kanaTrainer", next) }
    fun withMistake(kana: String, delta: Int): JsonObject {
        val m = mistakes.toMutableMap()
        val v = (m[kana] ?: 0) + delta
        if (v <= 0) m.remove(kana) else m[kana] = v
        return JsonObject(m.mapValues { JsonPrimitive(it.value) })
    }
    fun answered(firstTry: Boolean) {
        val next = pick(current.first)
        save(trainer.with("totalAnswered", JsonPrimitive(total + 1))
            .with("totalCorrect", JsonPrimitive(correct + if (firstTry) 1 else 0))
            .with("mistakes", if (firstTry) withMistake(current.first, -1) else JsonObject(mistakes.mapValues { JsonPrimitive(it.value) }))
            .with("enabledSetIds", JsonArray(sets.map { JsonPrimitive(it) }))
            .with("currentKana", JsonPrimitive(next.first)).with("currentReading", JsonPrimitive(next.second)))
    }

    Column(Modifier.fillMaxSize().padding(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("$correct / $total верно", color = Brand.Ink.copy(alpha = 0.6f), fontSize = 12.sp, modifier = Modifier.weight(1f))
            Text("⚙ наборы", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clip(CircleShape).clickable { chooseSets = true }.padding(6.dp))
        }
        Spacer(Modifier.weight(1f))
        Text(current.first, fontSize = 72.sp, color = if (wrong) Brand.Rose else Brand.Text, fontWeight = FontWeight.Medium)
        if (wrong || peek) Text(current.second, color = Brand.Amber, fontSize = 18.sp)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            input,
            { v ->
                input = v
                val answer = v.trim().lowercase()
                val options = listOf(current.second) + (KANA_REPLACEMENTS[current.second] ?: emptyList())
                when {
                    answer in options -> answered(!wrong && !peek)
                    answer.isNotEmpty() && options.none { it.startsWith(answer) } && !wrong -> {
                        wrong = true
                        save(trainer.with("mistakes", withMistake(current.first, 1)))
                    }
                }
            },
            placeholder = { Text("ромадзи") }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
            modifier = Modifier.width(180.dp),
        )
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PdfButton("🔊", true) {
                runCatching {
                    MediaPlayer().apply {
                        setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
                        setDataSource("$KANA_BASE_URL/audio/${current.second}.mp3")
                        setOnPreparedListener { it.start() }; setOnCompletionListener { it.release() }
                        setOnErrorListener { mp, _, _ -> mp.release(); true }
                        prepareAsync()
                    }
                }
            }
            PdfButton("👁 подсказка", true) { peek = true }
            PdfButton("⏭ дальше", true) { answered(false) }
        }
    }
    if (chooseSets) {
        val chosen = remember { androidx.compose.runtime.mutableStateListOf<String>().apply { addAll(sets) } }
        AlertDialog(
            onDismissRequest = { chooseSets = false }, containerColor = Brand.Night,
            title = { Text("Наборы каны") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    KANA_GROUPS.forEach { g ->
                        Text(g.title, color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp, bottom = 4.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            g.sets.forEach { s ->
                                val on = s.id in chosen
                                Text(s.entries.first().first + " " + s.label, fontSize = 13.sp, color = if (on) Brand.Deep else Color.White,
                                    modifier = Modifier.clip(CircleShape).background(if (on) Brand.Mint else Brand.Ink.copy(alpha = 0.06f))
                                        .clickable { if (on) chosen.remove(s.id) else chosen.add(s.id) }.padding(horizontal = 10.dp, vertical = 6.dp))
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = chosen.isNotEmpty(), onClick = {
                    chooseSets = false
                    save(trainer.with("enabledSetIds", JsonArray(chosen.map { JsonPrimitive(it) })).with("currentKana", JsonPrimitive("")))
                }) { Text("Готово", color = Brand.Mint) }
            },
        )
    }
}

// ───────────── Таймер обратного отсчёта ─────────────
@Composable
private fun TimerBlock(b: PageBlock, ctx: BlockContext) {
    val timer = b.meta?.countdownTimer
    val target = timer?.target?.ifBlank { null }?.let { t ->
        runCatching { OffsetDateTime.parse(t).toInstant() }.getOrNull()
            ?: runCatching { LocalDateTime.parse(t).atZone(ZoneId.systemDefault()).toInstant() }.getOrNull()
            ?: runCatching { LocalDate.parse(t).atStartOfDay(ZoneId.systemDefault()).toInstant() }.getOrNull()
    }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(b.id) { while (true) { delay(1000); now = System.currentTimeMillis() } }
    Column(
        Modifier.fillMaxSize().clickable(enabled = ctx.editMode) { ctx.editBlock(b.id) }.padding(16.dp),
        verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(timer?.title?.ifBlank { null } ?: "Таймер", color = Brand.Ink.copy(alpha = 0.7f), fontSize = 15.sp)
        Spacer(Modifier.height(6.dp))
        if (target == null) Text(if (ctx.editMode) "Нажмите, чтобы выбрать дату" else "Дата не выбрана", color = Brand.Ink.copy(alpha = 0.4f))
        else {
            val left = Duration.ofMillis((target.toEpochMilli() - now).coerceAtLeast(0))
            Text(
                if (left.isZero) "Время пришло 🎉" else "%d д %02d:%02d:%02d".format(left.toDays(), left.toHours() % 24, left.toMinutes() % 60, left.seconds % 60),
                color = Brand.Text, fontSize = 28.sp, fontWeight = FontWeight.Bold,
            )
        }
    }
}

// ───────────── Календарь текущего месяца с фильтром по тегам ─────────────
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CalendarBlock(b: PageBlock, ctx: BlockContext) {
    val selected = b.meta?.selectedTagIds.orEmpty()
    val events = ctx.events.filter { e -> selected.isEmpty() || e.tags.any { it.id in selected } }
    val today = LocalDate.now()
    val first = today.withDayOfMonth(1)
    val offset = first.dayOfWeek.value - 1
    Column(Modifier.fillMaxSize().padding(12.dp).verticalScroll(rememberScrollState())) {
        TagFilter(b, ctx)
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEach {
                Text(it, color = Brand.Ink.copy(alpha = 0.35f), fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.weight(1f))
            }
        }
        (0 until 6).forEach { week ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                (0 until 7).forEach { d ->
                    val day = week * 7 + d - offset + 1
                    Box(Modifier.weight(1f).aspectRatio(0.9f).padding(vertical = 2.dp)) {
                        if (day in 1..first.lengthOfMonth()) {
                            val date = first.withDayOfMonth(day).toString()
                            val dayEvents = events.filter { it.date.take(10) == date }
                            Column(
                                Modifier.fillMaxSize().clip(RoundedCornerShape(12.dp))
                                    .background(if (date == today.toString()) Brand.Mint.copy(alpha = 0.15f) else Brand.Ink.copy(alpha = 0.03f))
                                    .border(1.dp, Brand.Ink.copy(alpha = 0.08f), RoundedCornerShape(12.dp))
                                    .clickable { ctx.nav.navigate("calendar") }.padding(4.dp),
                            ) {
                                Text("$day", color = Brand.Ink.copy(alpha = 0.8f), fontSize = 11.sp)
                                dayEvents.take(2).forEach {
                                    Text(it.title, color = Brand.Ink.copy(alpha = 0.7f), fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(4.dp)).background(Brand.Ink.copy(alpha = 0.1f)).padding(horizontal = 2.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Фильтр по тегам у календаря и навигации — нажатие включает/выключает тег, как в веб. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagFilter(b: PageBlock, ctx: BlockContext) {
    val selected = b.meta?.selectedTagIds.orEmpty()
    if (ctx.tags.isEmpty()) return
    FlowRow(Modifier.padding(bottom = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        ctx.tags.forEach { t ->
            val on = t.id in selected
            TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clickable {
                val next = if (on) selected - t.id else selected + t.id
                ctx.state.update(b.id) { it.withMeta("selectedTagIds", buildJsonArray { next.forEach { add(it) } }) }
            }, selected = on)
        }
    }
}

// ───────────── Навигация по страницам ─────────────
@Composable
private fun PageNavBlock(b: PageBlock, ctx: BlockContext) {
    val tagIds = b.meta?.selectedTagIds.orEmpty()
    val list = ctx.pages.filter { p -> p.id != ctx.state.pageId && (tagIds.isEmpty() || p.tags.any { it.id in tagIds }) }
    Column(Modifier.fillMaxSize().padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (ctx.editMode) TagFilter(b, ctx) else if (tagIds.isEmpty()) Text("Показаны все страницы", color = Brand.Ink.copy(alpha = 0.45f), fontSize = 12.sp)
        list.forEach { p ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(Brand.Ink.copy(alpha = 0.03f))
                    .border(1.dp, Brand.Ink.copy(alpha = 0.1f), RoundedCornerShape(16.dp))
                    .clickable { ctx.nav.navigate("page/${p.id}") }.padding(12.dp),
            ) {
                Text(p.title?.ifBlank { null } ?: "Без названия", color = Brand.Ink.copy(alpha = 0.85f), fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (p.pinned) Text("📌", fontSize = 13.sp)
            }
        }
        if (list.isEmpty()) Text("Нет страниц по выбранным тегам", color = Brand.TextMuted, fontSize = 13.sp)
    }
}

// ───────────── Вкладки: переключатель групп блоков ─────────────
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
private fun TabsBlock(b: PageBlock, ctx: BlockContext) {
    val tabs = b.meta?.tabs.orEmpty()
    val active = b.meta?.activeTabId?.takeIf { a -> tabs.any { it.id == a } } ?: tabs.firstOrNull()?.id
    var renaming by remember { mutableStateOf<com.lifehub.app.data.PageTab?>(null) }
    fun setTabs(list: List<com.lifehub.app.data.PageTab>, activeId: String?) = ctx.state.update(b.id) { raw ->
        raw.withMeta("tabs", JsonArray(list.map { t -> buildJsonObject { put("id", t.id); put("title", t.title) } }))
            .withMeta("activeTabId", activeId?.let { JsonPrimitive(it) })
    }
    FlowRow(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        tabs.forEach { tab ->
            val on = tab.id == active
            Text(
                tab.title.ifBlank { "Вкладка" }, fontSize = 14.sp,
                color = if (on) Brand.Deep else Brand.Ink.copy(alpha = 0.75f),
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (on) Brand.Ink else Brand.Ink.copy(alpha = 0.03f))
                    .border(1.dp, if (on) Brand.Ink else Brand.Ink.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                    .combinedClickable(onClick = { setTabs(tabs, tab.id) }, onLongClick = { if (ctx.editMode) renaming = tab })
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (ctx.editMode) {
            Text("+ вкладка", fontSize = 14.sp, color = Brand.Mint,
                modifier = Modifier.clip(RoundedCornerShape(12.dp)).border(1.dp, Brand.Mint.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                    .clickable {
                        val t = com.lifehub.app.data.PageTab(newId(), "Вкладка ${tabs.size + 1}")
                        setTabs(tabs + t, t.id)
                    }.padding(horizontal = 12.dp, vertical = 8.dp))
        }
    }
    renaming?.let { tab ->
        var title by remember(tab.id) { mutableStateOf(tab.title) }
        AlertDialog(
            onDismissRequest = { renaming = null }, containerColor = Brand.Night,
            title = { Text("Вкладка") },
            text = { OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true) },
            confirmButton = {
                TextButton({ renaming = null; setTabs(tabs.map { if (it.id == tab.id) it.copy(title = title.ifBlank { "Вкладка" }) else it }, active) }) { Text("Сохранить", color = Brand.Mint) }
            },
            dismissButton = {
                TextButton(enabled = tabs.size > 1, onClick = {
                    renaming = null
                    val rest = tabs.filter { it.id != tab.id }
                    setTabs(rest, rest.firstOrNull()?.id)
                    // Блоки удалённой вкладки становятся обычными
                    ctx.state.blocks.toList().filter { it.obj("meta").str("tabId") == tab.id }.forEach { raw ->
                        ctx.state.update(raw.str("id").orEmpty()) { it.withMeta("tabGroupId", null).withMeta("tabId", null) }
                    }
                }) { Text("Удалить вкладку", color = Brand.Rose) }
            },
        )
    }
}
