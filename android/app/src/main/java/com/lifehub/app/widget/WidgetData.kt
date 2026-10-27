package com.lifehub.app.widget

import android.content.Context
import androidx.glance.appwidget.updateAll
import com.lifehub.app.data.Activity
import com.lifehub.app.data.Api
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.Habit
import com.lifehub.app.data.HabitCheck
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.MissionsSummary
import com.lifehub.app.data.Session
import com.lifehub.app.data.VocabItem
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.time.LocalDate
import java.time.YearMonth

@Serializable data class WidgetWord(val term: String, val translation: String, val note: String? = null)

/** Снимок данных для виджетов: хранится на телефоне, чтобы виджет рисовался мгновенно и без сети. */
@Serializable
data class WidgetSnapshot(
    val level: Int = 1,
    val xpToday: Int = 0,
    val streak: Int = 0,
    val missionsPoints: Int = 0,
    val missionsTarget: Int = 500,
    val claimable: Int = 0,
    val habitsLeft: Int = 0,
    val habitsTotal: Int = 0,
    val nextEvent: String? = null,
    val nextEventDate: String? = null,
    val languageId: Int? = null,
    val japanese: Boolean = false,
    val words: List<WidgetWord> = emptyList(),
    val wordIndex: Int = 0,
    val wordRevealed: Boolean = false,
    val updatedAt: Long = 0,
)

object WidgetData {
    private const val KEY = "widget_snapshot"
    private const val STALE_MS = 30 * 60_000L

    private fun prefs(context: Context) = context.getSharedPreferences("lifehub", Context.MODE_PRIVATE)

    // Живой снимок: Glance держит сессию виджета открытой, и данные, прочитанные один раз
    // в provideGlance, «замерзают». Виджеты подписываются на этот поток и перерисовываются сами.
    private val state = MutableStateFlow<WidgetSnapshot?>(null)
    @Volatile private var loaded = false

    fun flow(context: Context): StateFlow<WidgetSnapshot?> {
        if (!loaded) { state.value = load(context); loaded = true }
        return state
    }

    fun load(context: Context): WidgetSnapshot? =
        prefs(context).getString(KEY, null)?.let { runCatching { Api.json.decodeFromString<WidgetSnapshot>(it) }.getOrNull() }

    private fun save(context: Context, snapshot: WidgetSnapshot) {
        prefs(context).edit().putString(KEY, Api.json.encodeToString(snapshot)).apply()
        state.value = snapshot
        loaded = true
    }

    /** Сброс при выходе из аккаунта — виджеты покажут «войдите». */
    suspend fun clear(context: Context) {
        prefs(context).edit().remove(KEY).apply()
        state.value = null
        loaded = true
        updateAll(context)
    }

    fun isStale(snapshot: WidgetSnapshot?) = snapshot == null || System.currentTimeMillis() - snapshot.updatedAt > STALE_MS

    /** Загружает свежие данные с сервера и перерисовывает все виджеты. */
    suspend fun refresh(context: Context) {
        Session.init(context)
        if (Session.server.value == null || Session.token.value == null) {
            updateAll(context)
            return
        }
        // Проверяем, что сервер вообще отвечает: иначе не затираем старый снимок нулями
        val activityProbe = runCatching { Api.get<Activity>("/api/achievements/activity?days=7") }
        if (activityProbe.isFailure) {
            android.util.Log.w("LifeHubWidget", "refresh failed", activityProbe.exceptionOrNull())
            updateAll(context)
            return
        }
        val old = load(context)
        val today = LocalDate.now()
        val snapshot = coroutineScope {
            val activity = async { activityProbe.getOrNull() }
            val missions = async { runCatching { Api.get<MissionsSummary>("/api/life/daily-missions") }.getOrNull() }
            val habits = async { runCatching { Api.get<Items<Habit>>("/api/life/habits").items }.getOrDefault(emptyList()) }
            val checks = async { runCatching { Api.get<Items<HabitCheck>>("/api/life/habits/checks?from=$today&to=$today").items }.getOrDefault(emptyList()) }
            val events = async {
                runCatching {
                    val now = YearMonth.now()
                    listOf(now, now.plusMonths(1)).flatMap { Api.get<Items<CalendarEvent>>("/api/life/calendar?y=${it.year}&m=${it.monthValue}").items }
                }.getOrDefault(emptyList())
            }
            val languages = async { runCatching { Api.get<Items<Language>>("/api/life/languages").items }.getOrDefault(emptyList()) }

            // Язык со словами (а не просто первый в списке): больше слов к повторению — выше приоритет
            val vocabs = languages.await().map { lang ->
                async { lang to runCatching { Api.get<Items<VocabItem>>("/api/life/languages/${lang.id}/vocab").items }.getOrDefault(emptyList()) }
            }.map { it.await() }
            val best = vocabs.maxWithOrNull(compareBy({ (_, v) -> v.count { it.isDue } }, { (_, v) -> v.size }))
            val language = best?.takeIf { it.second.isNotEmpty() }?.first ?: vocabs.firstOrNull()?.first
            val words = best?.second.orEmpty()
                .sortedByDescending { it.isDue }.take(60).shuffled().map { WidgetWord(it.term, it.translation, it.note) }
            val checked = checks.await().map { it.habitId }.toSet()
            val habitList = habits.await()
            val next = events.await()
                .filter { it.type != "mood" && it.title.isNotBlank() && it.date >= today.toString() }
                .sortedBy { it.date }
                .firstOrNull()
            val m = missions.await()
            val a = activity.await()
            WidgetSnapshot(
                level = a?.level?.level ?: old?.level ?: 1,
                xpToday = a?.level?.xpToday ?: 0,
                streak = a?.streak ?: old?.streak ?: 0,
                missionsPoints = m?.totalPoints ?: 0,
                missionsTarget = m?.targetPoints ?: 500,
                claimable = m?.missions?.count { it.claimable } ?: 0,
                habitsLeft = habitList.count { it.id !in checked },
                habitsTotal = habitList.size,
                nextEvent = next?.title,
                nextEventDate = next?.date,
                languageId = language?.id,
                japanese = language?.name?.let { Regex("япон|japan|日本", RegexOption.IGNORE_CASE).containsMatchIn(it) } ?: false,
                words = words.ifEmpty { old?.words.orEmpty() },
                wordIndex = 0,
                wordRevealed = false,
                updatedAt = System.currentTimeMillis(),
            )
        }
        save(context, snapshot)
        android.util.Log.i("LifeHubWidget", "refreshed: lvl=${snapshot.level} words=${snapshot.words.size} habits=${snapshot.habitsTotal}")
        updateAll(context)
    }

    /** «Слово дня»: показать перевод, а при повторном нажатии — следующее слово. */
    suspend fun advanceWord(context: Context) {
        val s = load(context) ?: return
        val next = if (!s.wordRevealed) s.copy(wordRevealed = true)
        else s.copy(wordRevealed = false, wordIndex = if (s.words.isEmpty()) 0 else (s.wordIndex + 1) % s.words.size)
        save(context, next)
        WordWidget().updateAll(context)
    }

    suspend fun updateAll(context: Context) {
        runCatching { TodayWidget().updateAll(context) }
        runCatching { WordWidget().updateAll(context) }
        runCatching { QuickWidget().updateAll(context) }
    }
}
