package com.lifehub.app.ui.screens

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.PageTag
import com.lifehub.app.data.RelatedItem
import com.lifehub.app.data.WishItem
import com.lifehub.app.data.WishPreview
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.CoverImage
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.RelatedSection
import com.lifehub.app.ui.components.SavingsBar
import com.lifehub.app.ui.components.TagPicker
import com.lifehub.app.ui.components.currencySign
import com.lifehub.app.ui.components.money
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.components.rememberTagOptions
import com.lifehub.app.ui.screens.pages.uploadFile
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.net.URLEncoder

// Вишлист — пробковая доска с полароидами на кнопках, как на ПК. У каждого желания своя копилка.

private val CORK = Brush.linearGradient(listOf(Color(0xFFA0693B), Color(0xFF7F5029)))
private val PAPER = Color(0xFFFDFBF6)
private val INK = Color(0xFF1E293B)
private val PINS = listOf(0xFFF87171, 0xFFFBBF24, 0xFF34D399, 0xFF60A5FA, 0xFFC084FC, 0xFFF472B6).map { Color(it) }
private val TILTS = listOf(-2.5f, 1.5f, -1f, 2f, -1.8f, 1f)
private val CURRENCIES = listOf("RUB", "USD", "EUR", "KZT", "BYN", "UAH", "JPY", "CNY")

@kotlinx.serialization.Serializable private data class WishEnvelope(val item: WishItem)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun WishlistScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    val state = rememberLoadable { Api.get<Items<WishItem>>("/api/life/wishlist").items }
    val tagOptions = rememberTagOptions()
    var tab by remember { mutableStateOf("want") }
    var category by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<WishItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    var piggy by remember { mutableStateOf<WishItem?>(null) }
    // К каким поездкам относятся желания (по общему тегу или привязке)
    var trips by remember { mutableStateOf<Map<String, List<RelatedItem>>>(emptyMap()) }
    LaunchedEffect(state.data?.size) {
        trips =runCatching { Api.decode<BulkRelated>(Api.request("GET", "/api/life/links/related-bulk?type=wish&target=travel")).items }.getOrDefault(emptyMap())
    }

    fun replace(w: WishItem) { state.data = state.data?.map { if (it.id == w.id) w else it } }
    fun patch(id: Int, body: JsonObject) = scope.launch {
        runCatching { Api.decode<WishEnvelope>(Api.put("/api/life/wishlist/$id", body)).item }.getOrNull()?.let { replace(it) }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Вишлист", { nav.popBackStack() }) {
            IconButton({ adding = true }) { Icon(Icons.Default.Add, "Загадать", tint = Brand.Text) }
        }
        LoadableContent(state) { all ->
            val want = all.filter { it.status == "want" }
            val categories = all.mapNotNull { it.category?.ifBlank { null } }.distinct().sorted()
            val list = all.filter { it.status == tab && (category == null || it.category == category) }
                .sortedWith(if (tab == "got") compareByDescending { it.gotAt.orEmpty() } else compareByDescending { it.priority })
            val totals = want.groupBy { it.currency }.mapValues { (_, l) -> l.sumOf { it.price ?: 0.0 } to l.sumOf { minOf(it.saved, it.price ?: it.saved) } }
            LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
                item(span = { GridItemSpan(2) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            (if (want.isEmpty()) "Загадывайте, копите и отмечайте, что сбылось." else "${want.size} желаний · ${all.size - want.size} сбылось") +
                                totals.filter { it.value.first > 0 }.entries.joinToString("") { (c, t) -> " · отложено ${money(t.second, c)} из ${money(t.first, c)}" },
                            color = Brand.TextMuted, fontSize = 13.sp,
                        )
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            WishPill("✨ Хочу", tab == "want") { tab = "want" }
                            WishPill("🎁 Сбылось", tab == "got") { tab = "got" }
                            if (categories.isNotEmpty()) {
                                WishPill("Все", category == null, small = true) { category = null }
                                categories.forEach { c -> WishPill(c, category == c, small = true) { category = if (category == c) null else c } }
                            }
                        }
                    }
                }
                if (list.isEmpty()) item(span = { GridItemSpan(2) }) {
                    EmptyState(if (tab == "want") "🌠" else "🎁", if (tab == "want") "Доска пока пустая" else "Пока ничего не сбылось", if (tab == "want") "Нажмите «+», чтобы загадать первое желание." else "Отметьте желание кнопкой «Сбылось».")
                }
                items(list, key = { it.id }) { w ->
                    Polaroid(w, trips[w.id.toString()].orEmpty(), onOpen = { editing = w }, onPiggy = { piggy = w },
                        onFulfil = { patch(w.id, buildJsonObject { put("status", if (w.status == "got") "want" else "got") }) },
                        onPriority = { p -> replace(w.copy(priority = p)); patch(w.id, buildJsonObject { put("priority", p) }) })
                }
            }
        }
    }

    if (adding || editing != null) {
        WishEditorSheet(editing, tagOptions, state.data.orEmpty().mapNotNull { it.category?.ifBlank { null } }.distinct(),
            onDismiss = { adding = false; editing = null },
            onDelete = editing?.let { w -> {
                editing = null
                scope.launch { runCatching { Api.delete("/api/life/wishlist/${w.id}") }; state.reload() }
            } },
            onOpen = { route -> editing = null; adding = false; nav.navigate(route) },
        ) { body ->
            val current = editing
            adding = false; editing = null
            scope.launch {
                runCatching { if (current == null) Api.post("/api/life/wishlist", body) else Api.put("/api/life/wishlist/${current.id}", body) }
                state.reload()
            }
        }
    }
    piggy?.let { w ->
        PiggyDialog(w, onDismiss = { piggy = null }) { saved ->
            piggy = null
            replace(w.copy(saved = saved))
            patch(w.id, buildJsonObject { put("saved", saved) })
        }
    }
}

@kotlinx.serialization.Serializable private data class BulkRelated(val items: Map<String, List<RelatedItem>> = emptyMap())

@Composable
private fun WishPill(text: String, selected: Boolean, small: Boolean = false, onClick: () -> Unit) {
    Text(
        text, fontSize = if (small) 12.sp else 13.sp, color = if (selected) Brand.Text else Brand.TextMuted,
        modifier = Modifier.clip(CircleShape).background(if (selected) Brand.Mint.copy(alpha = 0.22f) else Color.Transparent)
            .border(1.dp, if (selected) Brand.Mint else Brand.Ink.copy(alpha = 0.1f), CircleShape)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = if (small) 5.dp else 7.dp),
    )
}

@Composable
private fun Hearts(value: Int, size: Int = 18, onChange: (Int) -> Unit) {
    Row {
        (1..3).forEach { v ->
            Icon(if (v <= value) Icons.Default.Favorite else Icons.Default.FavoriteBorder, null, tint = if (v <= value) Color(0xFFF43F5E) else Color(0xFF94A3B8),
                modifier = Modifier.size(size.dp).clip(CircleShape).clickable { onChange(v) })
        }
    }
}

/** Полароид на пробковой доске: картинка, подпись от руки, цена, копилка. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Polaroid(w: WishItem, trips: List<RelatedItem>, onOpen: () -> Unit, onPiggy: () -> Unit, onFulfil: () -> Unit, onPriority: (Int) -> Unit) {
    val got = w.status == "got"
    Box(Modifier.rotate(TILTS[w.id % TILTS.size]).padding(top = 8.dp)) {
        Column(
            Modifier.fillMaxWidth().shadow(8.dp, RoundedCornerShape(4.dp)).clip(RoundedCornerShape(4.dp))
                .background(CORK).padding(0.dp),
        ) {
            Column(Modifier.fillMaxWidth().background(PAPER).clickable(onClick = onOpen).padding(8.dp)) {
                Box {
                    CoverImage(w.imageUrl, "🎁", Modifier.fillMaxWidth().aspectRatio(1f), RoundedCornerShape(2.dp))
                    if (got) Text("СБЫЛОСЬ", color = Color(0xFF047857), fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).rotate(12f).border(2.dp, Color(0xFF059669), RoundedCornerShape(3.dp)).background(Color.White.copy(alpha = 0.85f)).padding(horizontal = 5.dp, vertical = 1.dp))
                }
                Text(w.title, color = INK, fontFamily = FontFamily.Cursive, fontSize = 17.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 19.sp, modifier = Modifier.padding(top = 6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (w.price != null) money(w.price, w.currency) else "без цены", color = if (w.price != null) INK else Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    if (!got) Hearts(w.priority, 15, onPriority)
                }
                if (!got) SavingsBar(w.price, w.saved, w.currency, light = true)
                if (trips.isNotEmpty() || w.tags.isNotEmpty()) FlowRow(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    trips.forEach { t -> Text("🗺️ ${t.title}", fontSize = 10.sp, color = Color(0xFF075985), modifier = Modifier.clip(CircleShape).background(Color(0xFFE0F2FE)).padding(horizontal = 5.dp, vertical = 1.dp)) }
                    w.tags.forEach { t -> Text("#${t.label}", fontSize = 10.sp, color = cssColor(t.color)) }
                }
                Row(Modifier.padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (!got) Text("🐷 Копилка", fontSize = 12.sp, color = Color(0xFF475569), modifier = Modifier.clickable(onClick = onPiggy).padding(vertical = 3.dp))
                    Text(if (got) "↩ Вернуть" else "🎁 Сбылось", fontSize = 12.sp, color = Color(0xFF475569), modifier = Modifier.clickable(onClick = onFulfil).padding(vertical = 3.dp))
                }
            }
        }
        // кнопка-гвоздик
        Box(Modifier.align(Alignment.TopCenter).offset(y = (-8).dp).size(16.dp).shadow(3.dp, CircleShape).clip(CircleShape).background(PINS[w.id % PINS.size]))
    }
}

@Composable
private fun PiggyDialog(w: WishItem, onDismiss: () -> Unit, onApply: (Double) -> Unit) {
    var amount by remember { mutableStateOf("") }
    val value = amount.replace(',', '.').toDoubleOrNull() ?: 0.0
    val left = w.price?.let { maxOf(0.0, it - w.saved) }
    AlertDialog(
        onDismissRequest = onDismiss, containerColor = Brand.Night,
        title = { Text("🐷 ${w.title}", maxLines = 2) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Отложено ${money(w.saved, w.currency)}" + (left?.let { " · осталось ${money(it, w.currency)}" } ?: ""), color = Brand.TextMuted, fontSize = 13.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(500, 1000, 5000).forEach { v -> WishPill("+$v", false, small = true) { amount = v.toString() } }
                    if (left != null && left > 0) WishPill("до цели", false, small = true) { amount = left.toLong().toString() }
                }
                OutlinedTextField(amount, { amount = it }, label = { Text("Сумма, ${currencySign(w.currency)}") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = { TextButton(enabled = value > 0, onClick = { onApply(w.saved + value) }) { Text("Отложить", color = Brand.Mint) } },
        dismissButton = { TextButton(enabled = value > 0, onClick = { onApply(maxOf(0.0, w.saved - value)) }) { Text("Взять", color = Brand.TextMuted) } },
    )
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun WishEditorSheet(
    wish: WishItem?, tagOptions: List<PageTag>, categories: List<String>,
    onDismiss: () -> Unit, onDelete: (() -> Unit)?, onOpen: (String) -> Unit, onSave: (JsonObject) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val uri = LocalUriHandler.current
    var title by remember { mutableStateOf(wish?.title.orEmpty()) }
    var link by remember { mutableStateOf(wish?.link.orEmpty()) }
    var image by remember { mutableStateOf(wish?.imageUrl.orEmpty()) }
    var price by remember { mutableStateOf(wish?.price?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()) }
    var saved by remember { mutableStateOf(wish?.saved?.takeIf { it > 0 }?.let { if (it % 1.0 == 0.0) it.toLong().toString() else it.toString() }.orEmpty()) }
    var currency by remember { mutableStateOf(wish?.currency ?: "RUB") }
    var category by remember { mutableStateOf(wish?.category.orEmpty()) }
    var priority by remember { mutableStateOf(wish?.priority ?: 2) }
    var note by remember { mutableStateOf(wish?.note.orEmpty()) }
    var tags by remember { mutableStateOf(wish?.tags.orEmpty().map { it.id }.toSet()) }
    var hint by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { u: Uri? ->
        u ?: return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            runCatching { uploadFile(context, u, "image").first }.onSuccess { image = it }.onFailure { hint = "Не удалось загрузить: ${it.message}" }
            busy = false
        }
    }
    fun fromLink() = scope.launch {
        if (link.isBlank()) return@launch
        busy = true; hint = null
        runCatching { Api.get<WishPreview>("/api/life/wishlist/preview?url=" + URLEncoder.encode(link.trim(), "UTF-8")) }
            .onSuccess { p ->
                if (p.error != null) hint = p.error
                else {
                    if (title.isBlank()) title = p.title.orEmpty()
                    if (image.isBlank()) image = p.imageUrl.orEmpty()
                    if (price.isBlank()) p.price?.let { price = it.toLong().toString() }
                    p.currency?.let { currency = it }
                    hint = if (p.title != null || p.imageUrl != null) "Заполнено со страницы — проверьте" else "Магазин не отдал данные, заполните вручную"
                }
            }.onFailure { hint = it.message }
        busy = false
    }

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Brand.Night, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 18.dp).padding(bottom = 28.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(if (wish == null) "Загадать желание" else "Желание", fontSize = 19.sp, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(link, { link = it }, label = { Text("Ссылка на товар") }, singleLine = true, modifier = Modifier.weight(1f))
                TextButton(enabled = link.isNotBlank() && !busy, onClick = { fromLink() }) { Text("По ссылке", color = Brand.Mint) }
            }
            hint?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp) }
            Row {
                Box(Modifier.size(112.dp).clip(RoundedCornerShape(16.dp)).border(1.dp, Brand.Ink.copy(alpha = 0.15f), RoundedCornerShape(16.dp)).clickable { picker.launch("image/*") }, contentAlignment = Alignment.Center) {
                    if (image.isBlank()) Text("🖼️\nКартинка", color = Brand.TextMuted, fontSize = 12.sp) else CoverImage(image, "🎁", Modifier.fillMaxSize(), RoundedCornerShape(16.dp))
                    if (busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = Brand.Mint)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(title, { title = it }, label = { Text("Чего хочется?") }, modifier = Modifier.fillMaxWidth())
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Насколько хочется", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.weight(1f))
                        Hearts(priority, 22) { priority = it }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedTextField(price, { price = it }, label = { Text("Цена") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
                OutlinedTextField(saved, { saved = it }, label = { Text("Отложено") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.weight(1f))
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                CURRENCIES.forEach { c -> WishPill("${currencySign(c)} $c", currency == c, small = true) { currency = c } }
            }
            OutlinedTextField(category, { category = it }, label = { Text("Категория: техника, одежда, хобби…") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            if (categories.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { categories.forEach { c -> WishPill(c, category == c, small = true) { category = c } } }
            OutlinedTextField(image, { image = it }, label = { Text("…или ссылка на картинку") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(note, { note = it }, label = { Text("Заметка: размер, цвет, зачем хочется…") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            Text("ТЕГИ", color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            TagPicker(tagOptions, tags) { id -> tags = if (id in tags) tags - id else tags + id }
            if (wish != null) RelatedSection("wish", wish.id, onOpen)
            else Text("После сохранения желание можно связать с поездкой, страницей или целью — общим тегом или вручную.", color = Brand.TextFaint, fontSize = 12.sp)
            wish?.link?.takeIf { it.isNotBlank() }?.let { l -> Text("Открыть ссылку ↗", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clickable { runCatching { uri.openUri(l) } }) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (onDelete != null) Text(if (confirmDelete) "Точно удалить?" else "🗑 Удалить", color = Brand.Rose, fontSize = 14.sp,
                    modifier = Modifier.clip(CircleShape).clickable { if (confirmDelete) onDelete() else confirmDelete = true }.padding(vertical = 6.dp))
                Spacer(Modifier.weight(1f))
                Text("Сохранить", color = Brand.Deep, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(if (title.isNotBlank()) Brand.Mint else Brand.Mint.copy(alpha = 0.4f))
                        .clickable(enabled = title.isNotBlank()) {
                            onSave(buildJsonObject {
                                put("title", title.trim()); put("link", link.trim()); put("image_url", image.trim())
                                price.replace(',', '.').toDoubleOrNull()?.let { put("price", it) } ?: put("price", JsonNull)
                                put("saved", saved.replace(',', '.').toDoubleOrNull() ?: 0.0)
                                put("currency", currency); put("category", category.trim()); put("priority", priority); put("note", note.trim())
                                putJsonArray("tags") { tags.forEach { add(it) } }
                            })
                        }.padding(horizontal = 18.dp, vertical = 10.dp))
            }
        }
    }
}
