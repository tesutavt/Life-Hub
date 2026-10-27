package com.lifehub.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.data.Program
import com.lifehub.app.data.ProgramCourse
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

private class DraftStage(title: String, unlockPct: Int, courses: List<Int>) {
    var title by mutableStateOf(title)
    var unlockPct by mutableStateOf(unlockPct)
    val courses = mutableStateListOf<Int>().apply { addAll(courses) }
}

/** Программа языка: этапы курсов (параллельно внутри этапа, следующий открывается по проценту предыдущего). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProgramScreen(languageId: Int, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable(languageId) { Api.get<Program>("/api/life/languages/$languageId/program") }
    val stages = remember { mutableStateListOf<DraftStage>() }
    var courses by remember { mutableStateOf<Map<Int, ProgramCourse>>(emptyMap()) }
    var saving by remember { mutableStateOf(false) }

    LaunchedEffect(state.data) {
        val program = state.data ?: return@LaunchedEffect
        courses = program.stages.flatMap { it.courses }.associateBy { it.id }
        stages.clear()
        stages.addAll(program.stages.map { DraftStage(it.title, if (it.stage == 1) 100 else it.unlockPct, it.courses.map { c -> c.id }) })
    }

    fun move(courseId: Int, target: Int) {
        stages.forEach { it.courses.remove(courseId) }
        if (target >= stages.size) stages.add(DraftStage("Этап ${stages.size + 1}", 100, listOf(courseId)))
        else stages[target].courses.add(courseId)
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Программа обучения", onBack)
        LoadableContent(state) { _ ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
                Text(
                    "Курсы одного этапа проходятся параллельно. Первый этап открыт сразу, следующий — когда предыдущий пройден на нужный процент.",
                    color = Brand.TextMuted, fontSize = 13.sp,
                )
                if (courses.isEmpty()) {
                    EmptyState("📚", "У языка нет курсов", "Привяжите курсы к языку в веб-версии на странице «Курсы».")
                    return@Column
                }
                Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Chip("Всё сразу", Brand.Sky, Modifier.clickable {
                        val all = stages.flatMap { it.courses }
                        stages.clear(); stages.add(DraftStage("Всё сразу", 100, all))
                    })
                    Chip("По очереди", Brand.Sky, Modifier.clickable {
                        val all = stages.flatMap { it.courses }
                        stages.clear(); all.forEach { id -> stages.add(DraftStage(courses[id]?.title ?: "Этап", 100, listOf(id))) }
                    })
                }
                stages.forEachIndexed { index, stage ->
                    LhCard(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(28.dp).clip(CircleShape).background(Brand.Mint), contentAlignment = Alignment.Center) {
                                Text("${index + 1}", color = Brand.Deep, fontWeight = FontWeight.Bold)
                            }
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(stage.title, { stage.title = it }, singleLine = true, colors = authFieldColors(), modifier = Modifier.weight(1f))
                            if (stages.size > 1) {
                                Text("✕", color = Brand.TextFaint, modifier = Modifier.padding(8.dp).clickable {
                                    val removed = stages.removeAt(index)
                                    stages[(index - 1).coerceAtLeast(0)].courses.addAll(removed.courses)
                                })
                            }
                        }
                        if (index > 0) {
                            Text("Откроется, когда этап $index пройден на:", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                                listOf(0, 25, 50, 75, 100).forEach { pct ->
                                    Chip(if (pct == 0) "сразу" else "$pct%", if (stage.unlockPct == pct) Brand.Mint else Brand.TextMuted, Modifier.clickable { stage.unlockPct = pct })
                                }
                            }
                        }
                        stage.courses.toList().forEach { id ->
                            val course = courses[id] ?: return@forEach
                            Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text((if (course.learnCourseId != null) "🦉 " else "📘 ") + course.title, fontSize = 14.sp, modifier = Modifier.weight(1f))
                                    Text("${course.progress}%", color = Brand.TextMuted, fontSize = 12.sp)
                                }
                                ProgressBar(course.progress / 100f, height = 4.dp)
                                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
                                    Text("Этап:", color = Brand.TextFaint, fontSize = 12.sp)
                                    stages.indices.forEach { i ->
                                        Chip("${i + 1}", if (i == index) Brand.Mint else Brand.TextMuted, Modifier.clickable { move(id, i) })
                                    }
                                    Chip("+ новый", Brand.TextMuted, Modifier.clickable { move(id, stages.size) })
                                }
                            }
                        }
                        if (stage.courses.isEmpty()) Text("Пустой этап — при сохранении удалится", color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
                    }
                }
                ChunkyButton(if (saving) "Сохраняем…" else "Сохранить программу", Modifier.fillMaxWidth(), enabled = !saving) {
                    saving = true
                    scope.launch {
                        runCatching {
                            Api.put("/api/life/languages/$languageId/program", buildJsonObject {
                                putJsonArray("stages") {
                                    stages.forEach { s ->
                                        add(buildJsonObject {
                                            put("title", s.title); put("unlock_pct", s.unlockPct)
                                            putJsonArray("course_ids") { s.courses.forEach { add(it) } }
                                        })
                                    }
                                }
                            })
                        }
                        saving = false
                        onBack()
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}
