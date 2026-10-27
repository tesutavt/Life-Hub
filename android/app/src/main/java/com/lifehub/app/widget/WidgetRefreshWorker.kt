package com.lifehub.app.widget

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/** Обновление виджетов — отдельно от напоминаний, чтобы не зависеть от их настроек и ошибок. */
class WidgetRefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runCatching { WidgetData.refresh(applicationContext) }
            .onFailure { android.util.Log.w("LifeHubWidget", "worker failed", it) }
        return Result.success()
    }

    companion object {
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val periodic = PeriodicWorkRequestBuilder<WidgetRefreshWorker>(30, TimeUnit.MINUTES).setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork("widgets", ExistingPeriodicWorkPolicy.KEEP, periodic)
        }

        fun runNow(context: Context) {
            val request = OneTimeWorkRequestBuilder<WidgetRefreshWorker>().setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniqueWork("widgets-now", ExistingWorkPolicy.KEEP, request)
        }
    }
}
