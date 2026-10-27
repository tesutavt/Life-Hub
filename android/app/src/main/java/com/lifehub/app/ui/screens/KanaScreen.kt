package com.lifehub.app.ui.screens

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.screens.learn.KANA_BASE_URL
import com.lifehub.app.ui.screens.learn.KANA_GROUPS
import com.lifehub.app.ui.screens.learn.KANA_REPLACEMENTS
import com.lifehub.app.ui.screens.learn.KANA_SETS
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Состояние тренажёра на этом устройстве (как в веб-версии — localStorage). */
@Serializable
private data class KanaState(
    val sets: List<String> = listOf("hsingle"),
    val mistakes: Map<String, Int> = emptyMap(),
    val totalAnswered: Int = 0,
    val totalCorrect: Int = 0,
)

private fun prefsKey(languageId: Int) = "kana_state_$languageId"

private fun loadState(context: Context, languageId: Int): KanaState =
    runCatching {
        Api.json.decodeFromString<KanaState>(context.getSharedPreferences("lifehub", Context.MODE_PRIVATE).getString(prefsKey(languageId), null)!!)
    }.getOrDefault(KanaState())

private fun saveState(context: Context, languageId: Int, state: KanaState) {
    context.getSharedPreferences("lifehub", Context.MODE_PRIVATE).edit().putString(prefsKey(languageId), Api.json.encodeToString(state)).apply()
}

/** Очередь круга: сложные знаки (с ошибками) попадают в неё 2–3 раза. */
private fun buildQueue(state: KanaState): MutableList<Pair<String, String>> {
    val active = state.sets.mapNotNull { KANA_SETS[it] }.flatMap { it.entries }.ifEmpty { KANA_SETS.getValue("hsingle").entries }
    val weak = active.filter { (state.mistakes[it.first] ?: 0) > 0 }
    val veryWeak = weak.filter { (state.mistakes[it.first] ?: 0) > 2 }
    return (active + weak + veryWeak).shuffled().toMutableList()
}

private const val SAVE_EVERY = 25

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun KanaScreen(languageId: Int, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf(loadState(context, languageId)) }
    val queue = remember { buildQueue(state) }
    var current by remember { mutableStateOf(queue.removeAt(0)) }
    var input by remember { mutableStateOf("") }
    var wrong by remember { mutableStateOf(false) }
    var peek by remember { mutableStateOf(false) }
    var stroke by remember { mutableStateOf(false) }
    var showSets by remember { mutableStateOf(false) }
    var roundTotal by remember { mutableIntStateOf(0) }
    var roundCorrect by remember { mutableIntStateOf(0) }
    var savedXp by remember { mutableIntStateOf(0) }
    val pending = remember { intArrayOf(0, 0) } // всего, верно — ещё не отправлено
    val startedAt = remember { longArrayOf(System.currentTimeMillis()) }
    val focus = remember { FocusRequester() }

    fun update(next: KanaState) {
        state = next
        saveState(context, languageId, next)
    }

    fun flush(target: CoroutineScope = scope) {
        val total = pending[0]
        val correct = pending[1]
        if (total == 0) return
        pending[0] = 0; pending[1] = 0
        val duration = ((System.currentTimeMillis() - startedAt[0]) / 1000).toInt()
        startedAt[0] = System.currentTimeMillis()
        target.launch {
            runCatching {
                val res = Api.post("/api/life/languages/$languageId/kana", buildJsonObject {
                    put("total", total); put("correct", correct); put("duration_sec", duration)
                })
                savedXp += (res as? kotlinx.serialization.json.JsonObject)?.get("xp_earned")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() } ?: 0
                Achievements.requestCheck()
            }.onFailure { pending[0] += total; pending[1] += correct }
        }
    }

    // Выход с экрана — засчитываем остаток (уже вне жизненного цикла экрана)
    @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
    DisposableEffect(Unit) { onDispose { flush(GlobalScope) } }

    fun next() {
        if (queue.isEmpty()) queue.addAll(buildQueue(state))
        if (queue.size > 1 && queue.first().first == current.first) queue.add(queue.removeAt(0))
        current = queue.removeAt(0)
        input = ""; wrong = false; peek = false; stroke = false
    }

    fun answered(firstTry: Boolean) {
        roundTotal += 1
        pending[0] += 1
        if (firstTry) { roundCorrect += 1; pending[1] += 1 }
        val left = (state.mistakes[current.first] ?: 0) - 1
        val mistakes = if (firstTry && left >= 0) (if (left == 0) state.mistakes - current.first else state.mistakes + (current.first to left)) else state.mistakes
        update(state.copy(mistakes = mistakes, totalAnswered = state.totalAnswered + 1, totalCorrect = state.totalCorrect + if (firstTry) 1 else 0))
        if (pending[0] >= SAVE_EVERY) flush()
        next()
    }

    fun onInput(value: String) {
        input = value
        val answer = value.trim().lowercase()
        if (answer.isEmpty()) return
        val options = listOf(current.second) + (KANA_REPLACEMENTS[current.second] ?: emptyList())
        if (answer in options) { answered(!wrong); return }
        // Ни один вариант так не начинается — ошибка, показываем ответ
        if (options.none { it.startsWith(answer) } && !wrong) {
            wrong = true
            update(state.copy(mistakes = state.mistakes + (current.first to ((state.mistakes[current.first] ?: 0) + 1))))
        }
    }

    fun playSound() {
        runCatching {
            MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
                setDataSource("$KANA_BASE_URL/audio/${current.second}.mp3")
                setOnPreparedListener { it.start() }
                setOnCompletionListener { it.release() }
                setOnErrorListener { mp, _, _ -> mp.release(); true }
                prepareAsync()
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep).navigationBarsPadding().imePadding()) {
        BackTopBar("Кана-тренажёр", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LhCard(Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Раунд: $roundCorrect из $roundTotal с первой попытки" + if (savedXp > 0) " · +$savedXp XP" else "", modifier = Modifier.weight(1f), fontSize = 14.sp)
                    Chip("Засчитать", Brand.Amber, Modifier.clickable { flush() })
                }
            }
            Box(
                Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(24.dp)).background(Brand.Card)
                    .border(1.dp, if (wrong) Brand.Rose.copy(alpha = 0.6f) else Color.White.copy(alpha = 0.08f), RoundedCornerShape(24.dp))
                    .clickable { peek = !peek },
                contentAlignment = Alignment.Center,
            ) {
                if (stroke && current.first.length == 1) {
                    AsyncImage("$KANA_BASE_URL/stroke/${current.first}.gif", "Порядок черт", modifier = Modifier.size(160.dp))
                } else {
                    Text(current.first, fontSize = if (current.first.length > 1) 88.sp else 120.sp, color = Color.White)
                }
                if (peek || wrong) Text(current.second, color = if (wrong) Brand.Rose else Brand.TextMuted, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp))
            }
            OutlinedTextField(
                input, ::onInput,
                placeholder = { Text("Ромадзи: a, ka, shi…") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Next, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onNext = { if (wrong) answered(false) }),
                colors = authFieldColors(),
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 22.sp, textAlign = TextAlign.Center),
                modifier = Modifier.fillMaxWidth().focusRequester(focus),
            )
            if (wrong) {
                Text("${current.first} = ${current.second} — введите правильно или нажмите «Дальше»", color = Brand.Rose, fontSize = 14.sp)
                ChunkyButton("Дальше", Modifier.fillMaxWidth(), color = Brand.Rose, shadow = Color(0xFF9F1239)) { answered(false) }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("🔊 Звук", Brand.Sky, Modifier.clickable { playSound() })
                if (current.first.length == 1) Chip("✍️ Порядок черт", Brand.Violet, Modifier.clickable { stroke = !stroke })
                Chip("👁 Подсмотреть", Brand.TextMuted, Modifier.clickable { peek = !peek })
            }
            if (state.mistakes.isNotEmpty()) {
                Text("Сложные — будут чаще:", color = Brand.TextFaint, fontSize = 12.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    state.mistakes.entries.sortedByDescending { it.value }.take(20).forEach { Chip(it.key, Brand.Rose) }
                }
            }
            Text("Всего: ${state.totalCorrect} из ${state.totalAnswered} · засчитывается каждые $SAVE_EVERY знаков и при выходе", color = Brand.TextFaint, fontSize = 12.sp)

            SectionTitle("Какие знаки тренировать") {
                TextButton(onClick = { showSets = !showSets }) { Text(if (showSets) "скрыть" else "показать") }
            }
            if (showSets) {
                KANA_GROUPS.forEach { group ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(group.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        TextButton(onClick = { update(state.copy(sets = (state.sets + group.sets.map { it.id }).distinct())) }) { Text("все") }
                        TextButton(onClick = {
                            val left = state.sets - group.sets.map { it.id }.toSet()
                            update(state.copy(sets = left.ifEmpty { listOf("hsingle") }))
                        }) { Text("снять") }
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        group.sets.forEach { set ->
                            val on = set.id in state.sets
                            Text(
                                set.entries.take(3).joinToString("") { it.first },
                                fontSize = 16.sp,
                                modifier = Modifier.clip(RoundedCornerShape(10.dp))
                                    .background(if (on) Brand.Mint.copy(alpha = 0.25f) else Color.White.copy(alpha = 0.06f))
                                    .border(1.dp, if (on) Brand.Mint else Color.Transparent, RoundedCornerShape(10.dp))
                                    .clickable {
                                        val next = if (on) state.sets - set.id else state.sets + set.id
                                        update(state.copy(sets = next.ifEmpty { listOf("hsingle") }))
                                        queue.clear()
                                    }
                                    .padding(horizontal = 10.dp, vertical = 6.dp),
                            )
                        }
                    }
                    Spacer(Modifier.height(6.dp))
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
