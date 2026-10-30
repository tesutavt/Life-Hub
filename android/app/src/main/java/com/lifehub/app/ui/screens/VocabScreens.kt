package com.lifehub.app.ui.screens

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PracticeExercise
import com.lifehub.app.data.VocabItem
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.screens.learn.Grade
import com.lifehub.app.ui.screens.learn.gradeText
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.util.Sound
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import com.lifehub.app.data.LanguageStats
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable private data class PracticeSession(val exercises: List<PracticeExercise> = emptyList())
@Serializable private data class PracticeOutcome(
    @kotlinx.serialization.SerialName("correct_count") val correct: Int = 0,
    @kotlinx.serialization.SerialName("exercises_done") val done: Int = 0,
    @kotlinx.serialization.SerialName("xp_earned") val xp: Int = 0,
    val streak: Int = 0,
)

@Composable
fun VocabScreen(languageId: Int, nav: NavController) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable(languageId) { Api.get<Items<VocabItem>>("/api/life/languages/$languageId/vocab").items }
    var query by remember { mutableStateOf("") }
    var adding by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Словарь", { nav.popBackStack() }) { IconButton(onClick = { adding = true }) { Icon(Icons.Default.Add, "Добавить слово") } }
        LoadableContent(state) { items ->
            Column(Modifier.padding(horizontal = 16.dp)) {
                OutlinedTextField(
                    query, { query = it }, leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("Поиск по словарю") },
                    singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("Всего ${items.size}", Brand.Mint)
                    Chip("К повторению ${items.count { it.isDue }}", Brand.Amber)
                    Chip("Новых ${items.count { it.isNew }}", Brand.Sky)
                }
                ChunkyButton("Тренировка", Modifier.fillMaxWidth(), color = Brand.Amber, shadow = Color(0xFFB45309), textColor = Brand.Deep, enabled = items.isNotEmpty()) {
                    nav.navigate("practice/$languageId")
                }
            }
            val visible = items.filter { query.isBlank() || it.term.contains(query, true) || it.translation.contains(query, true) }
            if (items.isEmpty()) EmptyState("📖", "Словарь пуст", "Добавьте слова кнопкой «+» или пройдите уроки курса, привязанного к этому языку.")
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(visible, key = { it.id }) { word ->
                    LhCard(Modifier.fillMaxWidth(), padding = androidx.compose.foundation.layout.PaddingValues(start = 14.dp, top = 8.dp, bottom = 8.dp, end = 4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(word.term, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                                Text(word.translation, color = Brand.TextMuted)
                                word.note?.let { Text(it, color = Brand.TextFaint, fontSize = 12.sp) }
                            }
                            if (word.isDue) Chip("повторить", Brand.Amber)
                            IconButton(onClick = { scope.launch { runCatching { Api.delete("/api/life/languages/vocab/${word.id}") }; state.reload() } }) {
                                Icon(Icons.Default.Delete, "Удалить", tint = Brand.TextFaint)
                            }
                        }
                    }
                }
            }
        }
    }

    if (adding) {
        var term by remember { mutableStateOf("") }
        var translation by remember { mutableStateOf("") }
        var note by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { adding = false },
            title = { Text("Новое слово") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(term, { term = it }, label = { Text("Слово") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(translation, { translation = it }, label = { Text("Перевод") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(note, { note = it }, label = { Text("Заметка (чтение, пример)") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                TextButton(enabled = term.isNotBlank() && translation.isNotBlank(), onClick = {
                    adding = false
                    scope.launch {
                        runCatching {
                            Api.post("/api/life/languages/$languageId/vocab", buildJsonObject {
                                put("term", term.trim()); put("translation", translation.trim()); if (note.isNotBlank()) put("note", note.trim())
                            })
                        }
                        Achievements.requestCheck()
                        state.reload()
                    }
                }) { Text("Добавить") }
            },
            dismissButton = { TextButton(onClick = { adding = false }) { Text("Отмена") } },
            containerColor = Brand.Night,
        )
    }
}

/** Тренировка словаря (SRS): режимы как в веб-версии — микс, повторение, работа над ошибками, новые слова. */
private data class PracticeMode(val id: String, val emoji: String, val title: String, val hint: String, val count: (LanguageStats) -> Int?)

private val PRACTICE_MODES = listOf(
    PracticeMode("mix", "🎯", "Тренировка", "повторение, ошибки и новые слова") { null },
    PracticeMode("review", "🔁", "Повторение", "слова, которые пора освежить") { it.dueCount },
    PracticeMode("mistakes", "🩹", "Работа над ошибками", "слова, на которых вы ошибались") { it.mistakesCount },
    PracticeMode("new", "🌱", "Новые слова", "ещё ни разу не тренировали") { it.newCount },
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PracticeScreen(languageId: Int, onBack: () -> Unit, onKana: () -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val stats = rememberLoadable(languageId) { Api.get<LanguageStats>("/api/life/languages/$languageId/stats") }
    var mode by remember { mutableStateOf<String?>(null) }
    var size by remember { mutableIntStateOf(10) }
    var attempt by remember { mutableIntStateOf(0) }
    var exercises by remember { mutableStateOf<List<PracticeExercise>?>(null) }
    var index by remember { mutableIntStateOf(0) }
    var answer by remember { mutableStateOf("") }
    var checked by remember { mutableStateOf<Grade?>(null) }
    val results = remember { mutableStateMapOf<Int, Boolean>() }
    var outcome by remember { mutableStateOf<PracticeOutcome?>(null) }
    var saving by remember { mutableStateOf(false) }
    var mistakesRound by remember { mutableIntStateOf(0) }
    var startedAt by remember { mutableStateOf(System.currentTimeMillis()) }

    LaunchedEffect(mode, attempt) {
        val m = mode ?: return@LaunchedEffect
        exercises = null
        val list = runCatching { Api.get<PracticeSession>("/api/life/languages/$languageId/practice/session?size=$size&mode=$m").exercises }.getOrDefault(emptyList())
        index = 0; answer = ""; checked = null; results.clear(); outcome = null; mistakesRound = 0
        startedAt = System.currentTimeMillis()
        exercises = list
        if (list.isEmpty()) mode = null
    }

    BackHandler(enabled = mode != null) { mode = null; stats.reload() }

    Column(Modifier.fillMaxSize().background(Brand.Deep).navigationBarsPadding().imePadding()) {
        BackTopBar(stats.data?.name?.let { "Практика · $it" } ?: "Практика", { if (mode != null) { mode = null; stats.reload() } else onBack() })
        val list = exercises
        when {
            mode == null -> LoadableContent(stats) { s ->
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    LhCard(Modifier.fillMaxWidth()) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("🎯 Цель дня: ${s.xpToday}/${s.dailyGoalXp} XP", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            Text("⏱ ${s.minutesToday} мин · 🔥 ${s.streak}", color = Brand.TextMuted, fontSize = 12.sp)
                        }
                        Spacer(Modifier.height(6.dp))
                        ProgressBar(s.xpToday.toFloat() / s.dailyGoalXp.coerceAtLeast(1), colors = listOf(Brand.Amber, Brand.Rose))
                        Spacer(Modifier.height(8.dp))
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf(20, 50, 100, 150).forEach { goal ->
                                Chip("$goal XP", if (s.dailyGoalXp == goal) Brand.Amber else Brand.TextMuted, Modifier.clickable {
                                    scope.launch {
                                        runCatching { Api.put("/api/life/languages/$languageId", buildJsonObject { put("daily_goal_xp", goal) }) }
                                        stats.reload()
                                    }
                                })
                            }
                        }
                    }
                    if (s.wordsTotal == 0) {
                        EmptyState("📖", "Словарь пуст", "Добавьте слова или пройдите урок курса-тренировки — слова попадут сюда сами.")
                    }
                    PRACTICE_MODES.forEach { m ->
                        val count = m.count(s)
                        val disabled = count == 0 || s.wordsTotal == 0
                        LhCard(Modifier.fillMaxWidth(), onClick = if (disabled) null else ({ mode = m.id; attempt += 1 }), background = if (disabled) Brand.Card.copy(alpha = 0.5f) else Brand.Card) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(m.emoji, fontSize = 30.sp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text(m.title, fontWeight = FontWeight.Bold, color = if (disabled) Brand.TextFaint else Brand.Text)
                                    Text(m.hint, color = Brand.TextMuted, fontSize = 12.sp)
                                }
                                count?.let { Chip("$it", Brand.Sky) }
                            }
                        }
                    }
                    if (Regex("япон|japan|日本", RegexOption.IGNORE_CASE).containsMatchIn(s.name)) {
                        LhCard(Modifier.fillMaxWidth(), onClick = onKana, border = Brand.Rose.copy(alpha = 0.4f), background = Brand.Rose.copy(alpha = 0.08f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("あ", fontSize = 30.sp)
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("Кана-тренажёр", fontWeight = FontWeight.Bold)
                                    Text("Хирагана и катакана. Ошибки повторяются чаще. Засчитывается в цель дня и стрик.", color = Brand.TextMuted, fontSize = 12.sp)
                                }
                            }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text("Слов за раунд:", color = Brand.TextMuted, fontSize = 13.sp)
                        listOf(5, 10, 20).forEach { n -> Chip("$n", if (size == n) Brand.Mint else Brand.TextMuted, Modifier.clickable { size = n }) }
                    }
                }
            }
            list == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Brand.Amber) }
            outcome != null -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                val o = outcome!!
                Text(if (o.correct == o.done) "💯" else "🎉", fontSize = 72.sp)
                Text("${o.correct} из ${o.done} верно", fontSize = 26.sp, fontWeight = FontWeight.ExtraBold)
                Text("+${o.xp} XP · 🔥 серия ${o.streak} дн.", color = Brand.Amber, modifier = Modifier.padding(top = 6.dp))
                Spacer(Modifier.height(28.dp))
                ChunkyButton("Ещё раунд", Modifier.fillMaxWidth()) { attempt += 1 }
                if (mistakesRound > 0 && mode != "mistakes") {
                    TextButton(onClick = { mode = "mistakes"; attempt += 1 }) { Text("🩹 Работа над ошибками") }
                }
                TextButton(onClick = { mode = null; stats.reload() }) { Text("Другой режим") }
            }
            else -> {
                val ex = list[index]
                val reverse = ex.direction == "reverse"
                val variants = listOf(ex.answer) + ex.answer.split(',', ';', '/').map { it.trim() }.filter { it.isNotEmpty() }
                fun submit(value: String) {
                    val g = if (ex.type == "choice") (if (value == ex.answer) Grade.Exact else Grade.Wrong) else gradeText(value, variants)
                    if (g != Grade.Wrong) Sound.correct(context) else { Sound.wrong(context); mistakesRound += 1 }
                    results.putIfAbsent(ex.vocabId, g != Grade.Wrong)
                    checked = g
                }
                fun next() {
                    if (index + 1 < list.size) {
                        index += 1; answer = ""; checked = null
                    } else {
                        saving = true
                        scope.launch {
                            try {
                                val body = buildJsonObject {
                                    put("results", JsonArray(results.map { (id, ok) -> buildJsonObject { put("vocab_id", id); put("correct", ok) } }))
                                    put("duration_sec", ((System.currentTimeMillis() - startedAt) / 1000).toInt())
                                }
                                outcome = Api.decode(Api.post("/api/life/languages/$languageId/practice/complete", body))
                                Sound.finish(context)
                                Achievements.requestCheck()
                            } catch (_: Exception) {
                            } finally {
                                saving = false
                            }
                        }
                    }
                }
                Column(Modifier.fillMaxSize().padding(16.dp)) {
                    ProgressBar(index.toFloat() / list.size, height = 12.dp, colors = listOf(Brand.Amber, Brand.Amber))
                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        ex.unitLabel?.let { Text(it.uppercase(), color = Brand.TextFaint, fontSize = 11.sp) }
                        Text(
                            when {
                                reverse && ex.type == "choice" -> "Как это на языке «${stats.data?.name ?: ""}»?"
                                reverse -> "Напишите на языке «${stats.data?.name ?: ""}»"
                                ex.type == "choice" -> "Выберите перевод"
                                else -> "Переведите"
                            },
                            fontSize = 20.sp, fontWeight = FontWeight.Bold,
                        )
                        Text(ex.term, fontSize = 34.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.border(2.dp, Brand.Ink.copy(alpha = 0.15f), RoundedCornerShape(14.dp)).padding(horizontal = 16.dp, vertical = 8.dp))
                        if (ex.type == "choice") {
                            ex.options.forEach { option ->
                                val color = when {
                                    checked != null && option == ex.answer -> Brand.Green
                                    checked == Grade.Wrong && option == answer -> Brand.Rose
                                    option == answer -> Brand.Sky
                                    else -> Brand.Ink.copy(alpha = 0.15f)
                                }
                                Text(
                                    option, fontSize = 17.sp,
                                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).border(2.dp, color, RoundedCornerShape(14.dp))
                                        .clickable(enabled = checked == null) { answer = option; submit(option) }.padding(16.dp),
                                )
                            }
                        } else {
                            OutlinedTextField(answer, { answer = it }, enabled = checked == null, placeholder = { Text(if (reverse) "Слово" else "Перевод") }, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                        }
                        checked?.let { g ->
                            Text(
                                when (g) {
                                    Grade.Exact -> "Верно! 🎉"
                                    Grade.Typo -> "Засчитано, но с опечаткой: ${ex.answer}"
                                    Grade.Wrong -> "Правильно: ${ex.answer}"
                                },
                                color = if (g == Grade.Wrong) Brand.Rose else Brand.Green, fontWeight = FontWeight.Bold, fontSize = 18.sp,
                            )
                            ex.note?.let { Text(it, color = Brand.TextMuted, fontSize = 13.sp) }
                        }
                    }
                    when {
                        saving -> Box(Modifier.fillMaxWidth().padding(12.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Brand.Amber) }
                        checked != null -> ChunkyButton("Дальше", Modifier.fillMaxWidth(), color = if (checked != Grade.Wrong) Brand.Green else Brand.Rose, shadow = Color.Black.copy(alpha = 0.3f)) { next() }
                        ex.type != "choice" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            ChunkyButton("Не помню", Modifier.weight(1f), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f), textColor = Brand.TextMuted) { answer = ""; submit("\u0000") }
                            ChunkyButton("Проверить", Modifier.weight(1.4f), enabled = answer.isNotBlank()) { submit(answer) }
                        }
                    }
                }
            }
        }
    }
}

