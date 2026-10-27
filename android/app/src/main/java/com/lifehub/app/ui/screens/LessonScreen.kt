package com.lifehub.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Favorite
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
import androidx.compose.runtime.mutableStateListOf
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.CheckpointResult
import com.lifehub.app.data.LessonData
import com.lifehub.app.data.LessonResult
import com.lifehub.app.data.Word
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.ErrorBox
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.screens.learn.Exercise
import com.lifehub.app.ui.screens.learn.Grade
import com.lifehub.app.ui.screens.learn.gradeText
import com.lifehub.app.ui.screens.learn.parseExercise
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.util.Sound
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add

private const val MAX_HEARTS = 5
private val PRAISE = listOf("Отлично!", "Супер!", "Так держать!", "Великолепно!", "В точку!", "Молодец!")

/** lessonId/lessonTitle — откуда задание (в контрольной), words — строки задания для «Работы над ошибками». */
private data class ExMeta(val lessonId: Int?, val lessonTitle: String?, val words: List<String>)
private data class QueueItem(val key: String, val exercise: Exercise, val retry: Boolean, val meta: ExMeta = ExMeta(null, null, emptyList()))

private fun metaOf(raw: JsonObject): ExMeta {
    val strings = listOf("question", "prompt", "answer", "text").mapNotNull { (raw[it] as? JsonPrimitive)?.contentOrNull } +
        ((raw["answers"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull } ?: emptyList())
    return ExMeta(
        (raw["lesson_id"] as? JsonPrimitive)?.intOrNull,
        (raw["lesson_title"] as? JsonPrimitive)?.contentOrNull,
        strings.filter { it.length <= 80 },
    )
}
private data class Feedback(val ok: Boolean, val answer: String? = null, val note: String? = null)
private enum class Phase { Loading, Playing, Saving, Result, Failed }

@Composable
fun LessonScreen(lessonId: Int, onExit: () -> Unit, checkpoint: Boolean = false, onOpenLesson: (Int) -> Unit = {}) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var lesson by remember { mutableStateOf<LessonData?>(null) }
    var loadError by remember { mutableStateOf<String?>(null) }
    val queue = remember { mutableStateListOf<QueueItem>() }
    var pos by remember { mutableIntStateOf(0) }
    var hearts by remember { mutableIntStateOf(MAX_HEARTS) }
    var phase by remember { mutableStateOf(Phase.Loading) }
    var feedback by remember { mutableStateOf<Feedback?>(null) }
    var answer by remember { mutableStateOf<Any?>(null) }
    var result by remember { mutableStateOf<LessonResult?>(null) }
    var askExit by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    val firstTry = remember { mutableStateMapOf<String, Boolean>() }
    var mistakes by remember { mutableIntStateOf(0) }
    val mistakeWords = remember { mutableStateListOf<String>() }
    val weakLessons = remember { mutableStateListOf<Int>() }
    var checkpointResult by remember { mutableStateOf<CheckpointResult?>(null) }
    val startedAt = remember(attempt) { System.currentTimeMillis() }

    LaunchedEffect(lessonId, attempt) {
        phase = Phase.Loading
        try {
            val data = Api.get<LessonData>(if (checkpoint) "/api/learn/units/$lessonId/checkpoint" else "/api/learn/lessons/$lessonId")
            lesson = data
            queue.clear()
            queue.addAll(data.exercises.mapIndexedNotNull { i, raw -> parseExercise(raw, data.words)?.let { QueueItem("e$i", it, false, metaOf(raw)) } })
            pos = 0; hearts = MAX_HEARTS; feedback = null; answer = null; mistakes = 0; firstTry.clear()
            mistakeWords.clear(); weakLessons.clear(); checkpointResult = null
            phase = Phase.Playing
        } catch (e: Exception) {
            loadError = e.message
        }
    }

    BackHandler(enabled = phase == Phase.Playing) { askExit = true }

    val current = queue.getOrNull(pos)
    val speechLang = lesson?.speechLang
    val gradedTotal = queue.count { !it.retry && it.exercise.graded }

    fun finish(failed: Boolean) {
        val data = lesson ?: return
        phase = Phase.Saving
        scope.launch {
            try {
                val body = buildJsonObject {
                    put("total", gradedTotal.coerceAtLeast(1)); put("correct", firstTry.values.count { it }); put("mistakes", mistakes); put("failed", failed)
                    put("duration_sec", ((System.currentTimeMillis() - startedAt) / 1000).toInt())
                    putJsonArray("mistake_words") { mistakeWords.distinct().forEach { add(it) } }
                    putJsonArray("weak_lessons") { weakLessons.distinct().forEach { add(it) } }
                }
                if (checkpoint) {
                    checkpointResult = Api.decode(Api.post("/api/learn/units/${data.id}/checkpoint/complete", body))
                    Achievements.requestCheck()
                    Sound.finish(context)
                    phase = Phase.Result
                    return@launch
                }
                val response = Api.post("/api/learn/lessons/${data.id}/complete", body)
                Achievements.requestCheck()
                if (failed) phase = Phase.Failed else {
                    result = Api.decode(response)
                    Sound.finish(context)
                    phase = Phase.Result
                }
            } catch (e: Exception) {
                loadError = e.message
                phase = Phase.Playing
            }
        }
    }

    fun register(ok: Boolean, correctAnswer: String? = null, note: String? = null) {
        val item = current ?: return
        if (!item.retry && item.key !in firstTry) firstTry[item.key] = ok
        if (ok) {
            Sound.correct(context)
        } else {
            Sound.wrong(context)
            mistakes += 1
            mistakeWords.addAll(item.meta.words)
            item.meta.lessonId?.let { weakLessons.add(it) }
            // В контрольной без сердечек и повторов — честная проверка
            if (!checkpoint) {
                hearts -= 1
                queue.add(QueueItem("${item.key}r${queue.size}", item.exercise, true, item.meta))
            }
        }
        feedback = Feedback(ok, correctAnswer, note)
    }

    fun advance() {
        feedback = null
        answer = null
        when {
            hearts <= 0 && !checkpoint -> finish(true)
            pos + 1 >= queue.size -> finish(false)
            else -> pos += 1
        }
    }

    fun check() {
        val ex = current?.exercise ?: return
        if (feedback != null) return
        when (ex) {
            is Exercise.Choice -> register(answer == ex.answer, ex.answer)
            is Exercise.Translate -> {
                val g = gradeText(answer as? String ?: "", ex.answers)
                register(g != Grade.Wrong, ex.answers.first(), if (g == Grade.Typo) "Небольшая опечатка — засчитано" else null)
            }
            is Exercise.Listen -> {
                val g = gradeText(answer as? String ?: "", ex.answers)
                register(g != Grade.Wrong, ex.answers.first(), if (g == Grade.Typo) "Небольшая опечатка — засчитано" else null)
            }
            is Exercise.Fill -> {
                val g = if (ex.options != null) (if (answer == ex.answer) Grade.Exact else Grade.Wrong) else gradeText(answer as? String ?: "", listOf(ex.answer))
                register(g != Grade.Wrong, ex.answer, ex.translation)
            }
            is Exercise.Assemble -> {
                @Suppress("UNCHECKED_CAST")
                val picked = answer as? List<Int> ?: emptyList()
                val built = picked.joinToString(ex.separator) { ex.tokens[it] }
                val target = ex.answerTokens.joinToString(ex.separator)
                register(gradeText(built, listOf(target)) == Grade.Exact, target)
            }
            else -> Unit
        }
    }

    fun skip() {
        val ex = current?.exercise ?: return
        val correct = when (ex) {
            is Exercise.Choice -> ex.answer
            is Exercise.Translate -> ex.answers.first()
            is Exercise.Listen -> ex.answers.first()
            is Exercise.Fill -> ex.answer
            is Exercise.Assemble -> ex.answerTokens.joinToString(ex.separator)
            else -> null
        }
        register(false, correct)
    }

    Box(Modifier.fillMaxSize().background(Brand.Deep).statusBarsPadding().navigationBarsPadding().imePadding()) {
        when {
            loadError != null && lesson == null -> ErrorBox(loadError!!) { loadError = null; attempt += 1 }
            phase == Phase.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Brand.Green) }
            phase == Phase.Result && checkpointResult != null -> CheckpointResultView(checkpointResult!!, onRetry = { attempt += 1 }, onExit = onExit, onOpenLesson = onOpenLesson)
            phase == Phase.Result -> ResultView(lesson!!, result!!, startedAt, onRetry = { attempt += 1 }, onExit = onExit)
            phase == Phase.Failed -> FailedView(onRetry = { attempt += 1 }, onExit = onExit)
            else -> Column(Modifier.fillMaxSize()) {
                // Верхняя панель: выход, прогресс, сердечки
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { askExit = true }) { Icon(Icons.Default.Close, "Выйти", tint = Brand.TextMuted) }
                    ProgressBar(if (queue.isEmpty()) 0f else pos.toFloat() / queue.size, Modifier.weight(1f), height = 14.dp, colors = listOf(Brand.Green, Brand.Green))
                    Spacer(Modifier.width(12.dp))
                    if (checkpoint) {
                        Text("🏰 КОНТРОЛЬНАЯ", color = Brand.Amber, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    } else {
                        Icon(Icons.Default.Favorite, null, tint = Brand.Rose)
                        Text(" $hearts", color = Brand.Rose, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(8.dp))
                }
                // Упражнение
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp)) {
                    if (current?.retry == true) Text("↻ ПОВТОРИМ ОШИБКУ", color = Color(0xFFFDBA74), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    current?.meta?.lessonTitle?.let { if (checkpoint) Text("ИЗ УРОКА «${it.uppercase()}»", color = Brand.TextFaint, fontWeight = FontWeight.Bold, fontSize = 11.sp) }
                    current?.let { item ->
                        AnimatedContent(
                            item.key,
                            transitionSpec = { (slideInHorizontally { it / 3 } + fadeIn()) togetherWith fadeOut() },
                            label = "exercise",
                        ) { key ->
                            val ex = queue.firstOrNull { it.key == key }?.exercise ?: return@AnimatedContent
                            ExerciseView(ex, speechLang, answer, { answer = it }, locked = feedback != null, onMatchDone = { errors ->
                                mistakes += errors
                                register(true, note = if (errors > 0) "Ошибок при сопоставлении: $errors" else null)
                            }, onSubmit = { check() })
                        }
                    }
                }
                BottomPanel(
                    exercise = current?.exercise,
                    feedback = feedback,
                    praise = PRAISE[pos % PRAISE.size],
                    canCheck = when (val a = answer) { null -> false; is String -> a.isNotBlank(); is List<*> -> a.isNotEmpty(); else -> true },
                    saving = phase == Phase.Saving,
                    onCheck = ::check,
                    onSkip = ::skip,
                    onContinue = ::advance,
                )
            }
        }
    }

    if (askExit) {
        AlertDialog(
            onDismissRequest = { askExit = false },
            title = { Text(if (checkpoint) "Выйти из контрольной?" else "Выйти из урока?") },
            text = { Text("Прогресс этого урока не сохранится.") },
            confirmButton = { TextButton(onClick = { askExit = false; onExit() }) { Text("Выйти", color = Brand.Rose) } },
            dismissButton = { TextButton(onClick = { askExit = false }) { Text("Продолжить урок") } },
            containerColor = Brand.Night,
        )
    }
}

@Composable
private fun BottomPanel(
    exercise: Exercise?,
    feedback: Feedback?,
    praise: String,
    canCheck: Boolean,
    saving: Boolean,
    onCheck: () -> Unit,
    onSkip: () -> Unit,
    onContinue: () -> Unit,
) {
    val bg = when {
        feedback == null -> Color.Transparent
        feedback.ok -> Color(0xFF16A34A).copy(alpha = 0.18f)
        else -> Color(0xFFE11D48).copy(alpha = 0.18f)
    }
    Column(Modifier.fillMaxWidth().background(bg).padding(16.dp)) {
        if (feedback != null) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 12.dp)) {
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(if (feedback.ok) Color(0xFF16A34A).copy(alpha = 0.3f) else Color(0xFFE11D48).copy(alpha = 0.3f)),
                    contentAlignment = Alignment.Center,
                ) { Text(if (feedback.ok) "✔" else "✖", fontSize = 20.sp) }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(if (feedback.ok) praise else "Неправильно", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = if (feedback.ok) Color(0xFF86EFAC) else Color(0xFFFDA4AF))
                    if (!feedback.ok && feedback.answer != null) Text("Правильный ответ: ${feedback.answer}", color = Color(0xFFFECDD3))
                    feedback.note?.let { Text(it, color = Brand.TextMuted, fontSize = 13.sp) }
                }
            }
            ChunkyButton(
                if (saving) "Сохраняем…" else "Продолжить",
                Modifier.fillMaxWidth(),
                color = if (feedback.ok) Brand.Green else Brand.Rose,
                shadow = if (feedback.ok) Brand.GreenShadow else Color(0xFF9F1239),
                enabled = !saving,
                onClick = onContinue,
            )
        } else when {
            exercise == null -> Unit
            !exercise.graded -> ChunkyButton(if (exercise is Exercise.Learn) "Запомнил!" else "Понятно", Modifier.fillMaxWidth(), enabled = !saving, onClick = onContinue)
            exercise is Exercise.Match -> Text("Соедините все пары", color = Brand.TextFaint, modifier = Modifier.align(Alignment.CenterHorizontally).padding(14.dp))
            else -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                ChunkyButton("Не знаю", Modifier.weight(1f), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f), textColor = Brand.TextMuted, onClick = onSkip)
                ChunkyButton("Проверить", Modifier.weight(1.4f), enabled = canCheck, onClick = onCheck)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExerciseView(
    ex: Exercise,
    speechLang: String?,
    answer: Any?,
    setAnswer: (Any?) -> Unit,
    locked: Boolean,
    onMatchDone: (Int) -> Unit,
    onSubmit: () -> Unit,
) {
    LaunchedEffect(ex) {
        when (ex) {
            is Exercise.Learn -> if (speechLang != null || ex.word.audio != null) Sound.speak(ex.word.term, speechLang, ex.word.reading, ex.word.audio)
            is Exercise.Listen -> Sound.speak(ex.text, speechLang)
            else -> Unit
        }
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        when (ex) {
            is Exercise.Learn -> {
                Pill("✨ НОВОЕ СЛОВО", Color(0xFFA78BFA))
                val w = ex.word
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).border(2.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(24.dp)).padding(22.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    w.emoji?.let { Text(it, fontSize = 56.sp) }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(w.term, fontSize = 38.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(10.dp))
                        SpeakButton { Sound.speak(w.term, speechLang, w.reading, w.audio) }
                    }
                    w.reading?.let { Text(it, color = Brand.TextMuted, fontSize = 18.sp) }
                    Spacer(Modifier.height(10.dp))
                    Text(w.translation, color = Color(0xFF6EE7B7), fontSize = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
                    w.note?.let { Text("💡 $it", color = Brand.TextMuted, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp), textAlign = TextAlign.Center) }
                    w.example?.let {
                        Column(Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(14.dp)).background(Color.Black.copy(alpha = 0.25f)).padding(12.dp)) {
                            Text(it)
                            w.exampleTranslation?.let { t -> Text(t, color = Brand.TextMuted) }
                        }
                    }
                }
            }
            is Exercise.Theory -> {
                Pill("💡 ПОДСКАЗКА", Brand.Amber)
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brand.Amber.copy(alpha = 0.06f)).border(2.dp, Brand.Amber.copy(alpha = 0.2f), RoundedCornerShape(24.dp)).padding(20.dp)) {
                    Text(ex.title, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(ex.text, lineHeight = 22.sp, color = Brand.Text.copy(alpha = 0.85f))
                }
            }
            is Exercise.Choice -> {
                Title(ex.prompt)
                ex.question?.let { q ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        SpeakButton { Sound.speak(q, speechLang) }
                        Spacer(Modifier.width(10.dp))
                        Text(q, fontSize = 26.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.border(2.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 8.dp))
                    }
                }
                ex.options.forEachIndexed { i, option -> OptionTile(option, i, answer == option, !locked) { setAnswer(option) } }
            }
            is Exercise.Translate -> {
                Title("Переведите")
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (ex.direction == "to_native") {
                        SpeakButton { Sound.speak(ex.prompt, speechLang) }
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(ex.prompt, fontSize = 24.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.border(2.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 8.dp))
                }
                var hint by remember(ex) { mutableStateOf(false) }
                ex.hint?.let { h -> Text(if (hint) h else "показать подсказку", color = Brand.Amber, modifier = Modifier.clickable { hint = !hint }) }
                AnswerField(answer as? String ?: "", { setAnswer(it) }, locked, if (ex.direction == "to_native") "Напишите по-русски" else "Напишите на изучаемом языке", onSubmit)
            }
            is Exercise.Listen -> {
                Title(ex.prompt)
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    SpeakButton(big = true) { Sound.speak(ex.text, speechLang) }
                    Box(
                        Modifier.size(56.dp).clip(RoundedCornerShape(16.dp)).background(Brand.Sky.copy(alpha = 0.25f)).clickable { Sound.speak(ex.text, speechLang, slow = true) },
                        contentAlignment = Alignment.Center,
                    ) { Text("🐢", fontSize = 26.sp) }
                }
                AnswerField(answer as? String ?: "", { setAnswer(it) }, locked, "Напишите, что услышали", onSubmit)
            }
            is Exercise.Fill -> {
                Title(ex.prompt)
                val parts = ex.sentence.split("___")
                FlowRow(verticalArrangement = Arrangement.Center) {
                    Text(parts.getOrElse(0) { "" }, fontSize = 24.sp)
                    Text(
                        (answer as? String)?.takeIf { it.isNotBlank() } ?: "  ?  ",
                        fontSize = 24.sp,
                        color = if (answer != null) Brand.Sky else Brand.TextFaint,
                        modifier = Modifier.padding(horizontal = 6.dp).border(width = 0.dp, color = Color.Transparent),
                    )
                    Text(parts.getOrElse(1) { "" }, fontSize = 24.sp)
                }
                ex.translation?.let { Text(it, color = Brand.TextFaint) }
                if (ex.options != null) {
                    ex.options.forEachIndexed { i, option -> OptionTile(option, i, answer == option, !locked) { setAnswer(option) } }
                } else {
                    AnswerField(answer as? String ?: "", { setAnswer(it) }, locked, "Впишите слово", onSubmit)
                }
            }
            is Exercise.Assemble -> {
                Title("Соберите перевод")
                Text(ex.prompt, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.border(2.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 8.dp))
                @Suppress("UNCHECKED_CAST")
                val chosen = answer as? List<Int> ?: emptyList()
                FlowRow(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).border(width = 0.dp, color = Color.Transparent).padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    chosen.forEachIndexed { position, index ->
                        TokenTile(ex.tokens[index], used = false, enabled = !locked) {
                            val next = chosen.filterIndexed { p, _ -> p != position }
                            setAnswer(next.ifEmpty { null })
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().height(2.dp).background(Color.White.copy(alpha = 0.1f)))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    ex.tokens.forEachIndexed { index, token ->
                        val used = index in chosen
                        TokenTile(token, used = used, enabled = !locked && !used) { setAnswer(chosen + index) }
                    }
                }
            }
            is Exercise.Match -> MatchView(ex, speechLang, onMatchDone)
        }
    }
}

@Composable
private fun Title(text: String) = Text(text, fontSize = 22.sp, fontWeight = FontWeight.Bold)

@Composable
private fun Pill(text: String, color: Color) {
    Text(text, color = color, fontSize = 12.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(color.copy(alpha = 0.18f)).padding(horizontal = 12.dp, vertical = 5.dp))
}

@Composable
private fun SpeakButton(big: Boolean = false, onClick: () -> Unit) {
    val size = if (big) 76.dp else 44.dp
    Box(Modifier.size(size).clip(RoundedCornerShape(14.dp)).background(Brand.Sky).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(Icons.AutoMirrored.Filled.VolumeUp, "Прослушать", tint = Color.White, modifier = Modifier.size(if (big) 38.dp else 22.dp))
    }
}

@Composable
private fun OptionTile(text: String, index: Int, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val border = if (selected) Brand.Sky else Color.White.copy(alpha = 0.15f)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (selected) Brand.Sky.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.03f))
            .border(2.dp, border, RoundedCornerShape(16.dp)).clickable(enabled = enabled, onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(28.dp).border(2.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
            Text("${index + 1}", fontSize = 12.sp, color = Brand.TextMuted)
        }
        Spacer(Modifier.width(12.dp))
        Text(text, fontSize = 17.sp, color = if (selected) Color(0xFFBAE6FD) else Brand.Text)
    }
}

@Composable
private fun TokenTile(text: String, used: Boolean, enabled: Boolean, onClick: () -> Unit) {
    Text(
        text,
        fontSize = 19.sp,
        color = if (used) Color.Transparent else Brand.Text,
        modifier = Modifier.clip(RoundedCornerShape(12.dp))
            .background(if (used) Color.White.copy(alpha = 0.05f) else Color.White.copy(alpha = 0.07f))
            .border(2.dp, Color.White.copy(alpha = if (used) 0.05f else 0.2f), RoundedCornerShape(12.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@Composable
private fun AnswerField(value: String, onChange: (String) -> Unit, locked: Boolean, placeholder: String, onSubmit: () -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { onChange(it.replace("\n", "")) },
        enabled = !locked,
        placeholder = { Text(placeholder) },
        minLines = 3,
        textStyle = androidx.compose.ui.text.TextStyle(fontSize = 18.sp, color = Brand.Text),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { if (value.isNotBlank()) onSubmit() }),
        colors = authFieldColors(),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun MatchView(ex: Exercise.Match, speechLang: String?, onDone: (Int) -> Unit) {
    val context = LocalContext.current
    val left = remember(ex) { ex.pairs.mapIndexed { i, p -> i to p.first }.shuffled() }
    val right = remember(ex) { ex.pairs.mapIndexed { i, p -> i to p.second }.shuffled() }
    var selLeft by remember(ex) { mutableStateOf<Int?>(null) }
    var selRight by remember(ex) { mutableStateOf<Int?>(null) }
    val matched = remember(ex) { mutableStateListOf<Int>() }
    var wrong by remember(ex) { mutableStateOf<Pair<Int, Int>?>(null) }
    var errors by remember(ex) { mutableIntStateOf(0) }

    LaunchedEffect(selLeft, selRight) {
        val l = selLeft
        val r = selRight
        if (l != null && r != null) {
            if (l == r) {
                matched.add(l)
                Sound.correct(context)
                if (matched.size == ex.pairs.size) {
                    delay(300)
                    onDone(errors)
                }
            } else {
                errors += 1
                Sound.wrong(context)
                wrong = l to r
                delay(450)
                wrong = null
            }
            selLeft = null
            selRight = null
        }
    }

    Title(ex.prompt)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            left.forEach { (i, text) ->
                MatchTile(text, i in matched, selLeft == i, wrong?.first == i) {
                    selLeft = i
                    Sound.speak(text, speechLang)
                }
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            right.forEach { (i, text) -> MatchTile(text, i in matched, selRight == i, wrong?.second == i) { selRight = i } }
        }
    }
}

@Composable
private fun MatchTile(text: String, matched: Boolean, selected: Boolean, wrong: Boolean, onClick: () -> Unit) {
    val alpha by animateFloatAsState(if (matched) 0.25f else 1f, label = "match")
    val border = when {
        wrong -> Brand.Rose
        selected -> Brand.Sky
        else -> Color.White.copy(alpha = 0.15f)
    }
    Box(
        Modifier.fillMaxWidth().height(58.dp).clip(RoundedCornerShape(14.dp))
            .background(if (wrong) Brand.Rose.copy(alpha = 0.15f) else if (selected) Brand.Sky.copy(alpha = 0.15f) else Color.White.copy(alpha = 0.03f))
            .border(2.dp, border.copy(alpha = border.alpha * alpha), RoundedCornerShape(14.dp))
            .clickable(enabled = !matched, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, fontSize = 17.sp, color = Brand.Text.copy(alpha = alpha), textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 6.dp))
    }
}

@Composable
private fun ResultView(lesson: LessonData, result: LessonResult, startedAt: Long, onRetry: () -> Unit, onExit: () -> Unit) {
    val seconds = ((System.currentTimeMillis() - startedAt) / 1000).toInt()
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(if (result.perfect) "🏆" else "🎉", fontSize = 80.sp)
        Text(if (result.perfect) "Без единой ошибки!" else "Урок пройден!", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Brand.Amber, textAlign = TextAlign.Center)
        Text(lesson.title, color = Brand.TextMuted)
        Spacer(Modifier.height(24.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("ОПЫТ", "+${result.xpEarned}", Brand.Amber, Modifier.weight(1f))
            StatTile("ТОЧНОСТЬ", "${result.score}%", Brand.Green, Modifier.weight(1f))
            StatTile("ВРЕМЯ", "%d:%02d".format(seconds / 60, seconds % 60), Brand.Sky, Modifier.weight(1f))
        }
        result.streak?.let { Text("🔥 Серия занятий: $it дн.", color = Color(0xFFFDBA74), modifier = Modifier.padding(top = 16.dp)) }
        result.achievements.forEach {
            Text("${it.icon} ${it.title}", color = Brand.Amber, modifier = Modifier.padding(top = 8.dp))
        }
        Spacer(Modifier.height(32.dp))
        ChunkyButton("Продолжить", Modifier.fillMaxWidth(), onClick = onExit)
        TextButton(onClick = onRetry, modifier = Modifier.padding(top = 8.dp)) { Text("Пройти ещё раз") }
    }
}

@Composable
private fun StatTile(label: String, value: String, color: Color, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).border(2.dp, color, RoundedCornerShape(16.dp)), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Brand.Deep, modifier = Modifier.fillMaxWidth().background(color).padding(vertical = 3.dp), textAlign = TextAlign.Center)
        Text(value, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(vertical = 12.dp))
    }
}

@Composable
private fun FailedView(onRetry: () -> Unit, onExit: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("💔", fontSize = 80.sp)
        Text("Сердечки закончились", fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text("Ничего страшного — ошибки помогают запоминать. Попробуйте ещё раз!", color = Brand.TextMuted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
        Spacer(Modifier.height(32.dp))
        ChunkyButton("Попробовать снова", Modifier.fillMaxWidth(), onClick = onRetry)
        TextButton(onClick = onExit, modifier = Modifier.padding(top = 8.dp)) { Text("Выйти") }
    }
}

@Composable
private fun CheckpointResultView(r: CheckpointResult, onRetry: () -> Unit, onExit: () -> Unit, onOpenLesson: (Int) -> Unit) {
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(if (r.passed) "🎓" else "📚", fontSize = 80.sp)
        Text(
            if (r.passed) (if (r.nextUnit != null) "Вы готовы идти дальше!" else "Раздел освоен!") else "Пока рановато",
            fontSize = 26.sp, fontWeight = FontWeight.ExtraBold, color = if (r.passed) Brand.Amber else Brand.Sky, textAlign = TextAlign.Center,
        )
        Text(
            when {
                r.passed && r.nextUnit != null -> "Раздел «${r.nextUnit.title}» открыт."
                r.passed -> "Это был последний раздел курса."
                else -> "Нужно ${r.passScore}% — повторите уроки ниже и попробуйте снова."
            },
            color = Brand.TextMuted, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp),
        )
        Spacer(Modifier.height(20.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("РЕЗУЛЬТАТ", "${r.score}%", if (r.passed) Brand.Green else Brand.Sky, Modifier.weight(1f))
            StatTile("ОПЫТ", "+${r.xpEarned}", Brand.Amber, Modifier.weight(1f))
        }
        if (r.weakLessons.isNotEmpty()) {
            Text("СТОИТ ПОВТОРИТЬ", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Brand.TextFaint, modifier = Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 6.dp))
            r.weakLessons.forEach { l ->
                Row(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(14.dp)).border(2.dp, Color.White.copy(alpha = 0.1f), RoundedCornerShape(14.dp))
                        .clickable { onOpenLesson(l.id) }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(l.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    Text("повторить →", color = Brand.Green, fontSize = 12.sp)
                }
            }
        }
        r.achievements.forEach { Text("${it.icon} ${it.title}", color = Brand.Amber, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(28.dp))
        ChunkyButton("К курсу", Modifier.fillMaxWidth(), onClick = onExit)
        TextButton(onClick = onRetry, modifier = Modifier.padding(top = 8.dp)) { Text(if (r.passed) "Ещё раз" else "Пересдать") }
    }
}
