package com.lifehub.app.ui.screens

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lifehub.app.data.Api
import com.lifehub.app.data.FeedItem
import com.lifehub.app.data.Goal
import com.lifehub.app.data.Habit
import com.lifehub.app.data.Language
import com.lifehub.app.data.LifeCourse
import com.lifehub.app.data.ProfileUser
import com.lifehub.app.data.TravelPlan
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

private val LANGUAGE_FALLBACKS = listOf(
    listOf(Color(0x6627E9B5), Color(0x4D3B5265), Color(0xB3162936)),
    listOf(Color(0x663B5265), Color(0x66162936), Color(0xCC051824)),
    listOf(Color(0x4D27E9B5), Color(0x1A27E9B5), Color(0xCC162936)),
    listOf(Color(0x66162936), Color(0x403B5265), Color(0x6627E9B5)),
)

/** Карточка языка как в веб-профиле: баннер на фоне, картинка-флаг, уровень, серия и прогресс. */
@Composable
fun LanguageBannerCard(l: Language, index: Int, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    val shape = RoundedCornerShape(14.dp)
    Box(modifier.fillMaxWidth().clip(shape).border(1.dp, Color.White.copy(alpha = 0.1f), shape).then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)) {
        Box(Modifier.matchParentSize().background(Brush.linearGradient(LANGUAGE_FALLBACKS[index % LANGUAGE_FALLBACKS.size])))
        Api.fileUrl(l.bannerUrl)?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
        Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.55f)))
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(Color.Black.copy(alpha = 0.4f)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text(l.name.filter { it.isLetter() }.take(2).uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                Api.fileUrl(l.imageUrl)?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) }
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(l.name, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, color = Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text((l.level ?: "A1") + if (l.streak > 0) " · 🔥 ${l.streak} дн." else "", fontSize = 11.sp, color = Color.White.copy(alpha = 0.7f))
                Spacer(Modifier.height(6.dp))
                Box(Modifier.fillMaxWidth().height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.15f))) {
                    Box(Modifier.fillMaxWidth(l.coursesProgressPct / 100f).height(4.dp).clip(CircleShape).background(Brand.Mint))
                }
            }
        }
    }
}

@Composable
fun CoursesShowcase(courses: List<LifeCourse>, open: (LifeCourse) -> Unit) {
    val active = courses.filter { it.progress < 100 }.take(6)
    if (active.isEmpty()) { Text("Активных курсов нет.", color = Brand.TextMuted, fontSize = 13.sp); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        active.forEach { c ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.05f)).clickable { open(c) }.padding(12.dp)) {
                Row {
                    Text((if (c.locked) "🔒 " else "") + c.title, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    Text("${c.progress}%", fontSize = 12.sp, color = Brand.TextMuted)
                }
                Spacer(Modifier.height(6.dp))
                Box(Modifier.fillMaxWidth().height(5.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.1f))) {
                    Box(Modifier.fillMaxWidth(c.progress / 100f).height(5.dp).clip(CircleShape).background(Brand.Green))
                }
            }
        }
    }
}

data class RadarMetric(val label: String, val value: Int)

/** «Индекс жизни» — те же 6 метрик, что считает веб-профиль. */
fun buildLifeRadar(level: Int, xp: Int, xpPct: Int, habits: List<Habit>, habitDone: Map<Int, Int>, goals: List<Goal>, languages: List<Language>, courses: List<LifeCourse>, travel: List<TravelPlan>): List<RadarMetric> {
    fun avg(v: List<Double>) = if (v.isEmpty()) 0.0 else v.average()
    val habitRatios = habits.map { h ->
        val done = habitDone[h.id] ?: 0
        if (h.targetPerWeek <= 0) (if (done > 0) 1.0 else 0.0) else (done.toDouble() / h.targetPerWeek).coerceIn(0.0, 1.0)
    }
    val trips = travel.size
    val tripsDone = travel.count { it.status == "completed" }
    val tripsGoing = travel.count { it.status == "in-progress" }
    return listOf(
        RadarMetric("Привычки", (avg(habitRatios) * 100).toInt()),
        RadarMetric("Годовые цели", avg(goals.map { it.completionPct.toDouble().coerceIn(0.0, 100.0) }).toInt()),
        RadarMetric("Языки", avg(languages.map { it.coursesProgressPct.toDouble() }).toInt()),
        RadarMetric("Курсы", avg(courses.map { it.progress.toDouble().coerceIn(0.0, 100.0) }).toInt()),
        RadarMetric("Путешествия", if (trips > 0) (((tripsDone + tripsGoing * 0.5) / trips) * 100).toInt() else 0),
        RadarMetric("Опыт", xpPct.coerceIn(0, 100)),
    )
}

@Composable
fun RadarShowcase(metrics: List<RadarMetric>) {
    Column {
        Canvas(Modifier.fillMaxWidth().height(220.dp)) {
            val c = Offset(size.width / 2, size.height / 2)
            val r = size.minDimension / 2 * 0.78f
            val n = metrics.size
            fun point(i: Int, k: Float) = (-Math.PI / 2 + 2 * Math.PI * i / n).let { a -> Offset(c.x + r * k * cos(a).toFloat(), c.y + r * k * sin(a).toFloat()) }
            for (ring in 1..4) {
                val p = Path().apply { (0 until n).forEach { i -> val o = point(i, ring / 4f); if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }; close() }
                drawPath(p, Color.White.copy(alpha = 0.12f), style = Stroke(1.5f))
            }
            (0 until n).forEach { i -> drawLine(Color.White.copy(alpha = 0.08f), c, point(i, 1f), 1.5f) }
            val shape = Path().apply {
                metrics.forEachIndexed { i, m -> val o = point(i, (m.value / 100f).coerceIn(0.02f, 1f)); if (i == 0) moveTo(o.x, o.y) else lineTo(o.x, o.y) }
                close()
            }
            drawPath(shape, Brand.Mint.copy(alpha = 0.35f))
            drawPath(shape, Brand.Mint.copy(alpha = 0.85f), style = Stroke(3f))
        }
        metrics.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { m ->
                    Row(Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.05f)).padding(horizontal = 10.dp, vertical = 7.dp)) {
                        Text(m.label, fontSize = 12.sp, color = Color.White.copy(alpha = 0.8f), modifier = Modifier.weight(1f), maxLines = 1)
                        Text("${m.value}%", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Brand.Mint)
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private fun feedVisual(type: String?): Pair<String, Color> = when (type) {
    "goal_completed" -> "🎯" to Color(0xFF10B981)
    "xp_gain" -> "✨" to Color(0xFFF59E0B)
    "habit_check" -> "✅" to Color(0xFF0EA5E9)
    "language_progress" -> "🈴" to Color(0xFF6366F1)
    "course_progress" -> "📚" to Color(0xFFA855F7)
    "shifts_plan" -> "🗓️" to Color(0xFF06B6D4)
    "loan_due" -> "💳" to Color(0xFFF43F5E)
    "page", "journal_page" -> "📄" to Color(0xFF3B82F6)
    else -> "📝" to Color.White
}

private fun feedLabel(type: String?): String = when (type) {
    null -> ""
    "goal_completed" -> "Годовая цель"; "xp_gain" -> "Опыт"; "habit_check" -> "Привычка"
    "language_progress" -> "Язык"; "course_progress" -> "Курс"; "shifts_plan" -> "График"
    "loan_due" -> "Платёж"; "page", "journal_page" -> "Страница"; "note" -> "Заметка"
    else -> type.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

private fun feedDate(item: FeedItem): String {
    val raw = item.ts?.jsonPrimitive?.contentOrNull ?: return ""
    val instant = raw.toLongOrNull()?.let { Instant.ofEpochMilli(it) } ?: runCatching { Instant.parse(raw) }.getOrNull() ?: return raw.take(16)
    return instant.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("d MMM, HH:mm", Locale("ru")))
}

@Composable
fun FeedShowcase(items: List<FeedItem>, limit: Int = 8) {
    if (items.isEmpty()) { Text("Записей пока нет.", color = Brand.TextMuted, fontSize = 13.sp); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.take(limit).forEach { j ->
            val (icon, tone) = feedVisual(j.type)
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.05f)).padding(10.dp)) {
                Box(Modifier.size(36.dp).clip(CircleShape).background(tone.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) { Text(icon, fontSize = 16.sp) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Row {
                        Text(feedDate(j), fontSize = 11.sp, color = Color.White.copy(alpha = 0.45f), modifier = Modifier.weight(1f))
                        Text(feedLabel(j.type), fontSize = 11.sp, color = Color.White.copy(alpha = 0.45f))
                    }
                    j.title?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    j.text?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = Color.White.copy(alpha = 0.65f), maxLines = 2, overflow = TextOverflow.Ellipsis) }
                }
            }
        }
    }
}

private suspend fun readUri(context: Context, uri: Uri, fallback: String): Triple<String, ByteArray, String> = withContext(Dispatchers.IO) {
    val r = context.contentResolver
    val n = r.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: fallback
    Triple(n, r.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0), r.getType(uri) ?: "image/jpeg")
}

/** Редактирование профиля (как «Профиль» в веб): имя, ник, о себе, город, ссылка, аватар и баннер. */
@Composable
fun ProfileEditDialog(user: ProfileUser, onDismiss: () -> Unit, onSaved: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(user.name.orEmpty()) }
    var username by remember { mutableStateOf(user.username.orEmpty()) }
    var bio by remember { mutableStateOf(user.bio.orEmpty()) }
    var city by remember { mutableStateOf(user.city.orEmpty()) }
    var link by remember { mutableStateOf(user.profileUrl.orEmpty()) }
    var avatar by remember { mutableStateOf<Uri?>(null) }
    var banner by remember { mutableStateOf<Uri?>(null) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { avatar = it ?: avatar }
    val pickBanner = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { banner = it ?: banner }

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        containerColor = Brand.Card,
        title = { Text("Профиль", color = Brand.Text) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(64.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).clickable { pickAvatar.launch("image/*") }, contentAlignment = Alignment.Center) {
                        val src = avatar ?: Api.fileUrl(user.avatarUrl)
                        if (src != null) AsyncImage(src, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize()) else Text("🙂", fontSize = 24.sp)
                    }
                    Box(Modifier.weight(1f).height(64.dp).clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.06f)).clickable { pickBanner.launch("image/*") }, contentAlignment = Alignment.Center) {
                        val src = banner ?: Api.fileUrl(user.bannerUrl)
                        if (src != null) AsyncImage(src, null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
                        Text("Баннер", fontSize = 12.sp, color = Color.White, modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.45f)).padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                Text("Нажмите на аватар или баннер, чтобы заменить", color = Brand.TextFaint, fontSize = 11.sp)
                OutlinedTextField(name, { name = it }, label = { Text("Имя") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(username, { username = it.filter { c -> !c.isWhitespace() } }, label = { Text("Ник") }, prefix = { Text("@") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(bio, { bio = it }, label = { Text("О себе") }, minLines = 2, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(city, { city = it }, label = { Text("Город") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(link, { link = it }, label = { Text("Ссылка") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = Brand.Rose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = !saving, onClick = {
                saving = true
                scope.launch {
                    runCatching {
                        val files = buildList {
                            avatar?.let { val (n, b, m) = readUri(context, it, "avatar.jpg"); add(Api.UploadFile("avatar", n, b, m)) }
                            banner?.let { val (n, b, m) = readUri(context, it, "banner.jpg"); add(Api.UploadFile("banner", n, b, m)) }
                        }
                        Api.uploadMany(
                            "/api/life/profile", files,
                            mapOf("display_name" to name, "username" to username.trim(), "bio" to bio, "city" to city.trim(), "profile_link" to link.trim()),
                        )
                    }.onSuccess { onSaved() }.onFailure { error = it.message ?: "Не удалось сохранить"; saving = false }
                }
            }) { Text(if (saving) "Сохраняю…" else "Сохранить", color = Brand.Mint) }
        },
        dismissButton = { TextButton({ onDismiss() }, enabled = !saving) { Text("Отмена", color = Brand.TextMuted) } },
    )
}
