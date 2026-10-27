import express from 'express';
import { getDB, levelFromXp, requireRole } from '../../utils.js';
import { ACTIONS_BY_KEY, CONDITION_TYPES, publicCatalog } from '../../achievements/catalog.js';
import { evaluateUser, listForUser, seedDefaultAchievements, trackAction, trackAppOpen } from '../../achievements/engine.js';
import { goalActionCatalog } from '../../achievements/catalog.js';

const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const mapUnseen = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  icon: row.icon,
  rarity: row.rarity,
  xp_reward: row.xp_reward,
  earned_at: row.earned_at,
});

// ───────────── Пользовательские маршруты: /api/achievements ─────────────
export const userRouter = express.Router();

userRouter.get('/', async (req, res) => {
  const items = await listForUser(req.user.uid);
  const earned = items.filter((item) => item.earned).length;
  // «Глобальная статистика», как в Steam: какой процент пользователей получил ачивку
  const db = await getDB();
  const usersTotal = (await db.get('SELECT COUNT(*) AS n FROM users'))?.n || 1;
  const counts = new Map(
    (await db.all('SELECT achievement_id, COUNT(*) AS n FROM user_achievements GROUP BY achievement_id')).map((r) => [r.achievement_id, r.n])
  );
  for (const item of items) item.global_pct = Math.round(((counts.get(item.id) || 0) * 1000) / usersTotal) / 10;
  res.json({ items, earned, total: items.length, users_total: usersTotal });
});

userRouter.get('/unseen', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    `SELECT a.*, ua.earned_at FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
     WHERE ua.user_id=? AND ua.seen=0 ORDER BY ua.earned_at`,
    [req.user.uid]
  );
  res.json({ items: rows.map(mapUnseen) });
});

userRouter.post('/seen', async (req, res) => {
  const db = await getDB();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length) {
    await db.run(
      `UPDATE user_achievements SET seen=1 WHERE user_id=? AND achievement_id IN (${ids.map(() => '?').join(',')})`,
      [req.user.uid, ...ids]
    );
  } else {
    await db.run('UPDATE user_achievements SET seen=1 WHERE user_id=?', [req.user.uid]);
  }
  res.json({ success: true });
});

// Действия, к которым можно привязать автоотметку цели на год
userRouter.get('/actions', (req, res) => {
  res.json({ items: goalActionCatalog() });
});

// Клиентские события: визиты страниц, использование функций интерфейса.
userRouter.post('/track', async (req, res) => {
  const action = String(req.body?.action || '');
  const def = ACTIONS_BY_KEY.get(action);
  if (!def || def.kind !== 'client') return res.status(400).json({ error: 'unknown_action' });
  const unlocked = action === 'app.open' ? await trackAppOpen(req.user.uid) : await trackAction(req.user.uid, action);
  res.json({ unlocked: unlocked.map(mapUnseen) });
});

// ───────────── Админские маршруты: /api/admin/achievements ─────────────
export const adminRouter = express.Router();
adminRouter.use(requireRole('moderator', 'admin'));

const sanitize = (body = {}) => {
  const action = String(body.action || '').trim();
  const def = ACTIONS_BY_KEY.get(action);
  if (!def) return { error: 'unknown_action' };
  let condition = String(body.condition_type || '').trim();
  if (def.kind === 'stat') condition = 'value';
  else if (def.kind === 'manual') condition = 'count';
  else if (!['count', 'days', 'streak'].includes(condition)) condition = 'count';
  const title = String(body.title || '').trim().slice(0, 120);
  if (!title) return { error: 'title_required' };
  const code = String(body.code || '').trim().slice(0, 64) || null;
  return {
    value: {
      code,
      title,
      description: String(body.description || '').trim().slice(0, 500) || null,
      icon: String(body.icon || '🏆').trim().slice(0, 16) || '🏆',
      category: String(body.category || '').trim().slice(0, 60) || null,
      action,
      condition_type: condition,
      threshold: Math.max(1, Math.min(1_000_000_000, Math.round(Number(body.threshold) || 1))),
      xp_reward: Math.max(0, Math.min(100_000, Math.round(Number(body.xp_reward) || 0))),
      rarity: RARITIES.includes(body.rarity) ? body.rarity : 'common',
      is_active: body.is_active === undefined ? 1 : body.is_active ? 1 : 0,
      is_hidden: body.is_hidden ? 1 : 0,
      sort_order: Math.round(Number(body.sort_order) || 0),
    },
  };
};

adminRouter.get('/actions', (req, res) => {
  res.json({ items: publicCatalog(), conditions: CONDITION_TYPES, rarities: RARITIES });
});

adminRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    `SELECT a.*, (SELECT COUNT(*) FROM user_achievements ua WHERE ua.achievement_id=a.id) AS earned_count
     FROM achievements a ORDER BY a.sort_order, a.id`
  );
  const users = await db.get('SELECT COUNT(*) AS n FROM users');
  res.json({
    items: rows.map((row) => ({
      ...row,
      is_active: !!row.is_active,
      is_hidden: !!row.is_hidden,
      action_label: ACTIONS_BY_KEY.get(row.action)?.label || `⚠ неизвестное действие: ${row.action}`,
      action_kind: ACTIONS_BY_KEY.get(row.action)?.kind || null,
    })),
    users_total: users?.n || 0,
  });
});

adminRouter.post('/', async (req, res) => {
  const { value, error } = sanitize(req.body);
  if (error) return res.status(400).json({ error });
  const db = await getDB();
  const ts = new Date().toISOString();
  try {
    const result = await db.run(
      `INSERT INTO achievements(code,title,description,icon,category,action,condition_type,threshold,xp_reward,rarity,is_active,is_hidden,sort_order,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [value.code, value.title, value.description, value.icon, value.category, value.action, value.condition_type, value.threshold, value.xp_reward, value.rarity, value.is_active, value.is_hidden, value.sort_order, ts, ts]
    );
    res.json({ item: await db.get('SELECT * FROM achievements WHERE id=?', [result.lastID]) });
  } catch {
    res.status(400).json({ error: 'code_taken' });
  }
});

// ───────────── Импорт ачивок от ИИ (как с курсами) ─────────────
const ACH_FORMAT = 'lifehub-achievements@1';

const EXAMPLE_ACHIEVEMENTS = {
  format: ACH_FORMAT,
  achievements: [
    { title: 'Первые шаги', description: 'Пройдите первый урок курса-тренировки', icon: '👣', category: 'Обучение', action: 'learn.lesson_complete', condition_type: 'count', threshold: 1, xp_reward: 20, rarity: 'common' },
    { title: 'Неделя без пропусков', description: 'Занимайтесь языком 7 дней подряд', icon: '🔥', category: 'Языки', action: 'practice.complete', condition_type: 'streak', threshold: 7, xp_reward: 150, rarity: 'epic' },
    { title: 'Скрытый гурман', description: 'Запишите 30 расходов вручную', icon: '🍜', category: 'Финансы', action: 'expense.add', condition_type: 'count', threshold: 30, xp_reward: 80, rarity: 'rare', is_hidden: true },
  ],
};

function buildAchievementsPrompt() {
  const groups = new Map();
  for (const item of publicCatalog()) {
    if (item.kind === 'manual') continue;
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(`  - ${item.key} — ${item.label}${item.kind === 'stat' ? ` [показатель${item.unit ? `, ${item.unit}` : ''}]` : ''}`);
  }
  const actions = Array.from(groups.entries())
    .map(([category, lines]) => `${category}:\n${lines.join('\n')}`)
    .join('\n');
  return `Ты — геймдизайнер приложения Life Hub (личный трекер: учёба, языки, привычки, цели, финансы).
Придумай <КОЛИЧЕСТВО, например 20> ачивок на тему: <ТЕМА, например «изучение японского» или «финансовая дисциплина»>.
Сложность: <лёгкие / разные / хардкорные>.

Ответь ТОЛЬКО JSON без пояснений, строго в формате:
{
  "format": "${ACH_FORMAT}",
  "achievements": [
    {
      "title": "Название (до 120 символов, с юмором можно)",
      "description": "Что нужно сделать — понятно пользователю",
      "icon": "один эмодзи",
      "category": "категория для группировки",
      "action": "ключ действия СТРОГО из списка ниже",
      "condition_type": "count | days | streak | value",
      "threshold": число,
      "xp_reward": число (обычная 10–30, редкая 40–100, эпическая 100–250, легендарная 300+),
      "rarity": "common | rare | epic | legendary",
      "is_hidden": false
    }
  ]
}

Типы условий:
- count — сколько раз всего выполнено действие (threshold = количество);
- days — в скольких разных днях выполнялось действие;
- streak — сколько дней подряд выполнялось действие;
- value — только для действий с пометкой [показатель]: threshold — значение показателя (например, уровень или число слов).

Правила:
- action бери только из списка ниже, другие не сработают;
- для действий [показатель] всегда condition_type = "value";
- не повторяй ачивки с одинаковым действием и порогом;
- is_hidden: true — для секретных ачивок-сюрпризов (не больше пары штук).

Доступные действия:
${actions}`;
}

adminRouter.get('/template', (req, res) => {
  res.json({ format: ACH_FORMAT, prompt: buildAchievementsPrompt(), example: EXAMPLE_ACHIEVEMENTS });
});

// Экспорт текущих ачивок в том же формате (бэкап или правка через ИИ)
adminRouter.get('/export', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM achievements ORDER BY sort_order, id');
  res.json({
    format: ACH_FORMAT,
    achievements: rows.map((r) => ({
      code: r.code, title: r.title, description: r.description, icon: r.icon, category: r.category, action: r.action,
      condition_type: r.condition_type, threshold: r.threshold, xp_reward: r.xp_reward, rarity: r.rarity,
      is_active: !!r.is_active, is_hidden: !!r.is_hidden,
    })),
  });
});

/**
 * Импорт: { achievements: [...] } или просто массив. dry_run — только проверить.
 * Повторы (то же название, или то же действие + условие + порог) пропускаются.
 */
adminRouter.post('/import', async (req, res) => {
  const body = req.body || {};
  const raw = Array.isArray(body) ? body : Array.isArray(body.achievements) ? body.achievements : Array.isArray(body.items) ? body.items : null;
  if (!raw) return res.status(400).json({ error: 'Нужен JSON с полем "achievements" — массивом ачивок' });
  if (raw.length > 500) return res.status(400).json({ error: 'Слишком много ачивок за раз (максимум 500)' });
  const dryRun = !!req.query.dry_run || !!body.dry_run;
  const db = await getDB();
  const existing = await db.all('SELECT title, action, condition_type, threshold, code FROM achievements');
  const titles = new Set(existing.map((r) => r.title.toLowerCase()));
  const rules = new Set(existing.map((r) => `${r.action}|${r.condition_type}|${r.threshold}`));
  const codes = new Set(existing.map((r) => r.code).filter(Boolean));
  const errors = [];
  const ready = [];
  let skipped = 0;
  raw.forEach((item, index) => {
    const { value, error } = sanitize(item || {});
    if (error) {
      errors.push({ index, title: item?.title || null, error: error === 'unknown_action' ? `неизвестное действие «${item?.action}»` : 'нет названия' });
      return;
    }
    const rule = `${value.action}|${value.condition_type}|${value.threshold}`;
    if (titles.has(value.title.toLowerCase()) || rules.has(rule)) {
      skipped += 1;
      return;
    }
    if (value.code && codes.has(value.code)) value.code = null;
    titles.add(value.title.toLowerCase());
    rules.add(rule);
    if (value.code) codes.add(value.code);
    ready.push(value);
  });
  if (!dryRun && ready.length) {
    const ts = new Date().toISOString();
    const maxOrder = (await db.get('SELECT MAX(sort_order) AS m FROM achievements'))?.m || 0;
    await db.exec('BEGIN');
    try {
      for (const [i, v] of ready.entries()) {
        await db.run(
          `INSERT INTO achievements(code,title,description,icon,category,action,condition_type,threshold,xp_reward,rarity,is_active,is_hidden,sort_order,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [v.code, v.title, v.description, v.icon, v.category, v.action, v.condition_type, v.threshold, v.xp_reward, v.rarity, v.is_active, v.is_hidden, v.sort_order || maxOrder + i + 1, ts, ts]
        );
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      return res.status(500).json({ error: error.message });
    }
  }
  res.json({ created: dryRun ? 0 : ready.length, valid: ready.length, skipped, errors, dry_run: dryRun, preview: ready.slice(0, 50) });
});

adminRouter.put('/:id', async (req, res) => {
  const { value, error } = sanitize(req.body);
  if (error) return res.status(400).json({ error });
  const db = await getDB();
  try {
    const result = await db.run(
      `UPDATE achievements SET code=?,title=?,description=?,icon=?,category=?,action=?,condition_type=?,threshold=?,xp_reward=?,rarity=?,is_active=?,is_hidden=?,sort_order=?,updated_at=? WHERE id=?`,
      [value.code, value.title, value.description, value.icon, value.category, value.action, value.condition_type, value.threshold, value.xp_reward, value.rarity, value.is_active, value.is_hidden, value.sort_order, new Date().toISOString(), req.params.id]
    );
    if (!result.changes) return res.status(404).json({ error: 'not_found' });
    res.json({ item: await db.get('SELECT * FROM achievements WHERE id=?', [req.params.id]) });
  } catch {
    res.status(400).json({ error: 'code_taken' });
  }
});

adminRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM achievements WHERE id=?', [req.params.id]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

adminRouter.post('/restore-defaults', async (req, res) => {
  const db = await getDB();
  const inserted = await seedDefaultAchievements(db, { force: true });
  res.json({ inserted });
});

adminRouter.post('/recalculate', async (req, res) => {
  const db = await getDB();
  const users = await db.all('SELECT id FROM users');
  let unlocked = 0;
  for (const user of users) {
    unlocked += (await evaluateUser(user.id, { includeStats: true, force: true })).length;
  }
  res.json({ users: users.length, unlocked });
});

adminRouter.get('/:id/holders', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    `SELECT u.id, u.name, u.username, u.avatar_url, ua.earned_at, ua.granted_by
     FROM user_achievements ua JOIN users u ON u.id=ua.user_id WHERE ua.achievement_id=? ORDER BY ua.earned_at DESC`,
    [req.params.id]
  );
  res.json({ items: rows });
});

adminRouter.post('/:id/grant', async (req, res) => {
  const db = await getDB();
  const userId = Number(req.body?.user_id);
  const achievement = await db.get('SELECT * FROM achievements WHERE id=?', [req.params.id]);
  if (!achievement || !Number.isInteger(userId)) return res.status(404).json({ error: 'not_found' });
  const result = await db.run(
    'INSERT INTO user_achievements(user_id, achievement_id, earned_at, seen, granted_by) VALUES(?,?,?,0,?) ON CONFLICT DO NOTHING',
    [userId, achievement.id, new Date().toISOString(), req.user.uid]
  );
  if (result.changes && achievement.xp_reward > 0) {
    const row = (await db.get('SELECT xp FROM user_xp WHERE user_id=?', [userId])) || { xp: 0 };
    const xp = (row.xp || 0) + achievement.xp_reward;
    await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?', [userId, xp, levelFromXp(xp), xp, levelFromXp(xp)]);
  }
  res.json({ granted: !!result.changes });
});

adminRouter.post('/:id/revoke', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM user_achievements WHERE achievement_id=? AND user_id=?', [req.params.id, Number(req.body?.user_id)]);
  res.json({ revoked: !!result.changes });
});

// ───────────── Профиль: активность, уровень, витрина ─────────────
const isNoise = (action) => action.startsWith('visit.') || action.startsWith('app.') || action.startsWith('auth.');
const pad2 = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

userRouter.get('/activity', async (req, res) => {
  const db = await getDB();
  const days = Math.min(400, Math.max(7, Number(req.query.days) || 182));
  const from = new Date();
  from.setDate(from.getDate() - days + 1);
  const rows = await db.all(
    'SELECT date, action, count FROM user_action_log WHERE user_id=? AND date >= ? ORDER BY date',
    [req.user.uid, isoLocal(from)]
  );
  const byDay = new Map();
  for (const row of rows) {
    if (isNoise(row.action)) continue;
    byDay.set(row.date, (byDay.get(row.date) || 0) + (row.count || 0));
  }

  // Серия активных дней (сегодня можно ещё не успеть — тогда считаем со вчера)
  const allDays = new Set(
    (await db.all('SELECT DISTINCT date, action FROM user_action_log WHERE user_id=?', [req.user.uid]))
      .filter((r) => !isNoise(r.action))
      .map((r) => r.date)
  );
  const cursor = new Date();
  if (!allDays.has(isoLocal(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (allDays.has(isoLocal(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const xpRow = (await db.get('SELECT xp, level FROM user_xp WHERE user_id=?', [req.user.uid])) || { xp: 0, level: 1 };
  const level = levelFromXp(xpRow.xp || 0);
  const today = await db.get(
    "SELECT SUM(xp) AS xp FROM (SELECT CAST(json_extract(meta,'$.xp') AS INTEGER) AS xp FROM life_feed WHERE user_id=? AND substr(ts,1,10)=?)",
    [req.user.uid, new Date().toISOString().slice(0, 10)]
  ).catch(() => null);

  res.json({
    days: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
    active_days: allDays.size,
    streak,
    level: {
      level,
      xp: xpRow.xp || 0,
      current_floor: 100 * (level - 1) ** 2,
      next_at: 100 * level ** 2,
      xp_today: today?.xp || 0,
    },
  });
});

userRouter.get('/activity/day', async (req, res) => {
  const date = String(req.query.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'bad_date' });
  const db = await getDB();
  const rows = await db.all('SELECT action, count FROM user_action_log WHERE user_id=? AND date=? ORDER BY count DESC', [req.user.uid, date]);
  const achievements = await db.all(
    `SELECT a.id, a.title, a.icon FROM user_achievements ua JOIN achievements a ON a.id=ua.achievement_id
     WHERE ua.user_id=? AND substr(ua.earned_at,1,10)=?`,
    [req.user.uid, date]
  );
  res.json({
    date,
    actions: rows
      .filter((r) => !isNoise(r.action))
      .map((r) => ({ action: r.action, label: ACTIONS_BY_KEY.get(r.action)?.label || r.action, count: r.count })),
    achievements,
  });
});

userRouter.get('/showcase', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT showcase_achievements FROM users WHERE id=?', [req.user.uid]);
  let ids = [];
  try {
    ids = JSON.parse(row?.showcase_achievements || '[]');
  } catch {
    ids = [];
  }
  res.json({ ids: Array.isArray(ids) ? ids.filter(Number.isInteger) : [] });
});

userRouter.put('/showcase', async (req, res) => {
  const db = await getDB();
  const raw = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  const ids = [...new Set(raw)].slice(0, 6);
  // В витрину можно поставить только полученные ачивки
  const owned = ids.length
    ? (await db.all(
        `SELECT achievement_id FROM user_achievements WHERE user_id=? AND achievement_id IN (${ids.map(() => '?').join(',')})`,
        [req.user.uid, ...ids]
      )).map((r) => r.achievement_id)
    : [];
  const filtered = ids.filter((id) => owned.includes(id));
  await db.run('UPDATE users SET showcase_achievements=? WHERE id=?', [JSON.stringify(filtered), req.user.uid]);
  res.json({ ids: filtered });
});

// ───────────── Мастер первого запуска: /api/onboarding ─────────────
export const onboardingRouter = express.Router();

onboardingRouter.get('/', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT onboarding_state FROM users WHERE id=?', [req.user.uid]);
  res.json({ show: row?.onboarding_state === 'pending' });
});

onboardingRouter.post('/', async (req, res) => {
  const db = await getDB();
  const state = req.body?.state === 'pending' ? 'pending' : 'done';
  await db.run('UPDATE users SET onboarding_state=? WHERE id=?', [state, req.user.uid]);
  res.json({ state });
});
