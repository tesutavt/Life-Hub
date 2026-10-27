package com.lifehub.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

// ───── Авторизация и профиль ─────
@Serializable data class AuthResponse(val token: String)
@Serializable data class AuthConfig(val registration: Boolean = true)
@Serializable data class Health(val app: String = "", val version: String = "")

@Serializable
data class ProfileUser(
    val id: Int = 0,
    val name: String? = null,
    val username: String? = null,
    val role: String? = null,
    @SerialName("is_verified") val isVerified: Int = 0,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    val bio: String? = null,
    val city: String? = null,
    @SerialName("profile_url") val profileUrl: String? = null,
    @SerialName("weather_api_key") val weatherApiKey: String? = null,
)

@Serializable data class XpInfo(val xp: Int = 0, val level: Int = 1)
@Serializable data class Badge(val id: Int = 0, val name: String = "", val icon: String? = null, val rarity: String? = null)
@Serializable
data class ProfileStyle(
    @SerialName("background_url") val backgroundUrl: String? = null,
    @SerialName("background_preset") val backgroundPreset: String = "aurora",
    @SerialName("featured_id") val featuredId: Int? = null,
    val showcases: List<String> = listOf("achievements", "languages", "activity", "goals"),
)

@Serializable
data class ProfileStats(
    val languages: Int = 0,
    val courses: Int = 0,
    @SerialName("courses_done") val coursesDone: Int = 0,
    val words: Int = 0,
    val lessons: Int = 0,
    val goals: Int = 0,
    @SerialName("goals_done") val goalsDone: Int = 0,
    val habits: Int = 0,
    val pages: Int = 0,
    val trips: Int = 0,
    @SerialName("active_days") val activeDays: Int = 0,
)

@Serializable
data class ProfileResponse(
    val user: ProfileUser = ProfileUser(),
    val xp: XpInfo = XpInfo(),
    val badges: List<Badge> = emptyList(),
    val style: ProfileStyle = ProfileStyle(),
    val stats: ProfileStats = ProfileStats(),
)
@Serializable data class ShowcaseIds(val ids: List<Int> = emptyList())

@Serializable data class ActivityDay(val date: String, val count: Int)
@Serializable
data class LevelInfo(
    val level: Int = 1,
    val xp: Int = 0,
    @SerialName("current_floor") val currentFloor: Int = 0,
    @SerialName("next_at") val nextAt: Int = 100,
    @SerialName("xp_today") val xpToday: Int = 0,
)
@Serializable
data class Activity(
    val days: List<ActivityDay> = emptyList(),
    @SerialName("active_days") val activeDays: Int = 0,
    val streak: Int = 0,
    val level: LevelInfo = LevelInfo(),
)

// ───── Ежедневные задания ─────
@Serializable
data class Mission(
    val id: Int,
    val title: String,
    val description: String? = null,
    val points: Int = 0,
    @SerialName("xp_reward") val xpReward: Int = 0,
    @SerialName("progress_value") val progressValue: Double = 0.0,
    @SerialName("target_value") val targetValue: Double = 1.0,
    @SerialName("progress_unit") val progressUnit: String? = null,
    val completed: Boolean = false,
    val claimable: Boolean = false,
    @SerialName("reward_claimed") val rewardClaimed: Boolean = false,
)

@Serializable
data class MissionsSummary(
    val date: String = "",
    @SerialName("target_points") val targetPoints: Int = 500,
    @SerialName("total_points") val totalPoints: Int = 0,
    @SerialName("remaining_points") val remainingPoints: Int = 0,
    @SerialName("completed_count") val completedCount: Int = 0,
    @SerialName("claimed_count") val claimedCount: Int = 0,
    @SerialName("total_count") val totalCount: Int = 0,
    @SerialName("xp_earned") val xpEarned: Int = 0,
    val missions: List<Mission> = emptyList(),
)

@Serializable
data class WeeklyMission(
    val key: String = "",
    val title: String = "",
    val description: String? = null,
    @SerialName("target_value") val targetValue: Double = 1.0,
    @SerialName("progress_value") val progressValue: Double = 0.0,
    val completed: Boolean = false,
    @SerialName("reward_points") val rewardPoints: Int = 0,
    @SerialName("reward_xp") val rewardXp: Int = 0,
)

// ───── Привычки и цели ─────
@Serializable
data class Habit(
    val id: Int,
    val title: String = "",
    @SerialName("target_per_week") val targetPerWeek: Int = 0,
    @SerialName("done_this_week") val doneThisWeek: Int = 0,
    val tags: List<PageTagRef> = emptyList(),
)
@Serializable data class HabitCheck(@SerialName("habit_id") val habitId: Int, val date: String)

@Serializable
data class Goal(
    val id: Int,
    val title: String = "",
    val target: Int = 0,
    val completed: Int = 0,
    val status: String = "active",
    @SerialName("streak_current") val streakCurrent: Int = 0,
    @SerialName("streak_best") val streakBest: Int = 0,
    @SerialName("completion_pct") val completionPct: Int = 0,
    @SerialName("today_done") val todayDone: Boolean = false,
    @SerialName("auto_action") val autoAction: String? = null,
    @SerialName("auto_label") val autoLabel: String? = null,
    @SerialName("auto_min") val autoMin: Int = 1,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("archived_at") val archivedAt: String? = null,
    @SerialName("recent_logs") val recentLogs: List<GoalLog> = emptyList(),
)
@Serializable data class GoalLog(val date: String = "")
@Serializable data class GoalAction(val key: String, val label: String = "", val category: String = "")
@Serializable data class GoalsResponse(val active: List<Goal> = emptyList(), val archived: List<Goal> = emptyList())

// ───── Календарь ─────
@Serializable
data class CalendarEvent(
    val id: JsonElement? = null,
    val date: String = "",
    val title: String = "",
    val type: String = "note",
    val mood: Int? = null,
)

// ───── Языки и курсы ─────
@Serializable
data class LinkedCourse(
    val id: Int,
    val title: String = "",
    val progress: Int = 0,
    @SerialName("learn_course_id") val learnCourseId: Int? = null,
    @SerialName("program_stage") val programStage: Int = 1,
    val locked: Boolean = false,
    @SerialName("lock_reason") val lockReason: String? = null,
)

@Serializable
data class Language(
    val id: Int,
    val name: String = "",
    val level: String? = null,
    val streak: Int = 0,
    @SerialName("streak_best") val streakBest: Int = 0,
    @SerialName("daily_goal_xp") val dailyGoalXp: Int = 50,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("courses_progress_pct") val coursesProgressPct: Int = 0,
    @SerialName("minutes_today") val minutesToday: Int = 0,
    val courses: List<LinkedCourse> = emptyList(),
    val tags: List<PageTagRef> = emptyList(),
)

@Serializable data class LanguageStats(
    val streak: Int = 0,
    @SerialName("daily_goal_xp") val dailyGoalXp: Int = 50,
    @SerialName("xp_today") val xpToday: Int = 0,
    @SerialName("due_count") val dueCount: Int = 0,
    @SerialName("new_count") val newCount: Int = 0,
    @SerialName("mistakes_count") val mistakesCount: Int = 0,
    @SerialName("words_total") val wordsTotal: Int = 0,
    @SerialName("minutes_today") val minutesToday: Int = 0,
    val name: String = "",
)

@Serializable
data class VocabItem(
    val id: Int,
    val term: String = "",
    val translation: String = "",
    val note: String? = null,
    @SerialName("unit_label") val unitLabel: String? = null,
    @SerialName("is_due") val isDue: Boolean = false,
    @SerialName("is_new") val isNew: Boolean = false,
)

@Serializable
data class PracticeExercise(
    @SerialName("vocab_id") val vocabId: Int,
    val term: String = "",
    val type: String = "translate",
    val options: List<String> = emptyList(),
    val answer: String = "",
    val direction: String = "forward",
    val note: String? = null,
    @SerialName("unit_label") val unitLabel: String? = null,
)

@Serializable
data class LearnCourse(
    val id: Int,
    @SerialName("language_id") val languageId: Int? = null,
    val title: String = "",
    val description: String? = null,
    val icon: String? = null,
    val color: String? = null,
    @SerialName("speech_lang") val speechLang: String? = null,
    @SerialName("units_count") val unitsCount: Int = 0,
    @SerialName("lessons_total") val lessonsTotal: Int = 0,
    @SerialName("lessons_done") val lessonsDone: Int = 0,
    @SerialName("xp_total") val xpTotal: Int = 0,
    @SerialName("progress_pct") val progressPct: Int = 0,
    val locked: Boolean = false,
    @SerialName("lock_reason") val lockReason: String? = null,
)

@Serializable
data class LessonNode(
    val id: Int,
    val title: String = "",
    val description: String? = null,
    val xp: Int = 10,
    @SerialName("words_count") val wordsCount: Int = 0,
    val status: String = "locked",
    @SerialName("best_score") val bestScore: Int = 0,
)

@Serializable
data class CourseUnit(
    val id: Int,
    val title: String = "",
    val description: String? = null,
    val color: String? = null,
    val guide: String? = null,
    val lessons: List<LessonNode> = emptyList(),
    @SerialName("done_count") val doneCount: Int = 0,
    val checkpoint: Checkpoint? = null,
)

@Serializable
data class Checkpoint(
    val attempts: Int = 0,
    @SerialName("best_score") val bestScore: Int = 0,
    val passed: Boolean = false,
    @SerialName("pass_score") val passScore: Int = 80,
)

@Serializable data class LessonRef(val id: Int, val title: String = "")

@Serializable
data class CheckpointResult(
    val score: Int = 0,
    val passed: Boolean = false,
    @SerialName("pass_score") val passScore: Int = 80,
    @SerialName("xp_earned") val xpEarned: Int = 0,
    @SerialName("weak_lessons") val weakLessons: List<LessonRef> = emptyList(),
    @SerialName("next_unit") val nextUnit: LessonRef? = null,
    val achievements: List<UnlockedShort> = emptyList(),
)

@Serializable data class CourseTree(val course: LearnCourse, val units: List<CourseUnit> = emptyList())

@Serializable
data class Word(
    val term: String = "",
    val translation: String = "",
    val reading: String? = null,
    val note: String? = null,
    val example: String? = null,
    @SerialName("example_translation") val exampleTranslation: String? = null,
    val emoji: String? = null,
    val audio: String? = null,
    val alternatives: List<String> = emptyList(),
)

@Serializable
data class LessonData(
    val id: Int,
    @SerialName("course_id") val courseId: Int,
    @SerialName("course_title") val courseTitle: String = "",
    val title: String = "",
    val xp: Int = 10,
    @SerialName("speech_lang") val speechLang: String? = null,
    val words: List<Word> = emptyList(),
    val exercises: List<JsonObject> = emptyList(),
    val checkpoint: Boolean = false,
)

@Serializable data class UnlockedShort(val id: Int, val title: String = "", val icon: String = "🏆")

@Serializable
data class LessonResult(
    @SerialName("xp_earned") val xpEarned: Int = 0,
    val perfect: Boolean = false,
    val score: Int = 0,
    val streak: Int? = null,
    val achievements: List<UnlockedShort> = emptyList(),
)

// ───── Ачивки ─────
@Serializable
data class Achievement(
    val id: Int,
    val title: String = "",
    val description: String? = null,
    val icon: String = "🏆",
    val rarity: String = "common",
    val category: String? = null,
    @SerialName("xp_reward") val xpReward: Int = 0,
    val earned: Boolean = false,
    @SerialName("earned_at") val earnedAt: String? = null,
    val progress: Double = 0.0,
    val threshold: Double = 1.0,
    val unit: String? = null,
    val hidden: Boolean = false,
    @SerialName("global_pct") val globalPct: Double = 0.0,
)

@Serializable
data class UnseenAchievement(
    val id: Int,
    val title: String = "",
    val description: String? = null,
    val icon: String = "🏆",
    val rarity: String = "common",
    @SerialName("xp_reward") val xpReward: Int = 0,
)

@Serializable data class Items<T>(val items: List<T> = emptyList())

// ───── Программа языка ─────
@Serializable
data class ProgramCourse(val id: Int, val title: String = "", val progress: Int = 0, @SerialName("learn_course_id") val learnCourseId: Int? = null)

@Serializable
data class ProgramStage(
    val stage: Int = 1,
    val title: String = "",
    @SerialName("unlock_pct") val unlockPct: Int = 100,
    @SerialName("progress_pct") val progressPct: Int = 0,
    val unlocked: Boolean = true,
    val reason: String? = null,
    val courses: List<ProgramCourse> = emptyList(),
)
@Serializable data class Program(val stages: List<ProgramStage> = emptyList())

// ───── Финансы ─────
@Serializable
data class Transaction(
    val id: Int,
    val ts: Long = 0,
    val amount: Double = 0.0,
    val description: String? = null,
    val category: String? = null,
    val mcc: Int? = null,
    @SerialName("account_bank") val accountBank: String? = null,
)

@Serializable
data class BankAccount(
    val id: Int,
    val bank: String = "",
    val transactions: Int = 0,
    @SerialName("first_ts") val firstTs: Long? = null,
    @SerialName("last_ts") val lastTs: Long? = null,
)

@Serializable
data class Loan(
    val id: Int,
    val bank: String = "",
    @SerialName("payment_monthly") val paymentMonthly: Double = 0.0,
    val remaining: Double = 0.0,
    @SerialName("due_day") val dueDay: String = "1",
)

@Serializable data class ImportResult(val imported: Int = 0, val duplicates: Int = 0, val skipped: Int = 0)

// ───── Отчёты ─────
@Serializable
data class ReportSummary(val current: Double = 0.0, val previous: Double = 0.0, val difference: Double = 0.0, val message: String = "")

@Serializable
data class ReportItem(val name: String = "", val current: Double = 0.0, val previous: Double = 0.0, val message: String = "", val unit: String? = null)

@Serializable
data class ReportSection(
    val key: String = "",
    val title: String = "",
    val subtitle: String = "",
    val unit: String = "",
    val summary: ReportSummary = ReportSummary(),
    val items: List<ReportItem> = emptyList(),
    val insights: List<String> = emptyList(),
    val timeline: List<ReportPoint> = emptyList(),
)
@Serializable data class ReportPoint(val label: String = "", val value: Double = 0.0)

@Serializable
data class ReportData(
    @SerialName("report_id") val reportId: Int? = null,
    val period: String = "weekly",
    @SerialName("period_key") val periodKey: String = "",
    @SerialName("period_label") val periodLabel: String = "",
    @SerialName("generated_at") val generatedAt: String = "",
    val highlights: List<String> = emptyList(),
    val sections: Map<String, ReportSection?> = emptyMap(),
)

@Serializable data class ReportPeriodResponse(val report: ReportData? = null, val empty: Boolean = false)

// ───── Страницы и путешествия ─────
@Serializable
data class PageSummary(
    val id: Int,
    val title: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
    @SerialName("page_date") val pageDate: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("banner_gradient") val bannerGradient: String? = null,
    val pinned: Boolean = false,
    val tags: List<PageTagRef> = emptyList(),
)
@Serializable data class PageTagRef(val id: Int = 0, val label: String = "", val color: String? = null)
@Serializable data class PageTag(val id: Int = 0, val label: String = "", val color: String? = null, @SerialName("page_count") val pageCount: Int = 0)

@Serializable data class BlockLayout(val x: Double = 0.0, val y: Double = 0.0, val w: Double = 360.0, val h: Double = 190.0)
@Serializable data class BlockDisplay(val customTitle: String = "", val hideChrome: Boolean = false, val hideHeader: Boolean = false)
@Serializable data class PageTab(val id: String = "", val title: String = "")
@Serializable data class CountdownTimer(val title: String = "", val target: String = "")

@Serializable
data class BlockMeta(
    val html: String? = null,
    val layout: BlockLayout? = null,
    val display: BlockDisplay? = null,
    val tabs: List<PageTab> = emptyList(),
    val activeTabId: String? = null,
    val tabGroupId: String? = null,
    val tabId: String? = null,
    val countdownTimer: CountdownTimer? = null,
    val originalName: String? = null,
    val selectedTagIds: List<Int> = emptyList(),
)

/** Блок страницы: свободный холст (meta.layout в пикселях, как в веб-редакторе). */
@Serializable
data class PageBlock(
    val id: String = "",
    val type: String = "text",
    val text: String? = null,
    val checked: Boolean = false,
    val url: String? = null,
    val meta: BlockMeta? = null,
)

@Serializable
data class PageFull(
    val id: Int,
    val title: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    @SerialName("banner_gradient") val bannerGradient: String? = null,
    @SerialName("page_date") val pageDate: String? = null,
    val blocks: List<PageBlock> = emptyList(),
)
@Serializable data class PageResponse(val page: PageFull)

@Serializable
data class TravelPlan(
    val id: Int,
    val title: String? = null,
    val location: String? = null,
    @SerialName("date_from") val dateFrom: String? = null,
    @SerialName("date_to") val dateTo: String? = null,
    val status: String? = null,
    val notes: String? = null,
)

// ───── Курсы (раздел «Курсы» веб-версии) и лента ─────
@Serializable
data class LifeCourse(
    val id: Int,
    val title: String = "",
    val provider: String? = null,
    @SerialName("course_type") val courseType: String? = null,
    @SerialName("language_id") val languageId: Int? = null,
    val progress: Int = 0,
    val status: String? = null,
    @SerialName("learn_course_id") val learnCourseId: Int? = null,
    @SerialName("program_stage") val programStage: Int = 1,
    val locked: Boolean = false,
    @SerialName("lock_reason") val lockReason: String? = null,
    val tags: List<PageTagRef> = emptyList(),
)
@Serializable data class LifeCourses(val items: List<LifeCourse> = emptyList(), val archived: List<LifeCourse> = emptyList())

@Serializable
data class FeedItem(
    val id: Int = 0,
    val type: String? = null,
    val title: String? = null,
    val text: String? = null,
    val ts: kotlinx.serialization.json.JsonElement? = null,
)
