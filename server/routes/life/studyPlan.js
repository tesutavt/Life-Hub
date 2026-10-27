// Умный план обучения: раскладывает оставшиеся уроки и материалы выбранного языка
// по дням календаря с учётом рабочих смен/выходных, доступного времени и срока.
import express from 'express';
import { getDB } from '../../utils.js';

const router = express.Router();

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const planKey = (languageId) => `study:lang:${languageId}`;

/** Всё, что осталось пройти по языку: уроки курсов-тренировок и непройденные материалы. */
async function collectSources(db, userId, languageId) {
  const sources = [];
  // Этапы программы обучения: сначала ранние этапы, курсы одного этапа — вперемешку
  const stageRows = await db.all(
    'SELECT id, learn_course_id, COALESCE(program_stage,1) AS stage FROM courses WHERE user_id=? AND language_id=? AND archived_at IS NULL',
    [userId, languageId]
  );
  const courseStage = new Map(stageRows.map((row) => [row.id, row.stage]));
  const learnStage = new Map();
  for (const row of stageRows) {
    if (row.learn_course_id) learnStage.set(row.learn_course_id, Math.min(learnStage.get(row.learn_course_id) ?? Infinity, row.stage));
  }
  const learnCourses = await db.all(
    `SELECT DISTINCT c.id, c.title FROM lang_courses c
     WHERE c.user_id=? AND (c.language_id=? OR c.id IN (SELECT learn_course_id FROM courses WHERE user_id=? AND language_id=? AND learn_course_id IS NOT NULL))
     ORDER BY c.id`,
    [userId, languageId, userId, languageId]
  );
  for (const course of learnCourses) {
    const lessons = await db.all(
      `SELECT l.id, l.title FROM lang_lessons l JOIN lang_units u ON u.id=l.unit_id
       LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
       WHERE l.course_id=? AND COALESCE(p.completed_count,0)=0 ORDER BY u.position, l.position, l.id`,
      [userId, course.id]
    );
    if (lessons.length) {
      sources.push({ key: `learn:${course.id}`, kind: 'lesson', title: course.title, stage: learnStage.get(course.id) ?? 1, items: lessons.map((l) => ({ title: l.title })) });
    }
  }

  const courses = await db.all(
    'SELECT id, title FROM courses WHERE user_id=? AND language_id=? AND archived_at IS NULL AND COALESCE(progress,0) < 100 ORDER BY title',
    [userId, languageId]
  );
  for (const course of courses) {
    const pages = await db.all(
      `SELECT jp.title FROM course_pages cp JOIN journal_pages jp ON jp.id=cp.page_id
       WHERE cp.user_id=? AND cp.course_id=? AND COALESCE(cp.done,0)=0 ORDER BY cp.created_at, cp.id`,
      [userId, course.id]
    );
    const pdfs = await db.all(
      'SELECT title FROM course_pdf_pages WHERE user_id=? AND course_id=? AND COALESCE(done,0)=0 ORDER BY page_number, id',
      [userId, course.id]
    );
    const items = [...pages, ...pdfs].map((row) => ({ title: row.title || 'Материал' }));
    if (items.length) sources.push({ key: `course:${course.id}`, kind: 'material', title: course.title, stage: courseStage.get(course.id) ?? 1, items });
  }

  const langPages = await db.all(
    `SELECT jp.title FROM language_pages lp JOIN journal_pages jp ON jp.id=lp.page_id
     WHERE lp.user_id=? AND lp.language_id=? AND COALESCE(lp.done,0)=0 ORDER BY lp.created_at, lp.id`,
    [userId, languageId]
  );
  const langPdfs = await db.all(
    'SELECT title FROM language_pdf_pages WHERE user_id=? AND language_id=? AND COALESCE(done,0)=0 ORDER BY page_number, id',
    [userId, languageId]
  );
  const langItems = [...langPages, ...langPdfs].map((row) => ({ title: row.title || 'Материал' }));
  if (langItems.length) sources.push({ key: `language:${languageId}`, kind: 'material', title: 'Материалы языка', stage: 1, items: langItems });

  return sources.sort((a, b) => a.stage - b.stage);
}

function normalizeInput(body = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(body.start_date) || today;
  const deadline = parseDate(body.deadline);
  const workWeekdays = Array.isArray(body.work_weekdays) ? body.work_weekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5];
  const restWeekdays = Array.isArray(body.rest_weekdays) ? body.rest_weekdays.map(Number).filter((d) => d >= 0 && d <= 6) : [];
  return {
    languageId: Number(body.language_id),
    start: start < today ? today : start,
    deadline,
    lessonMinutes: clampInt(body.lesson_minutes, 3, 120, 10),
    materialMinutes: clampInt(body.material_minutes, 5, 240, 30),
    workdayMinutes: clampInt(body.workday_minutes, 0, 600, 20),
    dayoffMinutes: clampInt(body.dayoff_minutes, 0, 900, 60),
    workTime: /^\d{2}:\d{2}$/.test(body.work_time || '') ? body.work_time : '20:00',
    offTime: /^\d{2}:\d{2}$/.test(body.off_time || '') ? body.off_time : '11:00',
    workWeekdays,
    restWeekdays,
    excluded: new Set(Array.isArray(body.excluded_sources) ? body.excluded_sources.map(String) : []),
  };
}

async function buildPlan(db, userId, body) {
  const input = normalizeInput(body);
  const language = await db.get('SELECT id, name FROM languages WHERE id=? AND user_id=?', [input.languageId, userId]);
  if (!language) throw Object.assign(new Error('Выберите язык'), { status: 400 });
  if (!input.deadline) throw Object.assign(new Error('Укажите срок, к которому хотите пройти материал'), { status: 400 });
  if (input.deadline < input.start) throw Object.assign(new Error('Срок не может быть раньше даты начала'), { status: 400 });

  const sources = await collectSources(db, userId, language.id);
  const tasks = [];
  // Внутри этапа чередуем курсы по одному занятию — так параллельные курсы идут вместе
  const stages = Array.from(new Set(sources.map((s) => s.stage))).sort((a, b) => a - b);
  for (const stage of stages) {
    const queues = sources
      .filter((source) => source.stage === stage && !input.excluded.has(source.key))
      .map((source) => ({ source, items: [...source.items] }));
    while (queues.some((q) => q.items.length)) {
      for (const queue of queues) {
        const item = queue.items.shift();
        if (!item) continue;
        const minutes = queue.source.kind === 'lesson' ? input.lessonMinutes : input.materialMinutes;
        tasks.push({ title: item.title, source: queue.source.title, kind: queue.source.kind, minutes });
      }
    }
  }

  // Рабочие смены и выходные из календаря имеют приоритет над днями недели
  const shifts = new Map(
    (await db.all("SELECT date, type FROM calendar_events WHERE user_id=? AND type IN ('work','off') AND date BETWEEN ? AND ?", [userId, iso(input.start), iso(input.deadline)]))
      .map((row) => [row.date, row.type])
  );
  const days = [];
  for (const d = new Date(input.start); d <= input.deadline; d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    const weekday = d.getDay();
    if (input.restWeekdays.includes(weekday)) continue;
    const kind = shifts.get(date) || (input.workWeekdays.includes(weekday) ? 'work' : 'off');
    const budget = kind === 'work' ? input.workdayMinutes : input.dayoffMinutes;
    if (budget > 0) days.push({ date, kind, budget, time: kind === 'work' ? input.workTime : input.offTime, minutes: 0, items: [] });
  }

  const required = tasks.reduce((sum, t) => sum + t.minutes, 0);
  const capacity = days.reduce((sum, d) => sum + d.budget, 0);
  // Равномерный темп до срока: задача ставится не раньше дня, соответствующего её доле
  // в общем объёме. Если времени не хватает — просто заполняем дни по доступному бюджету.
  const paced = required <= capacity;
  let dayIndex = 0;
  let done = 0;
  for (const task of tasks) {
    if (paced && required > 0) dayIndex = Math.max(dayIndex, Math.floor((done / required) * days.length));
    while (dayIndex < days.length) {
      const day = days[dayIndex];
      // Пустой день берёт хотя бы одну задачу, даже если она длиннее бюджета
      if (day.minutes === 0 || day.minutes + task.minutes <= day.budget) break;
      dayIndex += 1;
    }
    if (dayIndex >= days.length) break;
    days[dayIndex].items.push(task);
    days[dayIndex].minutes += task.minutes;
    done += task.minutes;
  }

  const planned = days.filter((d) => d.items.length);
  const scheduledCount = planned.reduce((sum, d) => sum + d.items.length, 0);
  const totalDays = Math.max(1, days.length);
  return {
    language,
    sources: sources.map((s) => ({ key: s.key, kind: s.kind, title: s.title, stage: s.stage, count: s.items.length, excluded: input.excluded.has(s.key) })),
    days: planned.map(({ date, kind, time, minutes, items }) => ({ date, kind, time, minutes, items })),
    summary: {
      tasks: tasks.length,
      scheduled: scheduledCount,
      unscheduled: tasks.length - scheduledCount,
      required_minutes: required,
      capacity_minutes: capacity,
      fits: required <= capacity,
      finish_date: planned.length ? planned[planned.length - 1].date : null,
      // Сколько минут в день нужно в среднем, чтобы успеть
      recommended_daily_minutes: Math.ceil(required / totalDays),
    },
  };
}

const eventTitle = (language, day) => {
  const lessons = day.items.filter((i) => i.kind === 'lesson').length;
  const materials = day.items.length - lessons;
  const parts = [];
  if (lessons) parts.push(`${lessons} ${lessons === 1 ? 'урок' : lessons < 5 ? 'урока' : 'уроков'}`);
  if (materials) parts.push(`${materials} матер.`);
  const first = day.items[0]?.title || '';
  return `${language.name} · ${day.time} · ${day.minutes} мин: ${parts.join(' + ')} — ${first}`.slice(0, 240);
};

router.post('/preview', async (req, res) => {
  try {
    res.json(await buildPlan(await getDB(), req.user.uid, req.body));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/apply', async (req, res) => {
  const db = await getDB();
  let plan;
  try {
    plan = await buildPlan(db, req.user.uid, req.body);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
  const key = planKey(plan.language.id);
  // Пересоздаём только будущую часть прошлого плана по этому языку
  const removed = await db.run('DELETE FROM calendar_events WHERE user_id=? AND plan_key=? AND date >= ?', [req.user.uid, key, iso(new Date())]);
  for (const day of plan.days) {
    await db.run('INSERT INTO calendar_events(user_id,date,title,type,mood,plan_key) VALUES(?,?,?,?,NULL,?)', [
      req.user.uid,
      day.date,
      eventTitle(plan.language, day),
      'study',
      key,
    ]);
  }
  res.json({ created: plan.days.length, removed: removed.changes || 0, summary: plan.summary });
});

router.delete('/:languageId', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM calendar_events WHERE user_id=? AND plan_key=? AND date >= ?', [req.user.uid, planKey(req.params.languageId), iso(new Date())]);
  res.json({ removed: result.changes || 0 });
});

export default router;
