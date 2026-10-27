package com.lifehub.app

import com.lifehub.app.data.Achievement
import com.lifehub.app.data.Api
import com.lifehub.app.data.BankAccount
import com.lifehub.app.data.CourseTree
import com.lifehub.app.data.GoalAction
import com.lifehub.app.data.Items
import com.lifehub.app.data.LanguageStats
import com.lifehub.app.data.LessonData
import com.lifehub.app.data.Loan
import com.lifehub.app.data.PageSummary
import com.lifehub.app.data.PracticeExercise
import com.lifehub.app.data.ProfileResponse
import com.lifehub.app.data.Program
import com.lifehub.app.data.ReportData
import com.lifehub.app.data.ReportPeriodResponse
import com.lifehub.app.data.Transaction
import com.lifehub.app.data.TravelPlan
import com.lifehub.app.ui.screens.learn.KANA_SETS
import com.lifehub.app.ui.screens.learn.parseExercise
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Новые экраны Android: ответы реального сервера (src/test/resources/api/v2_*.json) читаются моделями. */
class ApiContractV2Test {
    private fun read(name: String) = Api.json.parseToJsonElement(javaClass.getResource("/api/$name.json")!!.readText())
    private inline fun <reified T> decode(name: String): T = Api.json.decodeFromJsonElement<T>(read(name))

    @Serializable data class Session(val exercises: List<PracticeExercise> = emptyList())

    @Test fun achievementsWithGlobalStats() {
        val items = decode<Items<Achievement>>("v2_achievements").items
        assertTrue(items.size > 10)
        assertTrue(items.any { it.earned && it.globalPct > 0 })
        assertTrue(items.any { it.earnedAt != null })
    }

    @Test fun reports() {
        val history = decode<Items<ReportData>>("v2_reports_history").items
        assertTrue(history.isNotEmpty())
        assertTrue(history.first().sections.values.any { it != null && it.summary.current > 0 })
        assertNotNull(decode<ReportPeriodResponse>("v2_report_period").report)
        assertTrue(decode<ReportPeriodResponse>("v2_report_empty").empty)
    }

    @Test fun profileStyleAndStats() {
        val p = decode<ProfileResponse>("v2_profile")
        assertTrue(p.style.showcases.isNotEmpty())
        assertTrue(p.stats.languages >= 1)
    }

    @Test fun pagesTravelFinance() {
        decode<Items<PageSummary>>("v2_pages")
        decode<Items<TravelPlan>>("v2_travel")
        val tx = decode<Items<Transaction>>("v2_transactions").items
        assertTrue(tx.isNotEmpty())
        decode<Items<BankAccount>>("v2_accounts")
        decode<Items<Loan>>("v2_loans")
    }

    @Test fun learning() {
        val program = decode<Program>("v2_program")
        assertTrue(program.stages.isNotEmpty())
        val tree = decode<CourseTree>("v2_course_tree")
        assertNotNull(tree.units.first().checkpoint)
        assertTrue(decode<LanguageStats>("v2_stats").wordsTotal >= 0)
        assertTrue(decode<Session>("v2_practice_session").exercises.all { it.direction in setOf("forward", "reverse") })
        val actions = decode<Items<GoalAction>>("v2_goal_actions").items
        assertTrue(actions.any { it.key == "practice.kana" })
        assertEquals(2, read("v2_kana").jsonObject["xp_earned"]!!.jsonPrimitive.int)
    }

    @Test fun checkpointExercisesParse() {
        val cp = decode<LessonData>("v2_checkpoint")
        assertTrue(cp.checkpoint)
        val parsed = cp.exercises.mapNotNull { parseExercise(it, cp.words) }
        assertTrue(parsed.isNotEmpty())
        assertTrue(cp.exercises.all { "lesson_id" in it })
    }

    @Test fun kanaData() {
        assertEquals(56, KANA_SETS.size)
        assertEquals("a" to "a", KANA_SETS.getValue("hsingle").entries.first().second to "a")
        assertFalse(KANA_SETS.values.any { it.entries.isEmpty() })
    }
}
