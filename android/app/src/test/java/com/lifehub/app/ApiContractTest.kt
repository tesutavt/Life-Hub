package com.lifehub.app

import com.lifehub.app.data.Achievement
import com.lifehub.app.data.Activity
import com.lifehub.app.data.Api
import com.lifehub.app.data.AuthConfig
import com.lifehub.app.data.CalendarEvent
import com.lifehub.app.data.CourseTree
import com.lifehub.app.data.GoalsResponse
import com.lifehub.app.data.Habit
import com.lifehub.app.data.HabitCheck
import com.lifehub.app.data.Health
import com.lifehub.app.data.Items
import com.lifehub.app.data.Language
import com.lifehub.app.data.LanguageStats
import com.lifehub.app.data.LearnCourse
import com.lifehub.app.data.LessonData
import com.lifehub.app.data.LessonResult
import com.lifehub.app.data.MissionsSummary
import com.lifehub.app.data.ProfileResponse
import com.lifehub.app.data.UnseenAchievement
import com.lifehub.app.data.VocabItem
import com.lifehub.app.data.Session
import com.lifehub.app.data.WeeklyMission
import com.lifehub.app.ui.screens.learn.Exercise
import com.lifehub.app.ui.screens.learn.Grade
import com.lifehub.app.ui.screens.learn.gradeText
import com.lifehub.app.ui.screens.learn.parseExercise
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.decodeFromJsonElement
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Ответы реального сервера (снятые в src/test/resources/api) должны читаться моделями приложения. */
class ApiContractTest {
    private fun read(name: String) = Api.json.parseToJsonElement(javaClass.getResource("/api/$name.json")!!.readText())
    private inline fun <reified T> decode(name: String): T = Api.json.decodeFromJsonElement<T>(read(name))

    @Serializable data class Weekly(val missions: List<WeeklyMission> = emptyList())
    @Serializable data class Practice(val exercises: List<com.lifehub.app.data.PracticeExercise> = emptyList())

    @Test fun profile() {
        val p = decode<ProfileResponse>("u1_profile")
        assertEquals("tesuta", p.user.username)
        assertTrue(p.badges.isNotEmpty())
        decode<ProfileResponse>("profile")
    }

    @Test fun activityAndMissions() {
        decode<Activity>("activity"); decode<Activity>("u1_activity")
        val m = decode<MissionsSummary>("missions")
        assertTrue(m.missions.isNotEmpty())
        assertTrue(decode<Weekly>("weekly").missions.isNotEmpty())
    }

    @Test fun habitsGoalsCalendar() {
        assertTrue(decode<Items<Habit>>("u1_habits").items.isNotEmpty())
        assertTrue(decode<Items<HabitCheck>>("u1_checks").items.isNotEmpty())
        decode<GoalsResponse>("u1_goals")
        val events = decode<Items<CalendarEvent>>("u1_calendar").items
        assertTrue(events.isNotEmpty())
    }

    @Test fun languagesAndVocab() {
        val langs = decode<Items<Language>>("u1_languages").items
        assertTrue(langs.isNotEmpty())
        decode<LanguageStats>("u1_stats")
        assertTrue(decode<Items<VocabItem>>("u1_vocab").items.isNotEmpty())
        assertTrue(decode<Practice>("u1_practice").exercises.isNotEmpty())
    }

    @Test fun learnCourseAndLesson() {
        assertTrue(decode<Items<LearnCourse>>("learn_courses").items.isNotEmpty())
        val tree = decode<CourseTree>("course_tree")
        assertTrue(tree.units.first().lessons.isNotEmpty())
        val lesson = decode<LessonData>("lesson")
        val parsed = lesson.exercises.mapNotNull { parseExercise(it, lesson.words) }
        assertEquals("все упражнения урока должны распознаваться", lesson.exercises.size, parsed.size)
        assertTrue(parsed.any { it is Exercise.Match } && parsed.any { it is Exercise.Learn } && parsed.any { it is Exercise.Listen })
        decode<LessonResult>("lesson_result")
    }

    @Test fun achievementsAndMisc() {
        assertTrue(decode<Items<Achievement>>("achievements").items.size > 50)
        decode<Items<UnseenAchievement>>("unseen")
        assertEquals("lifehub", decode<Health>("health").app)
        assertTrue(decode<AuthConfig>("auth_config").registration)
    }

    @Test fun reminders() {
        val pending = decode<com.lifehub.app.notify.PendingReminders>("reminders_pending")
        assertTrue(pending.items.isNotEmpty())
        assertTrue(pending.items.all { it.key.isNotBlank() && it.title.isNotBlank() })
        val settings = decode<com.lifehub.app.ui.screens.ReminderSettings>("reminders_settings")
        assertTrue(settings.categories.containsKey("learning"))
    }

    @Test fun grading() {
        assertEquals(Grade.Exact, gradeText("Здравствуйте!", listOf("здравствуйте")))
        assertEquals(Grade.Exact, gradeText("  ёлка ", listOf("елка")))
        assertEquals(Grade.Typo, gradeText("здраствуйте", listOf("здравствуйте")))
        assertEquals(Grade.Wrong, gradeText("пока", listOf("здравствуйте")))
    }

    @Test fun serverAddress() {
        assertEquals("http://95.105.76.39:4000", Session.normalize(" 95.105.76.39 "))
        assertEquals("http://1.2.3.4:8080", Session.normalize("1.2.3.4:8080/"))
        assertEquals("https://lifehub.example.com", Session.normalize("https://lifehub.example.com/"))
        assertEquals("http://1.2.3.4:80", Session.normalize("http://1.2.3.4:80"))
    }
}
