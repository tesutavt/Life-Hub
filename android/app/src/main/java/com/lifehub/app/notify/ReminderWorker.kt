package com.lifehub.app.notify

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.lifehub.app.data.Api
import com.lifehub.app.data.Items
import com.lifehub.app.data.Session
import com.lifehub.app.data.UnseenAchievement
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.time.LocalDate
import java.time.LocalTime
import java.util.concurrent.TimeUnit

@Serializable data class Reminder(val key: String, val category: String = "learning", val title: String = "", val body: String = "", val route: String? = null)
@Serializable data class PendingReminders(val items: List<Reminder> = emptyList())

/** Открыто ли приложение на экране (выставляет MainActivity). */
object AppVisibility {
    @Volatile var foreground: Boolean = false
}

/**
 * Раз в 15 минут (минимум WorkManager) спрашивает сервер о напоминаниях с локальными датой и
 * часом телефона и показывает новые уведомлением. Ачивки — только когда приложение закрыто:
 * в открытом приложении их показывает всплывающий тост.
 */
class ReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        // Процесс мог быть поднят системой только ради этой задачи — состояние читаем заново
        Session.init(applicationContext)
        val stamp = LocalTime.now().withNano(0).withSecond(0).toString()
        if (Session.server.value == null || Session.token.value == null) {
            Session.lastReminderCheck = "$stamp|не выполнен вход"
            return Result.success()
        }
        if (!Session.deviceNotifications) return Result.success()
        val context = applicationContext
        val force = inputData.getBoolean(KEY_FORCE, false)
        return try {
            val today = LocalDate.now()
            val query = "/api/reminders/pending?date=$today&hour=${LocalTime.now().hour}" + if (force) "&force=1" else ""
            val response = Api.get<PendingReminders>(query)
            val shown = Session.shownReminders()
            response.items.filter { force || it.key !in shown }.forEach { item ->
                Notifications.show(context, item.key.hashCode(), item.category, item.title, item.body, item.route)
                Session.markReminderShown(item.key, today.toString())
            }
            if (!AppVisibility.foreground) {
                val unseen = Api.get<Items<UnseenAchievement>>("/api/achievements/unseen").items
                unseen.forEach { a ->
                    val body = listOfNotNull(a.description, if (a.xpReward > 0) "+${a.xpReward} XP" else null).joinToString(" · ")
                    Notifications.show(context, 100_000 + a.id, "achievements", "🏆 Ачивка: ${a.title}", body, "achievements")
                }
                if (unseen.isNotEmpty()) {
                    Api.post("/api/achievements/seen", buildJsonObject { put("ids", JsonArray(unseen.map { JsonPrimitive(it.id) })) })
                }
            }
            Session.lastReminderCheck = "$stamp|ok"
            // Попутно: календарь телефона (раз в 3 часа) и виджеты на рабочем столе
            runCatching { com.lifehub.app.sync.DeviceCalendar.syncIfDue(context) }
            Result.success()
        } catch (e: Exception) {
            Session.lastReminderCheck = "$stamp|${e.message ?: "сервер недоступен"}"
            Result.retry()
        }
    }

    companion object {
        const val KEY_FORCE = "force"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val periodic = PeriodicWorkRequestBuilder<ReminderWorker>(15, TimeUnit.MINUTES).setConstraints(constraints).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("reminders", ExistingPeriodicWorkPolicy.KEEP, periodic)
        }

        /** Разовая проверка; force — показать всё актуальное без учёта часов («проверить сейчас»). */
        fun runNow(context: Context, force: Boolean = false) {
            val request = OneTimeWorkRequestBuilder<ReminderWorker>()
                .setInputData(androidx.work.workDataOf(KEY_FORCE to force))
                .build()
            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
