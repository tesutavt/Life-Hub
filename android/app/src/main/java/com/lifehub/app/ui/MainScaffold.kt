package com.lifehub.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.lifehub.app.DeepLink
import com.lifehub.app.data.Achievements
import com.lifehub.app.data.Session
import com.lifehub.app.notify.Notifications
import com.lifehub.app.notify.ReminderWorker
import com.lifehub.app.data.UnseenAchievement
import com.lifehub.app.ui.screens.AchievementsScreen
import com.lifehub.app.ui.screens.CalendarScreen
import com.lifehub.app.ui.screens.CoursePathScreen
import com.lifehub.app.ui.screens.FinanceScreen
import com.lifehub.app.ui.screens.ProgramScreen
import com.lifehub.app.ui.screens.GoalsScreen
import com.lifehub.app.ui.screens.HabitsScreen
import com.lifehub.app.ui.screens.HomeScreen
import com.lifehub.app.ui.screens.LearnScreen
import com.lifehub.app.ui.screens.LessonScreen
import com.lifehub.app.ui.screens.MissionsScreen
import com.lifehub.app.ui.screens.PracticeScreen
import com.lifehub.app.ui.screens.ProfileScreen
import com.lifehub.app.ui.screens.SettingsScreen
import com.lifehub.app.ui.screens.VocabScreen
import com.lifehub.app.ui.theme.Brand
import com.lifehub.app.ui.theme.rarityColor
import com.lifehub.app.ui.theme.rarityLabel
import kotlinx.coroutines.delay

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("home", "Главная", Icons.Default.Home),
    Tab("learn", "Учёба", Icons.Default.School),
    Tab("missions", "Задания", Icons.Default.AutoAwesome),
    Tab("habits", "Привычки", Icons.Default.CheckCircle),
    Tab("profile", "Профиль", Icons.Default.Person),
)

/** Основное приложение: нижняя навигация, все экраны и всплывающие ачивки. */
@Composable
fun MainScaffold() {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showBar = TABS.any { it.route == route }
    val toasts = remember { mutableStateListOf<UnseenAchievement>() }
    val context = LocalContext.current

    // Android 13+: разрешение на уведомления спрашиваем один раз после входа
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        ReminderWorker.runNow(context)
    }
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33 && !Notifications.canPost(context) && !Session.askedNotificationPermission) {
            Session.askedNotificationPermission = true
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // Нажатие на уведомление — открыть нужный раздел
    val deepLink by DeepLink.route.collectAsState()
    LaunchedEffect(deepLink) {
        val target = deepLink ?: return@LaunchedEffect
        DeepLink.route.value = null
        val route = when {
            Regex("^(course|practice|kana|vocab|page|lesson|program|checkpoint)/\\d+$").matches(target) -> target
            target in listOf("learn", "habits", "missions", "profile") -> { openTab(nav, target); return@LaunchedEffect }
            target in listOf("calendar", "goals", "achievements", "finance", "finance/add", "reports", "pages", "travel", "settings", "search", "customize") -> target
            else -> { openTab(nav, "home"); return@LaunchedEffect }
        }
        nav.navigate(route) { launchSingleTop = true }
    }

    // Открытие приложения засчитывается в ачивки; затем раз в 20 секунд проверяем новые
    LaunchedEffect(Unit) {
        Achievements.track("app.open")
        Achievements.track("app.mobile_open")
        while (true) {
            toasts.addAll(Achievements.pollUnseen().filter { new -> toasts.none { it.id == new.id } })
            delay(20_000)
        }
    }
    LaunchedEffect(Unit) {
        Achievements.events.collect { toasts.addAll(Achievements.pollUnseen().filter { new -> toasts.none { it.id == new.id } }) }
    }

    Box(Modifier.fillMaxSize()) {
        Scaffold(
            containerColor = Brand.Deep,
            bottomBar = {
                if (showBar) {
                    NavigationBar(containerColor = Brand.Night, tonalElevation = 0.dp) {
                        TABS.forEach { tab ->
                            NavigationBarItem(
                                selected = route == tab.route,
                                onClick = { openTab(nav, tab.route) },
                                icon = { Icon(tab.icon, tab.label) },
                                label = { Text(tab.label, fontSize = 11.sp) },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = Brand.Deep,
                                    indicatorColor = Brand.Mint,
                                    selectedTextColor = Brand.Mint,
                                    unselectedIconColor = Brand.TextMuted,
                                    unselectedTextColor = Brand.TextMuted,
                                ),
                            )
                        }
                    }
                }
            },
        ) { padding ->
            Box(Modifier.padding(bottom = padding.calculateBottomPadding())) {
                AppNavHost(nav)
            }
        }

        // Тост об ачивке сверху экрана
        val current = toasts.firstOrNull()
        LaunchedEffect(current?.id) {
            if (current != null) {
                delay(4500)
                toasts.remove(current)
            }
        }
        AnimatedVisibility(
            visible = current != null,
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
            modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(12.dp),
        ) {
            current?.let { AchievementToast(it) { toasts.remove(it); nav.navigate("achievements") } }
        }
    }
}

@Composable
private fun AchievementToast(item: UnseenAchievement, onClick: () -> Unit) {
    val color = rarityColor(item.rarity)
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Color(0xF2051824))
            .border(1.5.dp, color.copy(alpha = 0.7f), RoundedCornerShape(18.dp)).clickable(onClick = onClick).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(52.dp).clip(RoundedCornerShape(14.dp)).background(color.copy(alpha = 0.2f)), contentAlignment = Alignment.Center) {
            Text(item.icon, fontSize = 28.sp)
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text("🏆 АЧИВКА ПОЛУЧЕНА · ${rarityLabel(item.rarity).uppercase()}", color = color, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(item.title, fontWeight = FontWeight.Bold)
            item.description?.let { Text(it, color = Brand.TextMuted, fontSize = 12.sp, maxLines = 2) }
            if (item.xpReward > 0) Text("+${item.xpReward} XP", color = Brand.Mint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

/**
 * Переход на вкладку нижнего меню: всегда к корню вкладки, без восстановления старого стека
 * (раньше «Главная» иногда возвращала на экран, где пользователь уже был).
 */
private fun openTab(nav: NavHostController, route: String) {
    if (route == "home") {
        if (!nav.popBackStack("home", inclusive = false)) nav.navigate("home")
        return
    }
    nav.navigate(route) {
        popUpTo("home") { inclusive = false }
        launchSingleTop = true
    }
}

@Composable
private fun AppNavHost(nav: NavHostController) {
    val back: () -> Unit = { nav.popBackStack() }
    NavHost(nav, startDestination = "home") {
        composable("home") { HomeScreen(nav) }
        composable("learn") { LearnScreen(nav) }
        composable("missions") { MissionsScreen() }
        composable("habits") { HabitsScreen() }
        composable("profile") { ProfileScreen(nav) }
        composable("achievements") { AchievementsScreen(back) }
        composable("calendar") { CalendarScreen(back) }
        composable("goals") { GoalsScreen(back) }
        composable("settings") { SettingsScreen(back) }
        composable("course/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            CoursePathScreen(it.arguments!!.getInt("id"), nav)
        }
        composable("lesson/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            LessonScreen(it.arguments!!.getInt("id"), back)
        }
        composable("vocab/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            VocabScreen(it.arguments!!.getInt("id"), nav)
        }
        composable("practice/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            val id = it.arguments!!.getInt("id")
            PracticeScreen(id, back, onKana = { nav.navigate("kana/$id") })
        }
        composable("checkpoint/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            LessonScreen(it.arguments!!.getInt("id"), back, checkpoint = true, onOpenLesson = { id -> nav.navigate("lesson/$id") { popUpTo("checkpoint/{id}") { inclusive = true } } })
        }
        composable("program/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            ProgramScreen(it.arguments!!.getInt("id"), back)
        }
        composable("finance") { FinanceScreen(back) }
        composable("finance/add") { FinanceScreen(back, startAdding = true) }
        composable("kana/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            com.lifehub.app.ui.screens.KanaScreen(it.arguments!!.getInt("id"), back)
        }
        composable("reports") { com.lifehub.app.ui.screens.ReportsScreen(back) }
        composable("pages") { com.lifehub.app.ui.screens.PagesScreen(nav) }
        composable("search") { com.lifehub.app.ui.screens.SearchScreen(nav) }
        composable("page/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) {
            com.lifehub.app.ui.screens.PageViewScreen(it.arguments!!.getInt("id"), nav)
        }
        composable("travel") { com.lifehub.app.ui.screens.TravelScreen(back) }
        composable("customize") { com.lifehub.app.ui.screens.ProfileCustomizeScreen(back) }
    }
}
