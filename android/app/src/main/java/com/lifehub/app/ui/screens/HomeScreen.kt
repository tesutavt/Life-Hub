package com.lifehub.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.data.Achievement
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Activity
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.Goal
import com.lifehub.app.data.GoalsResponse
import com.lifehub.app.data.Habit
import com.lifehub.app.data.HabitCheck
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.LearnCourse
import com.lifehub.app.data.Loan
import com.lifehub.app.data.MissionsSummary
import com.lifehub.app.data.ProfileResponse
import com.lifehub.app.data.Transaction
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.parseHex
import com.lifehub.app.util.today
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.text.NumberFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Раскладка Дэшборда из веб-версии (общая для всех устройств): порядок и скрытые блоки. */
@Serializable data class DashboardWidget(val id: String = "", val hidden: Boolean = false)
@Serializable data class DashboardLayout(val layout: List<DashboardWidget>? = null)

private val DEFAULT_ORDER = listOf("weather", "missions", "fitness", "learn", "habits", "languages", "calendar", "goals", "spend", "loans")

private data class HomeData(
    val profile: ProfileResponse,
    val activity: Activity,
    val missions: MissionsSummary,
    val courses: List<LearnCourse>,
    val habits: List<Habit>,
    val checkedToday: Set<Int>,
    val order: List<String>,
    val languages: List<Language>,
    val goals: List<Goal>,
    val events: List<CalendarEvent>,
    val monthSpend: Double?,
    val weekSpend: Double?,
    val loans: List<Loan>,
    val recentAchievements: List<Achievement>,
    val lifeCourses: List<com.lifehub.app.data.LifeCourse>,
    val weather: Weather?,
    val fitness: FitnessMetrics?,
)

/** Показатели дня с браслета (GET /api/fitness/metrics). */
@Serializable data class FitnessMetrics(val steps: Int = 0, val hr: Int = 0, val sleepH: Double = 0.0, val activeCalories: Double = 0.0)

/** Погода — как карточка на Дэшборде веб-версии (OpenWeather, город и ключ из профиля). */
data class Weather(val city: String, val country: String?, val description: String, val temp: Int, val main: String, val isNight: Boolean)

private suspend fun loadWeather(city: String?, key: String?): Weather? {
    if (city.isNullOrBlank() || key.isNullOrBlank()) return null
    return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        runCatching {
            val url = "https://api.openweathermap.org/data/2.5/weather?q=${java.net.URLEncoder.encode(city.trim(), "UTF-8")}&appid=${key.trim()}&units=metric&lang=ru"
            val text = java.net.URL(url).openConnection().apply { connectTimeout = 6000; readTimeout = 6000 }.getInputStream().use { it.readBytes().toString(Charsets.UTF_8) }
            val o = Api.json.parseToJsonElement(text).jsonObject
            val w = o["weather"]?.jsonArray?.firstOrNull()?.jsonObject
            val desc = w?.get("description")?.jsonPrimitive?.contentOrNull.orEmpty()
            val sys = o["sys"]?.jsonObject
            val now = o["dt"]?.jsonPrimitive?.longOrNull ?: 0L
            val sunrise = sys?.get("sunrise")?.jsonPrimitive?.longOrNull ?: 0L
            val sunset = sys?.get("sunset")?.jsonPrimitive?.longOrNull ?: Long.MAX_VALUE
            Weather(
                city = o["name"]?.jsonPrimitive?.contentOrNull ?: city,
                country = sys?.get("country")?.jsonPrimitive?.contentOrNull,
                description = desc.replaceFirstChar { it.uppercase() },
                temp = (o["main"]?.jsonObject?.get("temp")?.jsonPrimitive?.doubleOrNull ?: 0.0).let { Math.round(it).toInt() },
                main = w?.get("main")?.jsonPrimitive?.contentOrNull.orEmpty(),
                isNight = now < sunrise || now > sunset,
            )
        }.getOrNull()
    }
}

val MOODS = listOf("😢", "😕", "😐", "🙂", "😄")

/** Разделы приложения — открываются из шторки «Все разделы». */
private val SECTIONS = listOf(
    Triple("📅", "Календарь", "calendar"), Triple("🎯", "Цели", "goals"), Triple("💰", "Финансы", "finance"),
    Triple("📝", "Страницы", "pages"), Triple("📊", "Отчёты", "reports"), Triple("✈️", "Поездки", "travel"),
    Triple("🏆", "Ачивки", "achievements"), Triple("🎨", "Оформление", "customize"), Triple("⚙️", "Настройки", "settings"),
)

private val money = NumberFormat.getIntegerInstance(Locale("ru"))

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(nav: NavController) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    val state = rememberLoadable {
        // Сначала забираем свежие данные браслета из Health Connect и отправляем на сервер
        runCatching { com.lifehub.app.health.HealthSync.sync(context) }
        coroutineScope {
            val profile = async { Api.get<ProfileResponse>("/api/life/profile") }
            val activity = async { Api.get<Activity>("/api/achievements/activity?days=7") }
            val missions = async { Api.get<MissionsSummary>("/api/life/daily-missions") }
            val courses = async { runCatching { Api.get<Items<LearnCourse>>("/api/learn/courses").items }.getOrDefault(emptyList()) }
            val habits = async { runCatching { Api.get<Items<Habit>>("/api/life/habits").items }.getOrDefault(emptyList()) }
            val checks = async { runCatching { Api.get<Items<HabitCheck>>("/api/life/habits/checks?from=${today()}&to=${today()}").items }.getOrDefault(emptyList()) }
            val layout = async { runCatching { Api.get<DashboardLayout>("/api/life/dashboard-layout").layout }.getOrNull() }
            val languages = async { runCatching { Api.get<Items<Language>>("/api/life/languages").items }.getOrDefault(emptyList()) }
            val goals = async { runCatching { Api.get<GoalsResponse>("/api/life/yearly-goals").active }.getOrDefault(emptyList()) }
            val events = async {
                runCatching {
                    val now = YearMonth.now()
                    listOf(now, now.plusMonths(1)).flatMap { Api.get<Items<CalendarEvent>>("/api/life/calendar?y=${it.year}&m=${it.monthValue}").items }
                }.getOrDefault(emptyList())
            }
            val spend = async {
                runCatching {
                    val today = LocalDate.now()
                    val from = minOf(today.withDayOfMonth(1), today.minusDays(6))
                    val tx = Api.get<Items<Transaction>>("/api/banks/transactions?from=$from&to=$today&limit=5000").items.filter { it.amount < 0 }
                    val zone = java.time.ZoneId.systemDefault()
                    fun day(t: Transaction) = java.time.Instant.ofEpochMilli(if (t.ts < 10_000_000_000L) t.ts * 1000 else t.ts).atZone(zone).toLocalDate()
                    tx.filter { day(it) >= today.withDayOfMonth(1) }.sumOf { -it.amount } to tx.filter { day(it) >= today.minusDays(6) }.sumOf { -it.amount }
                }.getOrNull()
            }
            val fitness = async { runCatching { Api.get<FitnessMetrics>("/api/fitness/metrics?day=${today()}") }.getOrNull() }
            val lifeCourses = async { runCatching { Api.get<com.lifehub.app.data.LifeCourses>("/api/life/courses").items }.getOrDefault(emptyList()) }
            val loans = async { runCatching { Api.get<Items<Loan>>("/api/loans/summary").items }.getOrDefault(emptyList()) }
            val achievements = async {
                runCatching { Api.get<Items<Achievement>>("/api/achievements").items.filter { it.earned }.sortedByDescending { it.earnedAt }.take(4) }.getOrDefault(emptyList())
            }
            val order = layout.await()?.let { l -> l.filter { !it.hidden }.map { it.id } } ?: DEFAULT_ORDER
            val prof = profile.await()
            val weather = if ("weather" in order) loadWeather(prof.user.city, prof.user.weatherApiKey) else null
            HomeData(
                prof, activity.await(), missions.await(), courses.await(), habits.await(),
                checks.await().map { it.habitId }.toSet(), order, languages.await(), goals.await(),
                events.await().filter { it.type != "mood" && it.title.isNotBlank() && it.date >= today() }.sortedBy { it.date }.take(3),
                spend.await()?.first, spend.await()?.second, loans.await(), achievements.await(), lifeCourses.await(), weather, fitness.await(),
            )
        }
    }
    var mood by remember { mutableStateOf<Int?>(null) }
    var sections by remember { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = { state.reload() }, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).statusBarsPadding().padding(horizontal = 16.dp, vertical = 12.dp)) {
            LoadableContent(state) { data ->
                val user = data.profile.user
                // Шапка: аватар, приветствие, поиск и все разделы
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.clip(CircleShape).clickable { nav.navigate("profile") }) { Avatar(Api.fileUrl(user.avatarUrl), user.name ?: "?", 42) }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale("ru"))).replaceFirstChar { it.uppercase() },
                            color = Brand.TextMuted, fontSize = 12.sp,
                        )
                        Text("Привет, ${user.name ?: "друг"}", fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    IconButton({ nav.navigate("search") }) { Icon(Icons.Default.Search, "Поиск", tint = Brand.Text) }
                    IconButton({ sections = true }) { Icon(Icons.Default.Apps, "Все разделы", tint = Brand.Text) }
                }
                Spacer(Modifier.height(14.dp))

                HeroCard(data) { nav.navigate(it) }
                StatsRow(data) { nav.navigate(it) }
                data.weather?.let { WeatherCard(it) }

                // Настроение — одной строкой, без лишней карточки
                Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Настроение", color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.weight(1f))
                    MOODS.forEachIndexed { index, emoji ->
                        Box(
                            Modifier.padding(start = 4.dp).size(38.dp).clip(CircleShape)
                                .background(if (mood == index) Brand.Amber.copy(alpha = 0.28f) else Color.Transparent)
                                .clickable {
                                    mood = index
                                    scope.launch {
                                        runCatching {
                                            Api.post("/api/life/calendar", buildJsonObject {
                                                put("date", today()); put("title", "Настроение $emoji"); put("type", "mood"); put("mood", index + 1)
                                            })
                                        }
                                        Achievements.requestCheck()
                                    }
                                },
                            contentAlignment = Alignment.Center,
                        ) { Text(emoji, fontSize = if (mood == index) 24.sp else 20.sp) }
                    }
                }

                // Блоки — в том же порядке, что на Дэшборде веб-версии
                data.order.forEach { id ->
                    when (id) {
                        "learn" -> LearnBlock(data) { nav.navigate(it) }
                        "habits" -> HabitsBlock(data, nav) { habit, done ->
                            scope.launch {
                                runCatching { Api.post("/api/life/habits/checks", buildJsonObject { put("habit_id", habit.id); put("date", today()); put("done", done) }) }
                                Achievements.requestCheck()
                            }
                        }
                        "languages" -> LanguagesBlock(data) { nav.navigate(it) }
                        "calendar" -> CalendarBlock(data) { nav.navigate("calendar") }
                        "goals" -> GoalsBlock(data) { nav.navigate("goals") }
                        "spend" -> SpendBlock(data) { nav.navigate(it) }
                        "courses" -> CoursesBlock(data) { nav.navigate(it) }
                        "fitness" -> FitnessBlock(data) { nav.navigate("settings") }
                        "loans" -> LoansBlock(data) { nav.navigate("finance") }
                        "achievements" -> AchievementsBlock(data) { nav.navigate("achievements") }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (sections) {
        ModalBottomSheet(onDismissRequest = { sections = false }, containerColor = Brand.Night) {
            SectionsGrid { route -> sections = false; nav.navigate(route) }
        }
    }
}

// ───────────── Сводка и погода ─────────────

/** Четыре цифры сверху, как на веб-Дэшборде: языки, курсы, цели, расходы за 7 дней. */
@Composable
private fun StatsRow(data: HomeData, go: (String) -> Unit) {
    val courses = data.lifeCourses
    val coursePct = if (courses.isEmpty()) 0 else courses.sumOf { it.progress } / courses.size
    val goalPct = if (data.goals.isEmpty()) 0 else data.goals.sumOf { it.completionPct } / data.goals.size
    val items = listOf(
        Triple("Языки", "${data.languages.size}", "сегодня ${data.languages.sumOf { it.minutesToday }} мин") to "learn",
        Triple("Курсы", "${courses.size}", "прогресс $coursePct%") to "learn",
        Triple("Цели", "${data.goals.size}", "прогресс $goalPct%") to "goals",
        Triple("Расходы · 7 дн.", data.weekSpend?.let { "${money.format(it.toLong())} ₽" } ?: "—", "сумма списаний") to "finance",
    )
    Column(Modifier.padding(top = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (t, route) ->
                    val shape = RoundedCornerShape(14.dp)
                    Column(
                        Modifier.weight(1f).clip(shape).background(Brand.Card).border(1.dp, Color.White.copy(alpha = 0.06f), shape)
                            .clickable { go(route) }.padding(horizontal = 12.dp, vertical = 9.dp),
                    ) {
                        Text(t.first.uppercase(), fontSize = 10.sp, color = Brand.TextFaint, letterSpacing = 0.8.sp, maxLines = 1)
                        Text(t.second, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Text(t.third, fontSize = 11.sp, color = Brand.TextMuted, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun WeatherCard(w: Weather) {
    val m = (w.main + " " + w.description).lowercase()
    val (colors, emoji) = when {
        w.isNight -> listOf(Color(0xFF1E1B4B), Color(0xFF312E81), Color(0xFF0F172A)) to "🌙"
        "thunder" in m || "гроз" in m -> listOf(Color(0xFF334155), Color(0xFF4C1D95)) to "⛈️"
        "snow" in m || "снег" in m -> listOf(Color(0xFF64748B), Color(0xFFCBD5E1)) to "❄️"
        "rain" in m || "drizzle" in m || "дожд" in m -> listOf(Color(0xFF1E3A5F), Color(0xFF475569)) to "🌧️"
        "cloud" in m || "облач" in m || "пасмур" in m -> listOf(Color(0xFF475569), Color(0xFF64748B)) to "☁️"
        "mist" in m || "fog" in m || "туман" in m || "дымка" in m -> listOf(Color(0xFF52525B), Color(0xFF71717A)) to "🌫️"
        else -> listOf(Color(0xFF8B5CF6), Color(0xFFEC4899), Color(0xFFF59E0B)) to "☀️"
    }
    val shape = RoundedCornerShape(22.dp)
    Row(
        Modifier.fillMaxWidth().padding(top = 10.dp).clip(shape).background(Brush.linearGradient(colors)).padding(horizontal = 18.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(w.description, color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
            Text("${w.temp}°", color = Color.White, fontSize = 34.sp, fontWeight = FontWeight.Bold)
            Text(listOfNotNull(w.city, w.country).joinToString(", "), color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp)
        }
        Text(emoji, fontSize = 44.sp)
    }
}

// ───────────── Общие элементы ─────────────

@Composable
private fun Block(title: String, action: String? = null, onAction: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 18.dp)) {
        Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, modifier = Modifier.weight(1f))
            if (action != null && onAction != null) {
                Text(action, color = Brand.Mint, fontSize = 13.sp, modifier = Modifier.clip(CircleShape).clickable(onClick = onAction).padding(horizontal = 6.dp, vertical = 2.dp))
            }
        }
        val shape = RoundedCornerShape(18.dp)
        Column(
            Modifier.fillMaxWidth().clip(shape).background(Brand.Card).border(1.dp, Color.White.copy(alpha = 0.06f), shape).padding(vertical = 4.dp),
            content = content,
        )
    }
}

@Composable
private fun ListRow(
    leading: @Composable () -> Unit,
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
    onClick: (() -> Unit)? = null,
) {
    Row(
        Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            subtitle?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        trailing?.invoke()
    }
}

@Composable
private fun IconBubble(emoji: String, color: Color = Brand.Mint) {
    Box(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(color.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
        Text(emoji, fontSize = 18.sp)
    }
}

@Composable
private fun ThinBar(fraction: Float, color: Color, modifier: Modifier = Modifier) {
    Box(modifier.height(4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.08f))) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).height(4.dp).clip(CircleShape).background(color))
    }
}

@Composable
private fun MiniRing(fraction: Float, color: Color, size: Int = 30) {
    CircularProgressIndicator(
        progress = { fraction.coerceIn(0f, 1f) }, modifier = Modifier.size(size.dp),
        color = color, trackColor = Color.White.copy(alpha = 0.08f), strokeWidth = 3.dp,
    )
}

@Composable
private fun Chevron() = Icon(Icons.Default.ChevronRight, null, tint = Brand.TextFaint, modifier = Modifier.size(18.dp))

// ───────────── Блоки ─────────────

/** Уровень, XP, серия и задания дня — одна карточка вместо трёх. */
@Composable
private fun HeroCard(data: HomeData, go: (String) -> Unit) {
    val level = data.activity.level
    val m = data.missions
    val claimable = m.missions.count { it.claimable }
    val shape = RoundedCornerShape(22.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape)
            .background(Brush.linearGradient(listOf(Brand.Mint.copy(alpha = 0.16f), Brand.Card, Brand.CardHigh)))
            .border(1.dp, Brand.Mint.copy(alpha = 0.18f), shape),
    ) {
        Row(Modifier.fillMaxWidth().clickable { go("profile") }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            LevelRing(level.level, (level.xp - level.currentFloor).toFloat() / (level.nextAt - level.currentFloor).coerceAtLeast(1), size = 58)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("${level.xp} XP", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("до ур. ${level.level + 1} — ${(level.nextAt - level.xp).coerceAtLeast(0)} XP", color = Brand.TextMuted, fontSize = 12.sp)
                Text("+${level.xpToday} сегодня", color = Brand.Mint, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("🔥", fontSize = 22.sp)
                Text("${data.activity.streak}", fontWeight = FontWeight.Black, fontSize = 18.sp, color = Brand.Amber)
                Text("дней", color = Brand.TextMuted, fontSize = 10.sp)
            }
        }
        if ("missions" in data.order) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.06f)))
            Row(Modifier.fillMaxWidth().clickable { go("missions") }.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("Задания дня", fontSize = 13.sp, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                        Text("${m.totalPoints} / ${m.targetPoints}", color = Brand.TextMuted, fontSize = 12.sp)
                    }
                    Spacer(Modifier.height(6.dp))
                    ThinBar(m.totalPoints.toFloat() / m.targetPoints.coerceAtLeast(1), Brand.Amber, Modifier.fillMaxWidth())
                }
                Spacer(Modifier.width(12.dp))
                if (claimable > 0) {
                    Text("🎁 $claimable", color = Brand.Deep, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                        modifier = Modifier.clip(CircleShape).background(Brand.Amber).padding(horizontal = 10.dp, vertical = 4.dp))
                } else Chevron()
            }
        }
    }
}

@Composable
private fun LearnBlock(data: HomeData, go: (String) -> Unit) {
    val next = data.courses.firstOrNull { it.progressPct < 100 && !it.locked } ?: return
    val color = parseHex(next.color, Brand.Green)
    Block("Продолжить обучение") {
        ListRow(
            leading = { IconBubble(next.icon ?: "📘", color) },
            title = next.title,
            subtitle = "${next.lessonsDone} из ${next.lessonsTotal} уроков · ${next.progressPct}%",
            trailing = {
                Text("Дальше", color = Brand.Deep, fontWeight = FontWeight.Bold, fontSize = 12.sp,
                    modifier = Modifier.clip(CircleShape).background(color).padding(horizontal = 12.dp, vertical = 6.dp))
            },
            onClick = { go("course/${next.id}") },
        )
        ThinBar(next.progressPct / 100f, color, Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 6.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HabitsBlock(data: HomeData, nav: NavController, toggle: (Habit, Boolean) -> Unit) {
    if (data.habits.isEmpty()) return
    var checked by remember(data) { mutableStateOf(data.checkedToday) }
    val done = data.habits.count { it.id in checked }
    Block("Привычки · $done/${data.habits.size}", "все", { nav.navigate("habits") }) {
        FlowRow(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            data.habits.forEach { habit ->
                val on = habit.id in checked
                Row(
                    Modifier.clip(CircleShape)
                        .background(if (on) Brand.Mint.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.05f))
                        .border(1.dp, if (on) Brand.Mint.copy(alpha = 0.5f) else Color.White.copy(alpha = 0.08f), CircleShape)
                        .clickable {
                            checked = if (on) checked - habit.id else checked + habit.id
                            toggle(habit, !on)
                        }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(if (on) "✓" else "○", color = if (on) Brand.Mint else Brand.TextFaint, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Spacer(Modifier.width(6.dp))
                    Text(habit.title, fontSize = 13.sp, color = if (on) Brand.Text else Brand.TextMuted, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun LanguagesBlock(data: HomeData, go: (String) -> Unit) {
    if (data.languages.isEmpty()) return
    Block("Языки", "обучение", { go("learn") }) {
        data.languages.take(3).forEach { l ->
            ListRow(
                leading = { MiniRing(l.coursesProgressPct / 100f, Brand.Violet, 34) },
                title = l.name,
                subtitle = listOfNotNull(l.level, "${l.minutesToday} мин сегодня", if (l.streak > 0) "🔥 ${l.streak}" else null).joinToString(" · "),
                trailing = { Chevron() },
                onClick = { go("practice/${l.id}") },
            )
        }
    }
}

@Composable
private fun CalendarBlock(data: HomeData, open: () -> Unit) {
    Block("Ближайшее", "календарь", open) {
        if (data.events.isEmpty()) {
            Text("Событий нет — можно отдохнуть", color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
        }
        data.events.forEach { e ->
            val date = runCatching { LocalDate.parse(e.date) }.getOrNull()
            val label = when (date) {
                LocalDate.now() -> "сегодня"
                LocalDate.now().plusDays(1) -> "завтра"
                null -> e.date
                else -> date.format(DateTimeFormatter.ofPattern("d MMM, EE", Locale("ru")))
            }
            ListRow(
                leading = {
                    Column(Modifier.size(36.dp).clip(RoundedCornerShape(11.dp)).background(Brand.Sky.copy(alpha = 0.14f)), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Text(date?.dayOfMonth?.toString() ?: "•", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Brand.Sky)
                    }
                },
                title = e.title,
                subtitle = label,
                onClick = open,
            )
        }
    }
}

@Composable
private fun GoalsBlock(data: HomeData, open: () -> Unit) {
    if (data.goals.isEmpty()) return
    Block("Цели на год", "все", open) {
        data.goals.sortedByDescending { it.completionPct }.take(3).forEach { g ->
            Column(Modifier.fillMaxWidth().clickable(onClick = open).padding(horizontal = 14.dp, vertical = 9.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(g.title, fontSize = 14.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    if (g.todayDone) Text("✓ ", color = Brand.Mint, fontSize = 13.sp)
                    Text("${g.completionPct}%", color = Brand.TextMuted, fontSize = 12.sp)
                }
                Spacer(Modifier.height(6.dp))
                ThinBar(g.completionPct / 100f, Brand.Rose, Modifier.fillMaxWidth())
            }
        }
    }
}

/** Шаги, сон, пульс и калории за сегодня — как блок «Фитнес» на веб-дэшборде. */
@Composable
private fun FitnessBlock(data: HomeData, openSettings: () -> Unit) {
    val f = data.fitness ?: return
    val empty = f.steps == 0 && f.hr == 0 && f.sleepH == 0.0 && f.activeCalories == 0.0
    Block("Фитнес · сегодня", if (empty) "подключить" else null, if (empty) openSettings else null) {
        if (empty) {
            Text("Нет данных с браслета. Подключите Health Connect в настройках — туда пишут Notify и Simple Health.",
                color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.padding(14.dp))
            return@Block
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 10.dp)) {
            listOf(
                Triple("👟", money.format(f.steps.toLong()), "шагов"),
                Triple("😴", if (f.sleepH > 0) "%.1f ч".format(f.sleepH) else "—", "сон"),
                Triple("❤️", if (f.hr > 0) "${f.hr}" else "—", "пульс"),
                Triple("🔥", money.format(f.activeCalories.toLong()), "ккал"),
            ).forEach { (emoji, value, label) ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(emoji, fontSize = 20.sp)
                    Text(value, fontWeight = FontWeight.Bold, fontSize = 15.sp, maxLines = 1)
                    Text(label, color = Brand.TextMuted, fontSize = 11.sp)
                }
            }
        }
        ThinBar(f.steps / 10000f, Brand.Green, Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 10.dp))
    }
}

@Composable
private fun CoursesBlock(data: HomeData, go: (String) -> Unit) {
    val active = data.lifeCourses.filter { it.progress < 100 }
    if (active.isEmpty()) return
    Block("Курсы · ${active.size}") {
        active.take(4).forEach { c ->
            ListRow(
                leading = { MiniRing(c.progress / 100f, Brand.Green, 34) },
                title = (if (c.locked) "🔒 " else "") + c.title,
                subtitle = "${c.progress}%" + (c.lockReason?.let { " · $it" } ?: ""),
                trailing = { Chevron() },
                onClick = { go(c.learnCourseId?.let { "course/$it" } ?: "learn") },
            )
        }
    }
}

@Composable
private fun SpendBlock(data: HomeData, go: (String) -> Unit) {
    val spent = data.monthSpend ?: return
    Block("Расходы за месяц", "финансы", { go("finance") }) {
        ListRow(
            leading = { IconBubble("💸", Brand.Rose) },
            title = "${money.format(spent.toLong())} ₽",
            subtitle = LocalDate.now().format(DateTimeFormatter.ofPattern("LLLL", Locale("ru"))).replaceFirstChar { it.uppercase() },
            trailing = {
                Text("+ расход", color = Brand.Rose, fontWeight = FontWeight.SemiBold, fontSize = 12.sp,
                    modifier = Modifier.clip(CircleShape).border(1.dp, Brand.Rose.copy(alpha = 0.5f), CircleShape).clickable { go("finance/add") }.padding(horizontal = 12.dp, vertical = 6.dp))
            },
            onClick = { go("finance") },
        )
    }
}

@Composable
private fun LoansBlock(data: HomeData, open: () -> Unit) {
    if (data.loans.isEmpty()) return
    Block("Кредиты", "все", open) {
        ListRow(
            leading = { IconBubble("💳", Brand.Sky) },
            title = "${money.format(data.loans.sumOf { it.paymentMonthly }.toLong())} ₽ в месяц",
            subtitle = "остаток ${money.format(data.loans.sumOf { it.remaining }.toLong())} ₽ · ${data.loans.size} шт.",
            trailing = { Chevron() },
            onClick = open,
        )
    }
}

@Composable
private fun AchievementsBlock(data: HomeData, open: () -> Unit) {
    if (data.recentAchievements.isEmpty()) return
    Block("Последние ачивки", "все", open) {
        Row(Modifier.fillMaxWidth().clickable(onClick = open).padding(horizontal = 14.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            data.recentAchievements.forEach { a ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(a.icon, fontSize = 26.sp)
                    Text(a.title, fontSize = 10.sp, color = Brand.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun SectionsGrid(open: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
        Text("Все разделы", fontWeight = FontWeight.Bold, fontSize = 17.sp, modifier = Modifier.padding(bottom = 12.dp))
        SECTIONS.chunked(3).forEach { row ->
            Row(Modifier.padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { (emoji, label, route) ->
                    Column(
                        Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.05f)).clickable { open(route) }.padding(vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(emoji, fontSize = 24.sp)
                        Spacer(Modifier.height(4.dp))
                        Text(label, fontSize = 12.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
fun Avatar(url: String?, name: String, size: Int) {
    Box(Modifier.size(size.dp).clip(CircleShape).background(Brand.Mint.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
        Text(name.take(1).uppercase(), fontWeight = FontWeight.Bold, fontSize = (size * 0.4).sp, color = Brand.Mint)
        if (url != null) AsyncImage(url, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
    }
}

@Composable
fun LevelRing(level: Int, fraction: Float, size: Int = 68) {
    Box(Modifier.size(size.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(
            progress = { fraction.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxSize(),
            color = Brand.Mint,
            trackColor = Color.White.copy(alpha = 0.08f),
            strokeWidth = (size / 10).dp,
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("ур.", fontSize = (size / 7).sp, color = Brand.TextMuted)
            Text("$level", fontSize = (size / 3).sp, fontWeight = FontWeight.Black)
        }
    }
}
