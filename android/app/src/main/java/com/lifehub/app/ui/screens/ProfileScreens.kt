package com.lifehub.app.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Dns
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavController
import coil.compose.AsyncImage
import com.lifehub.app.BuildConfig
import com.lifehub.app.data.Achievement
import com.lifehub.app.data.Activity
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.ProfileResponse
import com.lifehub.app.data.Session
import com.lifehub.app.ui.components.BackTopBar
import com.lifehub.app.ui.components.Chip
import com.lifehub.app.ui.components.LhCard
import com.lifehub.app.ui.components.LoadableContent
import com.lifehub.app.ui.components.ProgressBar
import com.lifehub.app.ui.components.SectionTitle
import com.lifehub.app.ui.components.rememberLoadable
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.rarityColor
import com.lifehub.app.ui.theme.rarityLabel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import java.time.LocalDate

@Serializable private data class Showcase(val ids: List<Int> = emptyList())
@Composable
private fun ShowcaseSection(emoji: String, title: String, counter: String?, onAll: (() -> Unit)?) {
    Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$emoji  ${title.uppercase()}", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.5.sp, color = Color.White.copy(alpha = 0.6f), modifier = Modifier.weight(1f))
        counter?.let { Text(it, fontSize = 12.sp, color = Brand.TextMuted) }
        onAll?.let { Text("  все →", fontSize = 12.sp, color = Brand.Mint, modifier = Modifier.clickable(onClick = it)) }
    }
}

private data class ProfileData(
    val profile: ProfileResponse,
    val activity: Activity,
    val achievements: List<Achievement>,
    val showcase: List<Int>,
    val languages: List<com.lifehub.app.data.Language>,
    val goals: List<com.lifehub.app.data.Goal>,
    val courses: List<com.lifehub.app.data.LifeCourse>,
    val feed: List<com.lifehub.app.data.FeedItem>,
    val habits: List<com.lifehub.app.data.Habit>,
    val travel: List<com.lifehub.app.data.TravelPlan>,
)

/** Фоны профиля — те же пресеты, что в веб-версии. */
private fun presetColors(id: String): List<Color> = when (id) {
    "steam" -> listOf(Color(0xFF1B2838), Color(0xFF090D14))
    "sunset" -> listOf(Color(0xFF7A3B2A), Color(0xFF3B1D3A), Color(0xFF170D1F))
    "forest" -> listOf(Color(0xFF2E4A1C), Color(0xFF11261C), Color(0xFF08130D))
    "ocean" -> listOf(Color(0xFF1C4A7A), Color(0xFF0C2340), Color(0xFF050D1A))
    "sakura" -> listOf(Color(0xFF6B2E5A), Color(0xFF2A1428), Color(0xFF120A14))
    "cozy" -> listOf(Color(0xFF6B4A1E), Color(0xFF2B1D12), Color(0xFF140D08))
    "mono" -> listOf(Color(0xFF1F2227), Color(0xFF0D0F12))
    else -> listOf(Color(0xFF145A55), Color(0xFF0B1A2B), Color(0xFF071019))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(nav: NavController) {
    val state = rememberLoadable {
        coroutineScope {
            val profile = async { Api.get<ProfileResponse>("/api/life/profile") }
            val activity = async { Api.get<Activity>("/api/achievements/activity?days=126") }
            val achievements = async { Api.get<Items<Achievement>>("/api/achievements").items }
            val showcase = async { runCatching { Api.get<Showcase>("/api/achievements/showcase").ids }.getOrDefault(emptyList()) }
            val languages = async { runCatching { Api.get<Items<com.lifehub.app.data.Language>>("/api/life/languages").items }.getOrDefault(emptyList()) }
            val goals = async { runCatching { Api.get<com.lifehub.app.data.GoalsResponse>("/api/life/yearly-goals").active }.getOrDefault(emptyList()) }
            val courses = async { runCatching { Api.get<com.lifehub.app.data.LifeCourses>("/api/life/courses").items }.getOrDefault(emptyList()) }
            val feed = async { runCatching { Api.get<Items<com.lifehub.app.data.FeedItem>>("/api/life/feed").items }.getOrDefault(emptyList()) }
            val habits = async { runCatching { Api.get<Items<com.lifehub.app.data.Habit>>("/api/life/habits").items }.getOrDefault(emptyList()) }
            val travel = async { runCatching { Api.get<Items<com.lifehub.app.data.TravelPlan>>("/api/life/travel").items }.getOrDefault(emptyList()) }
            ProfileData(profile.await(), activity.await(), achievements.await(), showcase.await(), languages.await(), goals.await(), courses.await(), feed.await(), habits.await(), travel.await())
        }
    }
    var selectedDay by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = state.loading && state.data != null, onRefresh = { state.reload() }, modifier = Modifier.fillMaxSize()) {
        val style = state.data?.profile?.style
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(presetColors(style?.backgroundPreset ?: "aurora")))) {
        Api.fileUrl(style?.backgroundUrl)?.let {
            AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(Color(0x59050A12), Color(0xB3050A12), Color(0xE6050A12)))))
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
            LoadableContent(state) { data ->
                val user = data.profile.user
                if (editing) ProfileEditDialog(user, { editing = false }) { editing = false; state.reload() }
                // Баннер и аватар
                Box(Modifier.fillMaxWidth().height(170.dp)) {
                    Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF7C3AED), Color(0xFF2563EB)))))
                    Api.fileUrl(user.bannerUrl)?.let { AsyncImage(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.25f)))
                    IconButton(onClick = { editing = true }, modifier = Modifier.align(Alignment.TopEnd).padding(top = 32.dp, end = 96.dp)) {
                        Icon(Icons.Default.Edit, "Профиль", tint = Color.White)
                    }
                    IconButton(onClick = { nav.navigate("customize") }, modifier = Modifier.align(Alignment.TopEnd).padding(top = 32.dp, end = 52.dp)) {
                        Icon(Icons.Default.Palette, "Оформление", tint = Color.White)
                    }
                    IconButton(onClick = { nav.navigate("settings") }, modifier = Modifier.align(Alignment.TopEnd).padding(top = 32.dp, end = 8.dp)) {
                        Icon(Icons.Default.Settings, "Настройки", tint = Color.White)
                    }
                }
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Box(Modifier.offset(y = (-44).dp).size(92.dp).clip(CircleShape).border(4.dp, Brand.Deep, CircleShape)) {
                        Avatar(Api.fileUrl(user.avatarUrl), user.name ?: "?", 92)
                    }
                    Column(Modifier.offset(y = (-34).dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(user.name ?: "Без имени", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold)
                            if (user.isVerified == 1) Text("  ✔", color = Brand.Sky, fontWeight = FontWeight.Bold)
                        }
                        Text("@${user.username ?: ""}" + (user.city?.let { " · 📍 $it" } ?: ""), color = Brand.TextMuted)
                        user.bio?.takeIf { it.isNotBlank() }?.let { Text(it, modifier = Modifier.padding(top = 6.dp)) }
                        user.profileUrl?.takeIf { it.isNotBlank() }?.let { url ->
                            val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
                            Text("🔗 " + url.removePrefix("https://").removePrefix("http://"), color = Brand.Mint, fontSize = 13.sp,
                                modifier = Modifier.padding(top = 4.dp).clickable { runCatching { uriHandler.openUri(if (url.startsWith("http")) url else "https://$url") } })
                        }
                    }

                    // Уровень и серия
                    val level = data.activity.level
                    LhCard(Modifier.offset(y = (-22).dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            LevelRing(level.level, (level.xp - level.currentFloor).toFloat() / (level.nextAt - level.currentFloor).coerceAtLeast(1))
                            Spacer(Modifier.width(14.dp))
                            Column(Modifier.weight(1f)) {
                                Text("${level.xp} XP", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                Text("до ${level.level + 1} уровня: ${(level.nextAt - level.xp).coerceAtLeast(0)} XP", color = Brand.TextMuted, fontSize = 13.sp)
                                Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Chip("🔥 ${data.activity.streak} дн.", Brand.Amber)
                                    Chip("${data.activity.activeDays} активных дней", Brand.Sky)
                                }
                            }
                        }
                    }

                    // Главное достижение + 5 последних — как в Steam
                    val earnedAll = data.achievements.filter { it.earned }.sortedByDescending { it.earnedAt ?: "" }
                    val featured = data.profile.style.featuredId?.let { id -> earnedAll.firstOrNull { it.id == id } }
                    LhCard(Modifier.fillMaxWidth().offset(y = (-14).dp), background = Color.Black.copy(alpha = 0.35f)) {
                        if (featured != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val c = rarityColor(featured.rarity)
                                Box(Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)).background(c.copy(alpha = 0.2f)).border(2.dp, c, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
                                    Text(featured.icon, fontSize = 40.sp)
                                }
                                Spacer(Modifier.width(12.dp))
                                Column(Modifier.weight(1f)) {
                                    Text("ГЛАВНОЕ ДОСТИЖЕНИЕ", fontSize = 10.sp, color = Brand.TextFaint, letterSpacing = 1.5.sp)
                                    Text(featured.title, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                                    featured.description?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp, maxLines = 2) }
                                    Text(rarityLabel(featured.rarity), color = c, fontSize = 11.sp)
                                }
                            }
                        } else {
                            Text("⭐ Главное достижение можно выбрать в веб-версии: Профиль → Оформление", color = Brand.TextMuted, fontSize = 13.sp)
                        }
                        Spacer(Modifier.height(12.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("ПОСЛЕДНИЕ ДОСТИЖЕНИЯ", fontSize = 10.sp, color = Brand.TextFaint, letterSpacing = 1.5.sp, modifier = Modifier.weight(1f))
                            Text("${earnedAll.size} из ${data.achievements.size}", fontSize = 12.sp, color = Brand.TextMuted, modifier = Modifier.clickable { nav.navigate("achievements") })
                        }
                        Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            (0 until 5).forEach { i ->
                                val a = earnedAll.getOrNull(i)
                                Box(
                                    Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(12.dp))
                                        .background(a?.let { rarityColor(it.rarity).copy(alpha = 0.18f) } ?: Color.Transparent)
                                        .border(1.dp, a?.let { rarityColor(it.rarity).copy(alpha = 0.6f) } ?: Color.White.copy(alpha = 0.1f), RoundedCornerShape(12.dp)),
                                    contentAlignment = Alignment.Center,
                                ) { a?.let { Text(it.icon, fontSize = 24.sp) } }
                            }
                        }
                    }

                    // Статистика (как боковая панель Steam/Twitter)
                    val st = data.profile.stats
                    LhCard(Modifier.fillMaxWidth().padding(top = 10.dp).offset(y = (-14).dp), background = Color.Black.copy(alpha = 0.35f)) {
                        listOf(
                            "Языки" to "${st.languages}", "Курсы" to "${st.coursesDone}/${st.courses}", "Уроков пройдено" to "${st.lessons}",
                            "Слов в словаре" to "${st.words}", "Цели года" to "${st.goalsDone} ✓ · ${st.goals}", "Привычки" to "${st.habits}",
                            "Страницы" to "${st.pages}", "Путешествия" to "${st.trips}", "Активных дней" to "${st.activeDays}",
                        ).chunked(3).forEach { row ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                row.forEach { (label, value) ->
                                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                                        Text(value, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                                        Text(label, color = Brand.TextMuted, fontSize = 11.sp)
                                    }
                                }
                            }
                        }
                    }

                    val showcases = data.profile.style.showcases
                    val earned = data.achievements.filter { it.earned }
                    showcases.forEach { id ->
                        when (id) {
                            "achievements" -> {
                                val showcase = data.showcase.mapNotNull { sid -> earned.firstOrNull { it.id == sid } }.ifEmpty { earned.take(6) }
                                ShowcaseSection("🏆", "Витрина достижений", "${earned.size}/${data.achievements.size}") { nav.navigate("achievements") }
                                if (showcase.isEmpty()) {
                                    Text("Ачивок пока нет — они придут сами, просто пользуйтесь приложением.", color = Brand.TextMuted, fontSize = 14.sp)
                                } else showcase.chunked(3).forEach { row ->
                                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(bottom = 10.dp)) {
                                        row.forEach { AchievementBadge(it, Modifier.weight(1f)) }
                                        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                                    }
                                }
                            }
                            "languages" -> if (data.languages.isNotEmpty()) {
                                ShowcaseSection("🗣️", "Языки", "${data.languages.size}") { nav.navigate("learn") }
                                data.languages.forEachIndexed { i, l -> LanguageBannerCard(l, i, Modifier.padding(bottom = 8.dp)) { nav.navigate("vocab/${l.id}") } }
                            }
                            "courses" -> {
                                ShowcaseSection("🎓", "Курсы", null, null)
                                CoursesShowcase(data.courses) { c -> nav.navigate(c.learnCourseId?.let { "course/$it" } ?: "learn") }
                            }
                            "goals" -> if (data.goals.isNotEmpty()) {
                                ShowcaseSection("🎯", "Цели года", null) { nav.navigate("goals") }
                                data.goals.take(6).forEach { g ->
                                    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                                        Text(g.title, fontSize = 14.sp, modifier = Modifier.weight(1f), maxLines = 1)
                                        Text("${g.completed}/${g.target}", fontSize = 12.sp, color = Brand.TextMuted)
                                    }
                                    ProgressBar(g.completionPct / 100f, height = 5.dp, colors = listOf(Brand.Amber, Brand.Amber))
                                }
                            }
                            "activity" -> {
                                ShowcaseSection("🔥", "Активность", "${data.activity.activeDays} дн.", null)
                                LhCard(background = Color.Black.copy(alpha = 0.35f)) {
                                    ActivityGrid(data.activity, selectedDay) { selectedDay = if (selectedDay == it) null else it }
                                    selectedDay?.let { day ->
                                        val count = data.activity.days.firstOrNull { it.date == day }?.count ?: 0
                                        Text("$day: $count действий", color = Brand.TextMuted, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
                                    }
                                }
                            }
                            "radar" -> {
                                ShowcaseSection("🧭", "Индекс жизни", null, null)
                                val lvl = data.activity.level
                                val pct = ((lvl.xp - lvl.currentFloor) * 100 / (lvl.nextAt - lvl.currentFloor).coerceAtLeast(1))
                                LhCard(background = Color.Black.copy(alpha = 0.35f)) {
                                    RadarShowcase(buildLifeRadar(lvl.level, lvl.xp, pct, data.habits, data.habits.associate { it.id to it.doneThisWeek }, data.goals, data.languages, data.courses, data.travel))
                                }
                            }
                            "feed" -> {
                                ShowcaseSection("📰", "Лента событий", null, null)
                                FeedShowcase(data.feed)
                            }
                        }
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
        }
    }
}

@Composable
private fun ActivityGrid(activity: Activity, selected: String?, onSelect: (String) -> Unit) {
    val weeks = 18
    val counts = remember(activity) { activity.days.associate { it.date to it.count } }
    val today = LocalDate.now()
    val end = today.plusDays((6 - (today.dayOfWeek.value - 1)).toLong())
    val start = end.minusDays((weeks * 7 - 1).toLong())
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        for (w in 0 until weeks) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                for (d in 0 until 7) {
                    val date = start.plusDays((w * 7 + d).toLong())
                    val key = date.toString()
                    val count = counts[key] ?: 0
                    val color = when {
                        date.isAfter(today) -> Color.Transparent
                        count <= 0 -> Color.White.copy(alpha = 0.06f)
                        count < 3 -> Brand.Mint.copy(alpha = 0.3f)
                        count < 7 -> Brand.Mint.copy(alpha = 0.5f)
                        count < 15 -> Brand.Mint.copy(alpha = 0.75f)
                        else -> Brand.Mint
                    }
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(3.dp)).background(color)
                            .then(if (selected == key) Modifier.border(1.5.dp, Brand.Amber, RoundedCornerShape(3.dp)) else Modifier)
                            .clickable(enabled = !date.isAfter(today)) { onSelect(key) },
                    )
                }
            }
        }
    }
}

@Composable
fun AchievementBadge(item: Achievement, modifier: Modifier = Modifier) {
    val color = rarityColor(item.rarity)
    Column(
        modifier.clip(RoundedCornerShape(18.dp)).background(color.copy(alpha = 0.12f)).border(1.dp, color.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(item.icon, fontSize = 32.sp)
        Text(item.title, fontSize = 11.sp, textAlign = TextAlign.Center, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
    }
}

