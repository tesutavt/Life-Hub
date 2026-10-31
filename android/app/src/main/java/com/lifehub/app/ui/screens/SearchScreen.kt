package com.lifehub.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import com.lifehub.app.data.Api
import com.lifehub.app.data.PageTagRef
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.theme.Brand
import kotlinx.coroutines.delay
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.net.URLEncoder

@Serializable data class SearchPage(val id: Int = 0, val title: String? = null, val snippet: String? = null, @SerialName("updated_at") val updatedAt: String? = null, val pinned: Boolean = false, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchBookmark(val id: String = "", @SerialName("marker_title") val markerTitle: String = "", @SerialName("page_number") val pageNumber: Int? = null, @SerialName("pdf_title") val pdfTitle: String = "", @SerialName("page_id") val pageId: Int = 0, @SerialName("page_title") val pageTitle: String = "")
@Serializable data class SearchLanguage(val id: Int = 0, val name: String = "", val level: String? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchCourse(val id: Int = 0, val title: String = "", val provider: String? = null, val progress: Double? = null, val status: String? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchTravel(val id: Int = 0, val title: String = "", val location: String? = null, @SerialName("date_from") val dateFrom: String? = null, @SerialName("date_to") val dateTo: String? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchLoan(val id: Int = 0, val bank: String = "", @SerialName("payment_monthly") val paymentMonthly: Double? = null, val remaining: Double? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchHabit(val id: Int = 0, val title: String = "", @SerialName("target_per_week") val targetPerWeek: Int? = null, @SerialName("done_this_week") val doneThisWeek: Int? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchEvent(val id: Int = 0, val date: String = "", val title: String = "", val type: String = "", val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchGoal(val id: Int = 0, val title: String = "", @SerialName("completion_pct") val completionPct: Int = 0, val status: String = "")
@Serializable data class SearchLearnCourse(val id: Int = 0, val title: String = "", val description: String? = null, val icon: String? = null)
@Serializable data class SearchLearnLesson(val id: Int = 0, val title: String = "", @SerialName("course_title") val courseTitle: String = "", val icon: String? = null)
@Serializable data class SearchVocab(val id: Int = 0, val term: String = "", val translation: String = "", val note: String? = null, @SerialName("language_id") val languageId: Int = 0, @SerialName("language_name") val languageName: String = "")
@Serializable data class SearchAchievement(val id: Int = 0, val title: String = "", val description: String? = null, val icon: String = "🏆", val earned: Boolean = false)

@Serializable data class SearchShelf(val id: Int = 0, val kind: String = "book", val title: String = "", val author: String? = null, val year: Int? = null, val status: String? = null, val tags: List<PageTagRef> = emptyList())
@Serializable data class SearchWish(val id: Int = 0, val title: String = "", val price: Double? = null, val currency: String? = null, val status: String? = null, val category: String? = null, val tags: List<PageTagRef> = emptyList())

@Serializable
data class SearchResponse(
    @SerialName("learn_courses") val learnCourses: List<SearchLearnCourse> = emptyList(),
    @SerialName("learn_lessons") val learnLessons: List<SearchLearnLesson> = emptyList(),
    val vocab: List<SearchVocab> = emptyList(),
    val achievements: List<SearchAchievement> = emptyList(),
    val tags: List<PageTagRef> = emptyList(),
    @SerialName("selected_tag") val selectedTag: PageTagRef? = null,
    @SerialName("tag_matches") val tagMatches: List<PageTagRef> = emptyList(),
    val pages: List<SearchPage> = emptyList(),
    @SerialName("pdf_bookmarks") val pdfBookmarks: List<SearchBookmark> = emptyList(),
    val languages: List<SearchLanguage> = emptyList(),
    val courses: List<SearchCourse> = emptyList(),
    val travel: List<SearchTravel> = emptyList(),
    val shelf: List<SearchShelf> = emptyList(),
    val wishlist: List<SearchWish> = emptyList(),
    val loans: List<SearchLoan> = emptyList(),
    val habits: List<SearchHabit> = emptyList(),
    val calendar: List<SearchEvent> = emptyList(),
    val goals: List<SearchGoal> = emptyList(),
)

/** Быстрые переходы — как searchCommands.ts в веб-версии. */
private data class SearchCommand(val emoji: String, val label: String, val hint: String, val route: String, val keywords: String)

private val COMMANDS = listOf(
    SearchCommand("🏠", "Главная", "дэшборд", "home", "главная домой дашборд dashboard обзор"),
    SearchCommand("👤", "Профиль", "уровень, активность, витрина", "profile", "профиль я аватар уровень xp витрина"),
    SearchCommand("📅", "Календарь", "события и смены", "calendar", "календарь события смены даты расписание"),
    SearchCommand("💰", "Финансы", "расходы, доходы, выписки", "finance", "финансы деньги расходы доходы траты выписка банк кредит бюджет"),
    SearchCommand("💸", "Добавить расход", "быстрая запись", "finance/add", "расход трата добавить купил"),
    SearchCommand("🎓", "Обучение", "курсы и языки", "learn", "курсы курс уроки обучение учеба учёба языки язык словарь японский английский duolingo"),
    SearchCommand("🎯", "Цели на год", "прогресс и отметки", "goals", "цели цель год годовые"),
    SearchCommand("📝", "Страницы", "заметки и конспекты", "pages", "страницы заметки дневник конспект журнал теги"),
    SearchCommand("✅", "Привычки", "отметить за сегодня", "habits", "привычки привычка отметить трекер"),
    SearchCommand("🔥", "Ежедневные задания", "награды и очки", "missions", "задания миссии награды очки квесты ежедневные"),
    SearchCommand("🏆", "Ачивки", "все достижения", "achievements", "ачивки достижения награды значки"),
    SearchCommand("🗺️", "Путешествия", "карта мест и поездок", "travel", "путешествия поездки отпуск карта мечты"),
    SearchCommand("📚", "Полка", "книги, манга, аниме, фильмы, игры", "shelf", "полка книги манга аниме фильмы сериалы игры музыка shikimori"),
    SearchCommand("🎁", "Вишлист", "желания и копилки", "wishlist", "вишлист желания хочу подарки копилка накопить"),
    SearchCommand("📊", "Отчёты", "итоги недели и месяца", "reports", "отчеты отчёты статистика итоги"),
    SearchCommand("🎨", "Оформление профиля", "фон и витрины", "customize", "оформление фон витрина стиль"),
    SearchCommand("⚙️", "Настройки", "напоминания, календарь", "settings", "настройки параметры напоминания уведомления сервер календарь"),
)

private fun norm(s: String) = s.lowercase().replace('ё', 'е').trim()

private fun matchCommands(query: String): List<SearchCommand> {
    val q = norm(query)
    if (q.isEmpty()) return emptyList()
    return COMMANDS.map { c ->
        val label = norm(c.label)
        val hay = "$label ${norm(c.keywords)} ${norm(c.hint)}"
        c to when { label.startsWith(q) -> 3; label.contains(q) -> 2; hay.contains(q) -> 1; else -> 0 }
    }.filter { it.second > 0 }.sortedByDescending { it.second }.take(6).map { it.first }
}

/** Глобальный поиск, как SiteSearch в веб: команды, теги, страницы, курсы, слова, ачивки и т.д. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SearchScreen(nav: NavController, initialTagId: Int? = null) {
    var input by remember { mutableStateOf("") }
    var tagId by remember { mutableStateOf(initialTagId) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var results by remember { mutableStateOf<SearchResponse?>(null) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    LaunchedEffect(input, tagId) {
        delay(250)
        val q = input.trim()
        loading = true
        error = null
        val params = buildList {
            if (q.isNotEmpty()) add("q=" + URLEncoder.encode(q, "UTF-8"))
            tagId?.let { add("tag_id=$it") }
            add("limit=20")
        }.joinToString("&")
        runCatching { Api.get<SearchResponse>("/api/life/search?$params") }
            .onSuccess { r ->
                val text = q.isNotEmpty()
                val any = text || tagId != null
                results = SearchResponse(
                    learnCourses = if (text) r.learnCourses else emptyList(),
                    learnLessons = if (text) r.learnLessons else emptyList(),
                    vocab = if (text) r.vocab else emptyList(),
                    achievements = if (text) r.achievements else emptyList(),
                    tags = r.tags, selectedTag = r.selectedTag,
                    tagMatches = if (text) r.tagMatches else emptyList(),
                    pages = if (any) r.pages else emptyList(),
                    pdfBookmarks = if (text) r.pdfBookmarks else emptyList(),
                    languages = if (any) r.languages else emptyList(),
                    courses = if (any) r.courses else emptyList(),
                    travel = if (any) r.travel else emptyList(),
                    loans = if (any) r.loans else emptyList(),
                    habits = if (any) r.habits else emptyList(),
                    calendar = if (any) r.calendar else emptyList(),
                    goals = if (text) r.goals else emptyList(),
                )
                if (tagId != null && r.selectedTag == null) tagId = null
            }
            .onFailure { error = it.message ?: "Не удалось выполнить поиск"; results = null }
        loading = false
    }

    fun go(route: String) = nav.navigate(route)
    val commands = matchCommands(input)

    Column(Modifier.fillMaxSize().background(Brand.Deep)) {
        BackTopBar("Поиск", { nav.popBackStack() })
        OutlinedTextField(
            input, { input = it },
            leadingIcon = { Icon(Icons.Default.Search, null, tint = Brand.TextMuted) },
            placeholder = { Text("Найти страницу, курс, привычку или раздел…", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).focusRequester(focus),
        )
        val r = results
        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            // Теги-фильтры
            if (r != null && r.tags.isNotEmpty()) item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    TagBadge(PageTagRef(0, "Все", "#27e9b5"), Modifier.clickable { tagId = null }, selected = tagId == null)
                    r.tags.forEach { t -> TagBadge(t, Modifier.clickable { tagId = if (tagId == t.id) null else t.id }, selected = tagId == t.id) }
                }
            }
            if (input.isNotBlank() || tagId != null) item {
                Text("Сбросить", color = Brand.Mint, fontSize = 12.sp, modifier = Modifier.clickable { input = ""; tagId = null }.padding(vertical = 4.dp))
            }
            if (loading) item { Text("Загрузка…", color = Brand.TextFaint, fontSize = 11.sp) }
            error?.let { e -> item { Text(e, color = Color(0xFFF87171), fontSize = 13.sp) } }

            if (commands.isNotEmpty()) {
                header("Перейти")
                items(commands, key = { "cmd-" + it.route }) { c -> ResultRow(c.emoji, c.label, c.hint) { go(c.route) } }
            }
            if (r == null) return@LazyColumn
            if (r.tagMatches.isNotEmpty()) item {
                Column {
                    SectionHeader("Теги")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) { r.tagMatches.forEach { t -> TagBadge(t, Modifier.clickable { tagId = t.id; input = "" }) } }
                }
            }
            if (r.learnCourses.isNotEmpty()) {
                header("Курсы обучения")
                items(r.learnCourses, key = { "lc-${it.id}" }) { c -> ResultRow(c.icon ?: "🎓", c.title, c.description) { go("course/${c.id}") } }
            }
            if (r.learnLessons.isNotEmpty()) {
                header("Уроки")
                items(r.learnLessons, key = { "ll-${it.id}" }) { l -> ResultRow(l.icon ?: "📘", l.title, l.courseTitle) { go("lesson/${l.id}") } }
            }
            if (r.vocab.isNotEmpty()) {
                header("Слова")
                items(r.vocab, key = { "v-${it.id}" }) { v -> ResultRow("🗣️", "${v.term} — ${v.translation}", listOfNotNull(v.languageName, v.note).joinToString(" · ")) { go("vocab/${v.languageId}") } }
            }
            if (r.achievements.isNotEmpty()) {
                header("Ачивки")
                items(r.achievements, key = { "a-${it.id}" }) { a -> ResultRow(a.icon, a.title + if (a.earned) " ✓" else "", a.description) { go("achievements") } }
            }
            if (r.pages.isNotEmpty()) {
                header(r.selectedTag?.let { "Страницы · ${it.label}" } ?: "Страницы")
                items(r.pages, key = { "p-${it.id}" }) { p ->
                    ResultRow(if (p.pinned) "📌" else "📝", p.title?.ifBlank { null } ?: "Без названия", p.snippet, p.tags) { go("page/${p.id}") }
                }
            }
            if (r.pdfBookmarks.isNotEmpty()) {
                header("Закладки PDF")
                items(r.pdfBookmarks, key = { "b-${it.id}" }) { b ->
                    ResultRow("🔖", b.markerTitle, listOfNotNull(b.pdfTitle, b.pageNumber?.let { "стр. $it" }, b.pageTitle).joinToString(" · ")) { go("page/${b.pageId}") }
                }
            }
            if (r.languages.isNotEmpty()) {
                header("Языки")
                items(r.languages, key = { "lang-${it.id}" }) { l -> ResultRow("🗣️", l.name, l.level, l.tags) { go("vocab/${l.id}") } }
            }
            if (r.courses.isNotEmpty()) {
                header("Курсы")
                items(r.courses, key = { "c-${it.id}" }) { c ->
                    ResultRow("🎓", c.title, listOfNotNull(c.provider, c.progress?.let { "${it.toInt()}%" }).joinToString(" · "), c.tags) { go("learn") }
                }
            }
            if (r.habits.isNotEmpty()) {
                header("Привычки")
                items(r.habits, key = { "h-${it.id}" }) { h -> ResultRow("✅", h.title, "${h.doneThisWeek ?: 0}/${h.targetPerWeek ?: 7} на этой неделе", h.tags) { go("habits") } }
            }
            if (r.goals.isNotEmpty()) {
                header("Цели")
                items(r.goals, key = { "g-${it.id}" }) { g -> ResultRow("🎯", g.title, "${g.completionPct}%") { go("goals") } }
            }
            if (r.calendar.isNotEmpty()) {
                header("Календарь")
                items(r.calendar, key = { "e-${it.id}" }) { e -> ResultRow("📅", e.title, e.date, e.tags) { go("calendar") } }
            }
            if (r.travel.isNotEmpty()) {
                header("Путешествия")
                items(r.travel, key = { "t-${it.id}" }) { t ->
                    ResultRow("✈️", t.title, listOfNotNull(t.location, listOfNotNull(t.dateFrom, t.dateTo).joinToString(" — ").ifBlank { null }).joinToString(" · "), t.tags) { go("travel") }
                }
            }
            if (r.shelf.isNotEmpty()) {
                header("Полка")
                items(r.shelf, key = { "sh-${it.id}" }) { x ->
                    val emoji = mapOf("book" to "📚", "manga" to "📖", "anime" to "🌸", "movie" to "🎬", "series" to "📺", "game" to "🎮", "music" to "💿")[x.kind] ?: "📚"
                    ResultRow(emoji, x.title, listOfNotNull(x.author, x.year?.toString()).joinToString(" · "), x.tags) { go("shelf") }
                }
            }
            if (r.wishlist.isNotEmpty()) {
                header("Вишлист")
                items(r.wishlist, key = { "w-${it.id}" }) { w ->
                    ResultRow("🎁", w.title, listOfNotNull(w.category, w.price?.let { com.lifehub.app.ui.components.money(it, w.currency) }, if (w.status == "got") "сбылось" else null).joinToString(" · "), w.tags) { go("wishlist") }
                }
            }
            if (r.loans.isNotEmpty()) {
                header("Кредиты")
                items(r.loans, key = { "loan-${it.id}" }) { l ->
                    ResultRow("🏦", l.bank, listOfNotNull(l.paymentMonthly?.let { "платёж ${it.toInt()}" }, l.remaining?.let { "остаток ${it.toInt()}" }).joinToString(" · "), l.tags) { go("finance") }
                }
            }
            val empty = commands.isEmpty() && listOf(r.pages, r.pdfBookmarks, r.languages, r.courses, r.travel, r.shelf, r.wishlist, r.loans, r.habits, r.calendar, r.goals, r.learnCourses, r.learnLessons, r.vocab, r.achievements).all { it.isEmpty() }
            if (empty && !loading && (input.isNotBlank() || tagId != null)) item { Text("Ничего не найдено", color = Brand.TextMuted, modifier = Modifier.padding(top = 12.dp)) }
            if (input.isBlank() && tagId == null) item { Text("Начните вводить запрос или выберите тег", color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp)) }
        }
    }
}

private fun LazyListScope.header(title: String) = item(key = "h-$title") { SectionHeader(title) }

@Composable
private fun SectionHeader(title: String) {
    Text(title.uppercase(), color = Brand.TextMuted, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp, bottom = 2.dp))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ResultRow(emoji: String, title: String, subtitle: String?, tags: List<PageTagRef> = emptyList(), onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier.fillMaxWidth().clip(shape).background(Brand.Ink.copy(alpha = 0.05f)).border(1.dp, Brand.Ink.copy(alpha = 0.08f), shape)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, fontSize = 20.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            subtitle?.takeIf { it.isNotBlank() }?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
            if (tags.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp)) { tags.forEach { TagBadge(it) } }
            }
        }
    }
}
