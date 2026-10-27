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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.navigation.NavController
import com.lifehub.app.data.Api
import com.lifehub.app.data.CourseTree
import com.lifehub.app.data.CourseUnit
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.LanguageStats
import com.lifehub.app.data.LearnCourse
import com.lifehub.app.data.LessonNode
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
import com.lifehub.app.ui.theme.parseHex
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.coroutines.coroutineScope

private data class LearnData(val languages: List<Language>, val stats: Map<Int, LanguageStats>, val courses: List<LearnCourse>)

private val UNIT_COLORS = listOf("#58cc02", "#1cb0f6", "#ce82ff", "#ff9600", "#ff4b4b", "#2b70c9", "#00cd9c")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LearnScreen(nav: NavController) {
    val state = rememberLoadable {
        coroutineScope {
            val languages = async { Api.get<Items<Language>>("/api/life/languages").items }
            val courses = async { Api.get<Items<LearnCourse>>("/api/learn/courses").items }
            val langs = languages.await()
            val stats = langs.associate { it.id to async { runCatching { Api.get<LanguageStats>("/api/life/languages/${it.id}/stats") }.getOrNull() } }
            LearnData(langs, stats.mapNotNull { (id, d) -> d.await()?.let { id to it } }.toMap(), courses.await())
        }
    }
    LifecycleResumeEffect(Unit) {
        state.reload()
        onPauseOrDispose { }
    }
    val scope = rememberCoroutineScope()
    val extraMinutes = remember { mutableStateMapOf<Int, Int>() }
    var editingLanguage by remember { mutableStateOf<Language?>(null) }
    var addingLanguage by remember { mutableStateOf(false) }
    var importing by remember { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = { state.reload() }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(16.dp)) {
            Text("Учёба", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
            Text("Языки, словарь и уроки в стиле Duolingo", color = Brand.TextMuted)
            Spacer(Modifier.height(8.dp))
            LoadableContent(state) { data ->
                SectionTitle("Языки") {
                    Text("+ язык", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { addingLanguage = true }.padding(horizontal = 6.dp, vertical = 2.dp))
                }
                if (data.languages.isEmpty()) EmptyState("🗣️", "Языков пока нет", "Добавьте язык — появятся словарь, тренировки и программа курсов.")
                run {
                    data.languages.forEachIndexed { index, language ->
                        val stats = data.stats[language.id]
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), padding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
                            // Баннер языка, как в веб
                            LanguageBannerCard(language, index, Modifier.clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))) { editingLanguage = language }
                            Column(Modifier.padding(14.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                                        Text("Сегодня: ${extraMinutes[language.id] ?: language.minutesToday} мин", fontSize = 13.sp)
                                        Spacer(Modifier.width(8.dp))
                                        Text(
                                            "+15 мин",
                                            fontSize = 12.sp,
                                            color = Brand.Mint,
                                            modifier = Modifier.clip(CircleShape).background(Brand.Mint.copy(alpha = 0.15f)).clickable {
                                                scope.launch {
                                                    runCatching {
                                                        val res = Api.post("/api/life/languages/${language.id}/minutes", buildJsonObject { put("minutes", 15) })
                                                        res.jsonObject["minutes_today"]?.jsonPrimitive?.intOrNull?.let { extraMinutes[language.id] = it }
                                                    }
                                                }
                                            }.padding(horizontal = 8.dp, vertical = 2.dp),
                                        )
                                    }
                                }
                                Text("⋯", fontSize = 20.sp, color = Brand.TextMuted, modifier = Modifier.padding(start = 6.dp).clip(CircleShape).clickable { editingLanguage = language }.padding(horizontal = 8.dp))
                            }
                            if (stats != null) {
                                Spacer(Modifier.height(10.dp))
                                Text("Цель дня: ${stats.xpToday}/${stats.dailyGoalXp} XP", fontSize = 13.sp, color = Brand.TextMuted)
                                Spacer(Modifier.height(4.dp))
                                ProgressBar(stats.xpToday.toFloat() / stats.dailyGoalXp.coerceAtLeast(1), colors = listOf(Brand.Amber, Brand.Rose))
                            }
                            Spacer(Modifier.height(12.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                val due = (stats?.dueCount ?: 0) + (stats?.newCount ?: 0)
                                ChunkyButton(if (due > 0) "Тренировка · $due" else "Тренировка", Modifier.weight(1f), color = Brand.Amber, shadow = Color(0xFFB45309), textColor = Brand.Deep) {
                                    nav.navigate("practice/${language.id}")
                                }
                                ChunkyButton("Словарь", Modifier.weight(1f), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f)) { nav.navigate("vocab/${language.id}") }
                            }
                            if (language.courses.isNotEmpty()) {
                                Spacer(Modifier.height(10.dp))
                                val multiStage = language.courses.map { it.programStage }.distinct().size > 1
                                language.courses.sortedBy { it.programStage }.forEach { c ->
                                    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                                        if (multiStage) Text("${c.programStage}", color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.width(16.dp))
                                        Text(if (c.locked) "🔒 ${c.title}" else c.title, fontSize = 13.sp, color = if (c.locked) Brand.TextFaint else Color.White, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                                        Text("${c.progress}%", fontSize = 12.sp, color = Brand.TextMuted)
                                    }
                                }
                                Text(
                                    "Программа: порядок и этапы курсов →",
                                    color = Brand.Mint, fontSize = 13.sp,
                                    modifier = Modifier.padding(top = 6.dp).clickable { nav.navigate("program/${language.id}") },
                                )
                            }
                            }
                        }
                    }
                }

                SectionTitle("Курсы-тренировки") {
                    Text("⬆ импорт", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { importing = true }.padding(horizontal = 6.dp, vertical = 2.dp))
                }
                if (data.courses.isEmpty()) {
                    EmptyState("🦉", "Пока нет курсов", "Импортируйте JSON-курс кнопкой «импорт» — он сразу появится здесь.")
                }
                data.courses.forEach { course ->
                    val color = parseHex(course.color, Brand.Green)
                    LhCard(Modifier.fillMaxWidth().padding(bottom = 10.dp), onClick = { nav.navigate("course/${course.id}") }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(color.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
                                Text(course.icon ?: "📘", fontSize = 30.sp)
                            }
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(course.title, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text("${course.unitsCount} разд. · ${course.lessonsDone}/${course.lessonsTotal} уроков · ⚡${course.xpTotal}", color = Brand.TextMuted, fontSize = 12.sp)
                                if (course.locked) Text("🔒 ${course.lockReason ?: "Закрыт программой обучения"}", color = Brand.Amber, fontSize = 12.sp)
                                Spacer(Modifier.height(6.dp))
                                ProgressBar(course.progressPct / 100f, colors = listOf(color, color))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(20.dp))
                if (addingLanguage) LanguageDialog(null, { addingLanguage = false }) { addingLanguage = false; state.reload() }
                editingLanguage?.let { l -> LanguageDialog(l, { editingLanguage = null }) { editingLanguage = null; state.reload() } }
                if (importing) CourseImportDialog(data.languages, { importing = false }) { importing = false; state.reload() }
            }
        }
    }
}

/** Дорожка уроков курса: разделы и «змейка» узлов, как в Duolingo. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoursePathScreen(courseId: Int, nav: NavController) {
    val state = rememberLoadable(courseId) { Api.get<CourseTree>("/api/learn/courses/$courseId") }
    var selected by remember { mutableStateOf<Pair<LessonNode, Color>?>(null) }
    var selectedCheckpoint by remember { mutableStateOf<Pair<CourseUnit, Color>?>(null) }
    var guide by remember { mutableStateOf<CourseUnit?>(null) }
    LifecycleResumeEffect(courseId) {
        state.reload()
        onPauseOrDispose { }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar(state.data?.course?.title ?: "Курс", { nav.popBackStack() })
        LoadableContent(state) { tree ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
                item {
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 16.dp)) {
                        Text(tree.course.icon ?: "📘", fontSize = 30.sp)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text("${tree.course.lessonsDone}/${tree.course.lessonsTotal} уроков · ⚡ ${tree.course.xpTotal} XP", color = Brand.TextMuted, fontSize = 13.sp)
                            val langId = tree.course.languageId
                            if (langId != null && (tree.course.speechLang ?: "").lowercase().startsWith("ja")) {
                                Text("あ Кана-тренажёр →", color = Brand.Rose, fontSize = 13.sp, modifier = Modifier.padding(top = 2.dp).clickable { nav.navigate("kana/$langId") })
                            }
                            Spacer(Modifier.height(4.dp))
                            ProgressBar(tree.course.progressPct / 100f, colors = listOf(Brand.Green, Brand.Green))
                        }
                    }
                    if (tree.course.locked) {
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 12.dp), border = Brand.Amber.copy(alpha = 0.4f), background = Brand.Amber.copy(alpha = 0.1f)) {
                            Text("🔒 Курс пока закрыт программой обучения", fontWeight = FontWeight.Bold, color = Brand.Amber)
                            tree.course.lockReason?.let { Text(it, color = Brand.TextMuted, fontSize = 13.sp) }
                        }
                    }
                }
                tree.units.forEachIndexed { unitIndex, unit ->
                    val color = parseHex(unit.color ?: UNIT_COLORS[unitIndex % UNIT_COLORS.size], Brand.Green)
                    item(key = "u${unit.id}") {
                        Row(
                            Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 18.dp).clip(RoundedCornerShape(18.dp)).background(color).padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text("РАЗДЕЛ ${unitIndex + 1} · ${unit.doneCount}/${unit.lessons.size}", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.White.copy(alpha = 0.85f))
                                Text(unit.title, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color.White)
                                unit.description?.let { Text(it, fontSize = 13.sp, color = Color.White.copy(alpha = 0.9f), maxLines = 2) }
                            }
                            if (!unit.guide.isNullOrBlank()) {
                                IconButton(onClick = { guide = unit }) { Icon(Icons.Default.MenuBook, "Справочник", tint = Color.White) }
                            }
                        }
                    }
                    items(unit.lessons.withIndex().toList(), key = { "l${it.value.id}" }) { (index, lesson) ->
                        val offsets = listOf(0, 50, 80, 50, 0, -50, -80, -50)
                        Box(Modifier.fillMaxWidth().padding(vertical = 8.dp), contentAlignment = Alignment.Center) {
                            val shown = if (tree.course.locked) lesson.copy(status = "locked") else lesson
                            LessonNodeButton(shown, color, Modifier.offset(x = offsets[index % offsets.size].dp)) { selected = shown to color }
                        }
                    }
                    if (unit.lessons.isNotEmpty() && unit.checkpoint != null) {
                        item(key = "cp${unit.id}") {
                            Box(Modifier.fillMaxWidth().padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
                                CheckpointNodeButton(unit, color, tree.course.locked) { selectedCheckpoint = unit to color }
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(40.dp)) }
            }
        }
    }

    selected?.let { (lesson, color) ->
        ModalBottomSheet(onDismissRequest = { selected = null }, containerColor = Brand.Night) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
                Text(lesson.title, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                Text(
                    if (lesson.status == "locked") "Сначала пройдите предыдущие уроки — или попробуйте всё равно." else lesson.description ?: "${lesson.wordsCount} новых слов",
                    color = Brand.TextMuted,
                )
                Spacer(Modifier.height(18.dp))
                val label = when (lesson.status) {
                    "done" -> "Повторить +${(lesson.xp + 1) / 2} XP"
                    "locked" -> "Всё равно попробовать"
                    else -> "Начать +${lesson.xp} XP"
                }
                if (state.data?.course?.locked == true) return@Column
                ChunkyButton(label, Modifier.fillMaxWidth(), color = if (lesson.status == "locked") Brand.Slate else color, shadow = Color.Black.copy(alpha = 0.35f)) {
                    selected = null
                    nav.navigate("lesson/${lesson.id}")
                }
            }
        }
    }

    selectedCheckpoint?.let { (unit, color) ->
        val cp = unit.checkpoint!!
        val locked = state.data?.course?.locked == true
        ModalBottomSheet(onDismissRequest = { selectedCheckpoint = null }, containerColor = Brand.Night) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 32.dp)) {
                Text("🏰 Контрольная раздела", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                Text(
                    when {
                        locked -> "Курс пока закрыт программой обучения."
                        cp.passed -> "Сдана с результатом ${cp.bestScore}%. Можно пересдать, чтобы освежить материал."
                        else -> "Случайные задания из всех уроков раздела, без подсказок и сердечек. Наберите ${cp.passScore}% — и следующий раздел откроется."
                    },
                    color = Brand.TextMuted,
                )
                if (!cp.passed && unit.doneCount < unit.lessons.size && !locked) {
                    Text("Уроки ещё не все пройдены — можно сдать заранее.", color = Brand.Amber, fontSize = 13.sp, modifier = Modifier.padding(top = 4.dp))
                }
                if (cp.attempts > 0) Text("Попыток: ${cp.attempts} · лучший результат ${cp.bestScore}%", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                if (!locked) {
                    Spacer(Modifier.height(18.dp))
                    ChunkyButton(if (cp.passed) "Пересдать" else "Начать контрольную", Modifier.fillMaxWidth(), color = if (cp.passed) Color(0xFFCD9900) else color, shadow = Color.Black.copy(alpha = 0.35f)) {
                        selectedCheckpoint = null
                        nav.navigate("checkpoint/${unit.id}")
                    }
                }
            }
        }
    }

    guide?.let { unit ->
        AlertDialog(
            onDismissRequest = { guide = null },
            confirmButton = { TextButton(onClick = { guide = null }) { Text("Понятно") } },
            title = { Text(unit.title) },
            text = { Text(unit.guide.orEmpty(), modifier = Modifier.verticalScroll(rememberScrollState())) },
            containerColor = Brand.Night,
        )
    }
}

@Composable
private fun LessonNodeButton(lesson: LessonNode, color: Color, modifier: Modifier, onClick: () -> Unit) {
    val (bg, shadow) = when (lesson.status) {
        "locked" -> Color(0xFF37464F) to Color(0xFF232F36)
        "done" -> Color(0xFFFFC800) to Color(0xFFCD9900)
        else -> color to color.copy(alpha = 0.6f)
    }
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(width = 88.dp, height = 82.dp), contentAlignment = Alignment.Center) {
            if (lesson.status == "current") {
                Box(Modifier.size(width = 88.dp, height = 82.dp).clip(CircleShape).border(4.dp, color.copy(alpha = 0.45f), CircleShape))
            }
            Box(Modifier.size(width = 72.dp, height = 66.dp).offset(y = 5.dp).clip(CircleShape).background(shadow))
            Box(
                Modifier.size(width = 72.dp, height = 66.dp).clip(CircleShape).background(bg).clickable(onClick = onClick),
                contentAlignment = Alignment.Center,
            ) {
                when (lesson.status) {
                    "locked" -> Icon(Icons.Default.Lock, null, tint = Color.White.copy(alpha = 0.4f), modifier = Modifier.size(30.dp))
                    "done" -> Icon(if (lesson.bestScore >= 100) Icons.Default.Star else Icons.Default.Check, null, tint = Color.White, modifier = Modifier.size(36.dp))
                    else -> Icon(Icons.Default.Star, null, tint = Color.White, modifier = Modifier.size(36.dp))
                }
            }
        }
        if (lesson.status == "current") {
            Text("НАЧАТЬ", color = color, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun CheckpointNodeButton(unit: CourseUnit, color: Color, courseLocked: Boolean, onClick: () -> Unit) {
    val cp = unit.checkpoint ?: return
    val allDone = unit.doneCount >= unit.lessons.size
    val bg = when {
        cp.passed -> Color(0xFFFFC800)
        courseLocked -> Color(0xFF37464F)
        allDone -> color
        else -> Color(0xFF4B5C66)
    }
    Box(Modifier.size(width = 100.dp, height = 92.dp), contentAlignment = Alignment.TopCenter) {
        Box(Modifier.size(width = 96.dp, height = 84.dp).offset(y = 6.dp).clip(RoundedCornerShape(28.dp)).background(if (cp.passed) Color(0xFFCD9900) else Color.Black.copy(alpha = 0.35f)))
        Column(
            Modifier.size(width = 96.dp, height = 84.dp).clip(RoundedCornerShape(28.dp)).background(bg).clickable(onClick = onClick),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(if (cp.passed) "🏆" else "🏰", fontSize = 34.sp)
            if (cp.attempts > 0) Text("${cp.bestScore}%", fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
        }
    }
}
