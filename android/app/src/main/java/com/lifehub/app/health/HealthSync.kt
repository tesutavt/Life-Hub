package com.lifehub.app.health

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.aggregate.AggregateMetric
import com.lifehub.app.data.Api
import com.lifehub.app.data.Session
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.encodeToJsonElement
import java.time.Duration
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId

/** Один день для сервера (POST /api/fitness/import). */
@Serializable
data class FitnessDay(
    val date: String,
    val steps: Long = 0,
    val calories: Double = 0.0,
    val distance: Double = 0.0,
    val move_minutes: Long = 0,
    val active_minutes: Long = 0,
    val hr_avg: Double = 0.0,
    val hr_min: Double = 0.0,
    val hr_max: Double = 0.0,
    val hr_samples: Long = 0,
    val hr_rest: Double = 0.0,
    val sleep_minutes: Double = 0.0,
    val deep_minutes: Double = 0.0,
    val light_minutes: Double = 0.0,
    val rem_minutes: Double = 0.0,
    val awake_minutes: Double = 0.0,
    val sleep_sessions: Int = 0,
)

@Serializable private data class ImportBody(val source: String, val days: List<FitnessDay>)

/**
 * Данные браслета через Health Connect. Notify, Simple Health, Zepp и другие приложения пишут
 * туда шаги, пульс и сон — Life Hub читает их и отправляет на сервер.
 */
object HealthSync {
    private const val PROVIDER = "com.google.android.apps.healthdata"
    private const val KEY_LAST = "health_last_sync"
    private const val KEY_STATUS = "health_last_status"
    private const val MIN_INTERVAL_MS = 2 * 60_000L

    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
    )

    enum class Availability { READY, NEEDS_UPDATE, UNAVAILABLE }

    fun availability(context: Context): Availability = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> Availability.READY
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> Availability.NEEDS_UPDATE
        else -> Availability.UNAVAILABLE
    }

    /** Открыть Health Connect в Play Маркете (установить/обновить). */
    fun installIntent(): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding"))
            .setPackage("com.android.vending")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun prefs(context: Context) = context.getSharedPreferences("lifehub", Context.MODE_PRIVATE)

    fun lastStatus(context: Context): String? = prefs(context).getString(KEY_STATUS, null)

    suspend fun granted(context: Context): Set<String> =
        if (availability(context) != Availability.READY) emptySet()
        else runCatching { HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions() }.getOrDefault(emptySet())

    suspend fun isConnected(context: Context) = granted(context).isNotEmpty()

    /**
     * Прочитать последние [days] дней и отправить на сервер.
     * [force] = false — не чаще раза в пару минут (обновление экрана дёргает часто).
     */
    suspend fun sync(context: Context, days: Int = 7, force: Boolean = false): Result<Int> = runCatching {
        if (availability(context) != Availability.READY) error("Health Connect недоступен")
        val granted = granted(context)
        if (granted.isEmpty()) error("Нет доступа к Health Connect")
        val now = System.currentTimeMillis()
        if (!force && now - prefs(context).getLong(KEY_LAST, 0) < MIN_INTERVAL_MS) return@runCatching 0
        Session.init(context)
        if (Session.server.value == null || Session.token.value == null) error("Не выполнен вход")

        val list = read(context, granted, days)
        Api.post("/api/fitness/import", Json.encodeToJsonElement(ImportBody("health_connect", list)))
        prefs(context).edit().putLong(KEY_LAST, now).apply()
        val today = list.lastOrNull()
        val status = "${java.time.LocalTime.now().withNano(0).withSecond(0)} · сегодня ${today?.steps ?: 0} шагов" +
            (today?.sleep_minutes?.takeIf { it > 0 }?.let { " · сон ${"%.1f".format(it / 60)} ч" } ?: "")
        prefs(context).edit().putString(KEY_STATUS, status).apply()
        list.size
    }.onFailure { e ->
        prefs(context).edit().putString(KEY_STATUS, "Ошибка: ${e.message}").apply()
    }

    private suspend fun read(context: Context, granted: Set<String>, days: Int): List<FitnessDay> {
        val client = HealthConnectClient.getOrCreate(context)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now()
        val first = today.minusDays((days - 1).toLong())
        fun has(cls: kotlin.reflect.KClass<out androidx.health.connect.client.records.Record>) = HealthPermission.getReadPermission(cls) in granted

        // Агрегаты по суткам: Health Connect сам убирает дубли от разных приложений
        val metrics = buildSet<AggregateMetric<*>> {
            if (has(StepsRecord::class)) add(StepsRecord.COUNT_TOTAL)
            if (has(ActiveCaloriesBurnedRecord::class)) add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL)
            if (has(DistanceRecord::class)) add(DistanceRecord.DISTANCE_TOTAL)
            if (has(ExerciseSessionRecord::class)) add(ExerciseSessionRecord.EXERCISE_DURATION_TOTAL)
            if (has(HeartRateRecord::class)) {
                add(HeartRateRecord.BPM_AVG); add(HeartRateRecord.BPM_MIN); add(HeartRateRecord.BPM_MAX); add(HeartRateRecord.MEASUREMENTS_COUNT)
            }
            if (has(RestingHeartRateRecord::class)) add(RestingHeartRateRecord.BPM_AVG)
        }
        val byDay = mutableMapOf<LocalDate, FitnessDay>()
        (0 until days).forEach { i -> val d = first.plusDays(i.toLong()); byDay[d] = FitnessDay(d.toString()) }

        if (metrics.isNotEmpty()) {
            val buckets = client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(
                    metrics = metrics,
                    timeRangeFilter = TimeRangeFilter.between(first.atStartOfDay(), today.plusDays(1).atStartOfDay()),
                    timeRangeSlicer = Period.ofDays(1),
                ),
            )
            buckets.forEach { b ->
                val d = b.startTime.toLocalDate()
                val r = b.result
                val exercise = r[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes() ?: 0
                byDay[d] = (byDay[d] ?: FitnessDay(d.toString())).copy(
                    steps = r[StepsRecord.COUNT_TOTAL] ?: 0,
                    calories = r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0,
                    distance = r[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0,
                    active_minutes = exercise,
                    move_minutes = exercise,
                    hr_avg = (r[HeartRateRecord.BPM_AVG] ?: 0L).toDouble(),
                    hr_min = (r[HeartRateRecord.BPM_MIN] ?: 0L).toDouble(),
                    hr_max = (r[HeartRateRecord.BPM_MAX] ?: 0L).toDouble(),
                    hr_samples = r[HeartRateRecord.MEASUREMENTS_COUNT] ?: 0,
                    hr_rest = (r[RestingHeartRateRecord.BPM_AVG] ?: 0L).toDouble(),
                )
            }
        }

        // Сон относим к дню пробуждения, стадии — по типам Health Connect
        if (has(SleepSessionRecord::class)) {
            val sessions = client.readRecords(
                ReadRecordsRequest(
                    SleepSessionRecord::class,
                    TimeRangeFilter.between(first.minusDays(1).atStartOfDay(zone).toInstant(), today.plusDays(1).atStartOfDay(zone).toInstant()),
                ),
            ).records
            sessions.groupBy { it.endTime.atZone(zone).toLocalDate() }.forEach { (d, list) ->
                val day = byDay[d] ?: return@forEach
                var deep = 0.0; var light = 0.0; var rem = 0.0; var awake = 0.0
                list.flatMap { it.stages }.forEach { st ->
                    val min = Duration.between(st.startTime, st.endTime).toMinutes().toDouble()
                    when (st.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> deep += min
                        SleepSessionRecord.STAGE_TYPE_LIGHT -> light += min
                        SleepSessionRecord.STAGE_TYPE_REM -> rem += min
                        SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> awake += min
                    }
                }
                val total = list.sumOf { Duration.between(it.startTime, it.endTime).toMinutes() }.toDouble()
                byDay[d] = day.copy(
                    sleep_minutes = (total - awake).coerceAtLeast(0.0),
                    deep_minutes = deep, light_minutes = light, rem_minutes = rem, awake_minutes = awake,
                    sleep_sessions = list.size,
                )
            }
        }
        return byDay.toSortedMap().values.toList()
    }
}
