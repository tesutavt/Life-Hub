package com.lifehub.app.ui.screens.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.RelatedExtra
import com.lifehub.app.data.RelatedItem
import com.lifehub.app.ui.components.CoverImage
import com.lifehub.app.ui.components.SavingsBar
import com.lifehub.app.ui.components.relatedRoute
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.net.URLEncoder

// Блоки страницы, связанные с разделами (как на ПК):
//  • «Список задач» — пункт можно привязать к аниме/книге с полки, желанию, поездке; галочка ставит «готово» там;
//  • «Карточка» — вещь из любого раздела прямо на странице.

@Serializable
data class DescribedItem(
    val type: String = "",
    @SerialName("type_label") val typeLabel: String = "",
    val id: Int = 0,
    val title: String = "",
    val subtitle: String? = null,
    val image: String? = null,
    val url: String = "",
    val extra: RelatedExtra = RelatedExtra(),
    val done: Boolean? = null,
)
@Serializable private data class DescribedEnvelope(val item: DescribedItem? = null)

private val TYPE_EMOJI = mapOf("page" to "📄", "travel" to "🗺️", "wish" to "🎁", "shelf" to "📚", "goal" to "🎯", "habit" to "🔁", "course" to "🎓", "language" to "🗣️", "calendar_event" to "📅", "loan" to "💳")
private val DONE_LABEL = mapOf("shelf" to "готово на полке", "wish" to "сбылось", "travel" to "побывал")
private val STATUS_LABEL = mapOf(
    "planned" to "Хочу", "active" to "В процессе", "paused" to "Отложено", "done" to "Готово", "dropped" to "Брошено",
    "want" to "Хочу", "got" to "Сбылось", "dream" to "Мечтаю", "cancelled" to "Отменено",
)

private data class Ref(val type: String, val id: Int) { val key get() = "$type:$id" }
private fun JsonObject.ref(): Ref? {
    val r = this["ref"] as? JsonObject ?: return null
    val type = (r["type"] as? JsonPrimitive)?.contentOrNull ?: return null
    val id = (r["id"] as? JsonPrimitive)?.intOrNull ?: return null
    return Ref(type, id)
}
private fun refJson(r: Ref) = buildJsonObject { put("type", r.type); put("id", r.id) }

/** Свежие сведения о привязанных вещах (статус меняется на полке/в вишлисте). */
@Composable
private fun rememberDescribed(refs: List<Ref>): Pair<Map<String, DescribedItem>, (String, DescribedItem) -> Unit> {
    var map by remember { mutableStateOf<Map<String, DescribedItem>>(emptyMap()) }
    val sig = refs.map { it.key }.sorted().joinToString(",")
    LaunchedEffect(sig) {
        if (refs.isEmpty()) { map = emptyMap(); return@LaunchedEffect }
        val body = buildJsonObject { putJsonArray("refs") { refs.forEach { add(refJson(it)) } } }
        runCatching { Api.decode<Items<DescribedItem>>(Api.post("/api/life/links/describe", body)).items }
            .onSuccess { list -> map = list.associateBy { "${it.type}:${it.id}" } }
    }
    return map to { key, item -> map = map + (key to item) }
}

/** Поиск вещи по всем разделам для привязки. */
@Composable
private fun EntityPickerDialog(onPick: (RelatedItem) -> Unit, onDismiss: () -> Unit) {
    var q by remember { mutableStateOf("") }
    var items by remember { mutableStateOf<List<RelatedItem>>(emptyList()) }
    LaunchedEffect(q) {
        if (q.isBlank()) { items = emptyList(); return@LaunchedEffect }
        delay(300)
        items = runCatching { Api.get<Items<RelatedItem>>("/api/life/links/candidates?q=" + URLEncoder.encode(q.trim(), "UTF-8")).items }.getOrDefault(emptyList())
    }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Brand.Night,
        title = { Text("Из разделов") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(q, { q = it }, placeholder = { Text("Аниме, книга, желание, поездка…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                items.forEach { it ->
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { onPick(it) }.padding(vertical = 9.dp, horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(TYPE_EMOJI[it.type] ?: "•")
                        Spacer(Modifier.width(8.dp))
                        Text(it.title, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(it.typeLabel, color = Brand.TextFaint, fontSize = 11.sp)
                    }
                }
            }
        },
        confirmButton = {}, dismissButton = { TextButton(onDismiss) { Text("Отмена") } },
    )
}

private suspend fun toggleRemote(r: Ref, done: Boolean): DescribedItem? = runCatching {
    Api.decode<DescribedEnvelope>(Api.post("/api/life/links/toggle", buildJsonObject { put("type", r.type); put("id", r.id); put("done", done) })).item
}.getOrNull()

@Composable
fun ChecklistBlock(raw: JsonObject, ctx: BlockContext) {
    val id = raw.str("id").orEmpty()
    val scope = rememberCoroutineScope()
    val items = (raw.obj("meta")["checklist"] as? JsonArray)?.mapNotNull { it as? JsonObject } ?: emptyList()
    val (described, put) = rememberDescribed(items.mapNotNull { it.ref() })
    var draft by remember { mutableStateOf("") }
    var linking by remember { mutableStateOf<String?>(null) }
    fun save(next: List<JsonObject>) = ctx.state.update(id) { it.withMeta("checklist", JsonArray(next)) }
    fun doneOf(item: JsonObject): Boolean {
        val d = item.ref()?.let { described[it.key] }
        return d?.done ?: ((item["done"] as? JsonPrimitive)?.contentOrNull == "true")
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 4.dp).verticalScroll(rememberScrollState())) {
        if (items.isNotEmpty()) Text("${items.count { doneOf(it) }} из ${items.size}", color = Brand.TextFaint, fontSize = 11.sp, modifier = Modifier.padding(start = 6.dp))
        items.forEach { item ->
            val r = item.ref()
            val d = r?.let { described[it.key] }
            val checked = doneOf(item)
            val text = item.str("text").orEmpty()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked, { v ->
                    save(items.map { if (it.str("id") == item.str("id")) it.with("done", JsonPrimitive(v)) else it })
                    if (r != null && d?.done != null) {
                        put(r.key, d.copy(done = v))
                        scope.launch { toggleRemote(r, v)?.let { put(r.key, it) } }
                    }
                }, colors = CheckboxDefaults.colors(checkedColor = Brand.Mint, uncheckedColor = Brand.Ink.copy(alpha = 0.4f), checkmarkColor = Brand.Deep))
                if (r != null) CoverImage(d?.image, TYPE_EMOJI[r.type] ?: "•", Modifier.size(22.dp, 30.dp), RoundedCornerShape(4.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    text.ifBlank { d?.title ?: "…" }, Modifier.weight(1f).clickable(enabled = d != null || ctx.editMode) {
                        if (d != null) ctx.nav.navigate(relatedRoute(RelatedItem(type = d.type, id = d.id))) else linking = item.str("id")
                    },
                    color = if (checked) Brand.Ink.copy(alpha = 0.45f) else Brand.Text, fontSize = 14.sp, maxLines = 2, overflow = TextOverflow.Ellipsis,
                    textDecoration = if (checked) TextDecoration.LineThrough else null,
                )
                d?.extra?.status?.let { s -> Text(STATUS_LABEL[s] ?: s, fontSize = 10.sp, color = Brand.TextMuted, modifier = Modifier.clip(CircleShape).background(Brand.Ink.copy(alpha = 0.08f)).padding(horizontal = 6.dp, vertical = 1.dp)) }
                if (ctx.editMode) {
                    Text("🔗", fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { linking = item.str("id") }.padding(6.dp))
                    Text("✕", color = Brand.TextFaint, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { save(items.filter { it.str("id") != item.str("id") }) }.padding(6.dp))
                }
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(start = 6.dp, top = 2.dp)) {
            androidx.compose.foundation.text.BasicTextField(
                draft, { draft = it }, singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(color = Brand.Text, fontSize = 14.sp),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(Brand.Mint),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = {
                    if (draft.isNotBlank()) { save(items + buildJsonObject { put("id", newId()); put("text", draft.trim()); put("done", false); put("ref", JsonNull) }); draft = "" }
                }),
                decorationBox = { inner -> if (draft.isEmpty()) Text("+ Новая задача", color = Brand.TextFaint, fontSize = 14.sp); inner() },
                modifier = Modifier.weight(1f).padding(vertical = 8.dp),
            )
            Text("+ из разделов", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clip(CircleShape).clickable { linking = "new" }.padding(6.dp))
        }
    }
    linking?.let { target ->
        EntityPickerDialog(onDismiss = { linking = null }, onPick = { picked ->
            val r = Ref(picked.type, picked.id)
            if (target == "new") save(items + buildJsonObject { put("id", newId()); put("text", ""); put("done", false); put("ref", refJson(r)) })
            else save(items.map { if (it.str("id") == target) it.with("ref", refJson(r)) else it })
            put(r.key, DescribedItem(picked.type, picked.typeLabel, picked.id, picked.title, picked.subtitle, picked.image, picked.url, picked.extra))
            linking = null
        })
    }
}

@Composable
fun EmbedBlock(raw: JsonObject, ctx: BlockContext) {
    val id = raw.str("id").orEmpty()
    val scope = rememberCoroutineScope()
    val entity = (raw.obj("meta")["entity"] as? JsonObject)?.let { e ->
        val type = e.str("type"); val eid = (e["id"] as? JsonPrimitive)?.intOrNull
        if (type != null && eid != null) Ref(type, eid) else null
    }
    val (described, put) = rememberDescribed(listOfNotNull(entity))
    var picking by remember { mutableStateOf(false) }
    val d = entity?.let { described[it.key] }
    if (entity == null) {
        Column(Modifier.fillMaxSize().clickable { picking = true }.padding(12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("🔗", fontSize = 28.sp)
            Text("Нажмите, чтобы выбрать аниме, книгу, желание, поездку или цель", color = Brand.TextMuted, fontSize = 13.sp)
        }
    } else Row(Modifier.fillMaxSize().padding(10.dp)) {
        CoverImage(d?.image, TYPE_EMOJI[entity.type] ?: "•", Modifier.fillMaxHeight().aspectRatio(2f / 3f, matchHeightConstraintsFirst = true), RoundedCornerShape(12.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(d?.typeLabel?.uppercase() ?: "…", color = Brand.TextFaint, fontSize = 10.sp)
            Text(d?.title ?: "Загрузка…", fontSize = 16.sp, color = Brand.Text, modifier = Modifier.clickable(enabled = d != null) {
                d?.let { ctx.nav.navigate(relatedRoute(RelatedItem(type = it.type, id = it.id))) }
            })
            d?.subtitle?.takeIf { it.isNotBlank() }?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp) }
            d?.extra?.status?.let { s -> Text(STATUS_LABEL[s] ?: s, fontSize = 11.sp, color = Brand.TextMuted) }
            if (d?.type == "wish" && d.extra.status != "got") SavingsBar(d.extra.price, d.extra.saved, d.extra.currency)
            if (d?.done != null) Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(d.done, { v -> put(entity.key, d.copy(done = v)); scope.launch { toggleRemote(entity, v)?.let { put(entity.key, it) } } },
                    colors = CheckboxDefaults.colors(checkedColor = Brand.Mint, uncheckedColor = Brand.Ink.copy(alpha = 0.4f), checkmarkColor = Brand.Deep))
                Text(DONE_LABEL[d.type].orEmpty(), color = Brand.TextMuted, fontSize = 12.sp)
            }
            if (ctx.editMode) Text("Сменить", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clickable { picking = true })
        }
    }
    if (picking) EntityPickerDialog(onDismiss = { picking = false }, onPick = { picked ->
        ctx.state.update(id) { it.withMeta("entity", buildJsonObject { put("type", picked.type); put("id", picked.id) }) }
        put("${picked.type}:${picked.id}", DescribedItem(picked.type, picked.typeLabel, picked.id, picked.title, picked.subtitle, picked.image, picked.url, picked.extra))
        picking = false
    })
}
