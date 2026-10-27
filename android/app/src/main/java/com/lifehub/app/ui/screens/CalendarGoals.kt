package com.lifehub.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardOptions
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.Goal
import com.lifehub.app.data.GoalsResponse
import com.lifehub.app.data.Items
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
import com.lifehub.app.util.today
import com.lifehub.app.data.GoalAction
import androidx.compose.foundation.layout.heightIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle
import java.util.Locale

private fun eventIcon(type: String) = when (type) {
    "work" -> "💼"; "off" -> "🌴"; "study" -> "📚"; "loan_due" -> "💳"; "page" -> "📄"; "mood" -> ""; "stream_live" -> "🔴"; "video_released" -> "🎬"; else -> "•"
}

private fun eventColor(type: String) = when (type) {
    "work" -> Brand.Amber; "off" -> Brand.Green; "study" -> Brand.Sky; "loan_due" -> Brand.Rose; else -> Brand.Mint
}

@Composable
fun CalendarScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    var month by remember { mutableStateOf(YearMonth.now()) }
    var selected by remember { mutableStateOf(LocalDate.now()) }
    var adding by remember { mutableStateOf(false) }
    var shifts by remember { mutableStateOf(false) }
    val state = rememberLoadable(month) { Api.get<Items<CalendarEvent>>("/api/life/calendar?y=${month.year}&m=${month.monthValue}").items }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Календарь", onBack) {
            IconButton(onClick = { adding = true }) { Icon(Icons.Default.Add, "Добавить событие") }
        }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { month = month.minusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Назад") }
                Text(
                    "${month.month.getDisplayName(TextStyle.FULL_STANDALONE, Locale("ru")).replaceFirstChar { it.uppercase() }} ${month.year}",
                    fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                IconButton(onClick = { month = month.plusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Вперёд") }
            }
            val events = state.data ?: emptyList()
            val byDate = events.groupBy { it.date }
            Row(Modifier.fillMaxWidth()) {
                listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс").forEach {
                    Text(it, fontSize = 11.sp, color = Brand.TextFaint, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
            }
            val first = month.atDay(1)
            val offset = first.dayOfWeek.value - 1
            val cells = offset + month.lengthOfMonth()
            val rows = (cells + 6) / 7
            for (r in 0 until rows) {
                Row(Modifier.fillMaxWidth()) {
                    for (c in 0 until 7) {
                        val dayNum = r * 7 + c - offset + 1
                        Box(Modifier.weight(1f).aspectRatio(1f).padding(2.dp), contentAlignment = Alignment.Center) {
                            if (dayNum in 1..month.lengthOfMonth()) {
                                val date = month.atDay(dayNum)
                                val dayEvents = byDate[date.toString()].orEmpty()
                                val isToday = date == LocalDate.now()
                                val isSelected = date == selected
                                val shift = dayEvents.firstOrNull { it.type == "work" || it.type == "off" }
                                Column(
                                    Modifier.fillMaxSize().clip(RoundedCornerShape(10.dp))
                                        .background(
                                            when {
                                                isSelected -> Brand.Mint.copy(alpha = 0.3f)
                                                isToday -> Brand.Sky.copy(alpha = 0.25f)
                                                shift != null -> eventColor(shift.type).copy(alpha = 0.1f)
                                                else -> Color.White.copy(alpha = 0.03f)
                                            }
                                        )
                                        .clickable { selected = date },
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    val mood = dayEvents.firstNotNullOfOrNull { it.mood }
                                    Text(if (mood != null) MOODS.getOrElse(mood - 1) { "" } else "$dayNum", fontSize = if (mood != null) 16.sp else 14.sp, fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal)
                                    Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                        dayEvents.filter { it.type != "work" && it.type != "off" && it.type != "mood" }.take(3).forEach {
                                            Box(Modifier.size(5.dp).clip(CircleShape).background(eventColor(it.type)))
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            SectionTitle(selected.format(java.time.format.DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale("ru"))))
            LoadableContent(state) { all ->
                val dayEvents = all.filter { it.date == selected.toString() }
                if (dayEvents.isEmpty()) {
                    Text("Событий нет", color = Brand.TextMuted)
                }
                dayEvents.forEach { event ->
                    val id = event.id?.jsonPrimitive?.intOrNull
                    val c = eventColor(event.type)
                    Row(
                        Modifier.fillMaxWidth().padding(bottom = 6.dp).clip(RoundedCornerShape(14.dp)).background(Brand.Card)
                            .border(1.dp, c.copy(alpha = 0.3f), RoundedCornerShape(14.dp)),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.width(4.dp).height(44.dp).background(c))
                        Text("${eventIcon(event.type)} ${event.title}", fontSize = 14.sp, modifier = Modifier.weight(1f).padding(horizontal = 12.dp, vertical = 10.dp))
                        if (id != null) {
                            Icon(
                                Icons.Default.Delete, "Удалить", tint = Brand.TextFaint,
                                modifier = Modifier.padding(end = 8.dp).size(34.dp).clip(CircleShape)
                                    .clickable { scope.launch { runCatching { Api.delete("/api/life/calendar/$id") }; state.reload(); com.lifehub.app.sync.DeviceCalendar.syncIfDue(context, force = true) } }
                                    .padding(7.dp),
                            )
                        }
                    }
                }
                Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ChunkyButton("Событие", Modifier.weight(1f), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f)) { adding = true }
                    ChunkyButton("Смены", Modifier.weight(1f), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f)) { shifts = true }
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (shifts) {
        var pattern by remember { mutableStateOf("2/2") }
        var busy by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!busy) shifts = false },
            title = { Text("Мастер смен") },
            text = {
                Column {
                    Text("Смены будут чередоваться по шаблону 120 дней, начиная с ${selected.dayOfMonth}.${"%02d".format(selected.monthValue)}.${selected.year}. Начальный день — выбранный в календаре.", color = Brand.TextMuted, fontSize = 13.sp)
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("2/2", "5/2", "1/3", "3/3", "4/4").forEach { p ->
                            Text(p, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = if (pattern == p) Brand.Deep else Brand.Text,
                                modifier = Modifier.clip(CircleShape).background(if (pattern == p) Brand.Mint else Color.White.copy(alpha = 0.06f)).clickable { pattern = p }.padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                    OutlinedTextField(pattern, { pattern = it }, label = { Text("Паттерн (работа/выходные)") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = pattern.isNotBlank() && !busy, onClick = {
                    busy = true
                    scope.launch {
                        runCatching { Api.post("/api/life/calendar/auto-shifts", buildJsonObject { put("startDate", selected.toString()); put("pattern", pattern.trim()); put("days", 120) }) }
                        shifts = false
                        state.reload()
                        com.lifehub.app.sync.DeviceCalendar.syncIfDue(context, force = true)
                    }
                }) { Text(if (busy) "Создаю…" else "Готово") }
            },
            dismissButton = { TextButton(onClick = { shifts = false }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }

    if (adding) {
        var title by remember { mutableStateOf("") }
        var type by remember { mutableStateOf("note") }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Событие на ${selected.dayOfMonth}.${"%02d".format(selected.monthValue)}") },
            text = {
                Column {
                    OutlinedTextField(title, { title = it }, label = { Text("Что запланировано?") }, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                    Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("note" to "• Заметка", "study" to "📚 Учёба", "work" to "💼 Работа", "off" to "🌴 Выходной").forEach { (id, label) ->
                            Text(
                                label, fontSize = 12.sp,
                                modifier = Modifier.clip(CircleShape).background(if (type == id) Brand.Mint.copy(alpha = 0.3f) else Color.White.copy(alpha = 0.06f))
                                    .clickable { type = id }.padding(horizontal = 8.dp, vertical = 6.dp),
                            )
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = title.isNotBlank() || type == "work" || type == "off", onClick = {
                    adding = false
                    val finalTitle = title.ifBlank { if (type == "work") "Рабочая смена" else "Выходной" }
                    scope.launch {
                        runCatching { Api.post("/api/life/calendar", buildJsonObject { put("date", selected.toString()); put("title", finalTitle); put("type", type) }) }
                        Achievements.requestCheck()
                        state.reload()
                        com.lifehub.app.sync.DeviceCalendar.syncIfDue(context, force = true)
                    }
                }) { Text("Добавить") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun GoalsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable { Api.get<GoalsResponse>("/api/life/yearly-goals") }
    var adding by remember { mutableStateOf(false) }
    var autoGoal by remember { mutableStateOf<Goal?>(null) }
    var menuGoal by remember { mutableStateOf<Goal?>(null) }

    fun check(goal: Goal) {
        scope.launch {
            runCatching { Api.post("/api/life/yearly-goals/${goal.id}/check", buildJsonObject { put("date", today()); put("checked", !goal.todayDone) }) }
            Achievements.requestCheck()
            state.reload()
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Цели на год", onBack) { IconButton(onClick = { adding = true }) { Icon(Icons.Default.Add, "Новая цель") } }
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp)) {
            LoadableContent(state) { data ->
                if (data.active.isEmpty()) EmptyState("🎯", "Активных целей нет", "Поставьте цель на год — и отмечайте шаги к ней каждый день.")
                if (data.active.isNotEmpty()) {
                    Row(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Текущие цели", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Chip("Средний прогресс: ${data.active.sumOf { it.completionPct } / data.active.size}%", Brand.Mint)
                    }
                }
                data.active.forEachIndexed { index, goal ->
                    val accent = GOAL_ACCENTS[index % GOAL_ACCENTS.size]
                    LhCard(Modifier.fillMaxWidth().padding(bottom = 12.dp), padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                        // Шапка с градиентом, как карточки целей в веб
                        Column(Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.linearGradient(accent)).padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(goal.title, fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.weight(1f))
                                Text("⋯", fontSize = 20.sp, color = Brand.TextMuted, modifier = Modifier.clip(CircleShape).clickable { menuGoal = goal }.padding(horizontal = 8.dp))
                            }
                            androidx.compose.foundation.layout.FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                goal.createdAt?.take(10)?.let { GoalChip("Создана: ${ruDate(it)}") }
                                GoalChip("Стрик: ${goal.streakCurrent} дн. (рекорд ${goal.streakBest})")
                                if (goal.todayDone) GoalChip("Сегодня выполнено ✓")
                            }
                        }
                        Column(Modifier.padding(14.dp)) {
                            ProgressBar(goal.completionPct / 100f, colors = listOf(Color(0xFF34D399), Brand.Mint))
                            Row(Modifier.padding(top = 4.dp)) {
                                Text("${goal.completed} из ${goal.target}", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                Text("${goal.completionPct}%", color = Brand.TextMuted, fontSize = 12.sp)
                            }
                            Text(
                                if (goal.autoAction != null) "⚡ Авто: ${goal.autoLabel}${if (goal.autoMin > 1) " × ${goal.autoMin}" else ""}" else "⚡ Привязать к действию в проекте",
                                color = if (goal.autoAction != null) Brand.Amber else Brand.TextFaint, fontSize = 12.sp,
                                modifier = Modifier.padding(top = 10.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp))
                                    .background(if (goal.autoAction != null) Brand.Amber.copy(alpha = 0.1f) else Color.Transparent)
                                    .clickable { autoGoal = goal }.padding(horizontal = 10.dp, vertical = 8.dp),
                            )
                            if (goal.recentLogs.isNotEmpty()) {
                                androidx.compose.foundation.layout.FlowRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    goal.recentLogs.take(6).forEach { GoalChip(ruDate(it.date)) }
                                }
                            }
                            Row(Modifier.padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    if (goal.todayDone) "Снять отметку" else "Отметить сегодня",
                                    color = if (goal.todayDone) Brand.Text else Brand.Deep, fontWeight = FontWeight.SemiBold, fontSize = 14.sp,
                                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (goal.todayDone) Brand.Mint.copy(alpha = 0.2f) else Brand.Mint)
                                        .clickable { check(goal) }.padding(horizontal = 16.dp, vertical = 9.dp),
                                )
                                Spacer(Modifier.width(10.dp))
                                Text("Цель: ${goal.target}", color = Brand.TextMuted, fontSize = 12.sp)
                            }
                        }
                    }
                }
                if (data.archived.isNotEmpty()) {
                    SectionTitle("Архив · завершённые цели")
                    data.archived.forEach { goal ->
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            Text("🏁 ${goal.title}", fontWeight = FontWeight.SemiBold)
                            Text(
                                listOfNotNull(goal.archivedAt?.take(10)?.let { "Завершена: ${ruDate(it)}" }, "${goal.completed}/${goal.target}").joinToString(" • "),
                                color = Brand.TextMuted, fontSize = 12.sp,
                            )
                            Text("Рекордный стрик: ${goal.streakBest}", color = Brand.TextFaint, fontSize = 12.sp)
                        }
                    }
                }
            }
        }
    }

    menuGoal?.let { goal ->
        AlertDialog(
            onDismissRequest = { menuGoal = null },
            title = { Text(goal.title) },
            text = { Text("Удалить цель вместе со всеми отметками?", color = Brand.TextMuted) },
            confirmButton = {
                TextButton(onClick = {
                    menuGoal = null
                    scope.launch { runCatching { Api.delete("/api/life/yearly-goals/${goal.id}") }; state.reload() }
                }) { Text("Удалить", color = Brand.Rose) }
            },
            dismissButton = { TextButton(onClick = { menuGoal = null }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }

    if (adding) {
        var title by remember { mutableStateOf("") }
        var target by remember { mutableStateOf("52") }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Новая цель на год") },
            text = {
                Column {
                    OutlinedTextField(title, { title = it }, label = { Text("Цель") }, placeholder = { Text("Прочитать 52 книги") }, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                    Spacer(Modifier.width(8.dp))
                    OutlinedTextField(target, { target = it.filter(Char::isDigit) }, label = { Text("Сколько отметок до цели") }, colors = authFieldColors(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
                }
            },
            confirmButton = {
                TextButton(enabled = title.isNotBlank() && (target.toIntOrNull() ?: 0) > 0, onClick = {
                    adding = false
                    scope.launch {
                        runCatching { Api.post("/api/life/yearly-goals", buildJsonObject { put("title", title.trim()); put("target", target.toInt()) }) }
                        Achievements.requestCheck()
                        state.reload()
                    }
                }) { Text("Создать") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }

    autoGoal?.let { goal ->
        GoalAutoDialog(goal, onDismiss = { autoGoal = null }) { action, min ->
            autoGoal = null
            scope.launch {
                runCatching {
                    Api.patch("/api/life/yearly-goals/${goal.id}", buildJsonObject {
                        if (action == null) put("auto_action", kotlinx.serialization.json.JsonNull) else put("auto_action", action)
                        put("auto_min", min)
                    })
                }
                state.reload()
            }
        }
    }
}

/** Выбор действия, которое само отмечает день у цели (как «Автоотметка» в веб-версии). */
@Composable
private fun GoalAutoDialog(goal: Goal, onDismiss: () -> Unit, onSave: (String?, Int) -> Unit) {
    val actions = rememberLoadable { Api.get<Items<GoalAction>>("/api/achievements/actions").items }
    var selected by remember { mutableStateOf(goal.autoAction) }
    var min by remember { mutableStateOf(goal.autoMin.toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Автоотметка цели") },
        text = {
            Column {
                Text("День отметится сам, когда вы сделаете выбранное действие нужное число раз.", color = Brand.TextMuted, fontSize = 13.sp)
                OutlinedTextField(min, { min = it.filter(Char::isDigit).take(3) }, label = { Text("Раз за день") }, colors = authFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp))
                Column(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState())) {
                    Text(
                        "Нет — отмечаю вручную",
                        color = if (selected == null) Brand.Mint else Brand.Text,
                        modifier = Modifier.fillMaxWidth().clickable { selected = null }.padding(vertical = 8.dp),
                    )
                    LoadableContent(actions) { list ->
                        list.groupBy { it.category }.forEach { (category, items) ->
                            Text(category.uppercase(), color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(top = 8.dp))
                            items.forEach { a ->
                                Text(
                                    (if (selected == a.key) "✓ " else "") + a.label,
                                    color = if (selected == a.key) Brand.Mint else Brand.Text, fontSize = 14.sp,
                                    modifier = Modifier.fillMaxWidth().clickable { selected = a.key }.padding(vertical = 6.dp),
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(selected, (min.toIntOrNull() ?: 1).coerceAtLeast(1)) }) { Text("Сохранить") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        containerColor = Brand.Night,
    )
}

private val GOAL_ACCENTS = listOf(
    listOf(Color(0x661E3A8A), Color(0x55065F46)),
    listOf(Color(0x66713F12), Color(0x557F1D1D)),
    listOf(Color(0x665B21B6), Color(0x551E3A8A)),
    listOf(Color(0x66065F46), Color(0x55134E4A)),
)

private fun ruDate(iso: String): String = runCatching {
    java.time.LocalDate.parse(iso.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("dd.MM.yyyy"))
}.getOrDefault(iso)

@Composable
private fun GoalChip(text: String) {
    Text(text, fontSize = 11.sp, color = Brand.Text.copy(alpha = 0.85f),
        modifier = Modifier.clip(CircleShape).border(1.dp, Color.White.copy(alpha = 0.18f), CircleShape).padding(horizontal = 9.dp, vertical = 3.dp))
}
