package com.lifehub.app.ui.screens

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.Habit
import com.lifehub.app.data.HabitCheck
import com.lifehub.app.data.Items
import com.lifehub.app.data.Mission
import com.lifehub.app.data.MissionsSummary
import com.lifehub.app.data.WeeklyMission
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.add
import kotlinx.serialization.json.putJsonArray
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

@Serializable private data class WeeklySummary(val missions: List<WeeklyMission> = emptyList())
private data class MissionsData(val daily: MissionsSummary, val weekly: List<WeeklyMission>)

private fun missionEmoji(m: Mission): String {
    val t = m.title.lowercase()
    val u = (m.progressUnit ?: "").lowercase()
    return when {
        "шаг" in u -> "👟"
        "сп" in t || "сон" in t -> "😴"
        "ккал" in u || "трен" in t || "двига" in t -> "💪"
        "привыч" in u -> "✅"
        "язык" in t || "слов" in t -> "🗣️"
        "обучен" in t || "урок" in t || "курс" in t -> "🎓"
        "цел" in t -> "🎯"
        "запиш" in t || "мысл" in t -> "📝"
        else -> "⭐"
    }
}

private data class HabitsData(val habits: List<Habit>, val checks: Set<String>, val tags: List<com.lifehub.app.data.PageTag>)

/** Привычки как в веб: неделя пн–вс с листанием, прогресс «сделано / цель», теги, правка и удаление. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun HabitsScreen() {
    val scope = rememberCoroutineScope()
    var weekOffset by remember { mutableStateOf(0) }
    val monday = remember(weekOffset) { LocalDate.now().with(java.time.DayOfWeek.MONDAY).plusWeeks(weekOffset.toLong()) }
    val days = remember(monday) { (0..6).map { monday.plusDays(it.toLong()) } }
    val state = rememberLoadable(monday) {
        coroutineScope {
            val habits = async { Api.get<Items<Habit>>("/api/life/habits").items }
            val checks = async { Api.get<Items<HabitCheck>>("/api/life/habits/checks?from=${days.first()}&to=${days.last()}").items }
            val tags = async { runCatching { Api.get<Items<com.lifehub.app.data.PageTag>>("/api/life/pages/tags").items }.getOrDefault(emptyList()) }
            HabitsData(habits.await(), checks.await().map { "${it.habitId}|${it.date}" }.toSet(), tags.await())
        }
    }
    var checks by remember(state.data) { mutableStateOf(state.data?.checks ?: emptySet()) }
    var adding by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Habit?>(null) }
    val today = LocalDate.now()

    fun toggle(habit: Habit, date: LocalDate) {
        if (date.isAfter(today)) return
        val key = "${habit.id}|$date"
        val done = key in checks
        checks = if (done) checks - key else checks + key
        scope.launch {
            runCatching { Api.post("/api/life/habits/checks", buildJsonObject { put("habit_id", habit.id); put("date", date.toString()); put("done", !done) }) }
            Achievements.requestCheck()
        }
    }

    Box(Modifier.fillMaxSize()) {
        PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = { state.reload() }, modifier = Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(16.dp)) {
                Text("Привычки", style = MaterialTheme.typography.headlineMedium)
                // Листание недель, как в веб
                Row(Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    WeekArrow("←") { weekOffset-- }
                    val fmt = java.time.format.DateTimeFormatter.ofPattern("d MMM", Locale("ru"))
                    Text(
                        if (weekOffset == 0) "Эта неделя · ${days.first().format(fmt)} — ${days.last().format(fmt)}" else "${days.first().format(fmt)} — ${days.last().format(fmt)}",
                        color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                    )
                    if (weekOffset != 0) Text("сегодня", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clip(CircleShape).clickable { weekOffset = 0 }.padding(horizontal = 8.dp, vertical = 4.dp))
                    WeekArrow("→", enabled = weekOffset < 0) { weekOffset++ }
                }
                LoadableContent(state) { data ->
                    if (data.habits.isEmpty()) EmptyState("🌱", "Привычек пока нет", "Добавьте первую — кнопка «+» внизу.")
                    if (data.habits.isNotEmpty() && weekOffset == 0) {
                        val todayChecked = data.habits.count { "${it.id}|$today" in checks }
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
                            Text("Сегодня: $todayChecked из ${data.habits.size}", fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(6.dp))
                            ProgressBar(todayChecked.toFloat() / data.habits.size, colors = listOf(Brand.Green, Brand.Mint))
                        }
                    }
                    data.habits.forEach { habit ->
                        val weekCount = days.count { "${habit.id}|$it" in checks }
                        // В неделе 7 дней: цель больше (например, 365) значит «каждый день»
                        val target = minOf(habit.targetPerWeek, 7)
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(habit.title, fontWeight = FontWeight.SemiBold)
                                    Text(if (target > 0) "$weekCount / $target " + (if (habit.targetPerWeek > 7) "· каждый день" else "за неделю") else "$weekCount за неделю", color = Brand.TextMuted, fontSize = 12.sp)
                                }
                                Text("⋯", fontSize = 20.sp, color = Brand.TextMuted, modifier = Modifier.clip(CircleShape).clickable { editing = habit }.padding(horizontal = 10.dp, vertical = 2.dp))
                            }
                            if (habit.tags.isNotEmpty()) {
                                androidx.compose.foundation.layout.FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) { habit.tags.forEach { TagBadge(it) } }
                            }
                            if (target > 0) {
                                Spacer(Modifier.height(8.dp))
                                ProgressBar(weekCount.toFloat() / target, height = 5.dp, colors = listOf(Brand.Green, Brand.Mint))
                            }
                            Spacer(Modifier.height(10.dp))
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                days.forEach { date ->
                                    val done = "${habit.id}|$date" in checks
                                    val isToday = date == today
                                    val future = date.isAfter(today)
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(date.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale("ru")), fontSize = 11.sp, color = if (isToday) Brand.Mint else Brand.TextFaint)
                                        Spacer(Modifier.height(4.dp))
                                        Box(
                                            Modifier.size(38.dp).clip(CircleShape)
                                                .background(if (done) Brand.Mint else Brand.Ink.copy(alpha = if (isToday) 0.12f else if (future) 0.02f else 0.05f))
                                                .clickable(enabled = !future) { toggle(habit, date) },
                                            contentAlignment = Alignment.Center,
                                        ) {
                                            Text(if (done) "✓" else "${date.dayOfMonth}", color = if (done) Brand.Deep else if (future) Brand.TextFaint else Brand.TextMuted, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(80.dp))
                }
            }
        }
        FloatingActionButton(
            onClick = { adding = true },
            containerColor = Brand.Mint,
            contentColor = Brand.Deep,
            modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp),
        ) { Icon(Icons.Default.Add, "Добавить привычку") }
    }

    if (adding) {
        HabitDialog(null, state.data?.tags.orEmpty(), onDismiss = { adding = false }, onDelete = null) { title, target, tags ->
            adding = false
            scope.launch {
                runCatching { Api.post("/api/life/habits", buildJsonObject { put("title", title); put("target_per_week", target); putJsonArray("tags") { tags.forEach { add(it) } } }) }
                Achievements.requestCheck()
                state.reload()
            }
        }
    }

    editing?.let { habit ->
        HabitDialog(habit, state.data?.tags.orEmpty(), onDismiss = { editing = null }, onDelete = {
            editing = null
            scope.launch { runCatching { Api.delete("/api/life/habits/${habit.id}") }; state.reload() }
        }) { title, target, tags ->
            editing = null
            scope.launch {
                runCatching { Api.put("/api/life/habits/${habit.id}", buildJsonObject { put("title", title); put("target_per_week", target); putJsonArray("tags") { tags.forEach { add(it) } } }) }
                state.reload()
            }
        }
    }
}

@Composable
private fun WeekArrow(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.size(34.dp).clip(RoundedCornerShape(10.dp)).background(Brand.Ink.copy(alpha = if (enabled) 0.06f else 0.02f)).clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (enabled) Brand.Text else Brand.TextFaint) }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun HabitDialog(
    habit: Habit?,
    allTags: List<com.lifehub.app.data.PageTag>,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)?,
    onSave: (String, Int, List<Int>) -> Unit,
) {
    var title by remember { mutableStateOf(habit?.title.orEmpty()) }
    var target by remember { mutableStateOf(habit?.targetPerWeek?.takeIf { it > 0 } ?: 7) }
    val tags = remember { androidx.compose.runtime.mutableStateListOf<Int>().apply { addAll(habit?.tags.orEmpty().map { it.id }) } }
    var confirmDelete by remember { mutableStateOf(false) }
    val presets = listOf("💧 Пить воду", "🚶 Прогулка", "📖 Читать 20 минут", "🧘 Медитация", "🏋️ Зарядка", "😴 Лечь до 23:00")
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (habit == null) "Новая привычка" else "Привычка") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                if (habit == null) {
                    Spacer(Modifier.height(10.dp))
                    presets.chunked(2).forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(bottom = 6.dp)) {
                            row.forEach { p -> Text(p, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).background(Brand.Ink.copy(alpha = 0.06f)).clickable { title = p }.padding(horizontal = 10.dp, vertical = 6.dp)) }
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Цель: раз в неделю", color = Brand.TextMuted, fontSize = 12.sp)
                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (1..7).forEach { n ->
                        Box(
                            Modifier.size(32.dp).clip(CircleShape).background(if (n == target) Brand.Mint else Brand.Ink.copy(alpha = 0.06f)).clickable { target = n },
                            contentAlignment = Alignment.Center,
                        ) { Text("$n", color = if (n == target) Brand.Deep else Brand.Text, fontWeight = FontWeight.Bold, fontSize = 13.sp) }
                    }
                }
                if (allTags.isNotEmpty()) {
                    Spacer(Modifier.height(12.dp))
                    Text("Теги", color = Brand.TextMuted, fontSize = 12.sp)
                    androidx.compose.foundation.layout.FlowRow(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        allTags.forEach { t ->
                            val on = t.id in tags
                            TagBadge(com.lifehub.app.data.PageTagRef(t.id, t.label, t.color), Modifier.clickable { if (on) tags.remove(t.id) else tags.add(t.id) }, selected = on)
                        }
                    }
                }
                if (onDelete != null) {
                    Spacer(Modifier.height(16.dp))
                    Text(
                        if (confirmDelete) "Точно удалить вместе с отметками? Нажмите ещё раз" else "Удалить привычку",
                        color = Brand.Rose, fontSize = 13.sp,
                        modifier = Modifier.clip(CircleShape).clickable { if (confirmDelete) onDelete() else confirmDelete = true }.padding(vertical = 6.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(enabled = title.isNotBlank(), onClick = { onSave(title.trim(), target, tags.toList()) }) { Text("Сохранить") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        containerColor = Brand.Night,
    )
}
