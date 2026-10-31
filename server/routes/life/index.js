import express from 'express';
import { generateUniqueUsername, getDB, levelFromXp, normalizeUsername } from '../../utils.js';
import { TAG_ENTITY_TYPES, fetchTagLinks, sortTags, syncTagLinks } from '../../tagUtils.js';
import { upload, removeLocalUpload } from './storage.js';
import { createUploadsRouter } from './uploads.js';
import shelfRouter from './shelf.js';
import wishlistRouter from './wishlist.js';
import linksRouter, { dropEntityLinks } from './links.js';
import languageLearningRouter from './languageLearning.js';
import studyPlanRouter from './studyPlan.js';
import { applyGoalAutoChecks, listForUser, trackAction } from '../../achievements/engine.js';
import { ACTIONS_BY_KEY } from '../../achievements/catalog.js';
import { loadCourseLocks, loadProgram, saveProgram } from './program.js';
import { reportHasActivity } from '../../jobs/cleanup.js';

const router = express.Router();

const DEFAULT_NOTIFICATION_PREFS = {
  disabled_types: [],
  mute_sound: false,
  text_enabled: true,
};

const parseJsonSafe = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === undefined || parsed === null ? fallback : parsed;
  } catch {
    return fallback;
  }
};

const normalizeHiddenMenuItems = (value) => {
  const source = Array.isArray(value) ? value : parseJsonSafe(value, []);
  if (!Array.isArray(source)) return [];
  return source.filter((entry) => typeof entry === 'string');
};

const normalizeNotificationPreferences = (value) => {
  const sourceRaw = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : parseJsonSafe(value, {});
  const source = sourceRaw && typeof sourceRaw === 'object' ? sourceRaw : {};
  const disabledRaw = source.disabled_types ?? source.disabledTypes ?? [];
  const muteRaw = source.mute_sound ?? source.muteSound;
  const textRaw = source.text_enabled ?? source.textEnabled;
  const disabled = Array.isArray(disabledRaw)
    ? disabledRaw.filter((entry) => typeof entry === 'string')
    : [];
  return {
    disabled_types: Array.from(new Set(disabled)),
    mute_sound: typeof muteRaw === 'boolean' ? muteRaw : DEFAULT_NOTIFICATION_PREFS.mute_sound,
    text_enabled: typeof textRaw === 'boolean' ? textRaw : DEFAULT_NOTIFICATION_PREFS.text_enabled,
  };
};

router.use('/uploads', createUploadsRouter());
router.use('/shelf', shelfRouter);
router.use('/wishlist', wishlistRouter);
router.use('/links', linksRouter);

const todayISO = () => new Date().toISOString().slice(0, 10);

const pad = (n) => n.toString().padStart(2, '0');
const toISODate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const sanitizeOptionalText = (value, limit = 2048) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, limit);
};

const sanitizeRequiredText = (value, fallback = 'Без названия', limit = 255) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, limit);
};

const normalizePdfUrl = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2048);
};

const awardXp = async (db, userId, amount, feed = null) => {
  const safeAmount = Math.max(0, Math.round(Number(amount) || 0));
  const xpRow = (await db.get('SELECT xp FROM user_xp WHERE user_id=?', [userId])) || { xp: 0 };
  const newXp = (xpRow.xp || 0) + safeAmount;
  const level = levelFromXp(newXp);
  await db.run(
    'INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?',
    [userId, newXp, level, newXp, level]
  );
  if (feed) {
    await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)', [
      userId,
      feed.type,
      feed.title,
      feed.text || '',
      JSON.stringify(feed.meta || {}),
      feed.ts || new Date().toISOString(),
    ]);
  }
  return { xp: newXp, level };
};

const DAILY_MISSION_TARGET_POINTS = 500;
const DEFAULT_MISSION_POINTS = 100;
const DEFAULT_MISSION_XP = 50;

const DAILY_MISSION_DEFINITIONS = [
  {
    key: 'steps_5000',
    title: 'Сделайте 5000 шагов',
    description: 'Прогуляйтесь или займитесь любимой активностью, чтобы пройти не менее пяти тысяч шагов за день.',
    points: 140,
    xp_reward: 80,
    sort_order: 0,
    target_value: 5000,
    progress_unit: 'шагов',
    progress_source: 'steps',
  },
  {
    key: 'move_minutes_30',
    title: 'Двигайтесь 30 минут',
    description: 'Наберите минимум полчаса движения: прогулка, тренировка или активная зарядка — всё засчитывается.',
    points: 120,
    xp_reward: 70,
    sort_order: 1,
    target_value: 30,
    progress_unit: 'минут',
    progress_source: 'move_minutes',
  },
  {
    key: 'burn_300_calories',
    title: 'Сожгите 300 активных калорий',
    description: 'Достигните дневной цели по активным калориям, чтобы почувствовать прилив энергии.',
    points: 150,
    xp_reward: 80,
    sort_order: 2,
    target_value: 300,
    progress_unit: 'ккал',
    progress_source: 'active_calories',
  },
  {
    key: 'habit_checks_two',
    title: 'Отметьте две привычки',
    description: 'Закрепите полезные ритуалы: отметьте минимум две привычки в трекере за сегодня.',
    points: 130,
    xp_reward: 70,
    sort_order: 3,
    target_value: 2,
    progress_unit: 'привычек',
    progress_source: 'habit_checks',
  },
  {
    key: 'goal_update',
    title: 'Обновите цель',
    description: 'Добавьте прогресс к одной из годовых целей и не упускайте фокус.',
    points: 160,
    xp_reward: 90,
    sort_order: 4,
    target_value: 1,
    progress_unit: 'обновлений',
    progress_source: 'goal_updates',
  },
  {
    key: 'calendar_entry',
    title: 'Запланируйте событие',
    description: 'Добавьте встречу, тренировку или заметку в календарь на сегодня.',
    points: 110,
    xp_reward: 60,
    sort_order: 5,
    target_value: 1,
    progress_unit: 'событий',
    progress_source: 'calendar_events',
  },
  {
    key: 'journal_entry',
    title: 'Запишите мысль',
    description: 'Сделайте запись в дневник, чтобы сохранить эмоции и идеи.',
    points: 140,
    xp_reward: 80,
    sort_order: 6,
    target_value: 1,
    progress_unit: 'записей',
    progress_source: 'journal_entries',
  },
  {
    key: 'language_practice',
    title: 'Практикуйтесь в языке',
    description: 'Отметьте хотя бы одну страницу или упражнение в языковом модуле.',
    points: 150,
    xp_reward: 90,
    sort_order: 7,
    target_value: 1,
    progress_unit: 'упражнений',
    progress_source: 'language_progress',
  },
  {
    key: 'course_progress',
    title: 'Продвиньтесь в обучении',
    description: 'Закройте одну страницу курса или урок, чтобы двигаться к новым знаниям.',
    points: 170,
    xp_reward: 100,
    sort_order: 8,
    target_value: 1,
    progress_unit: 'страниц',
    progress_source: 'course_progress',
  },
  {
    key: 'sleep_well',
    title: 'Выспитесь не менее 7 часов',
    description: 'Наберите 420 минут сна, чтобы восстановить силы.',
    points: 180,
    xp_reward: 110,
    sort_order: 9,
    target_value: 420,
    progress_unit: 'минут',
    progress_source: 'sleep_minutes',
  },
];

const clampMissionNumber = (value, { fallback = 0, min = 0, max = 100000 } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.round(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

const sanitizeMissionPoints = (value, fallback = DEFAULT_MISSION_POINTS) =>
  clampMissionNumber(value, { fallback, min: 0, max: 500 });

const sanitizeMissionXp = (value, fallback = DEFAULT_MISSION_XP) =>
  clampMissionNumber(value, { fallback, min: 0, max: 500 });

const sanitizeMissionSortOrder = (value, fallback = 0) =>
  clampMissionNumber(value, { fallback, min: -1000, max: 1000 });

const sanitizeDateParam = (value, fallback = todayISO()) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return fallback;
  const test = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(test.getTime())) return fallback;
  return trimmed;
};

const toNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const parseBooleanParam = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return fallback;
    if (['1', 'true', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['0', 'false', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return fallback;
};

const mapDailyMissionRow = (row) => ({
  id: row.id,
  title: row.title || 'Без названия',
  description: row.description || null,
  points: sanitizeMissionPoints(row.points, DEFAULT_MISSION_POINTS),
  xp_reward: sanitizeMissionXp(
    row.xp_reward,
    row.xp_reward == null
      ? Math.max(DEFAULT_MISSION_XP, Math.round(sanitizeMissionPoints(row.points, DEFAULT_MISSION_POINTS) / 2))
      : DEFAULT_MISSION_XP
  ),
  sort_order: sanitizeMissionSortOrder(row.sort_order, 0),
  is_active: !!row.is_active,
  definition_key: row.definition_key || null,
  created_at: row.created_at || null,
  updated_at: row.updated_at || null,
});

const ensureDailyMissionSchema = async (db) => {
  try {
    await db.run('ALTER TABLE daily_missions ADD COLUMN definition_key TEXT');
  } catch (error) {
    const message = String(error?.message || error).toLowerCase();
    if (!message.includes('duplicate column')) {
      // ignore if the column already exists, rethrow otherwise
      throw error;
    }
  }
  try {
    await db.run(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_missions_user_definition ON daily_missions(user_id, definition_key)'
    );
  } catch {
    // ignore
  }
};

export const ensureDailyMissionDefaults = async (db, userId) => {
  await ensureDailyMissionSchema(db);
  const existing = await db.all(
    'SELECT id, definition_key, title FROM daily_missions WHERE user_id=? ORDER BY id ASC',
    [userId]
  );

  const byKey = new Map();
  existing.forEach((row) => {
    if (row.definition_key) {
      byKey.set(row.definition_key, row);
    }
  });

  for (let index = 0; index < DAILY_MISSION_DEFINITIONS.length; index += 1) {
    const definition = DAILY_MISSION_DEFINITIONS[index];
    let row = byKey.get(definition.key);

    if (!row) {
      row = existing.find((entry) => !entry.definition_key && entry.title === definition.title) || null;
      if (row) {
        await db.run('UPDATE daily_missions SET definition_key=? WHERE id=?', [definition.key, row.id]);
        row.definition_key = definition.key;
        byKey.set(definition.key, row);
      }
    }

    if (!row) {
      const result = await db.run(
        'INSERT INTO daily_missions(user_id,title,description,points,xp_reward,sort_order,is_active,definition_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [
          userId,
          definition.title,
          definition.description,
          definition.points,
          definition.xp_reward,
          definition.sort_order ?? index,
          1,
          definition.key,
        ]
      );
      row = { id: result.lastID, definition_key: definition.key };
      byKey.set(definition.key, row);
    } else {
      await db.run(
        'UPDATE daily_missions SET title=?, description=?, points=?, xp_reward=?, sort_order=?, is_active=1, definition_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
        [
          definition.title,
          definition.description,
          definition.points,
          definition.xp_reward,
          definition.sort_order ?? index,
          definition.key,
          row.id,
        ]
      );
    }
  }

  if (DAILY_MISSION_DEFINITIONS.length > 0) {
    const placeholders = DAILY_MISSION_DEFINITIONS.map(() => '?').join(',');
    const params = [userId, ...DAILY_MISSION_DEFINITIONS.map((item) => item.key)];
    await db.run(
      `DELETE FROM daily_missions WHERE user_id=? AND (definition_key IS NULL OR definition_key NOT IN (${placeholders}))`,
      params
    );
  } else {
    await db.run('DELETE FROM daily_missions WHERE user_id=?', [userId]);
  }
};

const collectDailyMissionStats = async (db, userId, date) => {
  const [
    activity,
    daily,
    sleep,
    habitChecks,
    goalUpdates,
    calendarEvents,
    journalEntries,
    languagePages,
    languagePdfPages,
    coursePages,
    coursePdfPages,
    languagePracticeExercises,
  ] = await Promise.all([
    db.get('SELECT steps, calories, move_minutes, active_minutes FROM fitness_activity WHERE user_id=? AND date=?', [
      userId,
      date,
    ]),
    db.get('SELECT active_calories FROM fitness_daily WHERE user_id=? AND date=?', [userId, date]),
    db.get('SELECT duration_minutes FROM fitness_sleep WHERE user_id=? AND date=?', [userId, date]),
    db.get('SELECT COUNT(*) AS count FROM habit_checks WHERE user_id=? AND date=?', [userId, date]),
    db.get('SELECT COUNT(*) AS count FROM yearly_goal_logs WHERE user_id=? AND date=?', [userId, date]),
    db.get('SELECT COUNT(*) AS count FROM calendar_events WHERE user_id=? AND date=?', [userId, date]),
    db.get('SELECT COUNT(*) AS count FROM journal_pages WHERE user_id=? AND page_date=?', [userId, date]),
    db.get(
      'SELECT COUNT(*) AS count FROM language_pages WHERE user_id=? AND done=1 AND COALESCE(substr(done_at,1,10),"")=?',
      [userId, date]
    ),
    db.get(
      'SELECT COUNT(*) AS count FROM language_pdf_pages WHERE user_id=? AND done=1 AND COALESCE(substr(done_at,1,10),"")=?',
      [userId, date]
    ),
    db.get(
      'SELECT COUNT(*) AS count FROM course_pages WHERE user_id=? AND done=1 AND COALESCE(substr(done_at,1,10),"")=?',
      [userId, date]
    ),
    db.get(
      'SELECT COUNT(*) AS count FROM course_pdf_pages WHERE user_id=? AND done=1 AND COALESCE(substr(done_at,1,10),"")=?',
      [userId, date]
    ),
    db.get(
      'SELECT COALESCE(SUM(exercises_done),0) AS count FROM language_practice_sessions WHERE user_id=? AND date=?',
      [userId, date]
    ),
  ]);

  return {
    activity: activity || null,
    daily: daily || null,
    sleep: sleep || null,
    habitChecks: toNumber(habitChecks?.count, 0),
    goalUpdates: toNumber(goalUpdates?.count, 0),
    calendarEvents: toNumber(calendarEvents?.count, 0),
    journalEntries: toNumber(journalEntries?.count, 0),
    languagePages: toNumber(languagePages?.count, 0),
    languagePdfPages: toNumber(languagePdfPages?.count, 0),
    coursePages: toNumber(coursePages?.count, 0),
    coursePdfPages: toNumber(coursePdfPages?.count, 0),
    languagePracticeExercises: toNumber(languagePracticeExercises?.count, 0),
  };
};

const getDailyMissionDefinitionForRow = (mission) => {
  if (!mission) return null;
  if (mission.definition_key) {
    const matched = DAILY_MISSION_DEFINITIONS.find((entry) => entry.key === mission.definition_key);
    if (matched) return matched;
  }
  return DAILY_MISSION_DEFINITIONS.find((entry) => entry.sort_order === mission.sort_order) || null;
};

const computeDailyMissionProgress = (definition, stats) => {
  if (!definition) return 0;
  switch (definition.progress_source) {
    case 'steps':
      return Math.max(0, toNumber(stats.activity?.steps, 0));
    case 'move_minutes':
      return Math.max(0, toNumber(stats.activity?.move_minutes ?? stats.activity?.active_minutes, 0));
    case 'active_calories':
      return Math.max(
        0,
        toNumber(stats.daily?.active_calories, 0) || toNumber(stats.activity?.calories, 0)
      );
    case 'habit_checks':
      return Math.max(0, stats.habitChecks || 0);
    case 'goal_updates':
      return Math.max(0, stats.goalUpdates || 0);
    case 'calendar_events':
      return Math.max(0, stats.calendarEvents || 0);
    case 'journal_entries':
      return Math.max(0, stats.journalEntries || 0);
    case 'language_progress':
      return Math.max(0, (stats.languagePages || 0) + (stats.languagePdfPages || 0) + (stats.languagePracticeExercises || 0));
    case 'course_progress':
      return Math.max(0, (stats.coursePages || 0) + (stats.coursePdfPages || 0));
    case 'sleep_minutes':
      return Math.max(0, Math.round(toNumber(stats.sleep?.duration_minutes, 0)));
    default:
      return 0;
  }
};

export const loadDailyMissionSummary = async (db, userId, date, { includeInactive = false } = {}) => {
  const rows = await db.all(
    `SELECT id, user_id, title, description, points, xp_reward, sort_order, is_active, definition_key, created_at, updated_at
     FROM daily_missions
     WHERE user_id=?${includeInactive ? '' : ' AND is_active=1'}
     ORDER BY sort_order ASC, id ASC`,
    [userId]
  );

  const completions = await db.all(
    'SELECT mission_id, points_awarded, xp_awarded, completed_at FROM daily_mission_completions WHERE user_id=? AND date=?',
    [userId, date]
  );

  const completionMap = new Map();
  completions.forEach((entry) => {
    completionMap.set(entry.mission_id, entry);
  });

  const stats = await collectDailyMissionStats(db, userId, date);

  const missions = rows.map((row) => {
    const base = mapDailyMissionRow(row);
    const definition = getDailyMissionDefinitionForRow(base);
    const targetValue = Math.max(1, toNumber(definition?.target_value, 1));
    const rawProgress = computeDailyMissionProgress(definition, stats);
    const clampedProgress = targetValue > 0 ? Math.min(rawProgress, targetValue) : rawProgress;
    const progressPct = targetValue > 0 ? Math.min(100, Math.round((clampedProgress * 100) / targetValue)) : 0;
    const completion = completionMap.get(row.id);
    const rewardClaimed = !!completion;
    const completed = rawProgress >= targetValue;
    return {
      ...base,
      title: definition?.title ?? base.title,
      description: definition?.description ?? base.description,
      points: sanitizeMissionPoints(definition?.points ?? base.points, base.points),
      xp_reward: sanitizeMissionXp(definition?.xp_reward ?? base.xp_reward, base.xp_reward),
      target_value: targetValue,
      progress_value: rawProgress,
      progress_pct: progressPct,
      progress_unit: definition?.progress_unit || null,
      completed,
      completed_at: completed ? completion?.completed_at || null : null,
      reward_claimed: rewardClaimed,
      reward_claimed_at: completion?.completed_at || null,
      claimable: completed && !rewardClaimed,
    };
  });

  const totalPoints = completions.reduce((sum, entry) => sum + sanitizeMissionPoints(entry.points_awarded, 0), 0);
  const xpEarned = completions.reduce((sum, entry) => sum + sanitizeMissionXp(entry.xp_awarded, 0), 0);
  const target = DAILY_MISSION_TARGET_POINTS;
  const progressPct = target > 0 ? Math.min(100, Math.round((totalPoints * 100) / target)) : 0;
  const remaining = Math.max(0, target - totalPoints);
  const completedCount = missions.filter((mission) => mission.completed).length;

  return {
    date,
    target_points: target,
    total_points: totalPoints,
    remaining_points: remaining,
    progress_pct: progressPct,
    completed_count: completedCount,
    claimed_count: completions.length,
    total_count: rows.length,
    xp_earned: xpEarned,
    missions,
  };
};

const fetchDailyMission = (db, userId, missionId) =>
  db.get(
    'SELECT id, user_id, title, description, points, xp_reward, sort_order, is_active, definition_key, created_at, updated_at FROM daily_missions WHERE id=? AND user_id=?',
    [missionId, userId]
  );

router.get('/daily-missions', async (req, res) => {
  const db = await getDB();
  const userId = req.user.uid;
  await ensureDailyMissionDefaults(db, userId);
  const date = sanitizeDateParam(typeof req.query?.date === 'string' ? req.query.date : '', todayISO());
  const includeInactiveRaw =
    typeof req.query?.include_inactive !== 'undefined' ? req.query.include_inactive : req.query?.all;
  const includeInactive = parseBooleanParam(includeInactiveRaw ?? false, false);
  const payload = await loadDailyMissionSummary(db, userId, date, { includeInactive });
  res.json(payload);
});

const respondMissionReadOnly = (res) => res.status(405).json({ error: 'mission management is disabled' });

router.post('/daily-missions', (req, res) => respondMissionReadOnly(res));
router.put('/daily-missions/:id', (req, res) => respondMissionReadOnly(res));
router.delete('/daily-missions/:id', (req, res) => respondMissionReadOnly(res));

router.post('/daily-missions/:id/complete', async (req, res) => {
  const missionId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(missionId)) {
    return res.status(400).json({ error: 'invalid mission id' });
  }
  const db = await getDB();
  await ensureDailyMissionDefaults(db, req.user.uid);
  const mission = await fetchDailyMission(db, req.user.uid, missionId);
  if (!mission) {
    return res.status(404).json({ error: 'mission not found' });
  }
  if (!mission.is_active) {
    return res.status(400).json({ error: 'mission is inactive' });
  }

  const date = sanitizeDateParam(req.body?.date, todayISO());
  const baseMission = mapDailyMissionRow(mission);
  const definition = getDailyMissionDefinitionForRow(baseMission);
  const targetValue = Math.max(1, toNumber(definition?.target_value, 1));
  const stats = await collectDailyMissionStats(db, req.user.uid, date);
  const progressValue = computeDailyMissionProgress(definition, stats);

  if (progressValue < targetValue) {
    return res.status(400).json({
      error: 'mission requirements not met',
      progress_value: progressValue,
      target_value: targetValue,
    });
  }

  const completion = await db.get(
    'SELECT id, points_awarded, xp_awarded FROM daily_mission_completions WHERE user_id=? AND mission_id=? AND date=?',
    [req.user.uid, missionId, date]
  );

  if (completion) {
    const summary = await loadDailyMissionSummary(db, req.user.uid, date);
    const mapped = summary.missions.find((item) => item.id === missionId) || {
      ...baseMission,
      completed: true,
      reward_claimed: true,
    };
    return res.json({ mission: mapped, summary, already_completed: true });
  }

  const points = sanitizeMissionPoints(definition?.points ?? mission.points, DEFAULT_MISSION_POINTS);
  const xpFallback =
    definition?.xp_reward == null && mission.xp_reward == null
      ? Math.max(DEFAULT_MISSION_XP, Math.round(points / 2))
      : definition?.xp_reward ?? mission.xp_reward ?? DEFAULT_MISSION_XP;
  const xpReward = sanitizeMissionXp(definition?.xp_reward ?? mission.xp_reward, xpFallback);
  const ts = new Date().toISOString();

  await db.run(
    'INSERT INTO daily_mission_completions(user_id, mission_id, date, points_awarded, xp_awarded, completed_at) VALUES(?,?,?,?,?,?)',
    [req.user.uid, missionId, date, points, xpReward, ts]
  );

  const { xp: newXp, level } = await awardXp(db, req.user.uid, xpReward, {
    type: 'daily_mission_completed',
    title: 'Ежедневное задание выполнено',
    text: mission.title || '',
    meta: { mission_id: missionId, date, points, xp: xpReward },
    ts,
  });

  const summary = await loadDailyMissionSummary(db, req.user.uid, date);
  const mapped =
    summary.missions.find((item) => item.id === missionId) ||
    {
      ...baseMission,
      completed: true,
      reward_claimed: true,
      reward_claimed_at: ts,
    };
  res.json({ mission: mapped, summary, xp: { value: newXp, level } });
});

router.delete('/daily-missions/:id/complete', (req, res) =>
  res.status(405).json({ error: 'mission rewards cannot be revoked' })
);

const WEEKLY_MISSION_DEFINITIONS = [
  {
    key: 'active_days_4',
    title: 'Будьте активны 4 дня',
    description: 'Выполните хотя бы одно ежедневное задание минимум в 4 разных днях недели.',
    target_value: 4,
    progress_unit: 'days',
    reward_points: 200,
    reward_xp: 120,
    progress_source: 'active_days',
  },
  {
    key: 'perfect_days_2',
    title: 'Соберите 2 идеальных дня',
    description: 'Наберите полную дневную цель очков минимум 2 раза за неделю.',
    target_value: 2,
    progress_unit: 'days',
    reward_points: 260,
    reward_xp: 150,
    progress_source: 'perfect_days',
  },
  {
    key: 'weekly_points_2000',
    title: 'Наберите 2000 очков активности',
    description: 'Собирайте очки за ежедневные задания — суммарно 2000 очков за неделю.',
    target_value: 2000,
    progress_unit: 'points',
    reward_points: 240,
    reward_xp: 140,
    progress_source: 'total_points',
  },
  {
    key: 'missions_completed_15',
    title: 'Выполните 15 ежедневных заданий',
    description: 'Забирайте награды за ежедневные задания — суммарно 15 штук за неделю.',
    target_value: 15,
    progress_unit: 'missions',
    reward_points: 220,
    reward_xp: 130,
    progress_source: 'missions_completed',
  },
  {
    key: 'language_days_3',
    title: 'Занимайтесь языком 3 дня',
    description: 'Выполните задание «Практикуйтесь в языке» минимум в 3 разных днях недели.',
    target_value: 3,
    progress_unit: 'days',
    reward_points: 220,
    reward_xp: 130,
    progress_source: 'language_days',
  },
];

const getWeekStart = (date = new Date()) => {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear?.() ?? date.getFullYear(), date.getUTCMonth?.() ?? date.getMonth(), date.getUTCDate?.() ?? date.getDate()));
  const day = utcDate.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diffToMonday);
  return utcDate.toISOString().slice(0, 10);
};

const getWeekEnd = (weekStart) => {
  const start = new Date(`${weekStart}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
};

const sanitizeWeekStartParam = (value, fallback = getWeekStart()) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return fallback;
  return getWeekStart(new Date(`${trimmed}T00:00:00Z`));
};

const collectWeeklyMissionStats = async (db, userId, weekStart, weekEnd) => {
  const rows = await db.all(
    `SELECT c.date, c.points_awarded, dm.definition_key
     FROM daily_mission_completions c
     JOIN daily_missions dm ON dm.id = c.mission_id
     WHERE c.user_id=? AND c.date BETWEEN ? AND ?`,
    [userId, weekStart, weekEnd]
  );
  const pointsByDate = new Map();
  const languageDateSet = new Set();
  let totalPoints = 0;
  rows.forEach((row) => {
    const points = toNumber(row.points_awarded, 0);
    pointsByDate.set(row.date, (pointsByDate.get(row.date) || 0) + points);
    totalPoints += points;
    if (row.definition_key === 'language_practice') languageDateSet.add(row.date);
  });
  const perfectDays = Array.from(pointsByDate.values()).filter((sum) => sum >= DAILY_MISSION_TARGET_POINTS).length;
  return {
    activeDays: pointsByDate.size,
    perfectDays,
    totalPoints,
    missionsCompleted: rows.length,
    languageDays: languageDateSet.size,
    lastCompletedAt: rows.length ? rows[rows.length - 1].date : null,
  };
};

const computeWeeklyMissionProgress = (definition, stats) => {
  if (!definition) return 0;
  switch (definition.progress_source) {
    case 'active_days':
      return Math.max(0, stats.activeDays || 0);
    case 'perfect_days':
      return Math.max(0, stats.perfectDays || 0);
    case 'total_points':
      return Math.max(0, stats.totalPoints || 0);
    case 'missions_completed':
      return Math.max(0, stats.missionsCompleted || 0);
    case 'language_days':
      return Math.max(0, stats.languageDays || 0);
    default:
      return 0;
  }
};

const loadWeeklyMissionSummary = async (db, userId, weekStart) => {
  const weekEnd = getWeekEnd(weekStart);
  const stats = await collectWeeklyMissionStats(db, userId, weekStart, weekEnd);
  const completions = await db.all(
    'SELECT definition_key, points_awarded, xp_awarded, completed_at FROM weekly_mission_completions WHERE user_id=? AND week_start=?',
    [userId, weekStart]
  );
  const completionMap = new Map();
  completions.forEach((entry) => completionMap.set(entry.definition_key, entry));

  const nowTs = new Date().toISOString();
  const missions = [];
  for (const definition of WEEKLY_MISSION_DEFINITIONS) {
    const targetValue = Math.max(1, toNumber(definition.target_value, 1));
    const rawProgress = computeWeeklyMissionProgress(definition, stats);
    const clampedProgress = Math.min(rawProgress, targetValue);
    const progressPct = Math.min(100, Math.round((clampedProgress * 100) / targetValue));
    const completed = rawProgress >= targetValue;
    let completion = completionMap.get(definition.key) || null;

    if (completed && !completion) {
      // Weekly missions auto-award as soon as the underlying weekly stats reach the target.
      await db.run(
        'INSERT INTO weekly_mission_completions(user_id, definition_key, week_start, points_awarded, xp_awarded, completed_at) VALUES(?,?,?,?,?,?)',
        [userId, definition.key, weekStart, definition.reward_points, definition.reward_xp, nowTs]
      );
      await awardXp(db, userId, definition.reward_xp, {
        type: 'weekly_mission_completed',
        title: 'Еженедельное задание выполнено',
        text: definition.title,
        meta: { definition_key: definition.key, week_start: weekStart, points: definition.reward_points, xp: definition.reward_xp },
        ts: nowTs,
      });
      completion = { definition_key: definition.key, points_awarded: definition.reward_points, xp_awarded: definition.reward_xp, completed_at: nowTs };
      trackAction(userId, 'mission.weekly_complete');
    }

    missions.push({
      key: definition.key,
      title: definition.title,
      description: definition.description,
      target_value: targetValue,
      progress_value: rawProgress,
      progress_pct: progressPct,
      progress_unit: definition.progress_unit,
      reward_points: definition.reward_points,
      reward_xp: definition.reward_xp,
      completed,
      completed_at: completion?.completed_at || null,
    });
  }

  const rewardPointsEarned = missions.reduce((sum, m) => sum + (m.completed_at ? m.reward_points : 0), 0);
  const rewardXpEarned = missions.reduce((sum, m) => sum + (m.completed_at ? m.reward_xp : 0), 0);

  return {
    week_start: weekStart,
    week_end: weekEnd,
    updated_at: nowTs,
    total_points: stats.totalPoints,
    total_completions: stats.missionsCompleted,
    perfect_days: stats.perfectDays,
    active_days: stats.activeDays,
    reward_points_earned: rewardPointsEarned,
    reward_xp_earned: rewardXpEarned,
    completed_count: missions.filter((m) => m.completed).length,
    total_count: missions.length,
    daily_target_points: DAILY_MISSION_TARGET_POINTS,
    missions,
  };
};

router.get('/weekly-missions', async (req, res) => {
  const db = await getDB();
  const userId = req.user.uid;
  const weekStart = sanitizeWeekStartParam(typeof req.query?.week_start === 'string' ? req.query.week_start : '');
  const payload = await loadWeeklyMissionSummary(db, userId, weekStart);
  res.json(payload);
});

export async function recomputeGoal(db, userId, goalId) {
  const goal = await db.get('SELECT * FROM yearly_goals WHERE id=? AND user_id=?', [goalId, userId]);
  if (!goal) return null;

  const logs = await db.all('SELECT date FROM yearly_goal_logs WHERE user_id=? AND goal_id=? ORDER BY date ASC', [userId, goalId]);
  const completed = logs.length;

  let currentStreak = 0;
  let bestStreak = 0;
  let previousDate = null;
  for (const entry of logs) {
    const currentDate = new Date(entry.date + 'T00:00:00Z');
    if (!previousDate) {
      currentStreak = 1;
    } else {
      const diffDays = Math.round((currentDate - previousDate) / 86400000);
      if (diffDays === 0) {
        // duplicate entry for same day, ignore for streaks
      } else if (diffDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }
    bestStreak = Math.max(bestStreak, currentStreak);
    previousDate = currentDate;
  }

  const target = goal.target || 0;
  const wasArchived = goal.status === 'archived';
  let status = goal.status || 'active';
  let archivedAt = goal.archived_at || null;
  let justArchived = false;

  if (target > 0 && completed >= target) {
    if (status !== 'archived') {
      status = 'archived';
      archivedAt = new Date().toISOString();
      justArchived = true;
    }
  } else if (status === 'archived') {
    status = 'active';
    archivedAt = null;
  }

  await db.run(
    'UPDATE yearly_goals SET completed=?, streak_current=?, streak_best=?, status=?, archived_at=? WHERE id=? AND user_id=?',
    [completed, currentStreak, bestStreak, status, archivedAt, goalId, userId]
  );

  if (justArchived) {
    await awardXp(db, userId, 100, {
      type: 'goal_completed',
      title: 'Годовая цель выполнена',
      text: goal.title || '',
      meta: { goal_id: goalId, completed },
    });
  }

  return await db.get('SELECT * FROM yearly_goals WHERE id=? AND user_id=?', [goalId, userId]);
}

const LANGUAGE_PAGE_SELECT = `
SELECT lp.id, lp.language_id, lp.page_id, lp.done, lp.done_at, lp.created_at,
       COALESCE(jp.title, 'Untitled page') AS page_title
FROM language_pages lp
LEFT JOIN journal_pages jp ON jp.id = lp.page_id
WHERE lp.user_id=?`;

const languagePageQuery = (tail = '') => `${LANGUAGE_PAGE_SELECT}${tail}`;

const mapLanguagePage = (row) => ({
  id: row.id,
  language_id: row.language_id,
  page_id: row.page_id,
  done: !!row.done,
  done_at: row.done_at,
  page_title: row.page_title || 'Untitled page'
});

const COURSE_PAGE_SELECT = `
SELECT cp.id, cp.course_id, cp.page_id, cp.done, cp.done_at, cp.created_at,
       COALESCE(jp.title, 'Untitled page') AS page_title
FROM course_pages cp
LEFT JOIN journal_pages jp ON jp.id = cp.page_id
WHERE cp.user_id=?`;

const coursePageQuery = (tail = '') => `${COURSE_PAGE_SELECT}${tail}`;

const mapCoursePage = (row) => ({
  id: row.id,
  course_id: row.course_id,
  page_id: row.page_id,
  done: !!row.done,
  done_at: row.done_at,
  page_title: row.page_title || 'Untitled page'
});

const mapLanguagePdfPage = (row) => ({
  id: row.id,
  language_id: row.language_id,
  title: row.title,
  pdf_url: row.pdf_url,
  page_number: row.page_number,
  done: !!row.done,
  done_at: row.done_at,
  original_name: row.original_name || null
});

const mapCoursePdfPage = (row) => ({
  id: row.id,
  course_id: row.course_id,
  title: row.title,
  pdf_url: row.pdf_url,
  page_number: row.page_number,
  done: !!row.done,
  done_at: row.done_at,
  original_name: row.original_name || null
});

const mapCourseRow = (row, tags = [], lock = null) => ({
  id: row.id,
  title: row.title,
  provider: row.provider,
  course_type: row.course_type,
  language_id: row.language_id,
  progress: row.progress ?? 0,
  status: row.status || 'in-progress',
  archived_at: row.archived_at,
  learn_course_id: row.learn_course_id ?? null,
  program_stage: lock?.stage ?? 1,
  locked: !!lock?.locked,
  lock_reason: lock?.reason || null,
  tags
});

const resolveLearnCourse = async (db, userId, value) => {
  const id = Number(value);
  if (!value || !Number.isInteger(id) || id <= 0) return null;
  return db.get('SELECT id, language_id FROM lang_courses WHERE id=? AND user_id=?', [id, userId]);
};

const normalizeCourseProgress = (value) => {
  if (!Number.isFinite(Number(value))) return 0;
  const rounded = Math.round(Number(value));
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
};

async function logCourseProgress(db, userId, courseId, progress) {
  const normalized = normalizeCourseProgress(progress);
  const last = await db.get(
    'SELECT progress FROM course_progress_logs WHERE user_id=? AND course_id=? ORDER BY logged_at DESC LIMIT 1',
    [userId, courseId]
  );
  if (last && normalizeCourseProgress(last.progress) === normalized) {
    return;
  }
  await db.run(
    'INSERT INTO course_progress_logs(user_id, course_id, progress, logged_at) VALUES(?,?,?,?)',
    [userId, courseId, normalized, new Date().toISOString()]
  );
}

export async function recomputeCourseProgress(db, userId, courseId) {
  const course = await db.get('SELECT id, progress, status, learn_course_id FROM courses WHERE id=? AND user_id=?', [courseId, userId]);
  if (!course) return null;

  const pageStats = await db.get(
    'SELECT COUNT(*) AS total, SUM(done) AS completed FROM course_pages WHERE user_id=? AND course_id=?',
    [userId, courseId]
  );
  const pdfStats = await db.get(
    'SELECT COUNT(*) AS total, SUM(done) AS completed FROM course_pdf_pages WHERE user_id=? AND course_id=?',
    [userId, courseId]
  );

  // Уроки привязанного курса-тренировки считаются наравне с материалами.
  const lessonStats = course.learn_course_id
    ? await db.get(
        `SELECT COUNT(l.id) AS total, SUM(CASE WHEN p.completed_count>0 THEN 1 ELSE 0 END) AS completed
         FROM lang_lessons l JOIN lang_courses c ON c.id=l.course_id AND c.user_id=?
         LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=c.user_id
         WHERE l.course_id=?`,
        [userId, course.learn_course_id]
      )
    : null;

  const total = Number(pageStats?.total || 0) + Number(pdfStats?.total || 0) + Number(lessonStats?.total || 0);
  const completed = Number(pageStats?.completed || 0) + Number(pdfStats?.completed || 0) + Number(lessonStats?.completed || 0);
  const normalized = normalizeCourseProgress(total > 0 ? Math.round((completed * 100) / total) : 0);
  const currentProgress = normalizeCourseProgress(course.progress);
  const desiredStatus = normalized >= 100 ? 'done' : 'in-progress';
  const currentStatus = course.status || 'in-progress';

  const updates = [];
  const values = [];
  let progressChanged = false;

  if (normalized !== currentProgress) {
    updates.push('progress=?');
    values.push(normalized);
    progressChanged = true;
  }

  if (desiredStatus !== currentStatus) {
    updates.push('status=?');
    values.push(desiredStatus);
  }

  if (updates.length) {
    await db.run(`UPDATE courses SET ${updates.join(', ')} WHERE id=? AND user_id=?`, [...values, courseId, userId]);
  }

  if (progressChanged) {
    await logCourseProgress(db, userId, courseId, normalized);
  }

  return { total, completed, progress: normalized, status: desiredStatus };
}

function attachGoalMeta(goal, logs) {
  const completionPct = goal.target > 0 ? Math.min(100, Math.round((goal.completed || 0) * 100 / goal.target)) : 0;
  const recent = logs.slice(0, 10);
  const todayDone = logs.some(log => log === toISODate(new Date()));
  return {
    id: goal.id,
    title: goal.title,
    target: goal.target,
    completed: goal.completed,
    status: goal.status,
    streak_current: goal.streak_current,
    streak_best: goal.streak_best,
    archived_at: goal.archived_at,
    created_at: goal.created_at,
    completion_pct: completionPct,
    today_done: todayDone,
    auto_action: goal.auto_action || null,
    auto_label: goal.auto_action ? ACTIONS_BY_KEY.get(goal.auto_action)?.label || goal.auto_action : null,
    auto_min: goal.auto_min || 1,
    recent_logs: recent.map(date => ({ date }))
  };
}

const MAX_SEARCH_RESULTS = 20;

const fetchPageTagsMap = async (db, userId, pageIds) => {
  if (!Array.isArray(pageIds) || pageIds.length === 0) return new Map();
  const placeholders = pageIds.map(() => '?').join(',');
  const rows = await db.all(
    'SELECT pt.page_id, t.id, t.label, t.color FROM page_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.user_id=? AND pt.page_id IN (' +
      placeholders +
      ') ORDER BY t.label COLLATE NOCASE',
    [userId, ...pageIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.page_id)) map.set(row.page_id, []);
    map.get(row.page_id).push({ id: row.id, label: row.label, color: row.color });
  }
  for (const [key, list] of map) {
    map.set(key, sortTags(list));
  }
  return map;
};

const extractPageSnippet = (blocksJson) => {
  if (!blocksJson) return '';
  try {
    const blocks = JSON.parse(blocksJson);
    const firstText = blocks.find((block) => typeof block?.text === 'string' && block.text.trim());
    if (!firstText) return '';
    const normalized = firstText.text.replace(/\s+/g, ' ').trim();
    return normalized.slice(0, 160);
  } catch {
    return '';
  }
};

const parseBlocksJson = (blocksJson) => {
  if (!blocksJson) return [];
  try {
    const parsed = JSON.parse(blocksJson);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.blocks)) {
      return parsed.blocks;
    }
  } catch {
    return [];
  }
  return [];
};

const collectPdfBookmarksFromPage = (pageRow, queryLower) => {
  const output = [];
  const rawBlocks = parseBlocksJson(pageRow.blocks_json);
  if (!Array.isArray(rawBlocks)) return output;

  const pageTitle = sanitizeRequiredText(pageRow.title, 'Без названия', 255);
  const pageTitleLower = pageTitle.toLowerCase();

  rawBlocks.forEach((block, blockIndex) => {
    if (!block || block.type !== 'pdf') return;
    const pdfUrl = normalizePdfUrl(block.url || block.src || null);
    if (!pdfUrl) return;

    const pdfTitle = sanitizeRequiredText(block.text, 'PDF документ', 255);
    const pdfTitleLower = pdfTitle.toLowerCase();
    const originalName = sanitizeOptionalText(block?.meta?.originalName ?? block?.meta?.original_name ?? null, 255);
    const originalLower = (originalName || '').toLowerCase();
    const markers = Array.isArray(block?.meta?.markers) ? block.meta.markers : [];

    markers.forEach((marker, markerIndex) => {
      if (!marker) return;
      const markerTitle = sanitizeRequiredText(marker.title, 'Фрагмент', 255);
      const markerLower = markerTitle.toLowerCase();
      if (
        queryLower &&
        !(
          markerLower.includes(queryLower) ||
          pdfTitleLower.includes(queryLower) ||
          pageTitleLower.includes(queryLower) ||
          (originalLower && originalLower.includes(queryLower))
        )
      ) {
        return;
      }

      let pageNumber = null;
      if (marker.page !== undefined && marker.page !== null) {
        const parsed = Number.parseInt(marker.page, 10);
        if (!Number.isNaN(parsed) && parsed > 0) pageNumber = parsed;
      }

      const markerId = typeof marker.id === 'string' && marker.id.trim() ? marker.id.trim() : `marker-${blockIndex}-${markerIndex}`;
      const blockId = typeof block.id === 'string' && block.id.trim() ? block.id.trim() : `pdf-${blockIndex}`;

      output.push({
        id: `${pageRow.id}:${blockId}:${markerId}`,
        marker_title: markerTitle,
        page_number: pageNumber,
        pdf_url: pdfUrl,
        pdf_title: pdfTitle,
        original_name: originalName,
        page_id: pageRow.id,
        page_title: pageTitle,
        marker_done: !!marker.done,
      });
    });
  });

  return output;
};

router.get('/search', async (req, res) => {
  const db = await getDB();
  const rawQuery = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const query = rawQuery.toLowerCase();
  // Шаблон GLOB без учёта регистра для любого алфавита: «курс» → *[Кк][Уу][Рр][Сс]*
  // (LOWER/LIKE в SQLite понимают регистр только латиницы).
  const searchGlob = '*' + Array.from(rawQuery).map((ch) => {
    const lower = ch.toLowerCase();
    const upper = ch.toUpperCase();
    if ('*?[]'.includes(ch)) return `[${ch}]`;
    return lower === upper ? ch : `[${lower}${upper}]`;
  }).join('') + '*';
  const tagParam = req.query?.tag_id ?? req.query?.tagId;
  const parsedTagId = Number(tagParam);
  const tagId = Number.isInteger(parsedTagId) && parsedTagId > 0 ? parsedTagId : null;
  const limitParam = Number(req.query?.limit);
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 25) : MAX_SEARCH_RESULTS;

  const tagRows = await db.all(
    'SELECT id, label, color FROM tags WHERE user_id=? ORDER BY label COLLATE NOCASE',
    [req.user.uid]
  );
  const tags = sortTags(tagRows.map((row) => ({ id: row.id, label: row.label, color: row.color })));
  const selectedTag = tagId ? tags.find((tag) => tag.id === tagId) || null : null;
  const hasTextQuery = query.length > 0;
  const includeTagFilter = !!selectedTag;
  const showPageResults = hasTextQuery || includeTagFilter;

  let pages = [];
  let pageRows = [];
  if (showPageResults) {
    let pageSql = 'SELECT jp.id, jp.title, jp.blocks_json, jp.updated_at, jp.created_at, jp.banner_url, jp.banner_gradient, jp.pinned FROM journal_pages jp WHERE jp.user_id=?';
    const pageParams = [req.user.uid];
    if (hasTextQuery) {
      const like = searchGlob;
      pageSql += ' AND (jp.title GLOB ? OR COALESCE(jp.blocks_json, "") GLOB ?)';
      pageParams.push(like, like);
    }
    if (selectedTag) {
      pageSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=jp.id AND tl.user_id=? AND tl.tag_id=?)';
      pageParams.push(TAG_ENTITY_TYPES.PAGE, req.user.uid, selectedTag.id);
    }
    pageSql += ' ORDER BY jp.pinned DESC, jp.updated_at DESC LIMIT ?';
    pageParams.push(limit);
    pageRows = await db.all(pageSql, pageParams);
    const pageIds = pageRows.map((row) => row.id);
    const pageTagMap = await fetchPageTagsMap(db, req.user.uid, pageIds);
    pages = pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      snippet: extractPageSnippet(row.blocks_json),
      updated_at: row.updated_at,
      created_at: row.created_at,
      banner_url: row.banner_url || null,
      banner_gradient: row.banner_gradient || null,
      pinned: !!row.pinned,
      tags: pageTagMap.get(row.id) || []
    }));
  }

  let pdfBookmarks = [];
  if (hasTextQuery) {
    const bookmarkMap = new Map();
    for (const row of pageRows) {
      bookmarkMap.set(row.id, row);
    }
    const extraRows = await db.all(
      'SELECT jp.id, jp.title, jp.blocks_json FROM journal_pages jp WHERE jp.user_id=? AND COALESCE(jp.blocks_json, "") GLOB ? ORDER BY jp.updated_at DESC LIMIT ?',
      [req.user.uid, searchGlob, limit * 3]
    );
    for (const row of extraRows) {
      if (!bookmarkMap.has(row.id)) bookmarkMap.set(row.id, row);
    }

    const dedupe = new Set();
    for (const row of bookmarkMap.values()) {
      const matches = collectPdfBookmarksFromPage(row, query);
      for (const match of matches) {
        const key = `${match.pdf_url}|${match.page_number ?? 'none'}|${match.marker_title.toLowerCase()}|${match.page_id}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);
        pdfBookmarks.push(match);
        if (pdfBookmarks.length >= limit) break;
      }
      if (pdfBookmarks.length >= limit) break;
    }
  }

  const shouldSearchOther = hasTextQuery || includeTagFilter;

  let languages = [];
  if (shouldSearchOther) {
    const searchMinutes = await minutesTodayByLanguage(db, req.user.uid);
    let languageSql = 'SELECT id, name, level, minutes_today, image_url, banner_url FROM languages WHERE user_id=?';
    const languageParams = [req.user.uid];
    if (hasTextQuery) {
      languageSql += ' AND name GLOB ?';
      languageParams.push(searchGlob);
    }
    if (selectedTag) {
      languageSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=languages.id AND tl.user_id=? AND tl.tag_id=?)';
      languageParams.push(TAG_ENTITY_TYPES.LANGUAGE, req.user.uid, selectedTag.id);
    }
    languageSql += ' ORDER BY minutes_today DESC, name COLLATE NOCASE ASC LIMIT ?';
    languageParams.push(limit);
    const languageRows = await db.all(languageSql, languageParams);
    const languageIds = languageRows.map((row) => row.id);
    const languageTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, languageIds);
    languages = languageRows.map((row) => ({
      id: row.id,
      name: row.name,
      level: row.level,
      minutes_today: searchMinutes.get(row.id) || 0,
      image_url: row.image_url || null,
      banner_url: row.banner_url || null,
      tags: languageTagMap.get(row.id) || []
    }));
  }

  let courses = [];
  if (shouldSearchOther) {
    let courseSql = 'SELECT id, title, provider, progress, status, course_type FROM courses WHERE user_id=?';
    const courseParams = [req.user.uid];
    if (hasTextQuery) {
      const like = searchGlob;
      courseSql += ' AND (title GLOB ? OR COALESCE(provider, "") GLOB ?)';
      courseParams.push(like, like);
    }
    if (selectedTag) {
      courseSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=courses.id AND tl.user_id=? AND tl.tag_id=?)';
      courseParams.push(TAG_ENTITY_TYPES.COURSE, req.user.uid, selectedTag.id);
    }
    courseSql += ' ORDER BY id DESC LIMIT ?';
    courseParams.push(limit);
    const courseRows = await db.all(courseSql, courseParams);
    const courseIds = courseRows.map((row) => row.id);
    const courseTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, courseIds);
    courses = courseRows.map((row) => ({
      id: row.id,
      title: row.title,
      provider: row.provider,
      progress: row.progress,
      status: row.status,
      course_type: row.course_type,
      tags: courseTagMap.get(row.id) || []
    }));
  }

  let travel = [];
  if (shouldSearchOther) {
    let travelSql = 'SELECT id, title, location, date_from, date_to, status FROM travel_plans WHERE user_id=?';
    const travelParams = [req.user.uid];
    if (hasTextQuery) {
      const like = searchGlob;
      travelSql += ' AND (title GLOB ? OR COALESCE(location, "") GLOB ?)';
      travelParams.push(like, like);
    }
    if (selectedTag) {
      travelSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=travel_plans.id AND tl.user_id=? AND tl.tag_id=?)';
      travelParams.push(TAG_ENTITY_TYPES.TRAVEL, req.user.uid, selectedTag.id);
    }
    travelSql += ' ORDER BY COALESCE(date_from, date_to) DESC, id DESC LIMIT ?';
    travelParams.push(limit);
    const travelRows = await db.all(travelSql, travelParams);
    const travelIds = travelRows.map((row) => row.id);
    const travelTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, travelIds);
    travel = travelRows.map((row) => ({
      id: row.id,
      title: row.title,
      location: row.location,
      date_from: row.date_from,
      date_to: row.date_to,
      status: row.status,
      tags: travelTagMap.get(row.id) || []
    }));
  }

  // Полка и вишлист — тем же способом: по тексту и/или по тегу
  const searchSimple = async (table, entityType, textCols, cols, order) => {
    let sql = `SELECT ${cols} FROM ${table} WHERE user_id=?`;
    const params = [req.user.uid];
    if (hasTextQuery) {
      sql += ' AND (' + textCols.map((c) => `COALESCE(${c}, "") GLOB ?`).join(' OR ') + ')';
      textCols.forEach(() => params.push(searchGlob));
    }
    if (selectedTag) {
      sql += ` AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=${table}.id AND tl.user_id=? AND tl.tag_id=?)`;
      params.push(entityType, req.user.uid, selectedTag.id);
    }
    sql += ` ORDER BY ${order} LIMIT ?`;
    params.push(limit);
    const rows = await db.all(sql, params).catch(() => []);
    const tagMap = await fetchTagLinks(db, req.user.uid, entityType, rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) || [] }));
  };
  const shelf = shouldSearchOther
    ? await searchSimple('shelf_items', TAG_ENTITY_TYPES.SHELF, ['title', 'author', 'notes'], 'id, kind, title, author, year, cover_url, status, rating', 'updated_at DESC')
    : [];
  const wishlist = shouldSearchOther
    ? await searchSimple('wishlist_items', TAG_ENTITY_TYPES.WISH, ['title', 'category', 'note'], 'id, title, image_url, price, saved, currency, status, category', 'status, priority DESC')
    : [];

  let loans = [];
  if (shouldSearchOther) {
    let loanSql = 'SELECT id, bank, payment_monthly, remaining, due_day FROM loans WHERE user_id=?';
    const loanParams = [req.user.uid];
    if (hasTextQuery) {
      loanSql += ' AND bank GLOB ?';
      loanParams.push(searchGlob);
    }
    if (selectedTag) {
      loanSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=loans.id AND tl.user_id=? AND tl.tag_id=?)';
      loanParams.push(TAG_ENTITY_TYPES.LOAN, req.user.uid, selectedTag.id);
    }
    loanSql += ' ORDER BY id DESC LIMIT ?';
    loanParams.push(limit);
    const loanRows = await db.all(loanSql, loanParams);
    const loanIds = loanRows.map((row) => row.id);
    const loanTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, loanIds);
    loans = loanRows.map((row) => ({
      id: row.id,
      bank: row.bank,
      payment_monthly: row.payment_monthly,
      remaining: row.remaining,
      due_day: row.due_day,
      tags: loanTagMap.get(row.id) || []
    }));
  }

  let habits = [];
  if (shouldSearchOther) {
    let habitSql = 'SELECT id, title, target_per_week, done_this_week FROM habits WHERE user_id=?';
    const habitParams = [req.user.uid];
    if (hasTextQuery) {
      habitSql += ' AND title GLOB ?';
      habitParams.push(searchGlob);
    }
    if (selectedTag) {
      habitSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=habits.id AND tl.user_id=? AND tl.tag_id=?)';
      habitParams.push(TAG_ENTITY_TYPES.HABIT, req.user.uid, selectedTag.id);
    }
    habitSql += ' ORDER BY id DESC LIMIT ?';
    habitParams.push(limit);
    const habitRows = await db.all(habitSql, habitParams);
    const habitIds = habitRows.map((row) => row.id);
    const habitTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, habitIds);
    habits = habitRows.map((row) => ({
      id: row.id,
      title: row.title,
      target_per_week: row.target_per_week,
      done_this_week: row.done_this_week,
      tags: habitTagMap.get(row.id) || []
    }));
  }

  let calendar = [];
  if (shouldSearchOther) {
    let calendarSql = 'SELECT id, date, title, type, mood FROM calendar_events WHERE user_id=?';
    const calendarParams = [req.user.uid];
    if (hasTextQuery) {
      calendarSql += ' AND (title GLOB ? OR type GLOB ?)';
      const like = searchGlob;
      calendarParams.push(like, like);
    }
    if (selectedTag) {
      calendarSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=calendar_events.id AND tl.user_id=? AND tl.tag_id=?)';
      calendarParams.push(TAG_ENTITY_TYPES.CALENDAR_EVENT, req.user.uid, selectedTag.id);
    }
    calendarSql += ' ORDER BY date DESC, id DESC LIMIT ?';
    calendarParams.push(limit);
    const calendarRows = await db.all(calendarSql, calendarParams);
    const calendarIds = calendarRows.map((row) => row.id);
    const calendarTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, calendarIds);
    calendar = calendarRows.map((row) => ({
      id: row.id,
      date: row.date,
      title: row.title,
      type: row.type,
      mood: row.mood,
      tags: calendarTagMap.get(row.id) || []
    }));
  }

  let goals = [];
  if (hasTextQuery) {
    let goalSql = 'SELECT id, title, target, completed, status, streak_current, streak_best, archived_at, created_at FROM yearly_goals WHERE user_id=?';
    const goalParams = [req.user.uid];
    goalSql += ' AND title GLOB ?';
    goalParams.push(searchGlob);
    goalSql += ' ORDER BY status, created_at DESC LIMIT ?';
    goalParams.push(limit);
    const goalRows = await db.all(goalSql, goalParams);
    goals = goalRows.map((row) => ({
      id: row.id,
      title: row.title,
      target: row.target,
      completed: row.completed,
      status: row.status,
      completion_pct: row.target > 0 ? Math.min(100, Math.round((row.completed || 0) * 100 / row.target)) : 0,
      streak_current: row.streak_current,
      streak_best: row.streak_best,
      archived_at: row.archived_at,
      created_at: row.created_at
    }));
  }

  const tagMatches = hasTextQuery
    ? tags.filter((tag) => tag.label.toLowerCase().includes(query)).slice(0, limit)
    : [];

  // Курсы-тренировки, уроки, слова словаря и ачивки. Фильтруем в JS: LOWER/LIKE в SQLite
  // не понимают регистр кириллицы («Курс» не находился по запросу «курс»).
  const matches = (...values) => values.some((v) => typeof v === 'string' && v.toLowerCase().replace(/ё/g, 'е').includes(query.replace(/ё/g, 'е')));
  let learnCourses = [];
  let learnLessons = [];
  let vocab = [];
  let achievements = [];
  if (hasTextQuery) {
    learnCourses = (await db.all('SELECT id, title, description, icon FROM lang_courses WHERE user_id=?', [req.user.uid]))
      .filter((row) => matches(row.title, row.description))
      .slice(0, limit);
    learnLessons = (
      await db.all(
        `SELECT l.id, l.title, l.description, c.id AS course_id, c.title AS course_title, c.icon
         FROM lang_lessons l JOIN lang_courses c ON c.id=l.course_id WHERE c.user_id=? ORDER BY l.position`,
        [req.user.uid]
      )
    )
      .filter((row) => matches(row.title, row.description))
      .slice(0, limit);
    vocab = (
      await db.all(
        `SELECT v.id, v.term, v.translation, v.note, v.language_id, l.name AS language_name
         FROM language_vocab v JOIN languages l ON l.id=v.language_id WHERE v.user_id=?`,
        [req.user.uid]
      )
    )
      .filter((row) => matches(row.term, row.translation, row.note))
      .slice(0, limit);
    achievements = (
      await db.all(
        `SELECT a.id, a.title, a.description, a.icon, ua.earned_at FROM achievements a
         LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=?
         WHERE a.is_active=1 AND (a.is_hidden=0 OR ua.earned_at IS NOT NULL)`,
        [req.user.uid]
      )
    )
      .filter((row) => matches(row.title, row.description))
      .slice(0, limit)
      .map((row) => ({ ...row, earned: !!row.earned_at }));
  }

  res.json({
    learn_courses: learnCourses,
    learn_lessons: learnLessons,
    vocab,
    achievements,
    tags,
    selected_tag: selectedTag,
    tag_matches: tagMatches,
    pages,
    pdf_bookmarks: pdfBookmarks,
    languages,
    courses,
    travel,
    shelf,
    wishlist,
    loans,
    habits,
    calendar,
    goals
  });
});

// Оформление профиля в духе Steam: фон, главное достижение, набор и порядок витрин
export const PROFILE_SHOWCASES = ['achievements', 'languages', 'courses', 'goals', 'activity', 'radar', 'feed'];
const DEFAULT_PROFILE_STYLE = { background_url: null, background_preset: 'aurora', featured_id: null, showcases: ['achievements', 'languages', 'activity', 'goals'] };

const readProfileStyle = (raw) => {
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const showcases = Array.isArray(parsed.showcases) ? parsed.showcases.filter((id) => PROFILE_SHOWCASES.includes(id)) : DEFAULT_PROFILE_STYLE.showcases;
  return {
    background_url: typeof parsed.background_url === 'string' ? parsed.background_url : null,
    background_preset: typeof parsed.background_preset === 'string' ? parsed.background_preset.slice(0, 40) : DEFAULT_PROFILE_STYLE.background_preset,
    featured_id: Number.isInteger(parsed.featured_id) ? parsed.featured_id : null,
    showcases: Array.from(new Set(showcases)),
  };
};

/** Счётчики для боковой панели профиля. */
async function profileStats(db, userId) {
  const one = async (sql, params = [userId]) => (await db.get(sql, params).catch(() => null))?.n || 0;
  return {
    languages: await one("SELECT COUNT(*) AS n FROM languages WHERE user_id=? AND COALESCE(status,'active')<>'archived'"),
    courses: await one('SELECT COUNT(*) AS n FROM courses WHERE user_id=? AND archived_at IS NULL'),
    courses_done: await one("SELECT COUNT(*) AS n FROM courses WHERE user_id=? AND archived_at IS NULL AND (status='done' OR progress>=100)"),
    words: await one('SELECT COUNT(*) AS n FROM language_vocab WHERE user_id=?'),
    lessons: await one('SELECT COUNT(*) AS n FROM lang_lesson_progress WHERE user_id=? AND completed_count>0'),
    goals: await one("SELECT COUNT(*) AS n FROM yearly_goals WHERE user_id=? AND status<>'archived'"),
    goals_done: await one("SELECT COUNT(*) AS n FROM yearly_goals WHERE user_id=? AND status='archived'"),
    habits: await one('SELECT COUNT(*) AS n FROM habits WHERE user_id=?'),
    pages: await one('SELECT COUNT(*) AS n FROM journal_pages WHERE user_id=?'),
    trips: await one('SELECT COUNT(*) AS n FROM travel_plans WHERE user_id=?'),
    active_days: await one('SELECT COUNT(DISTINCT date) AS n FROM user_action_log WHERE user_id=?'),
  };
}

router.put('/profile/style', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT profile_style FROM users WHERE id=?', [req.user.uid]);
  const style = readProfileStyle(row?.profile_style);
  const body = req.body || {};
  if (body.featured_id !== undefined) style.featured_id = Number.isInteger(Number(body.featured_id)) && body.featured_id !== null ? Number(body.featured_id) : null;
  if (Array.isArray(body.showcases)) style.showcases = Array.from(new Set(body.showcases.filter((id) => PROFILE_SHOWCASES.includes(id))));
  if (typeof body.background_preset === 'string') {
    style.background_preset = body.background_preset.slice(0, 40);
    style.background_url = null;
  }
  if (body.background_clear) style.background_url = null;
  await db.run('UPDATE users SET profile_style=? WHERE id=?', [JSON.stringify(style), req.user.uid]);
  res.json({ style });
});

router.get('/profile', async (req, res) => {
  const db = await getDB();
  const user = await db.get(
    'SELECT id,name,username,role,is_verified,avatar_url,banner_url,bio,city,profile_url,avatar_frame_main,avatar_frame_mini,weather_api_key FROM users WHERE id=?',
    [req.user.uid]
  );
  const xp = await db.get('SELECT xp, level FROM user_xp WHERE user_id=?', [req.user.uid]) || { xp: 0, level: 1 };
  // Значки профиля = полученные ачивки (настраиваются в админке).
  const achievements = await listForUser(req.user.uid);
  const badges = achievements
    .filter((item) => item.earned)
    .map((item) => ({ id: item.id, name: item.title, description: item.description, icon: item.icon, rarity: item.rarity, earned_at: item.earned_at }));
  const styleRow = await db.get('SELECT profile_style FROM users WHERE id=?', [req.user.uid]);
  res.json({ user, xp, badges, style: readProfileStyle(styleRow?.profile_style), stats: await profileStats(db, req.user.uid) });
});

router.post(
  '/profile',
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'background', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const db = await getDB();
      const current = await db.get('SELECT avatar_url, banner_url FROM users WHERE id=?', [req.user.uid]);

      const updates = [];
      const params = [];

      const displayNameRaw = req.body?.display_name;
      if (typeof displayNameRaw === 'string') {
        updates.push('name=?');
        params.push(displayNameRaw);
      }

      const usernameRaw = req.body?.username;
      if (typeof usernameRaw === 'string') {
        const normalizedUsername = normalizeUsername(usernameRaw);
        if (!normalizedUsername) {
          return res.status(400).json({ error: 'bad_username' });
        }
        const existing = await db.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id<>?', [normalizedUsername, req.user.uid]);
        if (existing) {
          return res.status(400).json({ error: 'username_taken' });
        }
        updates.push('username=?');
        params.push(normalizedUsername);
      } else {
        const currentUsername = await db.get('SELECT username, name, email FROM users WHERE id=?', [req.user.uid]);
        if (!currentUsername?.username) {
          updates.push('username=?');
          params.push(await generateUniqueUsername(db, currentUsername?.name || currentUsername?.email || `user-${req.user.uid}`, req.user.uid));
        }
      }

      const bioRaw = req.body?.bio;
      if (typeof bioRaw === 'string') {
        updates.push('bio=?');
        params.push(bioRaw);
      }

      const cityRaw = req.body?.city;
      if (typeof cityRaw === 'string') {
        updates.push('city=?');
        params.push(cityRaw);
      }

      const profileLinkRaw = req.body?.profile_link;
      if (typeof profileLinkRaw === 'string') {
        const trimmed = profileLinkRaw.trim();
        updates.push('profile_url=?');
        params.push(trimmed.length > 0 ? trimmed : null);
      }

      const frameMainRaw = req.body?.avatar_frame_main;
      if (typeof frameMainRaw === 'string') {
        const trimmed = frameMainRaw.trim();
        updates.push('avatar_frame_main=?');
        params.push(trimmed.length > 0 ? trimmed : null);
      }

      const frameMiniRaw = req.body?.avatar_frame_mini;
      if (typeof frameMiniRaw === 'string') {
        const trimmed = frameMiniRaw.trim();
        updates.push('avatar_frame_mini=?');
        params.push(trimmed.length > 0 ? trimmed : null);
      }

      let avatarToRemove = null;
      const avatarFile = Array.isArray(req.files?.avatar) ? req.files.avatar[0] : null;
      if (avatarFile) {
        const avatarPath = `/uploads/${avatarFile.filename}`;
        updates.push('avatar_url=?');
        params.push(avatarPath);
        if (current?.avatar_url && current.avatar_url !== avatarPath) {
          avatarToRemove = current.avatar_url;
        }
      }

      let bannerToRemove = null;
      const bannerFile = Array.isArray(req.files?.banner) ? req.files.banner[0] : null;
      if (bannerFile) {
        const bannerPath = `/uploads/${bannerFile.filename}`;
        updates.push('banner_url=?');
        params.push(bannerPath);
        if (current?.banner_url && current.banner_url !== bannerPath) {
          bannerToRemove = current.banner_url;
        }
      }

      // Фон страницы профиля (картинка)
      let backgroundToRemove = null;
      const backgroundFile = Array.isArray(req.files?.background) ? req.files.background[0] : null;
      if (backgroundFile || req.body?.background_clear === '1') {
        const styleRow = await db.get('SELECT profile_style FROM users WHERE id=?', [req.user.uid]);
        const style = readProfileStyle(styleRow?.profile_style);
        if (style.background_url) backgroundToRemove = style.background_url;
        style.background_url = backgroundFile ? `/uploads/${backgroundFile.filename}` : null;
        updates.push('profile_style=?');
        params.push(JSON.stringify(style));
      }

      if (updates.length > 0) {
        params.push(req.user.uid);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id=?`, params);
      }
      if (backgroundToRemove) await removeLocalUpload(backgroundToRemove);

      const user = await db.get(
        'SELECT id,name,username,role,is_verified,avatar_url,banner_url,bio,city,profile_url,avatar_frame_main,avatar_frame_mini FROM users WHERE id=?',
        [req.user.uid]
      );
      res.json({ user });

      if (avatarToRemove) await removeLocalUpload(avatarToRemove);
      if (bannerToRemove) await removeLocalUpload(bannerToRemove);
    } catch (error) {
      console.error('Failed to update profile', error);
      res.status(500).json({ error: 'failed to update profile' });
    }
  }
);

router.get('/calendar', async (req, res) => {
  const db = await getDB();

  const now = new Date();
  const y = parseInt(req.query.y || String(now.getFullYear()), 10);
  const m = parseInt(req.query.m || String(now.getMonth() + 1), 10);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0));
  const startISO = toISODate(monthStart);
  const endISO = toISODate(monthEnd);

  const stored = await db.all('SELECT id, user_id, date, title, type, mood FROM calendar_events WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date ASC', [req.user.uid, startISO, endISO]);
  const storedIds = stored.map((row) => row.id);
  const eventTagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, storedIds);
  const storedWithTags = stored.map((item) => ({ ...item, tags: eventTagMap.get(item.id) || [] }));

  const loans = await db.all('SELECT id, bank, due_day FROM loans WHERE user_id=?', [req.user.uid]);
  const virtual = [];
  for (const loan of loans) {
    const day = parseInt(loan.due_day || '1', 10);
    const dueDate = new Date(Date.UTC(y, m - 1, Math.min(day, monthEnd.getUTCDate())));
    virtual.push({
      id: 'loan_' + loan.id + '_' + y + '-' + String(m).padStart(2, '0'),
      user_id: req.user.uid,
      date: toISODate(dueDate),
      title: 'Платёж по кредиту ' + loan.bank,
      type: 'loan_due',
      mood: null
    });
  }

  const pages = await db.all(
    'SELECT id, title, page_date, banner_url, banner_gradient FROM journal_pages WHERE user_id=? AND page_date IS NOT NULL AND page_date BETWEEN ? AND ? ORDER BY page_date ASC',
    [req.user.uid, startISO, endISO]
  )
    .then(rows => rows.map(row => ({
      id: 'page_' + row.id,
      user_id: req.user.uid,
      date: row.page_date,
      title: row.title || 'Страница',
      type: 'page',
      mood: null,
      page_id: row.id,
      url: '/pages/' + row.id,
      banner_url: row.banner_url || null,
      banner_gradient: row.banner_gradient || null
    })));

  res.json({ items: [...storedWithTags, ...virtual, ...pages] });
});
router.post('/xp/add', async (req, res) => {
  const { amount = 0, note = null } = req.body || {};
  const db = await getDB();
  const { xp: newXp, level } = await awardXp(db, req.user.uid, amount, {
    type: 'xp_gain',
    title: 'Получено XP',
    text: `+${amount}${note ? ` (${note})` : ''}`,
    meta: { amount },
  });
  res.json({ xp: newXp, level });
});

router.get('/settings/google', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT google_refresh_token FROM users WHERE id=?', [req.user.uid]);
  res.json({ refresh_token: row?.google_refresh_token || null });
});

router.post('/settings/google', async (req, res) => {
  const db = await getDB();
  const { refresh_token = null } = req.body || {};
  await db.run('UPDATE users SET google_refresh_token=? WHERE id=?', [refresh_token || null, req.user.uid]);
  res.json({ ok: true });
});

router.get('/settings/weather', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT weather_api_key FROM users WHERE id=?', [req.user.uid]);
  res.json({ api_key: row?.weather_api_key || null });
});

router.post('/settings/weather', async (req, res) => {
  const db = await getDB();
  const rawKey = typeof req.body?.api_key === 'string' ? req.body.api_key : '';
  const apiKey = sanitizeOptionalText(rawKey, 128);
  await db.run('UPDATE users SET weather_api_key=? WHERE id=?', [apiKey, req.user.uid]);
  res.json({ ok: true, api_key: apiKey });
});

const isLikelyJson = (value) => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const collectPageIdsFromMeta = (meta) => {
  const ids = new Set();

  const visit = (value, depth = 0, force = false) => {
    if (value == null || depth > 8) return;

    if (typeof value === 'number') {
      if (force && Number.isInteger(value) && value > 0) ids.add(value);
      return;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;

      if (force && /^\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        if (parsed > 0) ids.add(parsed);
        return;
      }

      if (isLikelyJson(trimmed)) {
        const parsed = safeJsonParse(trimmed);
        if (parsed !== null) visit(parsed, depth + 1, force);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, force);
      return;
    }

    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        const lower = key.toLowerCase();
        const indicatesPage = lower.includes('page');
        visit(nested, depth + 1, force || indicatesPage);
      }
    }
  };

  visit(meta, 0, false);
  return Array.from(ids);
};

router.get('/feed', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM life_feed WHERE user_id=? ORDER BY ts DESC LIMIT 200', [req.user.uid]);

  const pageIdSet = new Set();
  const feedEntries = rows.map((row) => {
    let parsedMeta = null;
    if (row.meta && typeof row.meta === 'string' && isLikelyJson(row.meta)) {
      parsedMeta = safeJsonParse(row.meta);
    } else if (row.meta && typeof row.meta === 'object') {
      parsedMeta = row.meta;
    }

    const pageIds = collectPageIdsFromMeta(parsedMeta);
    for (const id of pageIds) pageIdSet.add(id);

    return {
      raw: row,
      pageId: pageIds.length > 0 ? pageIds[0] : null
    };
  });

  const pageVisuals = new Map();
  if (pageIdSet.size > 0) {
    const pageIds = Array.from(pageIdSet);
    const placeholders = pageIds.map(() => '?').join(',');
    const params = [req.user.uid, ...pageIds];
    const pageRows = await db.all(
      `SELECT id, banner_url, banner_gradient FROM journal_pages WHERE user_id=? AND id IN (${placeholders})`,
      params
    );
    for (const page of pageRows) {
      pageVisuals.set(page.id, {
        banner_url: page.banner_url || null,
        banner_gradient: page.banner_gradient || null
      });
    }
  }

  const items = feedEntries.map(({ raw, pageId }) => {
    const visual = pageId ? pageVisuals.get(pageId) || null : null;
    return {
      ...raw,
      page_id: pageId,
      page_banner_url: visual?.banner_url || null,
      page_banner_gradient: visual?.banner_gradient || null
    };
  });

  res.json({ items });
});

router.post('/feed/add', async (req, res) => {
  const { type, text, meta = null, ts = null } = req.body || {};
  const db = await getDB();
  await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)',
    [req.user.uid, type || 'note', '', text || '', meta ? JSON.stringify(meta) : null, ts || new Date().toISOString()]);
  res.json({ ok: true });
});
router.post('/calendar', async (req, res) => {
  const { date, title, type = 'note', mood = null, tags: tagsInput } = req.body || {};
  const db = await getDB();
  const result = await db.run('INSERT INTO calendar_events(user_id,date,title,type,mood) VALUES(?,?,?,?,?)', [req.user.uid, date, title, type, mood]);
  const row = await db.get('SELECT id, date, title, type, mood FROM calendar_events WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
  let tags = [];
  if (tagsInput !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, result.lastID, tagsInput);
    if (synced !== null) tags = synced;
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, [result.lastID]);
    tags = tagMap.get(result.lastID) || [];
  }
  res.json({ event: { ...row, tags } });
});

router.put('/calendar/:id', async (req, res) => {
  const payload = req.body || {};
  const db = await getDB();
  const updates = [];
  const values = [];
  if (payload.date !== undefined) { updates.push('date=?'); values.push(payload.date); }
  if (payload.title !== undefined) { updates.push('title=?'); values.push(payload.title); }
  if (payload.type !== undefined) { updates.push('type=?'); values.push(payload.type); }
  if (payload.mood !== undefined) { updates.push('mood=?'); values.push(payload.mood); }
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, req.params.id, payload.tags);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length) {
    const setClause = updates.join(', ');
    const result = await db.run('UPDATE calendar_events SET ' + setClause + ' WHERE id=? AND user_id=?', [...values, req.params.id, req.user.uid]);
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  const row = await db.get('SELECT id, date, title, type, mood FROM calendar_events WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.CALENDAR_EVENT, [row.id]);
  res.json({ event: { ...row, tags: tagMap.get(row.id) || [] } });
});

router.delete('/calendar/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM calendar_events WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [TAG_ENTITY_TYPES.CALENDAR_EVENT, req.params.id, req.user.uid]);
  res.json({ success: true });
});

router.post('/calendar/clear-shifts', async (req, res) => {
  const { types, startDate = null, endDate = null } = req.body || {};
  const allowedTypes = ['work', 'off'];
  const targetTypes = Array.isArray(types) && types.length
    ? types.filter((value) => allowedTypes.includes(value))
    : allowedTypes;

  if (targetTypes.length === 0) {
    return res.status(400).json({ error: 'invalid_types' });
  }

  const db = await getDB();
  const conditions = ['user_id=?', `type IN (${targetTypes.map(() => '?').join(',')})`];
  const params = [req.user.uid, ...targetTypes];

  if (startDate) {
    conditions.push('date>=?');
    params.push(startDate);
  }

  if (endDate) {
    conditions.push('date<=?');
    params.push(endDate);
  }

  const whereClause = conditions.join(' AND ');
  const selectSql = `SELECT id FROM calendar_events WHERE ${whereClause}`;
  const rows = await db.all(selectSql, params);

  if (!rows.length) {
    return res.json({ deleted: 0 });
  }

  const ids = rows.map((row) => row.id);
  const deleteSql = `DELETE FROM calendar_events WHERE ${whereClause}`;
  const result = await db.run(deleteSql, params);

  const idPlaceholders = ids.map(() => '?').join(',');
  await db.run(
    `DELETE FROM tag_links WHERE entity_type=? AND user_id=? AND entity_id IN (${idPlaceholders})`,
    [TAG_ENTITY_TYPES.CALENDAR_EVENT, req.user.uid, ...ids]
  );

  res.json({ deleted: result?.changes ?? ids.length });
});

router.post('/calendar/auto-shifts', async (req, res) => {
  const { startDate, pattern = '2/2', days = 120 } = req.body;
  const [work, off] = pattern.split('/').map((n) => parseInt(n || '0', 10));
  const db = await getDB();
  const start = new Date(startDate);
  const entries = [];
  let mode = 'work';
  let count = 0;
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const isWorkDay = mode === 'work';
    entries.push([
      req.user.uid,
      toISODate(date),
      isWorkDay ? 'Рабочая смена' : 'Выходной',
      isWorkDay ? 'work' : 'off',
      null
    ]);
    count += 1;
    const limit = isWorkDay ? work : off;
    if (limit > 0 && count >= limit) {
      mode = isWorkDay ? 'off' : 'work';
      count = 0;
    }
  }
  const stmt = await db.prepare('INSERT INTO calendar_events(user_id,date,title,type,mood) VALUES(?,?,?,?,?)');
  for (const entry of entries) {
    await stmt.run(...entry);
  }
  await stmt.finalize();

  await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)', [
    req.user.uid,
    'shifts_plan',
    'Создан график смен',
    `Сгенерировано ${entries.length} событий по шаблону ${pattern}`,
    JSON.stringify({ pattern, days, startDate }),
    new Date().toISOString()
  ]);

  res.json({ added: entries.length });
});

router.get('/menu-counters', async (req, res) => {
  const db = await getDB();
  const languagesRow = await db.get("SELECT COUNT(*) AS count FROM languages WHERE user_id=? AND (archived_at IS NULL OR archived_at='') AND COALESCE(status, 'active') <> 'archived'", [req.user.uid]) || { count: 0 };
  const coursesRow = await db.get("SELECT COUNT(*) AS count FROM courses WHERE user_id=? AND archived_at IS NULL", [req.user.uid]) || { count: 0 };
  const goalsRow = await db.get("SELECT COUNT(*) AS count FROM yearly_goals WHERE user_id=? AND COALESCE(status, 'active') <> 'archived'", [req.user.uid]) || { count: 0 };
  res.json({
    languages: languagesRow.count || 0,
    courses: coursesRow.count || 0,
    goals: goalsRow.count || 0
  });
});

// Тема: {mode, preset, accent, density, font, radius, animations, boldFocus, customThemes[]} — JSON до 32 КБ
const sanitizeTheme = (input) => {
  if (!input || typeof input !== 'object') return null;
  const json = JSON.stringify(input);
  return json.length <= 32 * 1024 ? json : null;
};

router.get('/ui-settings', async (req, res) => {
  const db = await getDB();
  const row = await db.get(
    'SELECT show_menu_counters, hidden_menu_items, notification_preferences, theme FROM ui_settings WHERE user_id=?',
    [req.user.uid],
  );
  const hiddenMenuItems = normalizeHiddenMenuItems(row?.hidden_menu_items);
  const notificationPreferences = normalizeNotificationPreferences(row?.notification_preferences);
  res.json({
    show_menu_counters: row ? !!row.show_menu_counters : true,
    hidden_menu_items: hiddenMenuItems,
    notification_preferences: notificationPreferences,
    theme: parseJsonSafe(row?.theme, null),
  });
});

// Раскладка Дэшборда — синхронизируется между устройствами
router.get('/dashboard-layout', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT dashboard_layout FROM ui_settings WHERE user_id=?', [req.user.uid]);
  res.json({ layout: parseJsonSafe(row?.dashboard_layout, null) });
});

router.put('/dashboard-layout', async (req, res) => {
  const raw = Array.isArray(req.body?.layout) ? req.body.layout : null;
  const layout = raw
    ? raw
        .filter((item) => item && typeof item.id === 'string')
        .slice(0, 40)
        .map((item) => ({ id: item.id.slice(0, 40), hidden: !!item.hidden, view: typeof item.view === 'string' ? item.view.slice(0, 20) : undefined }))
    : null;
  const db = await getDB();
  await db.run(
    `INSERT INTO ui_settings(user_id, dashboard_layout) VALUES(?, ?)
     ON CONFLICT(user_id) DO UPDATE SET dashboard_layout=excluded.dashboard_layout`,
    [req.user.uid, layout ? JSON.stringify(layout) : null]
  );
  res.json({ layout });
});

router.put('/ui-settings', async (req, res) => {
  const db = await getDB();
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'theme')) {
    await db.run(
      `INSERT INTO ui_settings(user_id, theme) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme`,
      [req.user.uid, sanitizeTheme(req.body.theme)]
    );
    if (Object.keys(req.body).length === 1) return res.json({ theme: parseJsonSafe(sanitizeTheme(req.body.theme), null) });
  }
  const existing = await db.get(
    'SELECT show_menu_counters, hidden_menu_items, notification_preferences FROM ui_settings WHERE user_id=?',
    [req.user.uid],
  );

  const hasShowFlag = Object.prototype.hasOwnProperty.call(req.body || {}, 'show_menu_counters');
  const showMenuCounters = hasShowFlag
    ? req.body?.show_menu_counters !== false
    : existing?.show_menu_counters !== 0 && existing?.show_menu_counters !== false;

  const hiddenMenuItems = normalizeHiddenMenuItems(
    Object.prototype.hasOwnProperty.call(req.body || {}, 'hidden_menu_items')
      ? req.body.hidden_menu_items
      : existing?.hidden_menu_items,
  );

  const notificationPreferences = normalizeNotificationPreferences(
    Object.prototype.hasOwnProperty.call(req.body || {}, 'notification_preferences')
      ? req.body.notification_preferences
      : existing?.notification_preferences,
  );

  await db.run(
    `INSERT INTO ui_settings(user_id, show_menu_counters, hidden_menu_items, notification_preferences)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       show_menu_counters=excluded.show_menu_counters,
       hidden_menu_items=excluded.hidden_menu_items,
       notification_preferences=excluded.notification_preferences`,
    [
      req.user.uid,
      showMenuCounters ? 1 : 0,
      hiddenMenuItems.length ? JSON.stringify(hiddenMenuItems) : null,
      notificationPreferences ? JSON.stringify(notificationPreferences) : JSON.stringify(DEFAULT_NOTIFICATION_PREFS),
    ],
  );

  res.json({
    show_menu_counters: !!showMenuCounters,
    hidden_menu_items: hiddenMenuItems,
    notification_preferences: notificationPreferences,
  });
});

function crud(table) {
  const routerCrud = express.Router();
  // Пишем только существующие колонки таблицы (кроме id/user_id): имена ключей из тела
  // запроса попадают в SQL, поэтому без белого списка это была бы SQL-инъекция.
  let columnsPromise = null;
  const pickColumns = async (db, body) => {
    columnsPromise = columnsPromise || db.all(`PRAGMA table_info(${table})`).then((cols) => new Set(cols.map((c) => c.name).filter((n) => n !== 'id' && n !== 'user_id')));
    const allowed = await columnsPromise;
    return Object.keys(body || {}).filter((key) => allowed.has(key));
  };
  routerCrud.get('/', async (req, res) => {
    const db = await getDB();
    const rows = await db.all(`SELECT * FROM ${table} WHERE user_id=?`, [req.user.uid]);
    res.json({ items: rows });
  });
  routerCrud.post('/', async (req, res) => {
    const db = await getDB();
    const keys = await pickColumns(db, req.body);
    if (!keys.length) return res.status(400).json({ error: 'no_fields' });
    const vals = keys.map((k) => req.body[k]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO ${table}(user_id,${keys.join(',')}) VALUES(?,${placeholders})`;
    const result = await db.run(sql, [req.user.uid, ...vals]);
    res.json({ id: result.lastID });
  });
  routerCrud.put('/:id', async (req, res) => {
    const db = await getDB();
    const keys = await pickColumns(db, req.body);
    if (!keys.length) return res.status(400).json({ error: 'no_fields' });
    const sets = keys.map((k) => `${k}=?`).join(',');
    const vals = keys.map((k) => req.body[k]);
    const sql = `UPDATE ${table} SET ${sets} WHERE id=? AND user_id=?`;
    await db.run(sql, [...vals, req.params.id, req.user.uid]);
    res.json({ success: true });
  });
  routerCrud.delete('/:id', async (req, res) => {
    const db = await getDB();
    await db.run(`DELETE FROM ${table} WHERE id=? AND user_id=?`, [req.params.id, req.user.uid]);
    res.json({ success: true });
  });
  return routerCrud;
}

const normalizeNullableText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const mapLanguageRow = (row, tags = []) => ({
  id: row.id,
  name: row.name,
  level: row.level,
  streak: row.streak ?? 0,
  streak_best: row.streak_best ?? 0,
  daily_goal_xp: row.daily_goal_xp ?? 50,
  last_practice_date: row.last_practice_date || null,
  minutes_today: row.minutes_today ?? 0,
  image_url: row.image_url || null,
  banner_url: row.banner_url || null,
  status: row.status || 'active',
  archived_at: row.archived_at,
  tags
});

/** Минуты занятий за сегодня по каждому языку (из language_practice_sessions). */
export async function minutesTodayByLanguage(db, userId) {
  const local = toISODate(new Date());
  const rows = await db.all(
    'SELECT language_id, SUM(COALESCE(seconds_spent,0)) AS seconds FROM language_practice_sessions WHERE user_id=? AND date IN (?, ?) GROUP BY language_id',
    [userId, todayISO(), local]
  );
  return new Map(rows.map((row) => [row.language_id, Math.round((row.seconds || 0) / 60)]));
}

const LANGUAGE_ROW_COLUMNS =
  'id,name,level,streak,streak_best,daily_goal_xp,last_practice_date,minutes_today,status,image_url,banner_url,archived_at';

const languagesRouter = express.Router();

languagesRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT ' + LANGUAGE_ROW_COLUMNS + ' FROM languages WHERE user_id=? ORDER BY name COLLATE NOCASE', [req.user.uid]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, ids);
  const minutesToday = await minutesTodayByLanguage(db, req.user.uid);
  for (const row of rows) row.minutes_today = minutesToday.get(row.id) || 0;
  const courseRows = await db.all(
    'SELECT id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id FROM courses WHERE user_id=?',
    [req.user.uid]
  );
  const courseTagMap = await fetchTagLinks(
    db,
    req.user.uid,
    TAG_ENTITY_TYPES.COURSE,
    courseRows.map((course) => course.id)
  );
  const locks = await loadCourseLocks(db, req.user.uid);
  const coursesByLanguage = new Map();
  for (const courseRow of courseRows) {
    if (courseRow.archived_at) continue;
    if (courseRow.language_id == null) continue;
    const mappedCourse = mapCourseRow(courseRow, courseTagMap.get(courseRow.id) || [], locks.courses.get(courseRow.id));
    if (!coursesByLanguage.has(courseRow.language_id)) {
      coursesByLanguage.set(courseRow.language_id, []);
    }
    coursesByLanguage.get(courseRow.language_id).push(mappedCourse);
  }
  for (const courseList of coursesByLanguage.values()) {
    courseList.sort((a, b) => a.program_stage - b.program_stage || a.title.localeCompare(b.title));
  }
  const active = [];
  const archived = [];
  for (const row of rows) {
    const base = mapLanguageRow(row, tagMap.get(row.id) || []);
    const courseList = coursesByLanguage.get(row.id) || [];
    const totalCourses = courseList.length;
    const completedCourses = courseList.filter((course) => normalizeCourseProgress(course.progress) >= 100).length;
    // Средний прогресс курсов языка — частично пройденные курсы тоже учитываются.
    const courseProgressPct = totalCourses > 0
      ? Math.round(courseList.reduce((sum, course) => sum + normalizeCourseProgress(course.progress), 0) / totalCourses)
      : 0;
    const mapped = {
      ...base,
      courses: courseList,
      courses_total: totalCourses,
      courses_completed: completedCourses,
      courses_progress_pct: courseProgressPct
    };
    if (mapped.archived_at || mapped.status === 'archived') archived.push(mapped); else active.push(mapped);
  }
  res.json({ items: active, archived });
});

languagesRouter.post('/', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const name = typeof payload.name === 'string' ? payload.name : '';
  const level = typeof payload.level === 'string' ? payload.level : 'A1';
  const streak = Number.isFinite(Number(payload.streak)) ? Number(payload.streak) : 0;
  const minutes = Number.isFinite(Number(payload.minutes_today)) ? Number(payload.minutes_today) : 0;
  const status = typeof payload.status === 'string' && payload.status === 'archived' ? 'archived' : 'active';
  const imageUrl = normalizeNullableText(payload.image_url);
  const bannerUrl = normalizeNullableText(payload.banner_url);
  const result = await db.run('INSERT INTO languages(user_id,name,level,streak,minutes_today,status,image_url,banner_url,archived_at) VALUES(?,?,?,?,?,?,?,?,NULL)', [req.user.uid, name, level, streak, minutes, status, imageUrl, bannerUrl]);
  const row = await db.get('SELECT ' + LANGUAGE_ROW_COLUMNS + ' FROM languages WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
  let tags = [];
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, row.id, payload.tags);
    if (synced !== null) {
      tags = synced;
    }
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, [row.id]);
    tags = tagMap.get(row.id) || [];
  }
  res.json({ language: mapLanguageRow(row, tags) });
});

languagesRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (payload.name !== undefined) { updates.push('name=?'); values.push(String(payload.name)); }
  if (payload.level !== undefined) { updates.push('level=?'); values.push(String(payload.level)); }
  if (payload.streak !== undefined) { updates.push('streak=?'); values.push(Number(payload.streak) || 0); }
  if (payload.minutes_today !== undefined) { updates.push('minutes_today=?'); values.push(Number(payload.minutes_today) || 0); }
  if (payload.daily_goal_xp !== undefined) { updates.push('daily_goal_xp=?'); values.push(Math.max(10, Number(payload.daily_goal_xp) || 50)); }
  if (payload.image_url !== undefined) { updates.push('image_url=?'); values.push(normalizeNullableText(payload.image_url)); }
  if (payload.banner_url !== undefined) { updates.push('banner_url=?'); values.push(normalizeNullableText(payload.banner_url)); }
  const tagsPayload = payload.tags;
  if (tagsPayload !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, req.params.id, tagsPayload);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length) {
    const setClause = updates.join(', ');
    const result = await db.run('UPDATE languages SET ' + setClause + ' WHERE id=? AND user_id=?', [...values, req.params.id, req.user.uid]);
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  const row = await db.get('SELECT ' + LANGUAGE_ROW_COLUMNS + ' FROM languages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, [row.id]);
  res.json({ language: mapLanguageRow(row, tagMap.get(row.id) || []) });
});

languagesRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  const now = new Date().toISOString();
  const result = await db.run("UPDATE languages SET status='archived', archived_at=COALESCE(archived_at, ?) WHERE id=? AND user_id=?", [now, req.params.id, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

// Программа обучения языка: этапы курсов
languagesRouter.get('/:id/program', async (req, res) => {
  const db = await getDB();
  const program = await loadProgram(db, req.user.uid, Number(req.params.id));
  if (!program) return res.status(404).json({ error: 'not_found' });
  res.json(program);
});

languagesRouter.put('/:id/program', async (req, res) => {
  const db = await getDB();
  const languageId = Number(req.params.id);
  const exists = await db.get('SELECT id FROM languages WHERE id=? AND user_id=?', [languageId, req.user.uid]);
  if (!exists) return res.status(404).json({ error: 'not_found' });
  res.json(await saveProgram(db, req.user.uid, languageId, req.body?.stages));
});

languagesRouter.post('/:id/restore', async (req, res) => {
  const db = await getDB();
  const result = await db.run("UPDATE languages SET status='active', archived_at=NULL WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

const coursesRouter = express.Router();

coursesRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id FROM courses WHERE user_id=? ORDER BY title COLLATE NOCASE', [req.user.uid]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, ids);
  const locks = await loadCourseLocks(db, req.user.uid);
  const active = [];
  const archived = [];
  for (const row of rows) {
    const mapped = mapCourseRow(row, tagMap.get(row.id) || [], locks.courses.get(row.id));
    if (mapped.archived_at) archived.push(mapped); else active.push(mapped);
  }
  res.json({ items: active, archived });
});

coursesRouter.post('/', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const title = typeof payload.title === 'string' ? payload.title : '';
  const provider = typeof payload.provider === 'string' ? payload.provider : '';
  const courseType = typeof payload.course_type === 'string' ? payload.course_type : 'study';
  const rawLanguage = payload.language_id;
  let languageId = null;
  if (rawLanguage !== null && rawLanguage !== undefined && rawLanguage !== '') {
    const parsed = Number(rawLanguage);
    languageId = Number.isNaN(parsed) ? null : parsed;
  }
  const progress = normalizeCourseProgress(payload.progress);
  const status = typeof payload.status === 'string' ? payload.status : 'in-progress';
  const learnCourse = await resolveLearnCourse(db, req.user.uid, payload.learn_course_id);
  if (learnCourse && languageId == null) languageId = learnCourse.language_id ?? null;
  const result = await db.run('INSERT INTO courses(user_id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id) VALUES(?,?,?,?,?,?,?,NULL,?)', [req.user.uid, title, provider, courseType, languageId, progress, status, learnCourse?.id ?? null]);
  if (learnCourse) await recomputeCourseProgress(db, req.user.uid, result.lastID);
  const row = await db.get('SELECT id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id FROM courses WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
  let tags = [];
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, row.id, payload.tags);
    if (synced !== null) {
      tags = synced;
    }
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, [row.id]);
    tags = tagMap.get(row.id) || [];
  }
  await logCourseProgress(db, req.user.uid, row.id, row.progress);
  res.json({ course: mapCourseRow(row, tags) });
});

coursesRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const existing = await db.get(
    'SELECT id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id FROM courses WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const updates = [];
  const values = [];
  if (payload.title !== undefined) { updates.push('title=?'); values.push(String(payload.title)); }
  if (payload.provider !== undefined) { updates.push('provider=?'); values.push(String(payload.provider)); }
  if (payload.course_type !== undefined) { updates.push('course_type=?'); values.push(String(payload.course_type)); }
  if (payload.language_id !== undefined) {
    if (payload.language_id === null || payload.language_id === '') {
      updates.push('language_id=?');
      values.push(null);
    } else {
      updates.push('language_id=?');
      const parsed = Number(payload.language_id);
      values.push(Number.isNaN(parsed) ? null : parsed);
    }
  }
  let progressChanged = false;
  let nextProgress = normalizeCourseProgress(existing.progress);
  if (payload.progress !== undefined) {
    const normalized = normalizeCourseProgress(payload.progress);
    updates.push('progress=?');
    values.push(normalized);
    progressChanged = normalized !== normalizeCourseProgress(existing.progress);
    nextProgress = normalized;
  }
  if (payload.status !== undefined) { updates.push('status=?'); values.push(String(payload.status)); }
  let relinked = false;
  if (payload.learn_course_id !== undefined) {
    const learnCourse = await resolveLearnCourse(db, req.user.uid, payload.learn_course_id);
    updates.push('learn_course_id=?');
    values.push(learnCourse?.id ?? null);
    relinked = true;
  }
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, req.params.id, payload.tags);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length) {
    const setClause = updates.join(', ');
    const result = await db.run('UPDATE courses SET ' + setClause + ' WHERE id=? AND user_id=?', [...values, req.params.id, req.user.uid]);
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  if (relinked) {
    await recomputeCourseProgress(db, req.user.uid, req.params.id);
    progressChanged = false; // recompute уже записал историю прогресса
  }
  // Язык курса = язык уроков: слова попадают в словарь, занятия — в стрик этого языка.
  const linked = await db.get('SELECT learn_course_id, language_id FROM courses WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (linked?.learn_course_id) {
    await db.run('UPDATE lang_courses SET language_id=? WHERE id=? AND user_id=?', [linked.language_id ?? null, linked.learn_course_id, req.user.uid]);
  }
  const row = await db.get('SELECT id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id FROM courses WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, [row.id]);
  if (progressChanged) {
    await logCourseProgress(db, req.user.uid, row.id, nextProgress);
  }
  res.json({ course: mapCourseRow(row, tagMap.get(row.id) || []) });
});

const mapTravelRow = (row, tags = []) => ({
  id: row.id,
  title: row.title,
  location: row.location,
  date_from: row.date_from,
  date_to: row.date_to,
  status: row.status,
  notes: row.notes,
  lat: row.lat ?? null,
  lon: row.lon ?? null,
  country: row.country ?? null,
  origin_name: row.origin_name ?? null,
  origin_lat: row.origin_lat ?? null,
  origin_lon: row.origin_lon ?? null,
  transport: row.transport ?? null,
  route: (() => {
    try {
      return row.route ? JSON.parse(row.route) : null;
    } catch {
      return null;
    }
  })(),
  route_km: row.route_km ?? null,
  tags
});

const mapHabitRow = (row, tags = []) => ({
  id: row.id,
  title: row.title,
  target_per_week: row.target_per_week,
  done_this_week: row.done_this_week,
  tags
});

const travelRouter = express.Router();

// Поиск места для карты: Nominatim (OpenStreetMap). Через сервер — Nominatim требует User-Agent и не любит CORS.
const nominatim = async (path) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch('https://nominatim.openstreetmap.org' + path, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LifeHub/1.0 (personal travel map)', 'Accept-Language': 'ru,en;q=0.7' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};
const mapPlace = (x) => ({
  name: x.name || x.display_name?.split(',')[0] || '',
  label: x.display_name || '',
  lat: Number(x.lat),
  lon: Number(x.lon),
  country: x.address?.country || null,
  city: x.address?.city || x.address?.town || x.address?.village || x.address?.state || null,
});

// ── Маршрут поездки: как ехали — по железной дороге, по трассе, пешком; самолёт и паром — дугой ──
const TRANSPORTS = ['train', 'car', 'bus', 'bike', 'walk', 'plane', 'ship'];
const BROUTER_PROFILE = { train: 'rail', car: 'car-fast', bus: 'car-fast', bike: 'trekking', walk: 'hiking-mountain' };

/** Упрощение линии (Дуглас — Пекер): длинный маршрут хранится компактно, форма сохраняется. */
const simplify = (pts, eps) => {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
};
const routeJson = (route) => {
  if (!Array.isArray(route) || route.length < 2) return null;
  const pts = route
    .filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .slice(0, 4000)
    .map((p) => [Math.round(Number(p[0]) * 1e5) / 1e5, Math.round(Number(p[1]) * 1e5) / 1e5]);
  return pts.length >= 2 ? JSON.stringify(pts) : null;
};
const haversineKm = (a, b) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b[0] - a[0]) * r) / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(((b[1] - a[1]) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
/** Дуга большого круга — так выглядит путь самолёта на карте. */
const greatCircle = (a, b, n = 64) => {
  const r = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (!d) return [a, b];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const A = Math.sin((1 - t) * d) / Math.sin(d);
    const B = Math.sin(t * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    return [Math.atan2(z, Math.hypot(x, y)) / r, Math.atan2(y, x) / r];
  });
};

travelRouter.post('/route', async (req, res) => {
  const transport = TRANSPORTS.includes(req.body?.transport) ? req.body.transport : 'car';
  const from = [Number(req.body?.from?.lat), Number(req.body?.from?.lon)];
  const to = [Number(req.body?.to?.lat), Number(req.body?.to?.lon)];
  if (![...from, ...to].every(Number.isFinite)) return res.status(400).json({ error: 'Укажите, откуда и куда' });
  if (transport === 'plane' || transport === 'ship') {
    const points = greatCircle(from, to);
    return res.json({ points, km: Math.round(haversineKm(from, to)), minutes: null, approximate: true });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const url = `https://brouter.de/brouter?lonlats=${from[1]},${from[0]}|${to[1]},${to[0]}&profile=${BROUTER_PROFILE[transport]}&alternativeidx=0&format=geojson`;
    const r = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LifeHub/1.0 (personal travel map)' } });
    const text = await r.text();
    if (!r.ok || !text.trim().startsWith('{')) throw new Error(text.slice(0, 160) || `HTTP ${r.status}`);
    const feature = JSON.parse(text)?.features?.[0];
    const coords = (feature?.geometry?.coordinates || []).map((c) => [c[1], c[0]]);
    if (coords.length < 2) throw new Error('пустой маршрут');
    const points = simplify(coords, 0.0006).slice(0, 4000);
    res.json({
      points,
      km: Math.round(Number(feature.properties?.['track-length'] || 0) / 1000) || Math.round(haversineKm(from, to)),
      minutes: Math.round(Number(feature.properties?.['total-time'] || 0) / 60) || null,
      approximate: false,
    });
  } catch (error) {
    // по дорогам не вышло (долго, граница, нет данных) — рисуем прямую, чтобы поездка всё равно была на карте
    res.json({
      points: greatCircle(from, to, 24),
      km: Math.round(haversineKm(from, to)),
      minutes: null,
      approximate: true,
      warning: 'По дорогам проложить не удалось — нарисована прямая. Можно попробовать точку ближе к вокзалу или трассе.',
    });
  } finally {
    clearTimeout(timer);
  }
});

travelRouter.get('/geocode', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  if (!q) return res.json({ items: [] });
  try {
    const data = await nominatim('/search?format=jsonv2&addressdetails=1&limit=6&q=' + encodeURIComponent(q));
    res.json({ items: (data || []).map(mapPlace) });
  } catch (error) {
    res.status(502).json({ error: 'Карта не ответила: ' + (error?.name === 'AbortError' ? 'долго нет ответа' : error?.message || 'нет связи') });
  }
});

travelRouter.get('/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'bad_coords' });
  const empty = { name: '', label: '', lat, lon, country: null, city: null };
  try {
    const data = await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=10&lat=${lat}&lon=${lon}`);
    res.json({ place: data && !data.error ? { ...mapPlace(data), lat, lon } : empty });
  } catch {
    res.json({ place: empty });
  }
});

travelRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id,title,location,date_from,date_to,status,notes,lat,lon,country,origin_name,origin_lat,origin_lon,transport,route,route_km FROM travel_plans WHERE user_id=? ORDER BY date_from DESC, id DESC', [req.user.uid]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, ids);
  res.json({
    items: rows.map((row) => mapTravelRow(row, tagMap.get(row.id) || []))
  });
});

travelRouter.post('/', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const title = typeof payload.title === 'string' ? payload.title : '';
  const location = typeof payload.location === 'string' ? payload.location : '';
  const dateFrom = payload.date_from || null;
  const dateTo = payload.date_to || null;
  const status = typeof payload.status === 'string' ? payload.status : 'planned';
  const notes = typeof payload.notes === 'string' ? payload.notes : null;
  const coord = (v, max) => (v !== null && v !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= max ? Number(v) : null);
  const result = await db.run(
    'INSERT INTO travel_plans(user_id,title,location,date_from,date_to,status,notes,lat,lon,country,origin_name,origin_lat,origin_lon,transport,route,route_km) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.user.uid, title, location, dateFrom, dateTo, status, notes, coord(payload.lat, 90), coord(payload.lon, 180), typeof payload.country === 'string' ? payload.country.slice(0, 80) : null,
      typeof payload.origin_name === 'string' ? payload.origin_name.slice(0, 200) : null, coord(payload.origin_lat, 90), coord(payload.origin_lon, 180),
      TRANSPORTS.includes(payload.transport) ? payload.transport : null, routeJson(payload.route), Number.isFinite(Number(payload.route_km)) ? Number(payload.route_km) : null]
  );
  const row = await db.get('SELECT id,title,location,date_from,date_to,status,notes,lat,lon,country,origin_name,origin_lat,origin_lon,transport,route,route_km FROM travel_plans WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
  let tags = [];
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, row.id, payload.tags);
    if (synced !== null) tags = synced;
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, [row.id]);
    tags = tagMap.get(row.id) || [];
  }
  res.json({ travel: mapTravelRow(row, tags) });
});

travelRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (payload.title !== undefined) { updates.push('title=?'); values.push(String(payload.title)); }
  if (payload.location !== undefined) { updates.push('location=?'); values.push(String(payload.location)); }
  if (payload.date_from !== undefined) { updates.push('date_from=?'); values.push(payload.date_from || null); }
  if (payload.date_to !== undefined) { updates.push('date_to=?'); values.push(payload.date_to || null); }
  if (payload.status !== undefined) { updates.push('status=?'); values.push(String(payload.status)); }
  if (payload.notes !== undefined) { updates.push('notes=?'); values.push(payload.notes ? String(payload.notes) : null); }
  for (const [key, max] of [['lat', 90], ['lon', 180]]) {
    if (payload[key] === undefined) continue;
    const v = Number(payload[key]);
    updates.push(`${key}=?`);
    values.push(payload[key] !== null && payload[key] !== '' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);
  }
  if (payload.country !== undefined) { updates.push('country=?'); values.push(payload.country ? String(payload.country).slice(0, 80) : null); }
  if (payload.origin_name !== undefined) { updates.push('origin_name=?'); values.push(payload.origin_name ? String(payload.origin_name).slice(0, 200) : null); }
  for (const [key, max] of [['origin_lat', 90], ['origin_lon', 180]]) {
    if (payload[key] === undefined) continue;
    const v = Number(payload[key]);
    updates.push(`${key}=?`);
    values.push(payload[key] !== null && payload[key] !== '' && Number.isFinite(v) && Math.abs(v) <= max ? v : null);
  }
  if (payload.transport !== undefined) { updates.push('transport=?'); values.push(TRANSPORTS.includes(payload.transport) ? payload.transport : null); }
  if (payload.route !== undefined) { updates.push('route=?'); values.push(routeJson(payload.route)); }
  if (payload.route_km !== undefined) { updates.push('route_km=?'); values.push(Number.isFinite(Number(payload.route_km)) && payload.route_km !== null ? Number(payload.route_km) : null); }
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, req.params.id, payload.tags);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length) {
    const setClause = updates.join(', ');
    const result = await db.run('UPDATE travel_plans SET ' + setClause + ' WHERE id=? AND user_id=?', [...values, req.params.id, req.user.uid]);
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  const row = await db.get('SELECT id,title,location,date_from,date_to,status,notes,lat,lon,country,origin_name,origin_lat,origin_lon,transport,route,route_km FROM travel_plans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, [row.id]);
  res.json({ travel: mapTravelRow(row, tagMap.get(row.id) || []) });
});

travelRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM travel_plans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [TAG_ENTITY_TYPES.TRAVEL, req.params.id, req.user.uid]);
  await dropEntityLinks(db, req.user.uid, 'travel', Number(req.params.id));
  res.json({ success: true });
});

const habitsRouter = express.Router();

habitsRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id, title, target_per_week, done_this_week FROM habits WHERE user_id=? ORDER BY id DESC', [
    req.user.uid
  ]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, ids);
  res.json({ items: rows.map((row) => mapHabitRow(row, tagMap.get(row.id) || [])) });
});

habitsRouter.post('/', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const title = typeof payload.title === 'string' ? payload.title : '';
  const target = Number.isFinite(Number(payload.target_per_week)) ? Number(payload.target_per_week) : 0;
  const result = await db.run(
    'INSERT INTO habits(user_id,title,target_per_week,done_this_week) VALUES(?,?,?,0)',
    [req.user.uid, title, target]
  );
  const row = await db.get(
    'SELECT id, title, target_per_week, done_this_week FROM habits WHERE id=? AND user_id=?',
    [result.lastID, req.user.uid]
  );
  let tags = [];
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, row.id, payload.tags);
    if (synced !== null) tags = synced;
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, [row.id]);
    tags = tagMap.get(row.id) || [];
  }
  res.json({ id: row.id, habit: mapHabitRow(row, tags) });
});

habitsRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (payload.title !== undefined) { updates.push('title=?'); values.push(String(payload.title)); }
  if (payload.target_per_week !== undefined) { updates.push('target_per_week=?'); values.push(Number(payload.target_per_week) || 0); }
  if (payload.done_this_week !== undefined) { updates.push('done_this_week=?'); values.push(Number(payload.done_this_week) || 0); }
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, req.params.id, payload.tags);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length) {
    const setClause = updates.join(', ');
    const result = await db.run('UPDATE habits SET ' + setClause + ' WHERE id=? AND user_id=?', [...values, req.params.id, req.user.uid]);
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  const row = await db.get('SELECT id, title, target_per_week, done_this_week FROM habits WHERE id=? AND user_id=?', [
    req.params.id,
    req.user.uid
  ]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.HABIT, [row.id]);
  res.json({ habit: mapHabitRow(row, tagMap.get(row.id) || []) });
});

habitsRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM habits WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [
    TAG_ENTITY_TYPES.HABIT,
    req.params.id,
    req.user.uid
  ]);
  res.json({ success: true });
});

coursesRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  const now = new Date().toISOString();
  const result = await db.run('UPDATE courses SET archived_at=COALESCE(archived_at, ?) WHERE id=? AND user_id=?', [now, req.params.id, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

coursesRouter.post('/:id/restore', async (req, res) => {
  const db = await getDB();
  const result = await db.run('UPDATE courses SET archived_at=NULL WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});
router.get('/course-pages', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(coursePageQuery(' ORDER BY cp.created_at DESC, cp.id DESC'), [req.user.uid]);
  res.json({ items: rows.map(mapCoursePage) });
});

router.post('/course-pages', async (req, res) => {
  const db = await getDB();
  const { course_id, page_id } = req.body || {};
  const courseId = Number(course_id);
  const pageId = Number(page_id);
  if (!Number.isInteger(courseId) || !Number.isInteger(pageId) || courseId <= 0 || pageId <= 0) {
    return res.status(400).json({ error: 'course_id_and_page_id_required' });
  }
  const course = await db.get('SELECT id FROM courses WHERE id=? AND user_id=?', [courseId, req.user.uid]);
  if (!course) return res.status(404).json({ error: 'course_not_found' });
  const page = await db.get('SELECT id FROM journal_pages WHERE id=? AND user_id=?', [pageId, req.user.uid]);
  if (!page) return res.status(404).json({ error: 'page_not_found' });
  let row = null;
  try {
    const result = await db.run(
      'INSERT INTO course_pages(user_id, course_id, page_id, done, done_at, created_at) VALUES(?,?,?,?,?,?)',
      [req.user.uid, courseId, pageId, 0, null, new Date().toISOString()]
    );
    row = await db.get(coursePageQuery(' AND cp.id=?'), [req.user.uid, result.lastID]);
  } catch (err) {
    const message = String(err || '');
    if ((err && err.code === 'SQLITE_CONSTRAINT') || message.includes('UNIQUE constraint failed')) {
      row = await db.get(coursePageQuery(' AND cp.course_id=? AND cp.page_id=?'), [req.user.uid, courseId, pageId]);
    } else {
      throw err;
    }
  }
  if (!row) return res.status(500).json({ error: 'course_page_create_failed' });
  await recomputeCourseProgress(db, req.user.uid, courseId);
  res.json({ item: mapCoursePage(row) });
});

router.patch('/course-pages/:id', async (req, res) => {
  const db = await getDB();
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  if (req.body?.done === undefined) return res.status(400).json({ error: 'done_required' });
  const done = !!req.body.done;
  const doneAt = done ? new Date().toISOString() : null;
  const result = await db.run('UPDATE course_pages SET done=?, done_at=? WHERE id=? AND user_id=?', [done ? 1 : 0, doneAt, targetId, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  const row = await db.get(coursePageQuery(' AND cp.id=?'), [req.user.uid, targetId]);
  if (row) {
    await recomputeCourseProgress(db, req.user.uid, row.course_id);
  }
  res.json({ item: mapCoursePage(row) });
});

router.delete('/course-pages/:id', async (req, res) => {
  const db = await getDB();
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  const existing = await db.get('SELECT course_id FROM course_pages WHERE id=? AND user_id=?', [targetId, req.user.uid]);
  const result = await db.run('DELETE FROM course_pages WHERE id=? AND user_id=?', [targetId, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  if (existing) {
    await recomputeCourseProgress(db, req.user.uid, existing.course_id);
  }
  res.json({ success: true });
});

router.get('/course-pdf-pages', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    'SELECT id, course_id, title, pdf_url, page_number, done, done_at, original_name FROM course_pdf_pages WHERE user_id=? ORDER BY created_at DESC',
    [req.user.uid]
  );
  res.json({ items: rows.map(mapCoursePdfPage) });
});

router.post('/course-pdf-pages', async (req, res) => {
  const db = await getDB();
  const courseId = Number.parseInt(req.body?.course_id ?? req.body?.courseId, 10);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: 'invalid_course' });
  }

  const course = await db.get('SELECT id FROM courses WHERE id=? AND user_id=?', [courseId, req.user.uid]);
  if (!course) return res.status(404).json({ error: 'course_not_found' });

  const pdfUrl = normalizePdfUrl(req.body?.pdf_url ?? req.body?.pdfUrl);
  if (!pdfUrl) return res.status(400).json({ error: 'invalid_pdf_url' });

  const title = sanitizeRequiredText(req.body?.title, 'PDF материал');
  const originalName = sanitizeOptionalText(req.body?.original_name ?? req.body?.originalName, 255);
  let pageNumber = null;
  const rawPageNumber = req.body?.page_number ?? req.body?.pageNumber;
  if (rawPageNumber !== undefined && rawPageNumber !== null && `${rawPageNumber}`.trim().length > 0) {
    const parsed = Number.parseInt(rawPageNumber, 10);
    if (!Number.isNaN(parsed) && parsed > 0) pageNumber = parsed;
  }

  const result = await db.run(
    'INSERT INTO course_pdf_pages(user_id, course_id, title, pdf_url, page_number, original_name) VALUES(?,?,?,?,?,?)',
    [req.user.uid, courseId, title, pdfUrl, pageNumber, originalName]
  );

  const row = await db.get(
    'SELECT id, course_id, title, pdf_url, page_number, done, done_at, original_name FROM course_pdf_pages WHERE id=? AND user_id=?',
    [result.lastID, req.user.uid]
  );

  await recomputeCourseProgress(db, req.user.uid, courseId);

  res.json({ item: mapCoursePdfPage(row) });
});

router.patch('/course-pdf-pages/:id', async (req, res) => {
  const db = await getDB();
  const entry = await db.get(
    'SELECT id, course_id, title, pdf_url, page_number, done, done_at, original_name FROM course_pdf_pages WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );
  if (!entry) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) {
    updates.push('title=?');
    values.push(sanitizeRequiredText(req.body.title, entry.title));
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pdf_url') || Object.prototype.hasOwnProperty.call(req.body || {}, 'pdfUrl')) {
    const newUrl = normalizePdfUrl(req.body?.pdf_url ?? req.body?.pdfUrl);
    if (!newUrl) return res.status(400).json({ error: 'invalid_pdf_url' });
    updates.push('pdf_url=?');
    values.push(newUrl);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'page_number') || Object.prototype.hasOwnProperty.call(req.body || {}, 'pageNumber')) {
    const rawPageNumber = req.body?.page_number ?? req.body?.pageNumber;
    let pageNumber = null;
    if (rawPageNumber !== undefined && rawPageNumber !== null && `${rawPageNumber}`.trim().length > 0) {
      const parsed = Number.parseInt(rawPageNumber, 10);
      if (!Number.isNaN(parsed) && parsed > 0) pageNumber = parsed;
    }
    updates.push('page_number=?');
    values.push(pageNumber);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'done')) {
    const done = req.body.done ? 1 : 0;
    updates.push('done=?', 'done_at=?');
    values.push(done, done ? new Date().toISOString() : null);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'original_name') || Object.prototype.hasOwnProperty.call(req.body || {}, 'originalName')) {
    updates.push('original_name=?');
    values.push(sanitizeOptionalText(req.body?.original_name ?? req.body?.originalName, 255));
  }

  if (updates.length === 0) {
    return res.json({ item: mapCoursePdfPage(entry) });
  }

  values.push(req.params.id, req.user.uid);
  await db.run(`UPDATE course_pdf_pages SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);

  const row = await db.get(
    'SELECT id, course_id, title, pdf_url, page_number, done, done_at, original_name FROM course_pdf_pages WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );

  if (row) {
    await recomputeCourseProgress(db, req.user.uid, row.course_id);
  }

  res.json({ item: mapCoursePdfPage(row) });
});

router.delete('/course-pdf-pages/:id', async (req, res) => {
  const db = await getDB();
  const existing = await db.get('SELECT course_id FROM course_pdf_pages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  const result = await db.run('DELETE FROM course_pdf_pages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  if (existing) {
    await recomputeCourseProgress(db, req.user.uid, existing.course_id);
  }
  res.json({ success: true });
});

router.get('/language-pages', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(languagePageQuery(' ORDER BY lp.created_at DESC, lp.id DESC'), [req.user.uid]);
  res.json({ items: rows.map(mapLanguagePage) });
});

router.post('/language-pages', async (req, res) => {
  const db = await getDB();
  const { language_id, page_id } = req.body || {};
  const langId = Number(language_id);
  const pageId = Number(page_id);
  if (!Number.isInteger(langId) || !Number.isInteger(pageId) || langId <= 0 || pageId <= 0) {
    return res.status(400).json({ error: 'language_id_and_page_id_required' });
  }
  const language = await db.get('SELECT id FROM languages WHERE id=? AND user_id=?', [langId, req.user.uid]);
  if (!language) return res.status(404).json({ error: 'language_not_found' });
  const page = await db.get('SELECT id FROM journal_pages WHERE id=? AND user_id=?', [pageId, req.user.uid]);
  if (!page) return res.status(404).json({ error: 'page_not_found' });
  let row = null;
  try {
    const result = await db.run(
      'INSERT INTO language_pages(user_id, language_id, page_id, done, done_at, created_at) VALUES(?,?,?,?,?,?)',
      [req.user.uid, langId, pageId, 0, null, new Date().toISOString()]
    );
    row = await db.get(languagePageQuery(' AND lp.id=?'), [req.user.uid, result.lastID]);
  } catch (err) {
    const message = String(err || '');
    if ((err && err.code === 'SQLITE_CONSTRAINT') || message.includes('UNIQUE constraint failed')) {
      row = await db.get(languagePageQuery(' AND lp.language_id=? AND lp.page_id=?'), [req.user.uid, langId, pageId]);
    } else {
      throw err;
    }
  }
  if (!row) return res.status(500).json({ error: 'language_page_create_failed' });
  res.json({ item: mapLanguagePage(row) });
});

router.patch('/language-pages/:id', async (req, res) => {
  const db = await getDB();
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  if (req.body?.done === undefined) return res.status(400).json({ error: 'done_required' });
  const done = !!req.body.done;
  const doneAt = done ? new Date().toISOString() : null;
  const result = await db.run('UPDATE language_pages SET done=?, done_at=? WHERE id=? AND user_id=?', [done ? 1 : 0, doneAt, targetId, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  const row = await db.get(languagePageQuery(' AND lp.id=?'), [req.user.uid, targetId]);
  res.json({ item: mapLanguagePage(row) });
});

router.delete('/language-pages/:id', async (req, res) => {
  const db = await getDB();
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'invalid_id' });
  const result = await db.run('DELETE FROM language_pages WHERE id=? AND user_id=?', [targetId, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

router.get('/language-pdf-pages', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    'SELECT id, language_id, title, pdf_url, page_number, done, done_at, original_name FROM language_pdf_pages WHERE user_id=? ORDER BY created_at DESC',
    [req.user.uid]
  );
  res.json({ items: rows.map(mapLanguagePdfPage) });
});

router.post('/language-pdf-pages', async (req, res) => {
  const db = await getDB();
  const languageId = Number.parseInt(req.body?.language_id ?? req.body?.languageId, 10);
  if (!Number.isInteger(languageId) || languageId <= 0) {
    return res.status(400).json({ error: 'invalid_language' });
  }

  const language = await db.get('SELECT id FROM languages WHERE id=? AND user_id=?', [languageId, req.user.uid]);
  if (!language) return res.status(404).json({ error: 'language_not_found' });

  const pdfUrl = normalizePdfUrl(req.body?.pdf_url ?? req.body?.pdfUrl);
  if (!pdfUrl) return res.status(400).json({ error: 'invalid_pdf_url' });

  const title = sanitizeRequiredText(req.body?.title, 'PDF материал');
  const originalName = sanitizeOptionalText(req.body?.original_name ?? req.body?.originalName, 255);
  let pageNumber = null;
  const rawPageNumber = req.body?.page_number ?? req.body?.pageNumber;
  if (rawPageNumber !== undefined && rawPageNumber !== null && `${rawPageNumber}`.trim().length > 0) {
    const parsed = Number.parseInt(rawPageNumber, 10);
    if (!Number.isNaN(parsed) && parsed > 0) pageNumber = parsed;
  }

  const result = await db.run(
    'INSERT INTO language_pdf_pages(user_id, language_id, title, pdf_url, page_number, original_name) VALUES(?,?,?,?,?,?)',
    [req.user.uid, languageId, title, pdfUrl, pageNumber, originalName]
  );

  const row = await db.get(
    'SELECT id, language_id, title, pdf_url, page_number, done, done_at, original_name FROM language_pdf_pages WHERE id=? AND user_id=?',
    [result.lastID, req.user.uid]
  );

  res.json({ item: mapLanguagePdfPage(row) });
});

router.patch('/language-pdf-pages/:id', async (req, res) => {
  const db = await getDB();
  const entry = await db.get(
    'SELECT id, language_id, title, pdf_url, page_number, done, done_at, original_name FROM language_pdf_pages WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );
  if (!entry) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'title')) {
    updates.push('title=?');
    values.push(sanitizeRequiredText(req.body.title, entry.title));
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'pdf_url') || Object.prototype.hasOwnProperty.call(req.body || {}, 'pdfUrl')) {
    const newUrl = normalizePdfUrl(req.body?.pdf_url ?? req.body?.pdfUrl);
    if (!newUrl) return res.status(400).json({ error: 'invalid_pdf_url' });
    updates.push('pdf_url=?');
    values.push(newUrl);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'page_number') || Object.prototype.hasOwnProperty.call(req.body || {}, 'pageNumber')) {
    const rawPageNumber = req.body?.page_number ?? req.body?.pageNumber;
    let pageNumber = null;
    if (rawPageNumber !== undefined && rawPageNumber !== null && `${rawPageNumber}`.trim().length > 0) {
      const parsed = Number.parseInt(rawPageNumber, 10);
      if (!Number.isNaN(parsed) && parsed > 0) pageNumber = parsed;
    }
    updates.push('page_number=?');
    values.push(pageNumber);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'done')) {
    const done = req.body.done ? 1 : 0;
    updates.push('done=?', 'done_at=?');
    values.push(done, done ? new Date().toISOString() : null);
  }

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'original_name') || Object.prototype.hasOwnProperty.call(req.body || {}, 'originalName')) {
    updates.push('original_name=?');
    values.push(sanitizeOptionalText(req.body?.original_name ?? req.body?.originalName, 255));
  }

  if (updates.length === 0) {
    return res.json({ item: mapLanguagePdfPage(entry) });
  }

  values.push(req.params.id, req.user.uid);
  await db.run(`UPDATE language_pdf_pages SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);

  const row = await db.get(
    'SELECT id, language_id, title, pdf_url, page_number, done, done_at, original_name FROM language_pdf_pages WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );

  res.json({ item: mapLanguagePdfPage(row) });
});

router.delete('/language-pdf-pages/:id', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM language_pdf_pages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

router.use('/languages', languagesRouter);
router.use('/languages', languageLearningRouter);
router.use('/courses', coursesRouter);
router.use('/journal', crud('journal'));
router.use('/study-plan', studyPlanRouter);
router.use('/habits', habitsRouter);
router.use('/travel', travelRouter);

router.get('/habits/checks', async (req, res) => {
  const db = await getDB();
  const { from = null, to = null } = req.query || {};
  let sql = 'SELECT habit_id, date FROM habit_checks WHERE user_id=?';
  const params = [req.user.uid];
  if (from && to) {
    sql += ' AND date BETWEEN ? AND ?';
    params.push(from, to);
  } else if (from) {
    sql += ' AND date >= ?';
    params.push(from);
  } else if (to) {
    sql += ' AND date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY date DESC';
  const rows = await db.all(sql, params);
  res.json({ items: rows });
});

router.post('/habits/checks', async (req, res) => {
  const { habit_id, date, done = true } = req.body || {};
  if (!habit_id || !date) return res.status(400).json({ error: 'habit_id and date required' });
  const db = await getDB();
  if (done) {
    await db.run('INSERT INTO habit_checks(user_id, habit_id, date) VALUES(?,?,?) ON CONFLICT(user_id, habit_id, date) DO NOTHING',
      [req.user.uid, habit_id, date]);
  } else {
    await db.run('DELETE FROM habit_checks WHERE user_id=? AND habit_id=? AND date=?', [req.user.uid, habit_id, date]);
  }
  const total = await db.get('SELECT COUNT(*) AS cnt FROM habit_checks WHERE user_id=? AND habit_id=?', [req.user.uid, habit_id]);
  res.json({ ok: true, total: total?.cnt || 0 });
});

router.get('/yearly-goals', async (req, res) => {
  const db = await getDB();
  const goals = await db.all('SELECT * FROM yearly_goals WHERE user_id=? ORDER BY status, created_at DESC', [req.user.uid]);
  const logRows = await db.all('SELECT goal_id, date FROM yearly_goal_logs WHERE user_id=? ORDER BY date DESC', [req.user.uid]);
  const logMap = new Map();
  for (const row of logRows) {
    if (!logMap.has(row.goal_id)) logMap.set(row.goal_id, []);
    logMap.get(row.goal_id).push(row.date);
  }
  const active = [];
  const archived = [];
  for (const goal of goals) {
    const logs = logMap.get(goal.id) || [];
    const formatted = attachGoalMeta(goal, logs);
    if (goal.status === 'archived') archived.push(formatted); else active.push(formatted);
  }
  res.json({ active, archived });
});

// auto_action — ключ действия из каталога (или null), auto_min — сколько раз за день
const sanitizeGoalAuto = (body) => {
  const action = typeof body?.auto_action === 'string' && ACTIONS_BY_KEY.has(body.auto_action) ? body.auto_action : null;
  const min = Math.min(1000, Math.max(1, parseInt(body?.auto_min, 10) || 1));
  return { action, min };
};

// Сразу засчитать сегодняшний день, если действие уже выполнено
const applyAutoForGoal = async (db, userId, goalId) => {
  const goal = await db.get('SELECT auto_action FROM yearly_goals WHERE id=? AND user_id=?', [goalId, userId]);
  if (goal?.auto_action) await applyGoalAutoChecks(db, userId, goal.auto_action, toISODate(new Date()));
};

router.post('/yearly-goals', async (req, res) => {
  const db = await getDB();
  const { title, target = 100 } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title_required' });
  const sanitizedTarget = Math.max(1, parseInt(target, 10) || 100);
  const auto = sanitizeGoalAuto(req.body);
  const result = await db.run(
    'INSERT INTO yearly_goals(user_id,title,target,completed,status,streak_current,streak_best,archived_at,created_at,auto_action,auto_min) VALUES(?,?,?,?,?,?,?,NULL, CURRENT_TIMESTAMP,?,?)',
    [req.user.uid, title.trim(), sanitizedTarget, 0, 'active', 0, 0, auto.action, auto.min]
  );
  await applyAutoForGoal(db, req.user.uid, result.lastID);
  const goal = await db.get('SELECT * FROM yearly_goals WHERE id=?', [result.lastID]);
  const logs = await db.all('SELECT date FROM yearly_goal_logs WHERE goal_id=? ORDER BY date DESC', [result.lastID]);
  res.json({ goal: attachGoalMeta(goal, logs.map((l) => l.date)) });
});

router.patch('/yearly-goals/:id', async (req, res) => {
  const db = await getDB();
  const { title, target } = req.body || {};
  const goal = await db.get('SELECT * FROM yearly_goals WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!goal) return res.status(404).json({ error: 'not_found' });
  const updates = [];
  const values = [];
  if (typeof title === 'string') {
    updates.push('title=?');
    values.push(title.trim());
  }
  if (target !== undefined) {
    const sanitizedTarget = Math.max(1, parseInt(target, 10) || 1);
    updates.push('target=?');
    values.push(sanitizedTarget);
  }
  if (req.body?.auto_action !== undefined) {
    const auto = sanitizeGoalAuto(req.body);
    updates.push('auto_action=?', 'auto_min=?');
    values.push(auto.action, auto.min);
  }
  if (updates.length) {
    values.push(req.params.id, req.user.uid);
    await db.run(`UPDATE yearly_goals SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
  }
  await applyAutoForGoal(db, req.user.uid, req.params.id);
  const updated = await recomputeGoal(db, req.user.uid, req.params.id);
  const logs = await db.all('SELECT date FROM yearly_goal_logs WHERE user_id=? AND goal_id=? ORDER BY date DESC', [req.user.uid, req.params.id]);
  res.json({ goal: attachGoalMeta(updated, logs.map(l => l.date)) });
});

router.post('/yearly-goals/:id/check', async (req, res) => {
  const db = await getDB();
  const { date = todayISO(), checked = true } = req.body || {};
  const targetDate = date.slice(0, 10);
  const goal = await db.get('SELECT * FROM yearly_goals WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!goal) return res.status(404).json({ error: 'not_found' });

  if (checked) {
    await db.run('INSERT INTO yearly_goal_logs(user_id, goal_id, date) VALUES(?,?,?) ON CONFLICT(user_id, goal_id, date) DO NOTHING', [req.user.uid, req.params.id, targetDate]);
  } else {
    await db.run('DELETE FROM yearly_goal_logs WHERE user_id=? AND goal_id=? AND date=?', [req.user.uid, req.params.id, targetDate]);
  }

  const updated = await recomputeGoal(db, req.user.uid, req.params.id);
  const logs = await db.all('SELECT date FROM yearly_goal_logs WHERE user_id=? AND goal_id=? ORDER BY date DESC', [req.user.uid, req.params.id]);
  res.json({ goal: attachGoalMeta(updated, logs.map(l => l.date)) });
});

router.delete('/yearly-goals/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM yearly_goals WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM yearly_goal_logs WHERE goal_id=? AND user_id=?', [req.params.id, req.user.uid]);
  res.json({ success: true });
});

router.get('/journal-pages', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    'SELECT id,title,blocks_json,updated_at,banner_url,banner_gradient FROM journal_pages WHERE user_id=? ORDER BY updated_at DESC',
    [req.user.uid]
  );
  res.json({ items: rows });
});

router.post('/journal-pages', async (req, res) => {
  const { title = '', blocks = [] } = req.body || {};
  const db = await getDB();
  const bannerUrl = sanitizeOptionalText(req.body?.banner_url ?? req.body?.bannerUrl);
  const bannerGradient = sanitizeOptionalText(req.body?.banner_gradient ?? req.body?.bannerGradient, 4096);
  const result = await db.run(
    'INSERT INTO journal_pages(user_id,title,blocks_json,updated_at,banner_url,banner_gradient) VALUES(?,?,?,?,?,?)',
    [req.user.uid, title, JSON.stringify(blocks || []), new Date().toISOString(), bannerUrl, bannerGradient]
  );
  res.json({ id: result.lastID });
});

router.put('/journal-pages/:id', async (req, res) => {
  const { title, blocks } = req.body || {};
  const db = await getDB();
  await db.run(
    'UPDATE journal_pages SET title=COALESCE(?,title), blocks_json=COALESCE(?,blocks_json), banner_url=COALESCE(?,banner_url), banner_gradient=COALESCE(?,banner_gradient), updated_at=? WHERE id=? AND user_id=?',
    [
      title,
      blocks ? JSON.stringify(blocks) : null,
      sanitizeOptionalText(req.body?.banner_url ?? req.body?.bannerUrl),
      sanitizeOptionalText(req.body?.banner_gradient ?? req.body?.bannerGradient, 4096),
      new Date().toISOString(),
      req.params.id,
      req.user.uid
    ]
  );
  res.json({ ok: true });
});

router.delete('/journal-pages/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM journal_pages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  res.json({ ok: true });
});

const MS_DAY = 86400000;
const REPORT_PERIODS = new Set(['daily', 'weekly', 'monthly']);
const numberFormatter = new Intl.NumberFormat('ru-RU');
const shortDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' });
const fullDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const monthLongFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const monthShortFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'short', year: 'numeric' });

const clampNumber = (value) => {
  if (!Number.isFinite(Number(value))) return 0;
  return Number(value);
};

const formatNumber = (value) => numberFormatter.format(Math.round(clampNumber(value)));

const formatSigned = (value) => {
  const rounded = Math.round(clampNumber(value));
  if (rounded > 0) return `+${rounded}`;
  if (rounded < 0) return `${rounded}`;
  return '0';
};

const formatDecimal = (value, digits = 1) => {
  const multiplier = 10 ** digits;
  const rounded = Math.round(clampNumber(value) * multiplier) / multiplier;
  return numberFormatter.format(rounded);
};

const formatSignedDecimal = (value, digits = 1) => {
  const multiplier = 10 ** digits;
  const rounded = Math.round(clampNumber(value) * multiplier) / multiplier;
  const formatted = numberFormatter.format(Math.abs(rounded));
  if (rounded > 0) return `+${formatted}`;
  if (rounded < 0) return `-${formatted}`;
  return '0';
};

const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDaysUtc = (date, amount) => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
};

const addMonthsUtc = (date, amount) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));

const toDateISO = (date) => date.toISOString().slice(0, 10);

const isoWeekKey = (date) => {
  const target = startOfUtcDay(date);
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((target - yearStart) / MS_DAY + 1) / 7);
  return `${target.getUTCFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
};

const formatRangeLabel = (start, endExclusive) => {
  const endInclusive = addDaysUtc(endExclusive, -1);
  if (endInclusive.getTime() < start.getTime()) return fullDateFormatter.format(start);
  if (start.getTime() === endInclusive.getTime()) {
    return fullDateFormatter.format(start);
  }
  return `${fullDateFormatter.format(start)} — ${fullDateFormatter.format(endInclusive)}`;
};

const formatShortRangeLabel = (start, endExclusive) => {
  const endInclusive = addDaysUtc(endExclusive, -1);
  if (endInclusive.getTime() < start.getTime()) return shortDateFormatter.format(start);
  if (start.getTime() === endInclusive.getTime()) {
    return shortDateFormatter.format(start);
  }
  return `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(endInclusive)}`;
};

const buildTimelineBuckets = (unit, count, endExclusive) => {
  const buckets = [];
  if (count <= 0) return buckets;
  if (unit === 'day') {
    let cursor = addDaysUtc(endExclusive, -count);
    for (let i = 0; i < count; i += 1) {
      const start = addDaysUtc(cursor, i);
      const end = addDaysUtc(start, 1);
      buckets.push({
        start,
        end,
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: shortDateFormatter.format(start)
      });
    }
  } else if (unit === 'week') {
    let cursor = addDaysUtc(endExclusive, -7 * count);
    for (let i = 0; i < count; i += 1) {
      const start = addDaysUtc(cursor, i * 7);
      const end = addDaysUtc(start, 7);
      buckets.push({
        start,
        end,
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: formatShortRangeLabel(start, end)
      });
    }
  } else if (unit === 'month') {
    let cursor = addMonthsUtc(endExclusive, -count);
    for (let i = 0; i < count; i += 1) {
      const start = addMonthsUtc(cursor, i);
      const end = addMonthsUtc(start, 1);
      buckets.push({
        start,
        end,
        startMs: start.getTime(),
        endMs: end.getTime(),
        label: monthShortFormatter.format(start)
      });
    }
  }
  return buckets;
};

const determineTrend = (current, previous) => {
  const curr = clampNumber(current);
  const prev = clampNumber(previous);
  if (curr > prev) return 'up';
  if (curr < prev) return 'down';
  return 'flat';
};

const computePeriodContext = (period, referenceDate = new Date()) => {
  const reference = startOfUtcDay(referenceDate);
  if (period === 'daily') {
    const endExclusive = reference;
    const start = addDaysUtc(endExclusive, -1);
    const previousStart = addDaysUtc(start, -1);
    const previousEndExclusive = start;
    const rangeLabel = fullDateFormatter.format(start);
    const previousLabel = fullDateFormatter.format(previousStart);
    const key = toDateISO(start);
    const timelineBuckets = buildTimelineBuckets('day', 7, endExclusive);
    return {
      period,
      key,
      start,
      endExclusive,
      previousStart,
      previousEndExclusive,
      label: `Дневной отчёт за ${rangeLabel}`,
      rangeLabel,
      previousLabel,
      timelineBuckets,
      timelineStart: timelineBuckets.length ? timelineBuckets[0].start : start,
      timelineEndExclusive: timelineBuckets.length ? timelineBuckets[timelineBuckets.length - 1].end : endExclusive,
      rangeStartString: toDateISO(start),
      rangeEndString: toDateISO(addDaysUtc(endExclusive, -1)),
      previousStartString: toDateISO(previousStart),
      previousEndString: toDateISO(addDaysUtc(previousEndExclusive, -1))
    };
  }
  if (period === 'weekly') {
    const day = reference.getUTCDay() || 7;
    const currentWeekStart = addDaysUtc(reference, -(day - 1));
    const endExclusive = currentWeekStart;
    const start = addDaysUtc(endExclusive, -7);
    const previousStart = addDaysUtc(start, -7);
    const previousEndExclusive = start;
    const rangeLabel = formatRangeLabel(start, endExclusive);
    const previousLabel = formatRangeLabel(previousStart, previousEndExclusive);
    const key = isoWeekKey(start);
    const timelineBuckets = buildTimelineBuckets('week', 8, endExclusive);
    return {
      period,
      key,
      start,
      endExclusive,
      previousStart,
      previousEndExclusive,
      label: `Недельный отчёт (${rangeLabel})`,
      rangeLabel,
      previousLabel,
      timelineBuckets,
      timelineStart: timelineBuckets.length ? timelineBuckets[0].start : start,
      timelineEndExclusive: timelineBuckets.length ? timelineBuckets[timelineBuckets.length - 1].end : endExclusive,
      rangeStartString: toDateISO(start),
      rangeEndString: toDateISO(addDaysUtc(endExclusive, -1)),
      previousStartString: toDateISO(previousStart),
      previousEndString: toDateISO(addDaysUtc(previousEndExclusive, -1))
    };
  }
  if (period === 'monthly') {
    const currentMonthStart = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    const endExclusive = currentMonthStart;
    const start = addMonthsUtc(endExclusive, -1);
    const previousStart = addMonthsUtc(start, -1);
    const previousEndExclusive = start;
    const rangeLabel = monthLongFormatter.format(start);
    const previousLabel = monthLongFormatter.format(previousStart);
    const key = `${start.getUTCFullYear()}-${(start.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    const timelineBuckets = buildTimelineBuckets('month', 6, endExclusive);
    return {
      period,
      key,
      start,
      endExclusive,
      previousStart,
      previousEndExclusive,
      label: `Месячный отчёт за ${rangeLabel}`,
      rangeLabel,
      previousLabel,
      timelineBuckets,
      timelineStart: timelineBuckets.length ? timelineBuckets[0].start : start,
      timelineEndExclusive: timelineBuckets.length ? timelineBuckets[timelineBuckets.length - 1].end : endExclusive,
      rangeStartString: toDateISO(start),
      rangeEndString: toDateISO(addDaysUtc(endExclusive, -1)),
      previousStartString: toDateISO(previousStart),
      previousEndString: toDateISO(addDaysUtc(previousEndExclusive, -1))
    };
  }
  throw new Error('unknown_period');
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return ts;
};

const buildTimelineFromEvents = (buckets, events) =>
  buckets.map((bucket) => {
    let total = 0;
    for (const event of events) {
      if (event.ts >= bucket.startMs && event.ts < bucket.endMs) {
        total += event.value ?? 1;
      }
    }
    const endInclusive = addDaysUtc(bucket.end, -1);
    return {
      label: bucket.label,
      start: toDateISO(bucket.start),
      end: toDateISO(endInclusive),
      value: total
    };
  });

const buildFitnessSection = async (db, userId, context) => {
  const rangeStart = context.rangeStartString;
  const rangeEnd = context.rangeEndString;
  const previousStart = context.previousStartString;
  const previousEnd = context.previousEndString;

  const timelineStartIso = context.timelineBuckets.length
    ? context.timelineStart.toISOString().slice(0, 10)
    : null;
  const timelineEndIso = context.timelineBuckets.length
    ? addDaysUtc(context.timelineEndExclusive, -1).toISOString().slice(0, 10)
    : null;

  const timelinePromise = timelineStartIso && timelineEndIso
    ? db.all(
        'SELECT date, steps FROM fitness_activity WHERE user_id=? AND date BETWEEN ? AND ?',
        [userId, timelineStartIso, timelineEndIso]
      )
    : Promise.resolve([]);

  const [
    currentActivityRows,
    previousActivityRows,
    currentHeartRows,
    previousHeartRows,
    currentSleepRows,
    previousSleepRows,
    timelineActivityRows
  ] = await Promise.all([
    db.all(
      'SELECT date, steps, calories, distance, move_minutes, active_minutes FROM fitness_activity WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, rangeStart, rangeEnd]
    ),
    db.all(
      'SELECT date, steps, calories, distance, move_minutes, active_minutes FROM fitness_activity WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, previousStart, previousEnd]
    ),
    db.all(
      'SELECT date, avg_bpm, min_bpm, max_bpm FROM fitness_heart_rate WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, rangeStart, rangeEnd]
    ),
    db.all(
      'SELECT date, avg_bpm, min_bpm, max_bpm FROM fitness_heart_rate WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, previousStart, previousEnd]
    ),
    db.all(
      'SELECT date, duration_minutes, deep_minutes, light_minutes, rem_minutes, awake_minutes FROM fitness_sleep WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, rangeStart, rangeEnd]
    ),
    db.all(
      'SELECT date, duration_minutes, deep_minutes, light_minutes, rem_minutes, awake_minutes FROM fitness_sleep WHERE user_id=? AND date BETWEEN ? AND ?',
      [userId, previousStart, previousEnd]
    ),
    timelinePromise
  ]);

  const sumColumn = (rows, column) =>
    rows.reduce((acc, row) => acc + (Number(row?.[column]) || 0), 0);

  const avgHeartFromRows = (rows) => {
    const values = rows
      .map((row) => Number(row?.avg_bpm))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!values.length) return 0;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  };

  const heartValuesCurrent = currentHeartRows
    .map((row) => Number(row?.avg_bpm))
    .filter((value) => Number.isFinite(value) && value > 0);

  const daysCurrent = Math.max(
    1,
    Math.round((context.endExclusive.getTime() - context.start.getTime()) / MS_DAY)
  );
  const daysPrevious = Math.max(
    1,
    Math.round(
      (context.previousEndExclusive.getTime() - context.previousStart.getTime()) / MS_DAY
    )
  );

  const totalStepsCurrent = sumColumn(currentActivityRows, 'steps');
  const totalStepsPrevious = sumColumn(previousActivityRows, 'steps');
  const avgStepsCurrent = totalStepsCurrent / daysCurrent;
  const avgStepsPrevious = totalStepsPrevious / daysPrevious;

  const totalCaloriesCurrent = sumColumn(currentActivityRows, 'calories');
  const totalCaloriesPrevious = sumColumn(previousActivityRows, 'calories');
  const avgCaloriesCurrent = totalCaloriesCurrent / daysCurrent;
  const avgCaloriesPrevious = totalCaloriesPrevious / daysPrevious;

  const totalDistanceCurrent = sumColumn(currentActivityRows, 'distance');
  const totalDistancePrevious = sumColumn(previousActivityRows, 'distance');
  const avgDistanceCurrent = totalDistanceCurrent / daysCurrent;
  const avgDistancePrevious = totalDistancePrevious / daysPrevious;

  const totalSleepMinutesCurrent = sumColumn(currentSleepRows, 'duration_minutes');
  const totalSleepMinutesPrevious = sumColumn(previousSleepRows, 'duration_minutes');
  const avgSleepMinutesCurrent = totalSleepMinutesCurrent / daysCurrent;
  const avgSleepMinutesPrevious = totalSleepMinutesPrevious / daysPrevious;
  const avgSleepHoursCurrent = avgSleepMinutesCurrent / 60;
  const avgSleepHoursPrevious = avgSleepMinutesPrevious / 60;

  const deepMinutesCurrent = sumColumn(currentSleepRows, 'deep_minutes');
  const remMinutesCurrent = sumColumn(currentSleepRows, 'rem_minutes');

  const avgHeartCurrent = avgHeartFromRows(currentHeartRows);
  const avgHeartPrevious = avgHeartFromRows(previousHeartRows);
  const minHeartCurrent = heartValuesCurrent.length
    ? Math.min(...heartValuesCurrent)
    : null;
  const maxHeartCurrent = heartValuesCurrent.length
    ? Math.max(...heartValuesCurrent)
    : null;

  const avgMoveMinutesCurrent = sumColumn(currentActivityRows, 'move_minutes') / daysCurrent;

  const stepsDiff = avgStepsCurrent - avgStepsPrevious;
  const caloriesDiff = avgCaloriesCurrent - avgCaloriesPrevious;
  const sleepDiffHours = avgSleepHoursCurrent - avgSleepHoursPrevious;
  const heartDiff = avgHeartCurrent - avgHeartPrevious;
  const distanceDiff = avgDistanceCurrent - avgDistancePrevious;

  const summaryParts = [];
  if (avgStepsCurrent > 0) {
    summaryParts.push(
      `Шаги: ${formatNumber(avgStepsCurrent)} в день (${formatSigned(stepsDiff)} шагов).`
    );
  }
  if (avgCaloriesCurrent > 0) {
    summaryParts.push(
      `Калории: ${formatNumber(avgCaloriesCurrent)} ккал/день (${formatSigned(caloriesDiff)} ккал).`
    );
  }
  if (avgSleepMinutesCurrent > 0) {
    summaryParts.push(
      `Сон: ${formatDecimal(avgSleepHoursCurrent)} ч (${formatSignedDecimal(sleepDiffHours)} ч).`
    );
  }
  if (avgHeartCurrent > 0) {
    summaryParts.push(
      `Пульс: ${formatNumber(avgHeartCurrent)} уд./мин (${formatSigned(heartDiff)}).`
    );
  }
  const summaryMessage = summaryParts.length
    ? summaryParts.join(' ')
    : 'Данные Google Fit за период отсутствуют.';

  const stepsMessage = avgStepsCurrent > 0
    ? `Среднее значение ${formatNumber(avgStepsCurrent)} шагов/день (${formatSigned(stepsDiff)}). ` +
      (avgDistanceCurrent > 0
        ? `Дистанция ~${formatDecimal(avgDistanceCurrent, 1)} км/день.`
        : '')
    : 'Шаги не записаны.';

  const caloriesMessage = avgCaloriesCurrent > 0
    ? `Калории ${formatNumber(avgCaloriesCurrent)} ккал/день (${formatSigned(caloriesDiff)}).`
    : 'Расход калорий не фиксировался.';

  const deepHoursAvg = deepMinutesCurrent > 0 ? deepMinutesCurrent / daysCurrent / 60 : 0;
  const remHoursAvg = remMinutesCurrent > 0 ? remMinutesCurrent / daysCurrent / 60 : 0;

  const sleepFragments = [];
  if (deepHoursAvg > 0) sleepFragments.push(`глубокий ${formatDecimal(deepHoursAvg, 1)} ч`);
  if (remHoursAvg > 0) sleepFragments.push(`REM ${formatDecimal(remHoursAvg, 1)} ч`);

  const sleepMessage = avgSleepMinutesCurrent > 0
    ? `Сон ${formatDecimal(avgSleepHoursCurrent)} ч/ночь (${formatSignedDecimal(sleepDiffHours)} ч)` +
      (sleepFragments.length ? ` (${sleepFragments.join(', ')})` : '')
    : 'Сон не отслеживался.';

  const heartMessage = avgHeartCurrent > 0
    ? `Средний пульс ${formatNumber(avgHeartCurrent)} уд./мин (${formatSigned(heartDiff)}).` +
      (minHeartCurrent !== null && maxHeartCurrent !== null
        ? ` Диапазон ${formatNumber(minHeartCurrent)}–${formatNumber(maxHeartCurrent)}.`
        : '')
    : 'Пульс не зафиксирован.';

  const distanceMessage = avgDistanceCurrent > 0
    ? `Дистанция ${formatDecimal(avgDistanceCurrent, 1)} км/день (${formatSignedDecimal(distanceDiff, 1)} км).`
    : 'Дистанция не фиксировалась.';

  const items = [
    {
      id: 'steps',
      name: 'Шаги',
      current: Math.round(avgStepsCurrent),
      previous: Math.round(avgStepsPrevious),
      difference: Math.round(stepsDiff),
      trend: determineTrend(avgStepsCurrent, avgStepsPrevious),
      unit: 'шагов/день',
      message: stepsMessage.trim()
    },
    {
      id: 'calories',
      name: 'Активные калории',
      current: Math.round(avgCaloriesCurrent),
      previous: Math.round(avgCaloriesPrevious),
      difference: Math.round(caloriesDiff),
      trend: determineTrend(avgCaloriesCurrent, avgCaloriesPrevious),
      unit: 'ккал/день',
      message: caloriesMessage.trim()
    },
    {
      id: 'sleep',
      name: 'Сон',
      current: Math.round(avgSleepMinutesCurrent),
      previous: Math.round(avgSleepMinutesPrevious),
      difference: Math.round(avgSleepMinutesCurrent - avgSleepMinutesPrevious),
      trend: determineTrend(avgSleepMinutesCurrent, avgSleepMinutesPrevious),
      unit: 'мин/ночь',
      message: sleepMessage.trim()
    }
  ];

  if (avgHeartCurrent > 0 || avgHeartPrevious > 0) {
    items.push({
      id: 'heart',
      name: 'Пульс',
      current: Math.round(avgHeartCurrent),
      previous: Math.round(avgHeartPrevious),
      difference: Math.round(heartDiff),
      trend: determineTrend(avgHeartCurrent, avgHeartPrevious),
      unit: 'уд./мин',
      message: heartMessage.trim()
    });
  }

  if (avgDistanceCurrent > 0 || avgDistancePrevious > 0) {
    items.push({
      id: 'distance',
      name: 'Дистанция',
      current: Math.round(avgDistanceCurrent),
      previous: Math.round(avgDistancePrevious),
      difference: Math.round(distanceDiff),
      trend: determineTrend(avgDistanceCurrent, avgDistancePrevious),
      unit: 'км/день',
      message: distanceMessage.trim()
    });
  }

  const bestStepsDay = currentActivityRows.reduce((best, row) => {
    const steps = Number(row?.steps || 0);
    if (!best || steps > best.steps) return { date: row.date, steps };
    return best;
  }, null);

  const longestSleep = currentSleepRows.reduce((best, row) => {
    const minutes = Number(row?.duration_minutes || 0);
    if (!best || minutes > best.minutes) return { date: row.date, minutes };
    return best;
  }, null);

  const insights = [];
  if (Math.abs(stepsDiff) >= 100) {
    insights.push(
      stepsDiff > 0
        ? `Шаги выросли на ${formatNumber(stepsDiff)} в день.`
        : `Шагов стало меньше на ${formatNumber(Math.abs(stepsDiff))} в день.`
    );
  }
  if (Math.abs(sleepDiffHours) >= 0.25) {
    insights.push(
      sleepDiffHours > 0
        ? `Сон увеличился на ${formatDecimal(sleepDiffHours, 1)} ч за ночь.`
        : `Сон сократился на ${formatDecimal(Math.abs(sleepDiffHours), 1)} ч за ночь.`
    );
  }
  if (avgMoveMinutesCurrent > 0) {
    insights.push(
      `Активность: ${formatNumber(avgMoveMinutesCurrent)} мин/день движения.`
    );
  }
  if (bestStepsDay && bestStepsDay.steps > 0) {
    const label = shortDateFormatter.format(
      new Date(`${bestStepsDay.date}T00:00:00Z`)
    );
    insights.push(`Рекорд по шагам — ${label}: ${formatNumber(bestStepsDay.steps)}.`);
  }
  if (longestSleep && longestSleep.minutes > 0) {
    const label = shortDateFormatter.format(
      new Date(`${longestSleep.date}T00:00:00Z`)
    );
    insights.push(
      `Самый долгий сон — ${label}: ${formatDecimal(longestSleep.minutes / 60, 1)} ч.`
    );
  }

  const timelineEvents = [];
  for (const row of timelineActivityRows) {
    const ts = parseTimestamp(`${row.date}T00:00:00Z`);
    if (ts === null) continue;
    timelineEvents.push({ ts, value: Number(row?.steps || 0) });
  }
  const timeline = buildTimelineFromEvents(context.timelineBuckets, timelineEvents);

  return {
    key: 'fitness',
    title: 'Фитнес',
    subtitle: 'Активность, сон и пульс',
    unit: 'шагов/день',
    summary: {
      current: Math.round(avgStepsCurrent),
      previous: Math.round(avgStepsPrevious),
      difference: Math.round(stepsDiff),
      trend: determineTrend(avgStepsCurrent, avgStepsPrevious),
      message: summaryMessage
    },
    items,
    timeline,
    insights: insights.filter((line) => line && line.trim().length > 0).slice(0, 6)
  };
};

const buildLanguageSection = async (db, userId, context) => {
  const languages = await db.all(
    "SELECT id, name FROM languages WHERE user_id=? AND (archived_at IS NULL OR archived_at='') AND COALESCE(status,'active') <> 'archived' ORDER BY name COLLATE NOCASE",
    [userId]
  );
  const courseRows = await db.all(
    'SELECT id, language_id, progress FROM courses WHERE user_id=? AND archived_at IS NULL',
    [userId]
  );
  const logsByCourse = await prepareCourseLogs(db, userId, context.timelineEndExclusive);

  const currentCounts = new Map();
  const previousCounts = new Map();
  const totalsByLanguage = new Map();
  const timelineEvents = [];

  const startMs = context.start.getTime();
  const endMs = context.endExclusive.getTime();
  const previousStartMs = context.previousStart.getTime();
  const previousEndMs = context.previousEndExclusive.getTime();
  const timelineStartMs = context.timelineStart.getTime();
  const timelineEndMs = context.timelineEndExclusive.getTime();

  for (const course of courseRows) {
    const languageId = course.language_id;
    if (!languageId) continue;
    const normalizedProgress = normalizeCourseProgress(course.progress);
    const totals = totalsByLanguage.get(languageId) || { total: 0, completed: 0 };
    totals.total += 1;
    if (normalizedProgress >= 100) totals.completed += 1;
    totalsByLanguage.set(languageId, totals);

    const logs = logsByCourse.get(course.id) || [];
    let previousProgress = 0;
    for (const entry of logs) {
      if (entry.progress >= 100 && previousProgress < 100) {
        const ts = entry.ts;
        if (ts >= startMs && ts < endMs) {
          currentCounts.set(languageId, (currentCounts.get(languageId) || 0) + 1);
        }
        if (ts >= previousStartMs && ts < previousEndMs) {
          previousCounts.set(languageId, (previousCounts.get(languageId) || 0) + 1);
        }
        if (ts >= timelineStartMs && ts < timelineEndMs) {
          timelineEvents.push({ ts, value: 1 });
        }
      }
      previousProgress = entry.progress;
    }
  }

  const itemsRaw = languages.map((language) => {
    const current = currentCounts.get(language.id) || 0;
    const previous = previousCounts.get(language.id) || 0;
    const difference = current - previous;
    const trend = determineTrend(current, previous);
    const totals = totalsByLanguage.get(language.id) || { total: 0, completed: 0 };
    const pct = totals.total > 0 ? Math.round((totals.completed * 100) / totals.total) : 0;
    let message = '';
    if (current > 0) {
      if (totals.total > 0) {
        message = `Завершено ${formatNumber(current)} курсов; всего выполнено ${formatNumber(totals.completed)} из ${formatNumber(totals.total)} (${formatNumber(pct)}%).`;
      } else {
        message = `Завершено ${formatNumber(current)} курсов.`;
      }
    } else if (totals.total > 0) {
      if (totals.completed > 0) {
        message = `Без новых завершений; всего выполнено ${formatNumber(totals.completed)} из ${formatNumber(totals.total)} (${formatNumber(pct)}%).`;
      } else {
        message = `Курсы не завершались; запланировано ${formatNumber(totals.total)} курсов.`;
      }
    } else {
      message = 'Нет закреплённых курсов.';
    }
    return {
      id: language.id,
      name: language.name,
      current,
      previous,
      difference,
      trend,
      total: pct,
      message
    };
  });

  const filteredItems = itemsRaw
    .filter((item) => item.current > 0 || item.previous > 0)
    .sort((a, b) => b.current - a.current || b.total - a.total || a.name.localeCompare(b.name));

  const items = filteredItems.slice(0, 8);

  const totalCurrent = itemsRaw.reduce((acc, item) => acc + item.current, 0);
  const totalPrevious = itemsRaw.reduce((acc, item) => acc + item.previous, 0);
  const difference = totalCurrent - totalPrevious;
  const totalCoursesOverall = courseRows.filter((course) => course.language_id).length;

  let summaryMessage = '';
  if (totalCoursesOverall === 0) {
    summaryMessage = 'Закреплённых курсов по языкам нет.';
  } else if (totalCurrent === 0 && totalPrevious === 0) {
    summaryMessage = 'Курсы не завершались в текущем и прошлом периодах.';
  } else if (totalCurrent === 0) {
    summaryMessage = `Завершённых курсов нет (на ${formatNumber(totalPrevious)} меньше, чем ранее).`;
  } else if (difference > 0) {
    summaryMessage = `Завершено ${formatNumber(totalCurrent)} курсов (+${formatNumber(difference)} к прошлому периоду).`;
  } else if (difference < 0) {
    summaryMessage = `Завершено ${formatNumber(totalCurrent)} курсов (на ${formatNumber(Math.abs(difference))} меньше, чем ранее).`;
  } else {
    summaryMessage = `Завершено ${formatNumber(totalCurrent)} курсов — на уровне прошлого периода.`;
  }

  const improved = itemsRaw
    .filter((item) => item.current > 0)
    .sort((a, b) => b.current - a.current || b.total - a.total);
  const unfinished = itemsRaw.filter((item) => {
    const totals = totalsByLanguage.get(item.id) || { total: 0, completed: 0 };
    return totals.total > 0 && totals.completed < totals.total && item.current === 0;
  });
  const fullyCompleted = itemsRaw.filter((item) => {
    const totals = totalsByLanguage.get(item.id) || { total: 0, completed: 0 };
    return totals.total > 0 && totals.completed === totals.total;
  });

  const insights = [];
  if (improved.length) {
    const top = improved[0];
    insights.push(`Больше всего завершений по языку «${top.name}»: ${formatNumber(top.current)}.`);
  }
  if (unfinished.length) {
    const listed = unfinished.map((item) => item.name).slice(0, 3).join(', ');
    insights.push(`Без завершений в этом периоде: ${listed}${unfinished.length > 3 ? ' и другие' : ''}.`);
  }
  if (fullyCompleted.length) {
    const listed = fullyCompleted.map((item) => item.name).slice(0, 3).join(', ');
    insights.push(`Курсы полностью закрыты по: ${listed}${fullyCompleted.length > 3 ? ' и другие' : ''}.`);
  }

  const timeline = buildTimelineFromEvents(context.timelineBuckets, timelineEvents);

  return {
    key: 'languages',
    title: 'Языки',
    subtitle: 'Завершённые курсы',
    unit: 'курсов',
    summary: {
      current: totalCurrent,
      previous: totalPrevious,
      difference,
      trend: determineTrend(totalCurrent, totalPrevious),
      message: summaryMessage
    },
    items,
    timeline,
    insights
  };
};

const prepareCourseLogs = async (db, userId, timelineEndExclusive) => {
  const rows = await db.all(
    'SELECT course_id, progress, logged_at FROM course_progress_logs WHERE user_id=? AND logged_at IS NOT NULL AND logged_at<? ORDER BY logged_at ASC',
    [userId, timelineEndExclusive.toISOString()]
  );
  const map = new Map();
  for (const row of rows) {
    const ts = parseTimestamp(row.logged_at);
    if (ts === null) continue;
    const progress = normalizeCourseProgress(row.progress);
    if (!map.has(row.course_id)) map.set(row.course_id, []);
    map.get(row.course_id).push({ progress, ts });
  }
  return map;
};

const getProgressAt = (logs, targetMs) => {
  if (!logs || logs.length === 0) return 0;
  let value = null;
  for (const entry of logs) {
    if (entry.ts < targetMs) {
      value = entry.progress;
    } else {
      break;
    }
  }
  return value === null ? 0 : value;
};

const getProgressDelta = (logs, startMs, endMs) => {
  const startValue = getProgressAt(logs, startMs);
  const endValue = getProgressAt(logs, endMs);
  return endValue - startValue;
};

const buildCourseTimeline = (buckets, logsByCourse) =>
  buckets.map((bucket) => {
    let total = 0;
    for (const logs of logsByCourse.values()) {
      total += getProgressDelta(logs, bucket.startMs, bucket.endMs);
    }
    const endInclusive = addDaysUtc(bucket.end, -1);
    return {
      label: bucket.label,
      start: toDateISO(bucket.start),
      end: toDateISO(endInclusive),
      value: total
    };
  });

const buildCourseSection = async (db, userId, context) => {
  const courses = await db.all(
    "SELECT id, title, progress, status, archived_at FROM courses WHERE user_id=? AND archived_at IS NULL ORDER BY title COLLATE NOCASE",
    [userId]
  );
  const logsByCourse = await prepareCourseLogs(db, userId, context.timelineEndExclusive);

  const itemsRaw = courses.map((course) => {
    const logs = logsByCourse.get(course.id) || [];
    const currentDelta = getProgressDelta(logs, context.start.getTime(), context.endExclusive.getTime());
    const previousDelta = getProgressDelta(logs, context.previousStart.getTime(), context.previousEndExclusive.getTime());
    const difference = currentDelta - previousDelta;
    const trend = determineTrend(currentDelta, previousDelta);
    const currentTotal = normalizeCourseProgress(course.progress);
    let message = '';
    if (currentDelta > 0) {
      message = `Прогресс за период: +${formatNumber(currentDelta)} п.п. (итого ${formatNumber(currentTotal)}%).`;
    } else if (currentDelta < 0) {
      message = `Прогресс уменьшился на ${formatNumber(Math.abs(currentDelta))} п.п.`;
    } else if (currentTotal === 0) {
      message = 'Продвижения нет, курс не начинался.';
    } else {
      message = `Прогресс без изменений (${formatNumber(currentTotal)}%).`;
    }
    return {
      id: course.id,
      name: course.title,
      current: currentDelta,
      previous: previousDelta,
      difference,
      trend,
      total: currentTotal,
      message
    };
  });

  const filteredItems = itemsRaw
    .filter((item) => item.current !== 0 || item.previous !== 0)
    .sort((a, b) => b.current - a.current || b.total - a.total || a.name.localeCompare(b.name));

  const items = filteredItems.slice(0, 8);

  const totalCurrent = itemsRaw.reduce((acc, item) => acc + item.current, 0);
  const totalPrevious = itemsRaw.reduce((acc, item) => acc + item.previous, 0);
  const difference = totalCurrent - totalPrevious;
  let summaryMessage = '';
  if (courses.length === 0) {
    summaryMessage = 'Активных курсов нет.';
  } else if (totalCurrent === 0 && totalPrevious === 0) {
    summaryMessage = 'Продвижения по курсам не зафиксировано.';
  } else if (difference > 0) {
    summaryMessage = `Суммарный прогресс: +${formatNumber(totalCurrent)} п.п. (${formatSigned(difference)} к прошлому периоду).`;
  } else if (difference < 0) {
    summaryMessage = `Суммарный прогресс уменьшился на ${formatNumber(Math.abs(difference))} п.п.`;
  } else {
    summaryMessage = `Продвижение за период: ${formatNumber(totalCurrent)} п.п. — на уровне прошлого периода.`;
  }

  const improved = itemsRaw
    .filter((item) => item.current > 0)
    .sort((a, b) => b.current - a.current);
  const declined = itemsRaw
    .filter((item) => item.current < 0)
    .sort((a, b) => a.current - b.current);
  const stagnant = itemsRaw.filter((item) => item.current === 0);

  const insights = [];
  if (improved.length) {
    const top = improved[0];
    insights.push(`Лучшее продвижение: «${top.name}» (+${formatNumber(top.current)} п.п.).`);
  }
  if (declined.length) {
    const worst = declined[0];
    insights.push(`Прогресс снизился в курсе «${worst.name}» на ${formatNumber(Math.abs(worst.current))} п.п.`);
  }
  if (stagnant.length) {
    const listed = stagnant.map((item) => item.name).slice(0, 3).join(', ');
    insights.push(`Без продвижения: ${listed}${stagnant.length > 3 ? ' и другие' : ''}.`);
  }

  const timeline = buildCourseTimeline(context.timelineBuckets, logsByCourse);

  return {
    key: 'courses',
    title: 'Курсы',
    subtitle: 'Прогресс обучения',
    unit: 'п.п.',
    summary: {
      current: totalCurrent,
      previous: totalPrevious,
      difference,
      trend: determineTrend(totalCurrent, totalPrevious),
      message: summaryMessage
    },
    items,
    timeline,
    insights
  };
};

const buildGoalsSection = async (db, userId, context) => {
  const goals = await db.all(
    "SELECT id, title, target, completed, status FROM yearly_goals WHERE user_id=? AND COALESCE(status,'active') <> 'archived' ORDER BY created_at DESC",
    [userId]
  );

  const currentRows = await db.all(
    'SELECT goal_id, COUNT(*) AS count FROM yearly_goal_logs WHERE user_id=? AND date BETWEEN ? AND ? GROUP BY goal_id',
    [userId, context.rangeStartString, context.rangeEndString]
  );
  const previousRows = await db.all(
    'SELECT goal_id, COUNT(*) AS count FROM yearly_goal_logs WHERE user_id=? AND date BETWEEN ? AND ? GROUP BY goal_id',
    [userId, context.previousStartString, context.previousEndString]
  );
  const timelineRows = await db.all(
    'SELECT goal_id, date FROM yearly_goal_logs WHERE user_id=? AND date BETWEEN ? AND ?',
    [
      userId,
      context.timelineStart.toISOString().slice(0, 10),
      addDaysUtc(context.timelineEndExclusive, -1).toISOString().slice(0, 10)
    ]
  );

  const currentMap = new Map();
  for (const row of currentRows) {
    currentMap.set(row.goal_id, Number(row.count) || 0);
  }
  const previousMap = new Map();
  for (const row of previousRows) {
    previousMap.set(row.goal_id, Number(row.count) || 0);
  }

  const timelineEvents = [];
  for (const row of timelineRows) {
    const ts = parseTimestamp(`${row.date}T00:00:00Z`);
    if (ts === null) continue;
    timelineEvents.push({ ts, value: 1 });
  }

  const itemsRaw = goals.map((goal) => {
    const current = currentMap.get(goal.id) || 0;
    const previous = previousMap.get(goal.id) || 0;
    const difference = current - previous;
    const trend = determineTrend(current, previous);
    const target = Math.max(0, Number(goal.target) || 0);
    const completed = Math.max(0, Number(goal.completed) || 0);
    const pct = target > 0 ? Math.min(100, Math.round((completed * 100) / target)) : 0;
    let message = '';
    if (current > 0) {
      if (target > 0) {
        message = `Добавлено ${formatNumber(current)} отметок; прогресс ${formatNumber(pct)}% (${formatNumber(completed)} из ${formatNumber(target)}).`;
      } else {
        message = `Добавлено ${formatNumber(current)} отметок.`;
      }
    } else if (target > 0) {
      message = `Без отметок; прогресс ${formatNumber(pct)}% (${formatNumber(completed)} из ${formatNumber(target)}).`;
    } else {
      message = 'Отметки не добавлены.';
    }
    return {
      id: goal.id,
      name: goal.title,
      current,
      previous,
      difference,
      trend,
      total: pct,
      message
    };
  });

  const filteredItems = itemsRaw
    .filter((item) => item.current > 0 || item.previous > 0)
    .sort((a, b) => b.current - a.current || b.total - a.total || a.name.localeCompare(b.name));

  const items = filteredItems.slice(0, 8);

  const totalCurrent = itemsRaw.reduce((acc, item) => acc + item.current, 0);
  const totalPrevious = itemsRaw.reduce((acc, item) => acc + item.previous, 0);
  const difference = totalCurrent - totalPrevious;
  let summaryMessage = '';
  if (goals.length === 0) {
    summaryMessage = 'Годовые цели не настроены.';
  } else if (totalCurrent === 0 && totalPrevious === 0) {
    summaryMessage = 'Отметок по целям не добавлено.';
  } else if (difference > 0) {
    summaryMessage = `Всего ${formatNumber(totalCurrent)} отметок по целям (+${formatNumber(difference)} к прошлому периоду).`;
  } else if (difference < 0) {
    summaryMessage = `Отметок стало меньше на ${formatNumber(Math.abs(difference))}.`;
  } else {
    summaryMessage = `Отметок за период: ${formatNumber(totalCurrent)} — на уровне прошлого периода.`;
  }

  const improved = itemsRaw
    .filter((item) => item.current > 0)
    .sort((a, b) => b.current - a.current);
  const stagnant = itemsRaw.filter((item) => item.current === 0);

  const insights = [];
  if (improved.length) {
    const top = improved[0];
    insights.push(`Больше всего прогресса в цели «${top.name}»: +${formatNumber(top.current)} отметок.`);
  }
  if (stagnant.length) {
    const listed = stagnant.map((item) => item.name).slice(0, 3).join(', ');
    insights.push(`Без отметок: ${listed}${stagnant.length > 3 ? ' и другие' : ''}.`);
  }

  const timeline = buildTimelineFromEvents(context.timelineBuckets, timelineEvents);

  return {
    key: 'goals',
    title: 'Годовые цели',
    subtitle: 'Выполнение планов',
    unit: 'отметок',
    summary: {
      current: totalCurrent,
      previous: totalPrevious,
      difference,
      trend: determineTrend(totalCurrent, totalPrevious),
      message: summaryMessage
    },
    items,
    timeline,
    insights
  };
};

const generateReportData = async (db, userId, context) => {
  const [fitness, languages, courses, goals] = await Promise.all([
    buildFitnessSection(db, userId, context),
    buildLanguageSection(db, userId, context),
    buildCourseSection(db, userId, context),
    buildGoalsSection(db, userId, context)
  ]);

  const highlights = [
    fitness.summary.message,
    languages.summary.message,
    courses.summary.message,
    goals.summary.message,
    ...fitness.insights.slice(0, 2),
    ...languages.insights.slice(0, 2),
    ...courses.insights.slice(0, 2),
    ...goals.insights.slice(0, 2)
  ].filter((line) => line && String(line).trim().length > 0);

  const nowIso = new Date().toISOString();

  return {
    period: context.period,
    period_key: context.key,
    period_label: context.label,
    period_description: `Промежуток: ${context.rangeLabel}`,
    generated_at: nowIso,
    range: {
      start: context.rangeStartString,
      end: context.rangeEndString,
      label: context.rangeLabel
    },
    previous_range: {
      start: context.previousStartString,
      end: context.previousEndString,
      label: context.previousLabel
    },
    highlights: highlights.slice(0, 8),
    sections: {
      fitness,
      languages,
      courses,
      goals
    }
  };
};

const normalizeStoredReport = (raw, context, fallbackGeneratedAt, reportId) => {
  const report = raw && typeof raw === 'object' ? { ...raw } : {};
  report.period = report.period || context.period;
  report.period_key = report.period_key || context.key;
  report.period_label = report.period_label || context.label;
  report.period_description = report.period_description || `Промежуток: ${context.rangeLabel}`;
  report.generated_at = report.generated_at || fallbackGeneratedAt || new Date().toISOString();
  report.report_id = reportId ?? report.report_id ?? null;
  report.range = report.range || { start: context.rangeStartString, end: context.rangeEndString, label: context.rangeLabel };
  report.previous_range = report.previous_range || {
    start: context.previousStartString,
    end: context.previousEndString,
    label: context.previousLabel
  };
  if (!Array.isArray(report.highlights)) report.highlights = [];
  if (!report.sections || typeof report.sections !== 'object') {
    report.sections = { fitness: null, languages: null, courses: null, goals: null };
  }
  if (!('languages' in report.sections)) report.sections.languages = null;
  if (!('courses' in report.sections)) report.sections.courses = null;
  if (!('goals' in report.sections)) report.sections.goals = null;
  if (!('fitness' in report.sections)) report.sections.fitness = null;
  return report;
};

router.get('/reports/period', async (req, res) => {
  const rawPeriod = typeof req.query?.period === 'string' ? req.query.period.trim().toLowerCase() : 'daily';
  if (!REPORT_PERIODS.has(rawPeriod)) {
    return res.status(400).json({ error: 'invalid_period' });
  }

  const force = req.query?.force === '1' || req.query?.force === 'true';
  let referenceDate = new Date();
  if (typeof req.query?.date === 'string' && req.query.date.trim().length > 0) {
    const parsed = Date.parse(`${req.query.date.trim()}T00:00:00Z`);
    if (!Number.isNaN(parsed)) {
      referenceDate = new Date(parsed);
    }
  }

  const context = computePeriodContext(rawPeriod, referenceDate);
  const db = await getDB();

  let stored = await db.get(
    'SELECT id, data, generated_at FROM progress_reports WHERE user_id=? AND period=? AND period_key=?',
    [req.user.uid, rawPeriod, context.key]
  );

  let reportData = null;
  if (!force && stored && typeof stored.data === 'string') {
    try {
      const parsed = JSON.parse(stored.data);
      reportData = normalizeStoredReport(parsed, context, stored.generated_at, stored.id);
    } catch {
      reportData = null;
    }
  }

  if (!reportData) {
    reportData = await generateReportData(db, req.user.uid, context);
    // Пустые отчёты не храним: только те, где есть хоть какая-то активность
    if (!reportHasActivity(reportData)) {
      if (stored) await db.run('DELETE FROM progress_reports WHERE id=?', [stored.id]);
      return res.json({ period: rawPeriod, period_key: context.key, period_label: context.label, report_id: null, empty: true, report: reportData });
    }
    const payload = JSON.stringify(reportData);
    const nowIso = new Date().toISOString();
    await db.run(
      'INSERT INTO progress_reports(user_id, period, period_key, period_start, period_end, data, generated_at) VALUES(?,?,?,?,?,?,?) ' +
        'ON CONFLICT(user_id, period, period_key) DO UPDATE SET data=excluded.data, period_start=excluded.period_start, period_end=excluded.period_end, generated_at=excluded.generated_at',
      [req.user.uid, rawPeriod, context.key, context.rangeStartString, context.rangeEndString, payload, nowIso]
    );
    stored = await db.get(
      'SELECT id, data, generated_at FROM progress_reports WHERE user_id=? AND period=? AND period_key=?',
      [req.user.uid, rawPeriod, context.key]
    );
    reportData = normalizeStoredReport(reportData, context, stored?.generated_at || nowIso, stored?.id || null);
  }

  if (stored) {
    reportData.report_id = stored.id;
    if (stored.generated_at) {
      reportData.generated_at = stored.generated_at;
    }
  }

  res.json({
    period: rawPeriod,
    period_key: context.key,
    period_label: context.label,
    report_id: reportData.report_id || stored?.id || null,
    report: reportData
  });
});

router.get('/reports/history', async (req, res) => {
  const db = await getDB();
  const limitParam = Number.parseInt(String(req.query?.limit || ''), 10);
  const limit = Number.isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);
  let periodFilter = null;
  if (typeof req.query?.period === 'string' && req.query.period.trim().length > 0) {
    const normalized = req.query.period.trim().toLowerCase();
    if (normalized !== 'all') {
      if (!REPORT_PERIODS.has(normalized)) {
        return res.status(400).json({ error: 'invalid_period' });
      }
      periodFilter = normalized;
    }
  }

  const params = [req.user.uid];
  let sql = 'SELECT id, period, period_key, period_start, period_end, data, generated_at FROM progress_reports WHERE user_id=?';
  if (periodFilter) {
    sql += ' AND period=?';
    params.push(periodFilter);
  }
  sql += ' ORDER BY period_start DESC, generated_at DESC LIMIT ?';
  params.push(limit);

  const rows = await db.all(sql, params);
  const items = [];
  for (const row of rows) {
    if (typeof row.data !== 'string') continue;
    try {
      const parsed = JSON.parse(row.data);
      const context = computePeriodContext(row.period, new Date(`${row.period_end || row.period_start}T00:00:00Z`));
      const report = normalizeStoredReport(parsed, context, row.generated_at, row.id);
      // Старые пустые отчёты (сохранённые до этого правила) — удаляем
      if (!reportHasActivity(report)) {
        await db.run('DELETE FROM progress_reports WHERE id=?', [row.id]);
        continue;
      }
      items.push(report);
    } catch {
      // skip malformed entries
    }
  }

  res.json({ items });
});

export default router;





