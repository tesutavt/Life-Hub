package com.lifehub.app.ui.screens.pages

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.lifehub.app.data.Api
import com.lifehub.app.data.PageBackground
import com.lifehub.app.data.PageBlock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID

/** Типы блоков и их размеры по умолчанию — те же, что в веб-редакторе (BLOCK_PRESETS). */
data class BlockPreset(val type: String, val label: String, val emoji: String, val w: Int, val h: Int)

val BLOCK_PRESETS = listOf(
    BlockPreset("text", "Текст", "📝", 360, 190),
    BlockPreset("heading", "Заголовок", "🔠", 520, 120),
    BlockPreset("todo", "Задача", "☑️", 320, 120),
    BlockPreset("image", "Изображение", "🖼️", 320, 320),
    BlockPreset("pdf", "PDF", "📕", 580, 540),
    BlockPreset("kana", "Кана", "あ", 430, 440),
    BlockPreset("timer", "Таймер", "⏳", 390, 260),
    BlockPreset("divider", "Разделитель", "➖", 520, 48),
    BlockPreset("calendar", "Календарь", "📅", 580, 420),
    BlockPreset("pageNav", "Навигация", "🧭", 420, 360),
    BlockPreset("tabs", "Вкладки", "🗂️", 620, 420),
    BlockPreset("checklist", "Список задач", "✅", 380, 300),
    BlockPreset("embed", "Карточка из разделов", "🔗", 440, 220),
)
fun presetOf(type: String) = BLOCK_PRESETS.firstOrNull { it.type == type } ?: BLOCK_PRESETS.first()

fun newId(): String = UUID.randomUUID().toString()

// ── Работа с «сырым» JSON блока: всё, чего телефон не знает, сохраняется как было ──

fun JsonObject.str(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull
fun JsonObject.obj(key: String): JsonObject = (this[key] as? JsonObject) ?: JsonObject(emptyMap())
fun JsonObject.with(key: String, value: JsonElement?): JsonObject = JsonObject(toMutableMap().apply { put(key, value ?: JsonNull) })
fun JsonObject.withMeta(key: String, value: JsonElement?): JsonObject = with("meta", obj("meta").with(key, value))
fun JsonObject.without(vararg keys: String): JsonObject = JsonObject(toMutableMap().apply { keys.forEach { remove(it) } })

fun JsonObject.layout(index: Int = 0): Layout {
    val l = obj("meta").obj("layout")
    val p = presetOf(str("type") ?: "text")
    fun n(k: String) = (l[k] as? JsonPrimitive)?.contentOrNull?.toFloatOrNull()
    return Layout(n("x") ?: (80f + (index % 3) * 60f), n("y") ?: (110f + index * 50f), n("w") ?: p.w.toFloat(), n("h") ?: p.h.toFloat())
}
fun JsonObject.withLayout(l: Layout): JsonObject = withMeta("layout", buildJsonObject {
    put("x", l.x.toDouble()); put("y", l.y.toDouble()); put("w", l.w.toDouble()); put("h", l.h.toDouble())
})
fun JsonObject.withDisplay(patch: (JsonObject) -> JsonObject): JsonObject = withMeta("display", patch(obj("meta").obj("display")))

data class Layout(val x: Float, val y: Float, val w: Float, val h: Float)

/** Новый блок как createBlock() в веб-редакторе. */
fun createBlock(type: String, x: Float, y: Float): JsonObject {
    val p = presetOf(type)
    return buildJsonObject {
        put("id", newId())
        put("type", type)
        put("text", when (type) { "heading" -> "Новый заголовок"; "calendar" -> "Календарь"; "pageNav" -> "Страницы"; "tabs" -> "Вкладки"; else -> "" })
        put("checked", false)
        put("url", "")
        put("relation", JsonNull)
        put("meta", buildJsonObject {
            put("layout", buildJsonObject { put("x", x.toDouble()); put("y", y.toDouble()); put("w", p.w); put("h", p.h) })
            put("links", JsonArray(emptyList()))
            put("markers", JsonArray(emptyList()))
            put("originalName", JsonNull)
            put("kanaTrainer", JsonNull)
            put("countdownTimer", buildJsonObject { put("title", ""); put("target", "") })
            put("display", buildJsonObject {
                put("customTitle", ""); put("hideChrome", false); put("hideHeader", type == "image"); put("locked", false)
            })
            put("selectedTagIds", JsonArray(emptyList()))
            if (type == "tabs") {
                val tabId = newId()
                put("tabs", JsonArray(listOf(buildJsonObject { put("id", tabId); put("title", "Вкладка 1") })))
                put("activeTabId", tabId)
            }
            put("tabGroupId", JsonNull)
            put("tabId", JsonNull)
        })
    }
}

/**
 * Страница в редакторе. Блоки — исходный JSON с сервера, правки меняют только нужные поля.
 * [version] растёт при каждой правке — по нему срабатывает автосохранение.
 */
class PageEditorState(val pageId: Int) {
    val blocks = mutableStateListOf<JsonObject>()
    var title by mutableStateOf("")
    var pageDate by mutableStateOf<String?>(null)
    var pinned by mutableStateOf(false)
    var bannerUrl by mutableStateOf<String?>(null)
    var bannerGradient by mutableStateOf<String?>(null)
    var background by mutableStateOf<PageBackground?>(null)
    var version by mutableIntStateOf(0)
    var saved by mutableIntStateOf(0)
    var saving by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)

    val dirty get() = version != saved

    suspend fun load() {
        val page = Api.request("GET", "/api/life/pages/$pageId").jsonObject.obj("page")
        title = page.str("title").orEmpty()
        pageDate = page.str("page_date")
        pinned = (page["pinned"] as? JsonPrimitive)?.contentOrNull == "true"
        bannerUrl = page.str("banner_url")
        bannerGradient = page.str("banner_gradient")
        background = (page["page_background"] as? JsonObject)?.let { runCatching { Api.json.decodeFromJsonElement<PageBackground>(it) }.getOrNull() }
        blocks.clear()
        ((page["blocks"] as? JsonArray) ?: JsonArray(emptyList())).forEachIndexed { i, el ->
            val raw = el as? JsonObject ?: return@forEachIndexed
            // Как normalizeBlocks() в веб: у каждого блока есть id и раскладка
            val withId = if (raw.str("id").isNullOrBlank()) raw.with("id", JsonPrimitive(newId())) else raw
            blocks += withId.withLayout(withId.layout(i))
        }
        version = 0; saved = 0
        loaded = true
    }

    fun parsed(raw: JsonObject): PageBlock = runCatching { Api.json.decodeFromJsonElement<PageBlock>(raw) }.getOrElse { PageBlock(id = raw.str("id").orEmpty(), type = raw.str("type") ?: "text") }

    fun indexOf(id: String) = blocks.indexOfFirst { it.str("id") == id }
    fun raw(id: String): JsonObject? = blocks.getOrNull(indexOf(id))

    fun update(id: String, transform: (JsonObject) -> JsonObject) {
        val i = indexOf(id)
        if (i < 0) return
        blocks[i] = transform(blocks[i])
        version++
    }

    fun add(block: JsonObject) { blocks += block; version++ }

    fun remove(id: String) {
        blocks.removeAll { it.str("id") == id }
        // Убираем связи на удалённый блок и привязки к удалённым вкладкам
        for (i in blocks.indices) {
            val b = blocks[i]
            val links = (b.obj("meta")["links"] as? JsonArray)?.filter { (it as? JsonPrimitive)?.contentOrNull != id }
            var next = if (links != null) b.withMeta("links", JsonArray(links)) else b
            if (next.obj("meta").str("tabGroupId") == id) next = next.withMeta("tabGroupId", JsonNull).withMeta("tabId", JsonNull)
            if (b.str("relation") == id) next = next.with("relation", JsonNull)
            blocks[i] = next
        }
        version++
    }

    fun duplicate(id: String) {
        val src = raw(id) ?: return
        val l = src.layout()
        add(src.with("id", JsonPrimitive(newId())).with("relation", JsonNull).withMeta("links", JsonArray(emptyList()))
            .withLayout(l.copy(x = l.x + 36, y = l.y + 36)))
    }

    fun touchPage() { version++ }

    /** То же тело запроса, что handleSave() в веб-редакторе. */
    suspend fun save() {
        if (!loaded) return
        val target = version
        saving = true
        runCatching {
            val bg = background?.takeIf { !it.url.isNullOrBlank() || !it.color.isNullOrBlank() || !it.gradient.isNullOrBlank() }
            Api.put("/api/life/pages/$pageId", buildJsonObject {
                put("title", title.trim().ifBlank { "Без названия" })
                put("page_date", pageDate?.ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
                put("pinned", pinned)
                put("banner_url", bannerUrl?.ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
                put("banner_gradient", bannerGradient?.ifBlank { null }?.let { JsonPrimitive(it) } ?: JsonNull)
                put("page_background", bg?.let { Api.json.encodeToJsonElement(it) } ?: JsonNull)
                put("blocks", JsonArray(blocks.toList()))
            })
        }.onSuccess { saved = target; error = null }
            .onFailure { error = it.message ?: "Не удалось сохранить" }
        saving = false
    }
}

/** Прочитать выбранный файл и загрузить на сервер (картинка или PDF). Возвращает url «/uploads/…». */
suspend fun uploadFile(context: Context, uri: Uri, kind: String): Pair<String, String> {
    val (name, bytes, mime) = withContext(Dispatchers.IO) {
        val r = context.contentResolver
        val n = r.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            ?: if (kind == "pdf") "file.pdf" else "image.jpg"
        Triple(n, r.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0), r.getType(uri) ?: if (kind == "pdf") "application/pdf" else "image/jpeg")
    }
    val res = Api.upload("/api/life/uploads/$kind", "file", name, bytes, mime = mime).jsonObject
    val url = res.str("url") ?: error("Сервер не вернул ссылку на файл")
    return url to name
}
