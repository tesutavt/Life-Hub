// Напоминания для Android и десктопа (Windows-уведомления).
// Клиент раз в 15 минут спрашивает /pending, передавая СВОИ локальные дату и час (сервер на VDS
// может жить в другом часовом поясе), и показывает пришедшее системным уведомлением.
// У каждого напоминания стабильный key — клиент показывает его один раз.
import express from 'express';
import { getDB } from '../../utils.js';
import { pickMessage } from '../../reminders/messages.js';
import { ensureDailyMissionDefaults, loadDailyMissionSummary } from '../life/index.js';

const router = express.Router();

export const REMINDER_CATEGORIES = ['learning', 'habits', 'calendar', 'missions', 'goals'];

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: true,
  categories: { learning: true, habits: true, calendar: true, missions: true, goals: true },
  learning_hour: 19,
  habits_hour: 20,
  quiet_start: 23,
  quiet_end: 8,
};

const clampHour = (value, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : fallback;
};

function normalizeSettings(raw) {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = {};
    }
  }
  source = source && typeof source === 'object' ? source : {};
  const categories = { ...DEFAULT_REMINDER_SETTINGS.categories };
  for (const key of REMINDER_CATEGORIES) {
    if (typeof source.categories?.[key] === 'boolean') categories[key] = source.categories[key];
  }
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : true,
    categories,
    learning_hour: clampHour(source.learning_hour, DEFAULT_REMINDER_SETTINGS.learning_hour),
    habits_hour: clampHour(source.habits_hour, DEFAULT_REMINDER_SETTINGS.habits_hour),
    quiet_start: clampHour(source.quiet_start, DEFAULT_REMINDER_SETTINGS.quiet_start),
    quiet_end: clampHour(source.quiet_end, DEFAULT_REMINDER_SETTINGS.quiet_end),
  };
}

async function loadSettings(db, userId) {
  const row = await db.get('SELECT reminder_settings FROM users WHERE id=?', [userId]);
  return normalizeSettings(row?.reminder_settings);
}

const inQuietHours = (hour, start, end) => (start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end);

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

router.get('/settings', async (req, res) => {
  res.json(await loadSettings(await getDB(), req.user.uid));
});

router.put('/settings', async (req, res) => {
  const db = await getDB();
  const current = await loadSettings(db, req.user.uid);
  const next = normalizeSettings({ ...current, ...req.body, categories: { ...current.categories, ...(req.body?.categories || {}) } });
  await db.run('UPDATE users SET reminder_settings=? WHERE id=?', [JSON.stringify(next), req.user.uid]);
  res.json(next);
});

router.get('/pending', async (req, res) => {
  const db = await getDB();
  const userId = req.user.uid;
  const settings = await loadSettings(db, userId);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const hour = clampHour(req.query.hour, new Date().getHours());
  const force = req.query.force === '1'; // «Проверить напоминания» из настроек: без учёта часов

  if (!settings.enabled || (!force && inQuietHours(hour, settings.quiet_start, settings.quiet_end))) {
    return res.json({ items: [], settings });
  }

  const user = await db.get('SELECT name FROM users WHERE id=?', [userId]);
  const name = user?.name || 'друг';
  const items = [];
  const push = (key, category, kind, values, route) => {
    const message = pickMessage(kind, `${date}|${key}`, { name, ...values });
    items.push({ key: `${key}:${date}`, category, title: message.title, body: message.body, route });
  };
  const yesterday = shiftDate(date, -1);
  const tomorrow = shiftDate(date, 1);

  // ── Учёба: урок или тренировка сегодня; ближе к ночи — серия в опасности
  if (settings.categories.learning && (force || hour >= settings.learning_hour)) {
    const languages = await db.all("SELECT id, name, streak, last_practice_date FROM languages WHERE user_id=? AND COALESCE(status,'active') <> 'archived'", [userId]);
    const course = await db.get(
      `SELECT c.id, c.title FROM lang_courses c WHERE c.user_id=? AND EXISTS (
         SELECT 1 FROM lang_lessons l LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=c.user_id
         WHERE l.course_id=c.id AND COALESCE(p.completed_count,0)=0) ORDER BY c.id LIMIT 1`,
      [userId]
    );
    if (languages.length || course) {
      const studied = await db.get(
        "SELECT 1 FROM user_action_log WHERE user_id=? AND date IN (?, ?) AND action IN ('learn.lesson_complete','practice.complete') LIMIT 1",
        [userId, date, new Date().toISOString().slice(0, 10)]
      );
      const practicedToday = languages.some((l) => l.last_practice_date === date);
      if (!studied && !practicedToday) {
        const language = languages[0]?.name?.replace(/^[^\p{L}]+/u, '').trim() || 'языка';
        const route = course ? `course/${course.id}` : 'learn';
        const streak = Math.max(0, ...languages.filter((l) => l.last_practice_date === yesterday).map((l) => l.streak || 0));
        if (streak > 0 && (force || hour >= 21)) push('streak', 'learning', 'streak', { streak }, route);
        else push('learning', 'learning', course ? 'learning_course' : 'learning', { language, course: course?.title }, route);
      }
    }
  }

  // ── Привычки: что не отмечено сегодня
  if (settings.categories.habits && (force || hour >= settings.habits_hour)) {
    const habits = await db.all('SELECT id, title FROM habits WHERE user_id=?', [userId]);
    if (habits.length) {
      const checked = new Set((await db.all('SELECT habit_id FROM habit_checks WHERE user_id=? AND date=?', [userId, date])).map((r) => r.habit_id));
      const left = habits.filter((h) => !checked.has(h.id));
      if (left.length) push('habits', 'habits', 'habits', { habit: left[0].title, count: left.length }, 'habits');
    }
  }

  // ── Календарь: утром — что сегодня, вечером — что завтра
  if (settings.categories.calendar) {
    const describe = (rows) => rows.slice(0, 3).map((r) => r.title).join(', ') + (rows.length > 3 ? ` и ещё ${rows.length - 3}` : '');
    if (force || hour >= 8) {
      const today = await db.all("SELECT title, type FROM calendar_events WHERE user_id=? AND date=? AND type NOT IN ('mood','off')", [userId, date]);
      if (today.length) push('calendar-today', 'calendar', 'calendar_today', { event: describe(today) }, 'calendar');
    }
    if (force || hour >= 20) {
      const next = await db.all("SELECT title, type FROM calendar_events WHERE user_id=? AND date=? AND type NOT IN ('mood','off')", [userId, tomorrow]);
      if (next.length) push('calendar-tomorrow', 'calendar', 'calendar_tomorrow', { event: describe(next) }, 'calendar');
    }
  }

  // ── Задания: награды можно забрать; вечером — сколько осталось до цели дня
  if (settings.categories.missions) {
    try {
      await ensureDailyMissionDefaults(db, userId);
      const summary = await loadDailyMissionSummary(db, userId, date);
      const claimable = (summary.missions || []).filter((m) => m.claimable).length;
      if (claimable > 0) push('missions-claim', 'missions', 'missions_claim', { count: claimable }, 'missions');
      else if ((force || hour >= 18) && summary.remaining_points > 0 && summary.total_points > 0) {
        push('missions-left', 'missions', 'missions_left', { points: summary.remaining_points }, 'missions');
      }
    } catch {
      // задания недоступны — пропускаем
    }
  }

  // ── Годовые цели: нет отметки за сегодня
  if (settings.categories.goals && (force || hour >= 20)) {
    const goal = await db.get(
      `SELECT g.title FROM yearly_goals g WHERE g.user_id=? AND COALESCE(g.status,'active')='active'
       AND NOT EXISTS (SELECT 1 FROM yearly_goal_logs l WHERE l.goal_id=g.id AND l.user_id=g.user_id AND l.date=?) LIMIT 1`,
      [userId, date]
    );
    if (goal) push('goals', 'goals', 'goals', { goal: goal.title }, 'goals');
  }

  res.json({ items, settings });
});

export default router;
