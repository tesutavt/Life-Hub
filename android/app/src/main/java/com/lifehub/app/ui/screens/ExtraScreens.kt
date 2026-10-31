package com.lifehub.app.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Achievement
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageResponse
import com.lifehub.app.data.PageSummary
import com.lifehub.app.data.ProfileResponse
import com.lifehub.app.data.ReportData
import com.lifehub.app.data.ReportPeriodResponse
import com.lifehub.app.data.ReportSection
import com.lifehub.app.data.ShowcaseIds
import com.lifehub.app.data.TravelPlan
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.rarityColor
import com.lifehub.app.ui.theme.rarityLabel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Цвета Steam для страницы ачивок
// Раньше — фиксированные цвета Steam; теперь цвета выбранной темы (как на ПК с 1.2.1)
private val SteamBg get() = Brand.Deep
private val SteamPanel get() = Brand.Card
private val SteamText get() = Brand.Text
private val SteamMuted get() = Brand.TextMuted
private val SteamBlue get() = Brand.Mint
private val SteamBar get() = Brush.horizontalGradient(listOf(Brand.Mint, Brand.Mint.copy(alpha = 0.6f)))

private fun unlockedAt(iso: String?): String = runCatching {
    val t = OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.systemDefault())
    "Разблокировано " + t.format(DateTimeFormatter.ofPattern("d MMM yyyy г., HH:mm", Locale("ru")))
}.getOrDefault("Разблокировано")

/** Ачивки в стиле Steam: прогресс сверху, затем полученные и неполученные списком. */
@Composable
fun AchievementsScreen(onBack: () -> Unit) {
    val state = rememberLoadable { Api.get<Items<Achievement>>("/api/achievements").items }
    var filter by remember { mutableStateOf("all") }
    var query by remember { mutableStateOf("") }
    var global by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(SteamBg)) {
        BackTopBar("Достижения", onBack)
        LoadableContent(state) { items ->
            val earned = items.filter { it.earned }.sortedByDescending { it.earnedAt ?: "" }
            val matches = { a: Achievement -> query.isBlank() || "${a.title} ${a.description ?: ""}".contains(query.trim(), ignoreCase = true) }
            val hiddenLeft = items.count { !it.earned && it.hidden }
            val locked = items.filter { !it.earned && !it.hidden }.filter(matches).sortedByDescending { it.progress / it.threshold.coerceAtLeast(1.0) }
            val pct = if (items.isEmpty()) 0f else earned.size.toFloat() / items.size
            LazyColumn(contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(width = 86.dp, height = 116.dp).border(2.dp, Color.White.copy(alpha = 0.8f))
                                .background(Brush.linearGradient(listOf(Brand.Slate, SteamBg, SteamBlue))),
                            contentAlignment = Alignment.Center,
                        ) { Text("🏆", fontSize = 40.sp) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text("Достижения Life Hub", fontSize = 20.sp, fontWeight = FontWeight.SemiBold, color = Color.White)
                            Text("Достижения: ${earned.size} / ${items.size}  |  ${earned.sumOf { it.xpReward }} XP", fontSize = 12.sp, color = SteamText)
                            Column(Modifier.padding(top = 10.dp).fillMaxWidth().background(Color.Black.copy(alpha = 0.35f)).padding(10.dp)) {
                                Text("Разблокировано: ${earned.size}/${items.size} (${(pct * 100).toInt()} %)", fontSize = 13.sp, color = Color.White)
                                Box(Modifier.padding(top = 6.dp).fillMaxWidth().height(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.6f))) {
                                    Box(Modifier.fillMaxWidth(pct).height(8.dp).clip(CircleShape).background(SteamBar))
                                }
                            }
                        }
                    }
                }
                item {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Глобальная статистика", color = Color.White, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Switch(global, { global = it }, colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint))
                    }
                    OutlinedTextField(
                        query, { query = it }, singleLine = true, placeholder = { Text("Поиск…") },
                        leadingIcon = { Icon(Icons.Default.Search, null) }, colors = authFieldColors(), modifier = Modifier.fillMaxWidth(),
                    )
                    Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("all" to "Все достижения", "earned" to "Полученные", "locked" to "Неполученные").forEach { (id, label) ->
                            Chip(label, if (filter == id) SteamBlue else SteamMuted, Modifier.clickable { filter = id })
                        }
                    }
                }
                if (filter != "locked") {
                    item { SteamHeader("Разблокированные достижения (${earned.count(matches)})") }
                    items(earned.filter(matches), key = { "e${it.id}" }) { a -> SteamRow(a, global) { Text(unlockedAt(a.earnedAt), color = SteamMuted, fontSize = 11.sp) } }
                }
                if (filter != "earned") {
                    item { SteamHeader("Заблокированные достижения (${locked.size + hiddenLeft})") }
                    items(locked, key = { "l${it.id}" }) { a ->
                        SteamRow(a, global) {
                            if (a.threshold > 1) Column(Modifier.width(90.dp), horizontalAlignment = Alignment.End) {
                                Text("${a.progress.coerceAtMost(a.threshold).toInt()} / ${a.threshold.toInt()}", color = SteamMuted, fontSize = 11.sp)
                                val f = (a.progress / a.threshold).toFloat().coerceIn(0f, 1f)
                                Box(Modifier.padding(top = 3.dp).fillMaxWidth().height(5.dp).background(Color.Black.copy(alpha = 0.5f))) {
                                    Box(Modifier.fillMaxWidth(f).height(5.dp).background(SteamBar))
                                }
                            }
                        }
                    }
                    if (hiddenLeft > 0 && query.isBlank()) item {
                        Row(Modifier.fillMaxWidth().background(SteamPanel).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(52.dp).background(Color.Black.copy(alpha = 0.4f)), contentAlignment = Alignment.Center) { Text("❔", fontSize = 26.sp) }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text("Осталось скрытых достижений: $hiddenLeft", color = Color.White, fontWeight = FontWeight.SemiBold)
                                Text("Подробности появятся после получения", color = SteamMuted, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SteamHeader(text: String) {
    Text(text.uppercase(), color = SteamText, fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 8.dp))
}

@Composable
private fun SteamRow(a: Achievement, global: Boolean, right: @Composable () -> Unit) {
    val c = rarityColor(a.rarity)
    Row(Modifier.fillMaxWidth().background(SteamPanel).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier.size(52.dp).background(if (a.earned) c.copy(alpha = 0.2f) else Color.Black.copy(alpha = 0.4f))
                .border(1.dp, if (a.earned) c.copy(alpha = 0.7f) else Color.White.copy(alpha = 0.08f)).alpha(if (a.earned) 1f else 0.45f),
            contentAlignment = Alignment.Center,
        ) { Text(a.icon, fontSize = 26.sp) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(a.title, color = if (a.earned) Color.White else SteamText, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            a.description?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp) }
            if (global) Text("${"%.1f".format(a.globalPct)} % пользователей · ${rarityLabel(a.rarity)} · +${a.xpReward} XP", color = SteamMuted, fontSize = 11.sp)
        }
        Spacer(Modifier.width(6.dp))
        right()
    }
}

// ───────────── Отчёты ─────────────
private val SECTION_EMOJI = mapOf("fitness" to "💪", "languages" to "🗣️", "courses" to "🎓", "goals" to "🎯")

private val SECTION_COLORS = mapOf(
    "fitness" to Color(0xFF34D399), "languages" to Color(0xFFA78BFA), "courses" to Color(0xFF38BDF8), "goals" to Color(0xFFF472B6),
)

/** Динамика раздела по периодам — площадь с линией и подписями (как AreaChart в веб-версии). */
@Composable
private fun TrendChart(sec: ReportSection, color: Color) {
    val points = sec.timeline
    if (points.count { it.value > 0 } < 2) return
    val max = points.maxOf { it.value }.coerceAtLeast(1.0)
    Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxWidth().height(110.dp)) {
            val stepX = if (points.size > 1) size.width / (points.size - 1) else size.width
            val coords = points.mapIndexed { i, p -> androidx.compose.ui.geometry.Offset(i * stepX, size.height - (p.value / max).toFloat() * (size.height - 8f) - 4f) }
            for (g in 1..3) {
                val y = size.height * g / 4f
                drawLine(Brand.Ink.copy(alpha = 0.06f), androidx.compose.ui.geometry.Offset(0f, y), androidx.compose.ui.geometry.Offset(size.width, y), 1f)
            }
            val area = androidx.compose.ui.graphics.Path().apply {
                moveTo(coords.first().x, size.height)
                coords.forEach { lineTo(it.x, it.y) }
                lineTo(coords.last().x, size.height)
                close()
            }
            drawPath(area, Brush.verticalGradient(listOf(color.copy(alpha = 0.45f), color.copy(alpha = 0.02f))))
            val line = androidx.compose.ui.graphics.Path().apply {
                moveTo(coords.first().x, coords.first().y)
                coords.drop(1).forEach { lineTo(it.x, it.y) }
            }
            drawPath(line, color, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 5f))
            coords.forEach { drawCircle(color, 6f, it) }
        }
        Row(Modifier.fillMaxWidth()) {
            points.forEachIndexed { i, p ->
                Text(
                    p.label, color = Brand.TextFaint, fontSize = 9.sp, maxLines = 1,
                    textAlign = when (i) { 0 -> androidx.compose.ui.text.style.TextAlign.Start; points.lastIndex -> androidx.compose.ui.text.style.TextAlign.End; else -> androidx.compose.ui.text.style.TextAlign.Center },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Единицы с сервера склоняем по числу: «1 отметка», «2 отметки»; «п.п.» — понятнее. */
private fun unitLabel(unit: String?, n: Double): String = when (unit) {
    "отметок" -> com.lifehub.app.ui.components.plural(n.toInt(), "отметка", "отметки", "отметок")
    "курсов" -> com.lifehub.app.ui.components.plural(n.toInt(), "курс", "курса", "курсов")
    "п.п." -> "% прогресса"
    else -> unit.orEmpty()
}

private fun ReportSection?.active() = this != null && (summary.current > 0 || items.any { it.current > 0 })
private fun fmtNum(v: Double) = if (v % 1.0 == 0.0) v.toLong().toString() else "%.1f".format(v)

/** Отчёты: итоги прошлого дня/недели/месяца и история (пустых периодов нет). */
@Composable
fun ReportsScreen(onBack: () -> Unit) {
    val history = rememberLoadable { Api.get<Items<ReportData>>("/api/life/reports/history?limit=30&period=all").items }
    var period by remember { mutableStateOf<String?>(null) }
    var opened by remember { mutableStateOf<ReportData?>(null) }
    val fresh = rememberLoadable(period) { period?.let { Api.get<ReportPeriodResponse>("/api/life/reports/period?period=$it&force=1") } }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar(opened?.periodLabel ?: "Отчёты", { if (opened != null) opened = null else onBack() })
        val shown = opened
        if (shown != null) {
            ReportDetails(shown)
            return@Column
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Text("Итоги за период", color = Brand.TextMuted)
            Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("daily" to "Вчера", "weekly" to "Неделя", "monthly" to "Месяц").forEach { (id, label) ->
                    Chip(label, if (period == id) Brand.Mint else Brand.TextMuted, Modifier.clickable { period = id })
                }
            }
            if (period != null) {
                val res = fresh.data
                when {
                    fresh.loading -> Text("Собираем итоги…", color = Brand.TextMuted)
                    res?.report == null || res.empty -> Text("🌱 За этот период пока тихо — отчёт не создаётся.", color = Brand.TextMuted)
                    else -> LhCard(Modifier.fillMaxWidth(), onClick = { opened = res.report }) {
                        Text(res.report.periodLabel, fontWeight = FontWeight.Bold)
                        ReportChips(res.report)
                        Text("Открыть →", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            SectionTitle("История")
            LoadableContent(history) { list ->
                if (list.isEmpty()) EmptyState("🌱", "Пока нечего показать", "Отчёт появится, когда вы что-нибудь сделаете за период.")
                list.forEach { r ->
                    LhCard(Modifier.fillMaxWidth().padding(bottom = 8.dp), onClick = { opened = r }) {
                        Text(r.periodLabel, fontWeight = FontWeight.SemiBold)
                        ReportChips(r)
                    }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReportChips(r: ReportData) {
    FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        r.sections.entries.filter { it.value.active() }.forEach { (key, s) ->
            Chip("${SECTION_EMOJI[key] ?: "✨"} ${fmtNum(s!!.summary.current)} ${unitLabel(s.unit, s.summary.current)}", Brand.Sky)
        }
    }
}

@Composable
private fun ReportDetails(r: ReportData) {
    Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (r.highlights.isNotEmpty()) LhCard(Modifier.fillMaxWidth(), border = Brand.Amber.copy(alpha = 0.4f), background = Brand.Amber.copy(alpha = 0.06f)) {
            Text("ГЛАВНОЕ", color = Brand.Amber, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            r.highlights.forEach { Text("✨ $it", fontSize = 14.sp, modifier = Modifier.padding(top = 4.dp)) }
        }
        r.sections.entries.filter { it.value.active() }.forEach { (key, s) ->
            val sec = s!!
            LhCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(SECTION_EMOJI[key] ?: "✨", fontSize = 24.sp)
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text(sec.title, fontWeight = FontWeight.Bold)
                        Text(sec.subtitle, color = Brand.TextMuted, fontSize = 12.sp)
                    }
                    Text("${fmtNum(sec.summary.current)} ${sec.unit}", fontWeight = FontWeight.ExtraBold)
                }
                TrendChart(sec, SECTION_COLORS[key] ?: Brand.Mint)
                sec.items.filter { it.current > 0 }.forEach { item ->
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp).clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.2f)).padding(10.dp)) {
                        Column(Modifier.weight(1f)) {
                            Text(item.name, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (item.message.isNotBlank()) Text(item.message, color = Brand.TextMuted, fontSize = 11.sp, maxLines = 2)
                        }
                        Text("${fmtNum(item.current)} ${item.unit ?: sec.unit}", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

// ───────────── Страницы ─────────────
// ───────────── Оформление профиля ─────────────
private val SHOWCASES = listOf(
    "achievements" to "🏆 Витрина достижений", "languages" to "🗣️ Языки", "courses" to "🎓 Курсы", "goals" to "🎯 Цели года",
    "activity" to "🔥 Активность", "radar" to "🧭 Индекс жизни", "feed" to "📰 Лента событий",
)
private val PRESETS = listOf(
    "aurora" to "Северное сияние", "steam" to "Ночной Steam", "sunset" to "Закат", "forest" to "Лес",
    "ocean" to "Океан", "sakura" to "Сакура", "cozy" to "Уютный вечер", "mono" to "Графит",
)

private data class CustomizeData(val profile: ProfileResponse, val achievements: List<Achievement>, val pinned: List<Int>)

/** Как «Оформление» в веб-версии: витрины, главное достижение, закреплённые ачивки, фон. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileCustomizeScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state = rememberLoadable {
        coroutineScope {
            val p = async { Api.get<ProfileResponse>("/api/life/profile") }
            val a = async { Api.get<Items<Achievement>>("/api/achievements").items }
            val s = async { runCatching { Api.get<ShowcaseIds>("/api/achievements/showcase").ids }.getOrDefault(emptyList()) }
            CustomizeData(p.await(), a.await(), s.await())
        }
    }
    val showcases = remember { mutableStateListOf<String>() }
    val pinned = remember { mutableStateListOf<Int>() }
    var featured by remember { mutableStateOf<Int?>(null) }
    var preset by remember { mutableStateOf("aurora") }
    var presetChanged by remember { mutableStateOf(false) }
    var saving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.data) {
        val d = state.data ?: return@LaunchedEffect
        showcases.clear(); showcases.addAll(d.profile.style.showcases)
        pinned.clear(); pinned.addAll(d.pinned)
        featured = d.profile.style.featuredId
        preset = d.profile.style.backgroundPreset
    }

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            message = runCatching {
                val (name, bytes, mime) = withContext(Dispatchers.IO) {
                    val r = context.contentResolver
                    val n = r.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "background.jpg"
                    Triple(n, r.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0), r.getType(uri) ?: "image/jpeg")
                }
                Api.upload("/api/life/profile", "background", name, bytes, mime = mime)
                state.reload()
                "Картинка фона загружена"
            }.getOrElse { "Не удалось загрузить: ${it.message}" }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Оформление профиля", onBack)
        LoadableContent(state) { data ->
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionTitle("Витрины — что показывать и в каком порядке")
                (showcases.toList() + SHOWCASES.map { it.first }.filter { it !in showcases }).forEach { id ->
                    val on = id in showcases
                    val index = showcases.indexOf(id)
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(if (on) Brand.Mint.copy(alpha = 0.08f) else Brand.Ink.copy(alpha = 0.03f)).padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(on, { if (it) showcases.add(id) else showcases.remove(id) }, colors = CheckboxDefaults.colors(checkedColor = Brand.Mint))
                        Text(SHOWCASES.first { it.first == id }.second, modifier = Modifier.weight(1f))
                        if (on) {
                            IconButton(onClick = { if (index > 0) { showcases.removeAt(index); showcases.add(index - 1, id) } }, enabled = index > 0) { Icon(Icons.Default.ArrowUpward, "Выше") }
                            IconButton(onClick = { if (index < showcases.size - 1) { showcases.removeAt(index); showcases.add(index + 1, id) } }, enabled = index < showcases.size - 1) { Icon(Icons.Default.ArrowDownward, "Ниже") }
                        }
                    }
                }

                SectionTitle("Достижения: ⭐ главное · 📌 в витрину (до 6)")
                val earned = data.achievements.filter { it.earned }
                if (earned.isEmpty()) Text("Полученных ачивок пока нет", color = Brand.TextMuted)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    earned.forEach { a ->
                        val c = rarityColor(a.rarity)
                        Column(
                            Modifier.width(100.dp).clip(RoundedCornerShape(14.dp)).background(c.copy(alpha = 0.12f))
                                .border(if (featured == a.id) 2.dp else 1.dp, if (featured == a.id) Brand.Amber else c.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).padding(8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(a.icon, fontSize = 28.sp)
                            Text(a.title, fontSize = 11.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Row {
                                Text(if (featured == a.id) "⭐" else "☆", fontSize = 20.sp, modifier = Modifier.clickable { featured = if (featured == a.id) null else a.id }.padding(4.dp))
                                Text(if (a.id in pinned) "📌" else "📍", fontSize = 18.sp, modifier = Modifier.alpha(if (a.id in pinned) 1f else 0.4f).clickable {
                                    if (a.id in pinned) pinned.remove(a.id) else if (pinned.size < 6) pinned.add(a.id)
                                }.padding(4.dp))
                            }
                        }
                    }
                }

                SectionTitle("Фон профиля")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    PRESETS.forEach { (id, label) -> Chip(label, if (preset == id && data.profile.style.backgroundUrl == null) Brand.Mint else Brand.TextMuted, Modifier.clickable { preset = id; presetChanged = true }) }
                }
                Text("🖼 Загрузить свою картинку", color = Brand.Sky, modifier = Modifier.clickable { picker.launch("image/*") }.padding(vertical = 6.dp))
                if (data.profile.style.backgroundUrl != null) Text("Сейчас стоит своя картинка — выберите готовый фон, чтобы её убрать", color = Brand.TextFaint, fontSize = 12.sp)
                message?.let { Text(it, color = Brand.Amber, fontSize = 13.sp) }

                ChunkyButton(if (saving) "Сохраняем…" else "Сохранить", Modifier.fillMaxWidth().padding(vertical = 12.dp), enabled = !saving) {
                    saving = true
                    scope.launch {
                        runCatching {
                            Api.put("/api/life/profile/style", buildJsonObject {
                                putJsonArray("showcases") { showcases.forEach { add(it) } }
                                if (featured == null) put("featured_id", JsonNull) else put("featured_id", featured)
                                if (presetChanged) put("background_preset", preset)
                            })
                            Api.put("/api/achievements/showcase", buildJsonObject { putJsonArray("ids") { pinned.forEach { add(it) } } })
                        }
                        saving = false
                        onBack()
                    }
                }
            }
        }
    }
}
