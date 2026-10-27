package com.lifehub.app.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.Mission
import com.lifehub.app.data.MissionsSummary
import com.lifehub.app.data.WeeklyMission
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.rememberLoadable
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

// Палитра «потёртого дневника» — как в веб-версии
private val Leather = Color(0xFF4A2A17)
private val LeatherLight = Color(0xFF6B3F24)
private val Paper = Color(0xFFF6EAD0)
private val PaperDark = Color(0xFFEFDFBD)
private val Ink = Color(0xFF3B2A1C)
private val InkSoft = Color(0xFF7A5C40)
private val InkFaint = Color(0xFFA58866)
private val InkBlue = Color(0xFF24405E)
private val Wax = Color(0xFF8B2A22)
private val Moss = Color(0xFF4F6B3A)
private val Hand = FontFamily.Cursive
private val Book = FontFamily.Serif

@Serializable private data class DiaryWeekly(
    val missions: List<WeeklyMission> = emptyList(),
    @kotlinx.serialization.SerialName("completed_count") val completedCount: Int = 0,
    @kotlinx.serialization.SerialName("total_count") val totalCount: Int = 0,
    @kotlinx.serialization.SerialName("total_points") val totalPoints: Int = 0,
    @kotlinx.serialization.SerialName("active_days") val activeDays: Int = 0,
    @kotlinx.serialization.SerialName("perfect_days") val perfectDays: Int = 0,
)
private data class DiaryData(val daily: MissionsSummary, val weekly: DiaryWeekly)

private fun doodle(m: Mission): String {
    val t = "${m.title} ${m.progressUnit ?: ""}".lowercase()
    return when {
        "шаг" in t -> "👣"
        "сон" in t || "сна" in t || "выспит" in t -> "🌙"
        "дневник" in t || "мысл" in t || "запиш" in t -> "🖋️"
        "урок" in t || "обучен" in t -> "🎓"
        "язык" in t || "слов" in t -> "📖"
        "трен" in t || "ккал" in t || "мин" in t -> "🏃"
        "привыч" in t -> "🌱"
        "цел" in t -> "🎯"
        else -> "✦"
    }
}

/** Ежедневные задания в виде потёртого дневника: кожаная обложка, страница в линейку, сургучные печати. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MissionsScreen() {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable {
        coroutineScope {
            val daily = async { Api.get<MissionsSummary>("/api/life/daily-missions") }
            val weekly = async { runCatching { Api.get<DiaryWeekly>("/api/life/weekly-missions") }.getOrDefault(DiaryWeekly()) }
            DiaryData(daily.await(), weekly.await())
        }
    }
    var page by remember { mutableStateOf("day") }
    var claiming by remember { mutableStateOf<Int?>(null) }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0xFF2B1D12), Color(0xFF140D08))))) {
        PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = { state.reload() }, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(12.dp)) {
                // Вкладки-закладки сверху книги
                Row(Modifier.padding(start = 24.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("day" to "Сегодня", "week" to "Неделя").forEach { (id, label) ->
                        Text(
                            label,
                            fontFamily = Hand, fontSize = 19.sp, color = Ink,
                            modifier = Modifier.clip(RoundedCornerShape(topStart = 10.dp, topEnd = 10.dp))
                                .background(if (page == id) Paper else Color(0xFFE4CFA4))
                                .clickable { page = id }
                                .padding(horizontal = 16.dp, vertical = if (page == id) 6.dp else 4.dp),
                        )
                    }
                }
                // Обложка
                Box(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp))
                        .background(Brush.linearGradient(listOf(LeatherLight, Leather, Color(0xFF3A2012))))
                        .padding(10.dp),
                ) {
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                            .background(Brush.verticalGradient(listOf(Paper, PaperDark)))
                            .ruled()
                            .padding(horizontal = 18.dp, vertical = 20.dp),
                    ) {
                        LoadableContent(state) { data ->
                            if (page == "day") DayPage(data.daily, claiming) { mission ->
                                claiming = mission.id
                                scope.launch {
                                    runCatching { Api.post("/api/life/daily-missions/${mission.id}/complete", buildJsonObject { put("date", data.daily.date) }) }
                                    claiming = null
                                    Achievements.requestCheck()
                                    state.reload()
                                }
                            } else WeekPage(data.weekly)
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@Composable
private fun DayPage(d: MissionsSummary, claiming: Int?, onClaim: (Mission) -> Unit) {
    val date = runCatching { LocalDate.parse(d.date) }.getOrDefault(LocalDate.now())
    val ru = Locale("ru")
    val pct = (d.totalPoints.toFloat() / d.targetPoints.coerceAtLeast(1)).coerceIn(0f, 1f)
    Text("Дневник заданий", fontFamily = Hand, color = InkSoft, fontSize = 15.sp)
    Text(date.dayOfWeek.getDisplayName(TextStyle.FULL, ru).replaceFirstChar { it.uppercase() }, fontFamily = Hand, color = Ink, fontSize = 40.sp, fontWeight = FontWeight.Bold)
    Text(date.format(DateTimeFormatter.ofPattern("d MMMM", ru)), fontFamily = Book, fontStyle = FontStyle.Italic, color = InkSoft, fontSize = 14.sp)
    Spacer(Modifier.height(14.dp))
    Row {
        Text("Собрано очков", fontFamily = Book, color = InkSoft, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text("${d.totalPoints} из ${d.targetPoints}", fontFamily = Book, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
    InkTrack(pct, Modifier.padding(top = 4.dp))
    Spacer(Modifier.height(10.dp))
    StickyNote(
        when {
            pct >= 1f -> "День прожит не зря. Можно заварить чай ☕"
            pct >= 0.5f -> "Больше половины позади — так держать!"
            d.totalPoints > 0 -> "Хорошее начало. Шаг за шагом."
            else -> "Чистая страница. С чего начнём сегодня?"
        },
    )
    Spacer(Modifier.height(14.dp))
    Text("Что сделать сегодня", fontFamily = Hand, color = Ink, fontSize = 24.sp)
    d.missions.sortedBy { if (it.claimable) 0 else if (!it.completed) 1 else 2 }.forEach { m ->
        val goal = m.targetValue.coerceAtLeast(1.0)
        val cur = m.progressValue.coerceIn(0.0, goal)
        DiaryItem(
            done = m.completed,
            claimed = m.rewardClaimed,
            title = "${doodle(m)} ${m.title}",
            description = m.description,
            progress = (cur / goal).toFloat(),
            progressText = "${cur.toInt()}/${goal.toInt()} ${m.progressUnit ?: ""}",
            reward = "+${m.points} ✦ · +${m.xpReward} XP",
        ) {
            when {
                m.rewardClaimed -> Stamp()
                m.claimable -> WaxSeal(loading = claiming == m.id) { onClaim(m) }
            }
        }
    }
    Text("— страница ${date.dayOfMonth} —", fontFamily = Book, fontStyle = FontStyle.Italic, color = InkFaint, fontSize = 11.sp, modifier = Modifier.fillMaxWidth().padding(top = 12.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
}

@Composable
private fun WeekPage(w: DiaryWeekly) {
    val pct = if (w.totalCount > 0) w.completedCount.toFloat() / w.totalCount else 0f
    Text("Глава недели", fontFamily = Hand, color = InkSoft, fontSize = 15.sp)
    Text("Эта неделя", fontFamily = Hand, color = Ink, fontSize = 40.sp, fontWeight = FontWeight.Bold)
    Spacer(Modifier.height(10.dp))
    Row {
        Text("Закрыто заданий недели", fontFamily = Book, color = InkSoft, fontSize = 12.sp, modifier = Modifier.weight(1f))
        Text("${w.completedCount} из ${w.totalCount}", fontFamily = Book, color = Ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
    InkTrack(pct, Modifier.padding(top = 4.dp))
    Spacer(Modifier.height(10.dp))
    listOf("✦ Очков за неделю: ${w.totalPoints}", "☀ Активных дней: ${w.activeDays} · идеальных: ${w.perfectDays}").forEach {
        Text(it, fontFamily = Book, color = Ink, fontSize = 15.sp, modifier = Modifier.padding(vertical = 3.dp))
    }
    Spacer(Modifier.height(8.dp))
    StickyNote(if (w.totalCount > 0 && w.completedCount >= w.totalCount) "Неделя закрыта целиком ✨" else "Хорошая неделя складывается из хороших дней.")
    Spacer(Modifier.height(14.dp))
    Text("Задания недели", fontFamily = Hand, color = Ink, fontSize = 24.sp)
    Text("Награда начисляется сама, как только задание выполнено.", fontFamily = Book, fontStyle = FontStyle.Italic, color = InkSoft, fontSize = 12.sp)
    w.missions.forEach { m ->
        val goal = m.targetValue.coerceAtLeast(1.0)
        val cur = m.progressValue.coerceIn(0.0, goal)
        DiaryItem(
            done = m.completed, claimed = m.completed, title = "📜 ${m.title}", description = m.description,
            progress = (cur / goal).toFloat(), progressText = "${cur.toInt()}/${goal.toInt()}", reward = "+${m.rewardPoints} ✦ · +${m.rewardXp} XP",
        ) { if (m.completed) Stamp() }
    }
}

@Composable
private fun DiaryItem(
    done: Boolean,
    claimed: Boolean,
    title: String,
    description: String?,
    progress: Float,
    progressText: String,
    reward: String,
    trailing: @Composable () -> Unit,
) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp).dashedBottom(), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.padding(top = 2.dp).size(22.dp).rotate(-3f).border(2.dp, Color(0xFF6B4C33), RoundedCornerShape(4.dp)),
            contentAlignment = Alignment.Center,
        ) { if (done) Text("✓", color = InkBlue, fontFamily = Hand, fontSize = 22.sp, fontWeight = FontWeight.Bold) }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontFamily = Book, color = Ink, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, textDecoration = if (claimed) TextDecoration.LineThrough else null)
            description?.let { Text(it, fontFamily = Book, fontStyle = FontStyle.Italic, color = InkSoft, fontSize = 12.sp, maxLines = 2) }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                val animated by animateFloatAsState(progress.coerceIn(0f, 1f), tween(500), label = "p")
                Box(Modifier.weight(1f).height(5.dp).clip(CircleShape).background(Color(0x26784F28))) {
                    Box(Modifier.fillMaxWidth(animated).height(5.dp).clip(CircleShape).background(Moss))
                }
                Spacer(Modifier.width(8.dp))
                Text(progressText, fontFamily = Hand, color = Color(0xFF6B4C33), fontSize = 16.sp)
            }
            Text(reward, fontFamily = Book, color = Color(0xFF9A7A5A), fontSize = 11.sp)
        }
        Spacer(Modifier.width(6.dp))
        trailing()
    }
}

@Composable
private fun WaxSeal(loading: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(58.dp).rotate(-8f).clip(CircleShape)
            .background(Brush.radialGradient(listOf(Color(0xFFC2463A), Wax, Color(0xFF6B1E18))))
            .clickable(enabled = !loading, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) CircularProgressIndicator(Modifier.size(18.dp), color = Color(0xFFFBE6D4), strokeWidth = 2.dp)
        else Text("Забрать", fontFamily = Hand, color = Color(0xFFFBE6D4), fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

@Composable
private fun Stamp() {
    Text(
        "ГОТОВО",
        fontFamily = Book, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 2.sp, color = Moss,
        modifier = Modifier.padding(top = 10.dp).rotate(-12f).border(2.dp, Moss.copy(alpha = 0.75f), RoundedCornerShape(4.dp)).padding(horizontal = 6.dp, vertical = 1.dp),
    )
}

@Composable
private fun StickyNote(text: String) {
    Text(
        text,
        fontFamily = Hand, fontSize = 19.sp, color = Color(0xFF5B3F2A),
        modifier = Modifier.fillMaxWidth().rotate(-1.5f).background(Color(0xFFFFF7C7)).padding(12.dp),
    )
}

@Composable
private fun InkTrack(fraction: Float, modifier: Modifier = Modifier) {
    val animated by animateFloatAsState(fraction.coerceIn(0f, 1f), tween(700), label = "ink")
    Box(modifier.fillMaxWidth().height(10.dp).clip(CircleShape).background(Color(0x26784F28))) {
        Box(Modifier.fillMaxWidth(animated).height(10.dp).clip(CircleShape).background(Brush.horizontalGradient(listOf(Color(0xFF2D4A6B), InkBlue))))
    }
}

/** Линовка страницы, как в тетради. */
private fun Modifier.ruled(): Modifier = this.then(
    Modifier.drawBehindCompat { w, h, draw ->
        var y = 32f * 3
        while (y < h) {
            draw(Offset(0f, y), Offset(w, y), Color(0x2E788CAA), null)
            y += 32f * 3
        }
        draw(Offset(54f, 0f), Offset(54f, h), Color(0x59C85046), null)
    },
)

private fun Modifier.dashedBottom(): Modifier = this.then(
    Modifier.drawBehindCompat { w, h, draw ->
        draw(Offset(0f, h), Offset(w, h), Color(0x40784F28), PathEffect.dashPathEffect(floatArrayOf(10f, 8f)))
    },
)

private fun Modifier.drawBehindCompat(block: (Float, Float, (Offset, Offset, Color, PathEffect?) -> Unit) -> Unit): Modifier =
    this.then(
        Modifier.drawBehind {
            block(size.width, size.height) { a, b, c, effect -> drawLine(c, a, b, strokeWidth = 2f, pathEffect = effect) }
        },
    )
