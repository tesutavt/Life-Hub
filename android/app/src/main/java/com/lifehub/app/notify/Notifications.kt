package com.lifehub.app.notify

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.lifehub.app.MainActivity
import com.lifehub.app.R

/** Каналы уведомлений = категории напоминаний: каждую можно отключить и в настройках Android. */
object Notifications {
    data class Channel(val id: String, val name: String, val description: String)

    val CHANNELS = listOf(
        Channel("learning", "Учёба и языки", "Урок ещё не пройден, серия в опасности"),
        Channel("habits", "Привычки", "Неотмеченные привычки вечером"),
        Channel("calendar", "Календарь", "События сегодня и завтра"),
        Channel("missions", "Задания дня", "Награды и дневная цель"),
        Channel("goals", "Цели на год", "Шаг к цели за сегодня"),
        Channel("achievements", "Ачивки", "Новые полученные ачивки"),
    )

    const val EXTRA_ROUTE = "route"

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)
        CHANNELS.forEach { channel ->
            manager.createNotificationChannel(
                NotificationChannel(channel.id, channel.name, NotificationManager.IMPORTANCE_DEFAULT).apply { description = channel.description }
            )
        }
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun show(context: Context, id: Int, channel: String, title: String, body: String, route: String?) {
        if (!canPost(context)) return
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            route?.let { putExtra(EXTRA_ROUTE, it) }
        }
        val pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, if (CHANNELS.any { it.id == channel }) channel else "learning")
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFF27E9B5.toInt())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, notification)
        } catch (_: SecurityException) {
            // разрешение на уведомления отозвано
        }
    }
}
