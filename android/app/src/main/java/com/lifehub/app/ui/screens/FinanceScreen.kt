package com.lifehub.app.ui.screens

import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Api
import com.lifehub.app.data.BankAccount
import com.lifehub.app.data.ImportResult
import com.lifehub.app.data.Items
import com.lifehub.app.data.Loan
import com.lifehub.app.data.Transaction
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.ChunkyButton
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.EmptyState
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

private data class FinanceData(val items: List<Transaction>, val accounts: List<BankAccount>, val loans: List<Loan>)

private val MCC = mapOf(
    "Продукты" to listOf(5411, 5422, 5441, 5451, 5462, 5499),
    "Кафе и рестораны" to listOf(5811, 5812, 5813, 5814),
    "Транспорт" to listOf(4111, 4112, 4121, 4131, 4511, 4789, 5541, 5542, 7523),
    "Подписки и связь" to listOf(4812, 4814, 4816, 4899, 5815, 5816, 5817, 5818),
    "Дом" to listOf(5200, 5211, 5251, 5712, 5719, 5722, 5732, 4900),
    "Здоровье" to listOf(5912, 8011, 8021, 8043, 8062, 8099),
    "Хобби и развлечения" to listOf(5942, 5943, 5944, 5945, 5947, 7832, 7922, 7941, 7991, 7997, 7999),
    "Одежда" to listOf(5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699),
    "Магазины" to listOf(5999, 5311, 5331, 5399, 5964),
    "Учёба" to listOf(8220, 8241, 8244, 8249, 8299),
).flatMap { (label, codes) -> codes.map { it to label } }.toMap()

private val KEYWORDS = listOf(
    "Продукты" to listOf("пятероч", "перекрест", "магнит", "лента", "вкусвилл", "ашан", "дикси", "самокат"),
    "Кафе и рестораны" to listOf("кофе", "coffee", "кафе", "ресторан", "бургер", "kfc", "додо"),
    "Транспорт" to listOf("такси", "uber", "яндекс го", "yandex go", "метро", "азс", "лукойл"),
    "Подписки и связь" to listOf("netflix", "spotify", "кинопоиск", "яндекс плюс", "мтс", "билайн", "мегафон", "теле2", "steam"),
    "Здоровье" to listOf("аптека", "клиника", "стоматолог"),
    "Магазины" to listOf("ozon", "озон", "wildberries", "яндекс маркет", "aliexpress"),
)

private val CATEGORY_COLORS = mapOf(
    "Продукты" to Color(0xFF34D399), "Кафе и рестораны" to Color(0xFFF97316), "Транспорт" to Color(0xFF38BDF8),
    "Подписки и связь" to Color(0xFF8B5CF6), "Дом" to Color(0xFFFACC15), "Здоровье" to Color(0xFFF87171),
    "Магазины" to Color(0xFFF472B6), "Одежда" to Color(0xFFC084FC), "Учёба" to Color(0xFF22D3EE),
    "Хобби и развлечения" to Color(0xFFA3E635),
)

private val EXPENSE_CATEGORIES = listOf("🛒 Продукты", "☕ Кафе и рестораны", "🚕 Транспорт", "🏠 Дом", "💊 Здоровье", "🎮 Хобби и развлечения", "📱 Подписки и связь", "👕 Одежда", "🎁 Подарки", "📚 Учёба")
private val INCOME_CATEGORIES = listOf("💼 Зарплата", "💸 Подработка", "🎁 Подарок", "↩️ Возврат")

/** Категория: ручная → по MCC → по описанию → «Прочее» (как в веб-версии). */
private fun categoryOf(tx: Transaction): String {
    tx.category?.takeIf { it.isNotBlank() }?.let { return it }
    if (tx.amount > 0) return "Доход"
    tx.mcc?.let { MCC[it] }?.let { return it }
    val d = (tx.description ?: "").lowercase()
    return KEYWORDS.firstOrNull { (_, words) -> words.any { it in d } }?.first ?: "Прочее"
}

private val money: NumberFormat = NumberFormat.getIntegerInstance(Locale("ru")).apply { maximumFractionDigits = 0 }
private fun rub(value: Double) = "${money.format(Math.round(value))} ₽"

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun FinanceScreen(onBack: () -> Unit, startAdding: Boolean = false) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var month by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    val state = rememberLoadable(month) {
        val end = month.plusMonths(1).minusDays(1)
        coroutineScope {
            val tx = async { Api.get<Items<Transaction>>("/api/banks/transactions?from=$month&to=$end&limit=5000").items }
            val acc = async { runCatching { Api.get<Items<BankAccount>>("/api/banks/accounts").items }.getOrDefault(emptyList()) }
            val loans = async { runCatching { Api.get<Items<Loan>>("/api/loans/summary").items }.getOrDefault(emptyList()) }
            FinanceData(tx.await(), acc.await(), loans.await())
        }
    }
    var adding by remember { mutableStateOf<String?>(if (startAdding) "expense" else null) }
    var filter by remember { mutableStateOf<String?>(null) }
    var importMessage by remember { mutableStateOf<String?>(null) }
    var importing by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var txMenu by remember { mutableStateOf<Transaction?>(null) }
    var loanEdit by remember { mutableStateOf<Loan?>(null) }
    var loanAdd by remember { mutableStateOf(false) }

    // Выбор CSV-файла выписки
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        importing = true
        scope.launch {
            importMessage = try {
                val (name, bytes) = withContext(Dispatchers.IO) {
                    val resolver = context.contentResolver
                    val fileName = resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                        if (c.moveToFirst()) c.getString(0) else null
                    } ?: "statement.csv"
                    fileName to (resolver.openInputStream(uri)?.use { it.readBytes() } ?: ByteArray(0))
                }
                val res = Api.decode<ImportResult>(Api.upload("/api/banks/import/csv", "file", name, bytes))
                Achievements.requestCheck()
                state.reload()
                buildString {
                    append("Загружено операций: ${res.imported}")
                    if (res.duplicates > 0) append("\nУже были загружены: ${res.duplicates}")
                    if (res.skipped > 0) append("\nПропущено строк: ${res.skipped}")
                }
            } catch (e: Exception) {
                "Не получилось: ${e.message}"
            } finally {
                importing = false
            }
        }
    }

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Финансы", onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ChunkyButton("+ Расход", Modifier.weight(1f), color = Brand.Rose, shadow = Color(0xFF9F1239), textColor = Brand.Deep) { adding = "expense" }
                ChunkyButton("+ Доход", Modifier.weight(1f), color = Color(0xFF34D399), shadow = Color(0xFF047857), textColor = Brand.Deep) { adding = "income" }
            }
            Spacer(Modifier.height(8.dp))
            ChunkyButton(if (importing) "Разбираем выписку…" else "📄 Загрузить выписку (CSV)", Modifier.fillMaxWidth(), color = Brand.CardHigh, shadow = Color.Black.copy(alpha = 0.4f), enabled = !importing) {
                picker.launch(arrayOf("text/*", "text/csv", "text/comma-separated-values", "application/csv", "application/vnd.ms-excel", "*/*"))
            }
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                IconButton(onClick = { month = month.minusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Предыдущий месяц") }
                Text(
                    "${month.month.getDisplayName(TextStyle.FULL_STANDALONE, Locale("ru")).replaceFirstChar { it.uppercase() }} ${month.year}",
                    fontWeight = FontWeight.Bold, fontSize = 17.sp,
                )
                IconButton(onClick = { month = month.plusMonths(1) }) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Следующий месяц") }
            }
            LoadableContent(state) { data ->
                val expense = data.items.filter { it.amount < 0 }.sumOf { -it.amount }
                val income = data.items.filter { it.amount > 0 }.sumOf { it.amount }
                val today = LocalDate.now()
                val days = if (today.year == month.year && today.month == month.month) today.dayOfMonth else month.lengthOfMonth()
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("Расходы", rub(expense), Brand.Rose, Modifier.weight(1f))
                    Stat("Доходы", rub(income), Color(0xFF34D399), Modifier.weight(1f))
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat("Баланс", (if (income - expense > 0) "+" else "") + rub(income - expense), if (income >= expense) Color(0xFF34D399) else Brand.Rose, Modifier.weight(1f))
                    Stat("В день", rub(expense / days.coerceAtLeast(1)), Brand.Text, Modifier.weight(1f))
                }

                if (data.items.isEmpty()) {
                    EmptyState("💸", "За этот месяц операций нет", "Загрузите выписку из банка (CSV) или добавьте расход вручную.")
                } else {
                    val byCategory = data.items.filter { it.amount < 0 }.groupBy(::categoryOf).mapValues { (_, l) -> l.sumOf { -it.amount } }.toList().sortedByDescending { it.second }
                    SectionTitle("Расходы по дням")
                    LhCard(Modifier.fillMaxWidth()) { DailyBars(data.items, month) }
                    SectionTitle("Куда ушли деньги")
                    LhCard(Modifier.fillMaxWidth()) {
                        byCategory.forEach { (label, value) ->
                            Column(Modifier.fillMaxWidth().clip(CircleShape).clickable { filter = if (filter == label) null else label }.padding(vertical = 4.dp)) {
                                Row {
                                    Text(label, fontSize = 14.sp, color = if (filter == label) Brand.Mint else Brand.Text, modifier = Modifier.weight(1f))
                                    Text(rub(value), fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                                }
                                val c = CATEGORY_COLORS[label] ?: Color(0xFF94A3B8)
                                ProgressBar((value / expense.coerceAtLeast(1.0)).toFloat(), height = 5.dp, colors = listOf(c, c))
                            }
                        }
                    }
                    SectionTitle("Операции" + (filter?.let { " · $it" } ?: "")) {
                        if (filter != null) Text("сбросить", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clickable { filter = null })
                    }
                    OutlinedTextField(
                        query, { query = it }, placeholder = { Text("Найти операцию") }, singleLine = true, colors = authFieldColors(),
                        leadingIcon = { Icon(Icons.Default.Search, null, tint = Brand.TextMuted) },
                        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                    )
                    val fmt = DateTimeFormatter.ofPattern("d MMMM, EE", Locale("ru"))
                    val q = query.trim().lowercase()
                    data.items.filter { filter == null || categoryOf(it) == filter }
                        .filter { q.isEmpty() || (it.description ?: "").lowercase().contains(q) || categoryOf(it).lowercase().contains(q) || (it.accountBank ?: "").lowercase().contains(q) }
                        .groupBy { Instant.ofEpochMilli(it.ts).atZone(ZoneId.systemDefault()).toLocalDate() }
                        .forEach { (date, list) ->
                            Row(Modifier.padding(top = 8.dp, bottom = 4.dp)) {
                                Text(date.format(fmt), color = Brand.TextFaint, fontSize = 12.sp, modifier = Modifier.weight(1f))
                                Text(rub(list.sumOf { it.amount }), color = Brand.TextFaint, fontSize = 12.sp)
                            }
                            LhCard(Modifier.fillMaxWidth(), padding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 4.dp)) {
                                list.forEach { tx ->
                                    val cat = categoryOf(tx)
                                    Row(Modifier.fillMaxWidth().clickable { txMenu = tx }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Box(Modifier.size(9.dp).clip(CircleShape).background(if (tx.amount > 0) Color(0xFF34D399) else CATEGORY_COLORS[cat] ?: Color(0xFF94A3B8)))
                                        Spacer(Modifier.width(10.dp))
                                        Column(Modifier.weight(1f)) {
                                            Text(tx.description?.takeIf { it.isNotBlank() } ?: cat, fontSize = 14.sp, maxLines = 1)
                                            Text(cat + (tx.accountBank?.let { " · $it" } ?: ""), fontSize = 11.sp, color = Brand.TextMuted, maxLines = 1)
                                        }
                                        Text((if (tx.amount > 0) "+" else "") + rub(tx.amount), fontWeight = FontWeight.SemiBold, color = if (tx.amount > 0) Color(0xFF34D399) else Brand.Text)
                                    }
                                }
                            }
                        }
                }

                SectionTitle("Загруженные выписки")
                if (data.accounts.isEmpty()) Text("Пока ни одной. Выгрузите выписку в CSV из приложения или веб-версии банка.", color = Brand.TextMuted, fontSize = 13.sp)
                data.accounts.forEach { acc ->
                    LhCard(Modifier.fillMaxWidth().padding(bottom = 6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(acc.bank, fontWeight = FontWeight.SemiBold)
                                Text("${acc.transactions} операций", color = Brand.TextMuted, fontSize = 12.sp)
                            }
                            IconButton(onClick = { scope.launch { runCatching { Api.delete("/api/banks/accounts/${acc.id}") }; state.reload() } }) {
                                Icon(Icons.Default.Delete, "Удалить выписку", tint = Brand.TextFaint)
                            }
                        }
                    }
                }
                SectionTitle(if (data.loans.isEmpty()) "Кредиты" else "Кредиты · ${rub(data.loans.sumOf { it.paymentMonthly })} в месяц") {
                    Text("+ кредит", color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable { loanAdd = true }.padding(horizontal = 6.dp, vertical = 2.dp))
                }
                run {
                    data.loans.forEach { loan ->
                        LhCard(Modifier.fillMaxWidth().padding(bottom = 6.dp), onClick = { loanEdit = loan }) {
                            Text(loan.bank.ifBlank { "Кредит" }, fontWeight = FontWeight.SemiBold)
                            Text("${rub(loan.paymentMonthly)} в месяц · платёж ${loan.dueDay}-го · осталось ${rub(loan.remaining)}", color = Brand.TextMuted, fontSize = 12.sp)
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    adding?.let { kind -> ExpenseDialog(kind, onDismiss = { adding = null }) { amount, category, comment ->
        adding = null
        scope.launch {
            runCatching {
                Api.post("/api/banks/transactions", buildJsonObject {
                    put("amount", amount); put("kind", kind); put("description", comment); put("date", LocalDate.now().toString())
                    category?.let { put("category", it) }
                })
            }
            Achievements.requestCheck()
            state.reload()
        }
    } }

    txMenu?.let { tx ->
        TransactionDialog(tx, categoryOf(tx), onDismiss = { txMenu = null }, onCategory = { cat ->
            txMenu = null
            scope.launch {
                runCatching { Api.patch("/api/banks/transactions/${tx.id}", buildJsonObject { if (cat == null) put("category", kotlinx.serialization.json.JsonNull) else put("category", cat) }) }
                state.reload()
            }
        }, onDelete = {
            txMenu = null
            scope.launch { runCatching { Api.delete("/api/banks/transactions/${tx.id}") }; state.reload() }
        })
    }

    if (loanAdd || loanEdit != null) {
        LoanDialog(loanEdit, onDismiss = { loanAdd = false; loanEdit = null }, onDelete = loanEdit?.let { l -> {
            loanEdit = null
            scope.launch { runCatching { Api.delete("/api/loans/${l.id}") }; state.reload() }
        } }) { bank, payment, remaining, due ->
            val editing = loanEdit
            loanAdd = false; loanEdit = null
            scope.launch {
                val body = buildJsonObject { put("bank", bank); put("payment_monthly", payment); put("remaining", remaining); put("due_day", due) }
                runCatching { if (editing == null) Api.post("/api/loans", body) else Api.put("/api/loans/${editing.id}", body) }
                state.reload()
            }
        }
    }

    importMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = { importMessage = null },
            title = { Text("Выписка") },
            text = { Text(msg) },
            confirmButton = { TextButton(onClick = { importMessage = null }) { Text("Готово") } },
            containerColor = Brand.Night,
        )
    }
}

@Composable
private fun Stat(label: String, value: String, color: Color, modifier: Modifier) {
    LhCard(modifier) {
        Text(label, color = Brand.TextMuted, fontSize = 12.sp)
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 18.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExpenseDialog(kind: String, onDismiss: () -> Unit, onSave: (Double, String?, String) -> Unit) {
    var amount by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<String?>(null) }
    var comment by remember { mutableStateOf("") }
    val value = amount.replace(',', '.').toDoubleOrNull() ?: 0.0
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (kind == "expense") "Новый расход" else "Новый доход") },
        text = {
            Column {
                OutlinedTextField(amount, { amount = it.filter { c -> c.isDigit() || c == ',' || c == '.' } }, label = { Text("Сумма, ₽") }, colors = authFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
                FlowRow(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    (if (kind == "expense") EXPENSE_CATEGORIES else INCOME_CATEGORIES).forEach { c ->
                        Chip(c, if (category == c) Brand.Mint else Brand.TextMuted, Modifier.clickable { category = if (category == c) null else c })
                    }
                }
                OutlinedTextField(comment, { comment = it }, label = { Text("Комментарий") }, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(enabled = value > 0, onClick = { onSave(value, category?.substringAfter(' '), comment.trim()) }) { Text("Сохранить") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        containerColor = Brand.Night,
    )
}

/** Столбики расходов по дням месяца, как график в веб-версии. */
@Composable
private fun DailyBars(items: List<Transaction>, month: LocalDate) {
    val zone = ZoneId.systemDefault()
    val days = month.lengthOfMonth()
    val sums = DoubleArray(days)
    items.filter { it.amount < 0 }.forEach { tx ->
        val d = Instant.ofEpochMilli(tx.ts).atZone(zone).toLocalDate()
        if (d.year == month.year && d.month == month.month) sums[d.dayOfMonth - 1] += -tx.amount
    }
    val max = sums.maxOrNull()?.takeIf { it > 0 } ?: 1.0
    var picked by remember(month) { mutableStateOf<Int?>(null) }
    Column {
        Row(Modifier.fillMaxWidth().height(120.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            sums.forEachIndexed { i, v ->
                Box(
                    Modifier.weight(1f).fillMaxHeight().clickable { picked = if (picked == i) null else i },
                    contentAlignment = Alignment.BottomCenter,
                ) {
                    Box(
                        Modifier.fillMaxWidth().fillMaxHeight((v / max).toFloat().coerceAtLeast(if (v > 0) 0.02f else 0f))
                            .clip(RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp))
                            .background(if (picked == i) Brand.Amber else Brand.Rose),
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
            listOf(1, 8, 15, 22, days).forEachIndexed { idx, d ->
                Text("$d", fontSize = 10.sp, color = Brand.TextFaint, modifier = Modifier.weight(1f),
                    textAlign = if (idx == 4) androidx.compose.ui.text.style.TextAlign.End else androidx.compose.ui.text.style.TextAlign.Start)
            }
        }
        picked?.let { i -> Text("${i + 1} ${month.month.getDisplayName(TextStyle.FULL, Locale("ru"))}: ${rub(sums[i])}", fontSize = 12.sp, color = Brand.Amber, modifier = Modifier.padding(top = 4.dp)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TransactionDialog(tx: Transaction, current: String, onDismiss: () -> Unit, onCategory: (String?) -> Unit, onDelete: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tx.description?.takeIf { it.isNotBlank() } ?: current, maxLines = 2) },
        text = {
            Column {
                Text((if (tx.amount > 0) "+" else "") + rub(tx.amount) + (tx.accountBank?.let { " · $it" } ?: ""), color = Brand.TextMuted)
                Text("Категория", color = Brand.TextMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 10.dp))
                FlowRow(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    (if (tx.amount > 0) INCOME_CATEGORIES else EXPENSE_CATEGORIES).forEach { c ->
                        val label = c.substringAfter(' ')
                        Chip(c, if (label == current) Brand.Mint else Brand.TextMuted, Modifier.clickable { onCategory(label) })
                    }
                    Chip("↺ Авто", Brand.TextMuted, Modifier.clickable { onCategory(null) })
                }
                Text(
                    if (confirm) "Точно удалить? Нажмите ещё раз" else "Удалить операцию",
                    color = Brand.Rose, fontSize = 13.sp,
                    modifier = Modifier.padding(top = 8.dp).clip(CircleShape).clickable { if (confirm) onDelete() else confirm = true }.padding(vertical = 6.dp),
                )
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Готово") } },
        containerColor = Brand.Night,
    )
}

@Composable
private fun LoanDialog(loan: Loan?, onDismiss: () -> Unit, onDelete: (() -> Unit)?, onSave: (String, Double, Double, String) -> Unit) {
    var bank by remember { mutableStateOf(loan?.bank.orEmpty()) }
    var payment by remember { mutableStateOf(loan?.paymentMonthly?.takeIf { it > 0 }?.let { Math.round(it).toString() }.orEmpty()) }
    var remaining by remember { mutableStateOf(loan?.remaining?.takeIf { it > 0 }?.let { Math.round(it).toString() }.orEmpty()) }
    var due by remember { mutableStateOf(loan?.dueDay ?: "1") }
    var confirm by remember { mutableStateOf(false) }
    val num = { v: String -> v.replace(',', '.').toDoubleOrNull() ?: 0.0 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (loan == null) "Новый кредит" else "Кредит") },
        text = {
            Column {
                OutlinedTextField(bank, { bank = it }, label = { Text("Банк") }, singleLine = true, colors = authFieldColors(), modifier = Modifier.fillMaxWidth())
                OutlinedTextField(payment, { payment = it.filter { c -> c.isDigit() || c == ',' || c == '.' } }, label = { Text("Платёж в месяц, ₽") }, singleLine = true, colors = authFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                OutlinedTextField(remaining, { remaining = it.filter { c -> c.isDigit() || c == ',' || c == '.' } }, label = { Text("Осталось выплатить, ₽") }, singleLine = true, colors = authFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                OutlinedTextField(due, { due = it.filter(Char::isDigit).take(2) }, label = { Text("День платежа") }, singleLine = true, colors = authFieldColors(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
                if (onDelete != null) {
                    Text(
                        if (confirm) "Точно удалить? Нажмите ещё раз" else "Удалить кредит",
                        color = Brand.Rose, fontSize = 13.sp,
                        modifier = Modifier.padding(top = 10.dp).clip(CircleShape).clickable { if (confirm) onDelete() else confirm = true }.padding(vertical = 6.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(enabled = bank.isNotBlank(), onClick = { onSave(bank.trim(), num(payment), num(remaining), due.ifBlank { "1" }) }) { Text("Сохранить") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Отмена") } },
        containerColor = Brand.Night,
    )
}
