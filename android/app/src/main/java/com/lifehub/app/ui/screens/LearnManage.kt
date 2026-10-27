package com.lifehub.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.PageTagRef
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

private val LEVELS = listOf("A0", "A1", "A2", "B1", "B2", "C1", "C2")

/** Создание и правка языка — те же поля, что в веб: название, уровень, картинка, баннер, теги; архив. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LanguageDialog(language: Language?, onDismiss: () -> Unit, onDone: () -> Unit) {
    val scope = rememberCoroutineScope()
    var name by remember { mutableStateOf(language?.name.orEmpty()) }
    var level by remember { mutableStateOf(language?.level ?: "A1") }
    var image by remember { mutableStateOf(language?.imageUrl.orEmpty()) }
    var banner by remember { mutableStateOf(language?.bannerUrl.orEmpty()) }
    var allTags by remember { mutableStateOf<List<PageTag>>(emptyList()) }
    val tags = remember { mutableStateListOf<Int>().apply { addAll(language?.tags.orEmpty().map { it.id }) } }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmArchive by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(Unit) {
        allTags = runCatching { Api.get<Items<PageTag>>("/api/life/pages/tags").items }.getOrDefault(emptyList())
    }
    fun run(block: suspend () -> Unit) {
        busy = true
        scope.launch { runCatching { block() }.onSuccess { onDone() }.onFailure { error = it.message; busy = false } }
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = Brand.Night,
        title = { Text(if (language == null) "Новый язык" else "Язык") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Название, например 🇯🇵 Японский") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                Text("Уровень", color = Brand.TextMuted, fontSize = 12.sp)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    LEVELS.forEach { l ->
                        Text(l, color = if (l == level) Brand.Deep else Brand.Text, fontWeight = FontWeight.Bold, fontSize = 13.sp,
                            modifier = Modifier.clip(CircleShape).background(if (l == level) Brand.Mint else Color.White.copy(alpha = 0.06f)).clickable { level = l }.padding(horizontal = 12.dp, vertical = 6.dp))
                    }
                }
                OutlinedTextField(image, { image = it }, label = { Text("Ссылка на изображение (необязательно)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(banner, { banner = it }, label = { Text("Ссылка на баннер (необязательно)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (allTags.isNotEmpty()) {
                    Text("Теги", color = Brand.TextMuted, fontSize = 12.sp)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        allTags.forEach { t ->
                            val on = t.id in tags
                            TagBadge(PageTagRef(t.id, t.label, t.color), Modifier.clickable { if (on) tags.remove(t.id) else tags.add(t.id) }, selected = on)
                        }
                    }
                }
                if (language != null) {
                    Text(
                        if (confirmArchive) "Точно переместить в архив? Нажмите ещё раз" else "Переместить в архив",
                        color = Brand.Rose, fontSize = 13.sp,
                        modifier = Modifier.padding(top = 8.dp).clip(CircleShape).clickable(enabled = !busy) {
                            if (confirmArchive) run { Api.delete("/api/life/languages/${language.id}") } else confirmArchive = true
                        }.padding(vertical = 6.dp),
                    )
                }
                error?.let { Text(it, color = Brand.Rose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank() && !busy, onClick = {
                val body = buildJsonObject {
                    put("name", name.trim()); put("level", level)
                    put("image_url", image.trim().ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
                    put("banner_url", banner.trim().ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
                    putJsonArray("tags") { tags.forEach { add(it) } }
                }
                run { if (language == null) Api.post("/api/life/languages", body) else Api.put("/api/life/languages/${language.id}", body) }
            }) { Text(if (language == null) "Добавить" else "Сохранить", color = Brand.Mint) }
        },
        dismissButton = { TextButton({ onDismiss() }, enabled = !busy) { Text("Отмена", color = Brand.TextMuted) } },
    )
}

/** Импорт курса-тренировки из JSON-файла (тот же формат, что «Импорт курса» в веб и шаблон для ИИ). */
@Composable
fun CourseImportDialog(languages: List<Language>, onDismiss: () -> Unit, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var file by remember { mutableStateOf<Pair<String, String>?>(null) }
    var languageId by remember { mutableStateOf(languages.firstOrNull()?.id) }
    var createCourse by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            file = runCatching {
                withContext(Dispatchers.IO) {
                    val name = context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)
                        ?.use { c -> if (c.moveToFirst()) c.getString(0) else null } ?: "course.json"
                    name to (context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: "")
                }
            }.getOrNull()
            error = null
        }
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        containerColor = Brand.Night,
        title = { Text("Импорт курса") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Выберите JSON-файл курса — например, сгенерированный ИИ по шаблону из веб-версии.", color = Brand.TextMuted, fontSize = 13.sp)
                Text(
                    file?.first ?: "📄 Выбрать файл…",
                    color = if (file == null) Brand.Mint else Brand.Text, fontSize = 14.sp,
                    modifier = Modifier.fillMaxWidth().clip(CircleShape).background(Color.White.copy(alpha = 0.06f)).clickable { picker.launch("*/*") }.padding(horizontal = 14.dp, vertical = 10.dp),
                )
                if (languages.isNotEmpty()) {
                    Text("Язык курса", color = Brand.TextMuted, fontSize = 12.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (listOf<Language?>(null) + languages).forEach { l ->
                            val on = languageId == l?.id
                            Text(l?.name ?: "Без языка", fontSize = 12.sp, color = if (on) Brand.Deep else Brand.Text,
                                modifier = Modifier.clip(CircleShape).background(if (on) Brand.Mint else Color.White.copy(alpha = 0.06f)).clickable { languageId = l?.id }.padding(horizontal = 10.dp, vertical = 6.dp))
                        }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Добавить в раздел «Курсы»", fontSize = 13.sp, modifier = Modifier.weight(1f))
                    Switch(createCourse, { createCourse = it }, colors = SwitchDefaults.colors(checkedTrackColor = Brand.Mint))
                }
                error?.let { Text(it, color = Brand.Rose, fontSize = 12.sp) }
            }
        },
        confirmButton = {
            TextButton(enabled = file != null && !busy, onClick = {
                val text = file?.second?.trim()?.removePrefix("```json")?.removePrefix("```")?.removeSuffix("```")?.trim().orEmpty()
                val parsed = runCatching { Api.json.parseToJsonElement(text) }.getOrElse { error = "Это не похоже на корректный JSON: ${it.message}"; return@TextButton }
                busy = true
                scope.launch {
                    runCatching {
                        Api.post("/api/learn/courses/import", buildJsonObject {
                            put("course", parsed)
                            put("language_id", languageId?.let { JsonPrimitive(it) } ?: JsonNull)
                            put("create_course", createCourse)
                        })
                    }.onSuccess { onDone() }.onFailure { error = it.message ?: "Не удалось импортировать курс"; busy = false }
                }
            }) { Text(if (busy) "Импорт…" else "Импортировать", color = Brand.Mint) }
        },
        dismissButton = { TextButton({ onDismiss() }, enabled = !busy) { Text("Отмена", color = Brand.TextMuted) } },
    )
}
