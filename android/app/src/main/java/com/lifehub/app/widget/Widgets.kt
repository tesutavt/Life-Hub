package com.lifehub.app.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.lifehub.app.MainActivity
import com.lifehub.app.notify.Notifications
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

// Минималистичная палитра: тёмная «стеклянная» карточка, как в приложении
private val BG = ColorProvider(Color(0xEB0B1A24))
private val CHIP = ColorProvider(Color(0x14FFFFFF))
private val TEXT = ColorProvider(Color(0xFFE9FCF6))
private val MUTED = ColorProvider(Color(0x99E9FCF6))
private val MINT = ColorProvider(Color(0xFF27E9B5))
private val AMBER = ColorProvider(Color(0xFFFBBF24))
private val TRACK = ColorProvider(Color(0x22FFFFFF))

/** Открыть приложение на нужном разделе (уникальный Uri — чтобы кнопки не путались). */
private fun openIntent(context: Context, route: String) =
    Intent(context, MainActivity::class.java)
        .setData(Uri.parse("lifehub://open/$route"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(Notifications.EXTRA_ROUTE, route)

/** Данные устарели — просим фоновую задачу обновить (она же перерисует виджеты). */
private fun refreshIfStale(context: Context, snapshot: WidgetSnapshot?) {
    if (WidgetData.isStale(snapshot)) WidgetRefreshWorker.runNow(context)
}

/** Общий приёмник: при добавлении виджета включаем периодическое обновление. */
abstract class LifeHubWidgetReceiver : GlanceAppWidgetReceiver() {
    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        WidgetRefreshWorker.schedule(context)
        WidgetRefreshWorker.runNow(context)
    }
    override fun onUpdate(context: Context, appWidgetManager: android.appwidget.AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        WidgetRefreshWorker.schedule(context)
    }
}

@Composable
private fun Card(context: Context, route: String, content: @Composable () -> Unit) {
    Box(
        GlanceModifier.fillMaxSize().cornerRadius(22.dp).background(BG).padding(14.dp)
            .clickable(actionStartActivity(openIntent(context, route))),
    ) { content() }
}

@Composable
private fun SignIn(context: Context) {
    Card(context, "home") {
        Column(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Life Hub", style = TextStyle(color = MINT, fontSize = 15.sp, fontWeight = FontWeight.Bold))
            Text("Откройте приложение и войдите", style = TextStyle(color = MUTED, fontSize = 12.sp, textAlign = TextAlign.Center))
        }
    }
}

// ───────────── «Сегодня» ─────────────
class TodayWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(130.dp, 130.dp), DpSize(250.dp, 130.dp), DpSize(250.dp, 200.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val flow = WidgetData.flow(context)
        refreshIfStale(context, flow.value)
        provideContent {
            val data by flow.collectAsState()
            data.let { if (it == null) SignIn(context) else TodayContent(context, it) }
        }
    }
}

@Composable
private fun TodayContent(context: Context, d: WidgetSnapshot) {
    val size = LocalSize.current
    val wide = size.width >= 240.dp
    val tall = size.height >= 190.dp
    val date = LocalDate.now().format(DateTimeFormatter.ofPattern("EE, d MMMM", Locale("ru")))
    Card(context, "home") {
        Column(GlanceModifier.fillMaxSize()) {
            Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(date.replaceFirstChar { it.uppercase() }, style = TextStyle(color = MUTED, fontSize = 12.sp), modifier = GlanceModifier.defaultWeight())
                Text("ур. ${d.level}", style = TextStyle(color = MINT, fontSize = 12.sp, fontWeight = FontWeight.Bold))
            }
            Spacer(GlanceModifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("🔥 ${d.streak}", style = TextStyle(color = TEXT, fontSize = 22.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.width(12.dp))
                Text("+${d.xpToday} XP", style = TextStyle(color = AMBER, fontSize = 14.sp, fontWeight = FontWeight.Medium))
            }
            Spacer(GlanceModifier.height(8.dp))
            Row(GlanceModifier.fillMaxWidth()) {
                Text("Задания дня", style = TextStyle(color = MUTED, fontSize = 11.sp), modifier = GlanceModifier.defaultWeight())
                Text(if (d.claimable > 0) "🎁 ${d.claimable}" else "${d.missionsPoints}/${d.missionsTarget}", style = TextStyle(color = if (d.claimable > 0) AMBER else MUTED, fontSize = 11.sp))
            }
            Spacer(GlanceModifier.height(4.dp))
            LinearProgressIndicator(
                progress = (d.missionsPoints.toFloat() / d.missionsTarget.coerceAtLeast(1)).coerceIn(0f, 1f),
                modifier = GlanceModifier.fillMaxWidth().height(6.dp),
                color = MINT, backgroundColor = TRACK,
            )
            if (wide || tall) {
                Spacer(GlanceModifier.height(8.dp))
                Row(GlanceModifier.fillMaxWidth()) {
                    Text(
                        if (d.habitsTotal == 0) "✅ Привычек нет" else if (d.habitsLeft == 0) "✅ Все привычки отмечены" else "✅ Осталось привычек: ${d.habitsLeft}",
                        style = TextStyle(color = TEXT, fontSize = 12.sp),
                        modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(openIntent(context, "habits"))),
                    )
                }
            }
            if (tall && d.nextEvent != null) {
                Spacer(GlanceModifier.height(6.dp))
                val when_ = d.nextEventDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }?.let {
                    if (it == LocalDate.now()) "сегодня" else if (it == LocalDate.now().plusDays(1)) "завтра" else it.format(DateTimeFormatter.ofPattern("d MMM", Locale("ru")))
                }
                Text("📅 ${when_ ?: ""} · ${d.nextEvent}", style = TextStyle(color = MUTED, fontSize = 12.sp), maxLines = 1,
                    modifier = GlanceModifier.clickable(actionStartActivity(openIntent(context, "calendar"))))
            }
        }
    }
}

class TodayWidgetReceiver : LifeHubWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

// ───────────── «Слово дня» ─────────────
class WordWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val flow = WidgetData.flow(context)
        refreshIfStale(context, flow.value)
        provideContent {
            val data by flow.collectAsState()
            data.let { if (it == null) SignIn(context) else WordContent(context, it) }
        }
    }
}

class NextWordAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetData.advanceWord(context)
    }
}

@Composable
private fun WordContent(context: Context, d: WidgetSnapshot) {
    val word = d.words.getOrNull(d.wordIndex)
    val route = d.languageId?.let { "practice/$it" } ?: "learn"
    Box(GlanceModifier.fillMaxSize().cornerRadius(22.dp).background(BG).padding(14.dp)) {
        Column(GlanceModifier.fillMaxSize().clickable(actionRunCallback<NextWordAction>()), verticalAlignment = Alignment.CenterVertically, horizontalAlignment = Alignment.CenterHorizontally) {
            if (word == null) {
                Text("Словарь пуст", style = TextStyle(color = TEXT, fontSize = 14.sp, fontWeight = FontWeight.Bold))
                Text("Пройдите урок — слова появятся", style = TextStyle(color = MUTED, fontSize = 11.sp, textAlign = TextAlign.Center))
            } else {
                Text("слово дня", style = TextStyle(color = MUTED, fontSize = 10.sp))
                Text(word.term, style = TextStyle(color = TEXT, fontSize = 26.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center), maxLines = 2)
                Spacer(GlanceModifier.height(4.dp))
                if (d.wordRevealed) {
                    Text(word.translation, style = TextStyle(color = MINT, fontSize = 15.sp, textAlign = TextAlign.Center), maxLines = 2)
                    word.note?.let { Text(it, style = TextStyle(color = MUTED, fontSize = 11.sp, textAlign = TextAlign.Center), maxLines = 1) }
                } else {
                    Text("нажмите, чтобы увидеть перевод", style = TextStyle(color = MUTED, fontSize = 11.sp, textAlign = TextAlign.Center))
                }
            }
        }
        // Маленькая кнопка в углу — сразу в тренировку
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
            Text(" ▶ ", style = TextStyle(color = MINT, fontSize = 12.sp, fontWeight = FontWeight.Bold),
                modifier = GlanceModifier.cornerRadius(10.dp).background(CHIP).clickable(actionStartActivity(openIntent(context, route))))
        }
    }
}

class WordWidgetReceiver : LifeHubWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WordWidget()
}

// ───────────── «Быстрые действия» ─────────────
class QuickWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val flow = WidgetData.flow(context)
        provideContent {
            val data by flow.collectAsState()
            QuickContent(context, data)
        }
    }
}

@Composable
private fun QuickButton(context: Context, emoji: String, label: String, route: String, modifier: GlanceModifier) {
    Column(
        modifier.cornerRadius(16.dp).background(CHIP).padding(vertical = 8.dp).clickable(actionStartActivity(openIntent(context, route))),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(emoji, style = TextStyle(fontSize = 18.sp))
        Text(label, style = TextStyle(color = TEXT, fontSize = 11.sp), maxLines = 1)
    }
}

@Composable
private fun QuickContent(context: Context, d: WidgetSnapshot?) {
    val lang = d?.languageId
    Row(
        GlanceModifier.fillMaxSize().cornerRadius(22.dp).background(BG).padding(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        QuickButton(context, "💸", "Расход", "finance/add", GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.width(6.dp))
        QuickButton(context, "🗣️", "Слова", lang?.let { "practice/$it" } ?: "learn", GlanceModifier.defaultWeight())
        Spacer(GlanceModifier.width(6.dp))
        if (d?.japanese == true && lang != null) {
            QuickButton(context, "あ", "Кана", "kana/$lang", GlanceModifier.defaultWeight())
            Spacer(GlanceModifier.width(6.dp))
        }
        QuickButton(context, if ((d?.claimable ?: 0) > 0) "🎁" else "📖", "Задания", "missions", GlanceModifier.defaultWeight())
    }
}

class QuickWidgetReceiver : LifeHubWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = QuickWidget()
}
