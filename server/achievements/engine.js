import { getDB, levelFromXp } from '../utils.js';
import { ACTIONS_BY_KEY, MATCHABLE_ACTIONS } from './catalog.js';
import { DEFAULT_ACHIEVEMENTS } from './defaults.js';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const STATS_THROTTLE_MS = 15_000;
const lastStatsEval = new Map();

/**
 * Добавляет ачивки из стандартного набора. Каждый код добавляется один раз (журнал
 * achievement_seeds): новые ачивки из обновлений появятся сами, а удалённые админом не вернутся.
 * force — «Стандартный набор» в админке: вернуть все недостающие.
 */
export async function seedDefaultAchievements(db, { force = false } = {}) {
  await db.exec('CREATE TABLE IF NOT EXISTS achievement_seeds(code TEXT PRIMARY KEY, seeded_at TEXT)');
  const seeded = new Set((await db.all('SELECT code FROM achievement_seeds')).map((r) => r.code));
  let inserted = 0;
  const ts = new Date().toISOString();
  for (const item of DEFAULT_ACHIEVEMENTS) {
    if (!force && seeded.has(item.code)) continue;
    const result = await db.run(
      `INSERT INTO achievements(code,title,description,icon,category,action,condition_type,threshold,xp_reward,rarity,is_active,is_hidden,sort_order,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,1,0,?,?,?) ON CONFLICT(code) DO NOTHING`,
      [item.code, item.title, item.description, item.icon, item.category, item.action, item.condition_type, item.threshold, item.xp_reward, item.rarity, item.sort_order, ts, ts]
    );
    inserted += result.changes || 0;
    await db.run('INSERT INTO achievement_seeds(code, seeded_at) VALUES(?,?) ON CONFLICT(code) DO NOTHING', [item.code, ts]);
  }
  return inserted;
}

async function awardXp(db, userId, amount) {
  const safe = Math.max(0, Math.round(Number(amount) || 0));
  if (!safe) return;
  const row = (await db.get('SELECT xp FROM user_xp WHERE user_id=?', [userId])) || { xp: 0 };
  const xp = (row.xp || 0) + safe;
  const level = levelFromXp(xp);
  await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?', [userId, xp, level, xp, level]);
}

const bestStreak = (dates) => {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${sorted[i]}T00:00:00Z`).getTime();
    run = curr - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
};

/** Значение показателя для пары (action, condition_type). Кэшируется в пределах одного вызова. */
async function measure(db, userId, action, conditionType, cache) {
  const cacheKey = `${action}|${conditionType}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const def = ACTIONS_BY_KEY.get(action);
  let value = 0;
  try {
    if (def?.kind === 'stat') {
      value = Number(await def.compute(db, userId)) || 0;
    } else if (def?.kind === 'manual') {
      value = 0;
    } else if (conditionType === 'days') {
      const row = await db.get('SELECT COUNT(*) AS n FROM user_action_log WHERE user_id=? AND action=?', [userId, action]);
      value = row?.n || 0;
    } else if (conditionType === 'streak') {
      const rows = await db.all('SELECT date FROM user_action_log WHERE user_id=? AND action=?', [userId, action]);
      value = bestStreak(rows.map((r) => r.date));
    } else {
      const row = await db.get('SELECT SUM(count) AS n FROM user_action_log WHERE user_id=? AND action=?', [userId, action]);
      value = row?.n || 0;
    }
  } catch (error) {
    console.warn(`[achievements] measure ${action} failed:`, error.message);
    value = 0;
  }
  cache.set(cacheKey, value);
  return value;
}

async function unlock(db, userId, achievement) {
  const ts = new Date().toISOString();
  const result = await db.run(
    'INSERT INTO user_achievements(user_id, achievement_id, earned_at, seen) VALUES(?,?,?,0) ON CONFLICT(user_id, achievement_id) DO NOTHING',
    [userId, achievement.id, ts]
  );
  if (!result.changes) return false;
  await awardXp(db, userId, achievement.xp_reward);
  await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)', [
    userId,
    'achievement_unlocked',
    `Ачивка: ${achievement.title}`,
    achievement.description || '',
    JSON.stringify({ achievement_id: achievement.id, icon: achievement.icon, xp: achievement.xp_reward }),
    ts,
  ]);
  return true;
}

/**
 * Проверяет ачивки пользователя и выдаёт те, условия которых выполнены.
 * actions — проверить только ачивки на эти действия (плюс мета-ачивки по количеству ачивок);
 * includeStats — заодно пересчитать все stat-ачивки (с троттлингом).
 */
export async function evaluateUser(userId, { actions = null, includeStats = false, force = false } = {}) {
  const db = await getDB();
  const now = Date.now();
  const statsDue = includeStats && (force || now - (lastStatsEval.get(userId) || 0) > STATS_THROTTLE_MS);
  if (statsDue) lastStatsEval.set(userId, now);

  const candidates = await db.all(
    `SELECT a.* FROM achievements a
     WHERE a.is_active=1 AND a.action <> 'manual'
       AND NOT EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id=? AND ua.achievement_id=a.id)
     ORDER BY a.sort_order, a.id`,
    [userId]
  );

  const wanted = new Set(actions || []);
  const cache = new Map();
  const unlocked = [];

  const check = async (list) => {
    for (const achievement of list) {
      const value = await measure(db, userId, achievement.action, achievement.condition_type, cache);
      if (value >= Math.max(1, achievement.threshold || 1)) {
        if (await unlock(db, userId, achievement)) unlocked.push(achievement);
      }
    }
  };

  await check(
    candidates.filter((a) => {
      if (a.action === 'stat.achievements' || a.action === 'stat.level' || a.action === 'stat.xp_total') return false;
      // Полная проверка (statsDue) охватывает и событийные ачивки — например, созданные
      // админом уже после того, как пользователь совершил нужные действия.
      return wanted.has(a.action) || statsDue;
    })
  );

  // Мета-ачивки (уровень, XP, количество ачивок) — после выдачи остальных, т.к. зависят от них.
  if (unlocked.length || statsDue || wanted.size) {
    cache.clear();
    await check(candidates.filter((a) => ['stat.achievements', 'stat.level', 'stat.xp_total'].includes(a.action) && !unlocked.includes(a)));
  }

  return unlocked;
}

/**
 * Цели на год с автоотметкой: если сегодня действие выполнено нужное число раз —
 * отмечаем день у всех целей, привязанных к этому действию.
 */
export async function applyGoalAutoChecks(db, userId, action, date = localDate()) {
  const goals = await db.all(
    `SELECT g.id, COALESCE(g.auto_min, 1) AS auto_min FROM yearly_goals g
     WHERE g.user_id=? AND g.auto_action=? AND g.status <> 'archived'
       AND NOT EXISTS (SELECT 1 FROM yearly_goal_logs l WHERE l.goal_id=g.id AND l.date=?)`,
    [userId, action, date]
  );
  if (!goals.length) return;
  const row = await db.get('SELECT count FROM user_action_log WHERE user_id=? AND action=? AND date=?', [userId, action, date]);
  const done = row?.count || 0;
  const reached = goals.filter((goal) => done >= Math.max(1, goal.auto_min));
  if (!reached.length) return;
  // Динамический импорт: роуты life сами импортируют этот модуль
  const { recomputeGoal } = await import('../routes/life/index.js');
  for (const goal of reached) {
    await db.run('INSERT INTO yearly_goal_logs(user_id, goal_id, date) VALUES(?,?,?) ON CONFLICT(user_id, goal_id, date) DO NOTHING', [userId, goal.id, date]);
    await recomputeGoal(db, userId, goal.id);
  }
}

/** Записывает действие пользователя и проверяет связанные ачивки. Никогда не бросает исключений. */
export async function trackAction(userId, action, amount = 1) {
  if (!userId || !action) return [];
  try {
    const db = await getDB();
    const safeAmount = Math.max(1, Math.round(Number(amount) || 1));
    await db.run(
      `INSERT INTO user_action_log(user_id, action, date, count, last_at) VALUES(?,?,?,?,?)
       ON CONFLICT(user_id, action, date) DO UPDATE SET count = count + excluded.count, last_at = excluded.last_at`,
      [userId, action, localDate(), safeAmount, new Date().toISOString()]
    );
    await applyGoalAutoChecks(db, userId, action);
    return await evaluateUser(userId, { actions: [action] });
  } catch (error) {
    console.warn('[achievements] trackAction failed:', error.message);
    return [];
  }
}

export async function trackActions(userId, actions) {
  const unlocked = [];
  for (const [action, amount] of actions) {
    unlocked.push(...(await trackAction(userId, action, amount)));
  }
  return unlocked;
}

/** Действие «открыл приложение» + производные по времени суток/дню недели. */
export async function trackAppOpen(userId) {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const actions = [['app.open', 1]];
  if (hour < 5) actions.push(['app.open_night', 1]);
  if (hour >= 5 && hour < 8) actions.push(['app.open_morning', 1]);
  if (day === 0 || day === 6) actions.push(['app.open_weekend', 1]);
  return trackActions(userId, actions);
}

/**
 * Express-middleware: после успешного ответа сопоставляет запрос с каталогом
 * действий и засчитывает совпавшие. Монтируется на /api до роутеров.
 */
export function achievementTracker(req, res, next) {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const userId = req.user?.uid;
    if (!userId) return;
    const path = (req.originalUrl || '').split('?')[0];
    const matched = [];
    for (const entry of MATCHABLE_ACTIONS) {
      const { method, path: pattern, when, amount } = entry.match;
      if (method !== req.method || !pattern.test(path)) continue;
      try {
        if (when && !when(req)) continue;
        matched.push([entry.key, amount ? amount(req) : 1]);
      } catch {
        // некорректное тело запроса — просто пропускаем
      }
    }
    if (matched.length) trackActions(userId, matched).catch(() => {});
  });
  next();
}

/** Список ачивок пользователя с прогрессом для UI. */
export async function listForUser(userId) {
  const db = await getDB();
  await evaluateUser(userId, { includeStats: true });
  const rows = await db.all(
    `SELECT a.*, ua.earned_at, ua.seen
     FROM achievements a
     LEFT JOIN user_achievements ua ON ua.achievement_id=a.id AND ua.user_id=?
     WHERE a.is_active=1 OR ua.earned_at IS NOT NULL
     ORDER BY a.sort_order, a.id`,
    [userId]
  );
  const cache = new Map();
  const items = [];
  for (const row of rows) {
    const earned = !!row.earned_at;
    if (row.is_hidden && !earned) {
      items.push({ id: row.id, hidden: true, title: 'Секретная ачивка', description: 'Условие держится в секрете 🤫', icon: '❔', rarity: row.rarity, earned: false, progress: 0, threshold: 1, xp_reward: row.xp_reward, category: row.category });
      continue;
    }
    const value = row.action === 'manual' ? (earned ? 1 : 0) : await measure(db, userId, row.action, row.condition_type, cache);
    const threshold = Math.max(1, row.threshold || 1);
    const def = ACTIONS_BY_KEY.get(row.action);
    items.push({
      id: row.id,
      code: row.code,
      title: row.title,
      description: row.description,
      icon: row.icon,
      rarity: row.rarity,
      category: row.category || def?.category || null,
      action: row.action,
      action_label: def?.label || row.action,
      condition_type: row.condition_type,
      xp_reward: row.xp_reward,
      earned,
      earned_at: row.earned_at || null,
      progress: Math.min(value, threshold),
      threshold,
      unit: def?.unit || null,
    });
  }
  return items;
}
