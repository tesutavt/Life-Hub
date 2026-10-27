package com.lifehub.app.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.os.SystemClock

/**
 * Резерв для WorkManager: многие прошивки (Xiaomi, Huawei, Samsung…) не запускают
 * периодические задачи закрытого приложения. Будильник AlarmManager раз в ~30 минут
 * срабатывает и в режиме сна (setAndAllowWhileIdle), запускает проверку и ставит себя снова.
 */
class ReminderAlarm : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> ReminderWorker.schedule(context)
        }
        ReminderWorker.runNow(context)
        schedule(context)
    }

    companion object {
        private const val INTERVAL_MS = 30 * 60_000L
        private const val ACTION = "com.lifehub.app.REMINDER_ALARM"

        fun schedule(context: Context) {
            val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, ReminderAlarm::class.java).setAction(ACTION)
            val pending = PendingIntent.getBroadcast(context, 7001, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + INTERVAL_MS, pending)
        }

        /** Разрешено ли приложению работать в фоне без ограничений экономии батареи. */
        fun ignoresBatteryOptimizations(context: Context): Boolean {
            val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            return power.isIgnoringBatteryOptimizations(context.packageName)
        }
    }
}
