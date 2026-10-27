import express from 'express';
import { getDB, levelFromXp } from '../../utils.js';
import { trackActions } from '../../achievements/engine.js';

const router = express.Router();

// Локальная дата — как у уроков курсов, чтобы стрик и минуты не расходились после полуночи по UTC
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const addDaysISO = (isoDate, days) => {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
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

const sanitizeText = (value, limit = 255) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, limit);
};

const sanitizeOptionalText = (value, limit = 500) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
};

const fetchOwnedLanguage = async (db, userId, languageId) =>
  db.get('SELECT id, name, streak, streak_best, daily_goal_xp, last_practice_date FROM languages WHERE id=? AND user_id=?', [
    languageId,
    userId,
  ]);

const mapVocabRow = (row) => ({
  id: row.id,
  language_id: row.language_id,
  term: row.term,
  translation: row.translation,
  note: row.note || null,
  unit_label: row.unit_label || null,
  created_at: row.created_at,
  due_at: row.due_at || null,
  repetitions: row.repetitions ?? 0,
  is_new: row.repetitions == null,
  is_due: !!row.due_at && row.due_at <= todayISO(),
});

router.get('/:id/vocab', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });
  const rows = await db.all(
    `SELECT v.id, v.language_id, v.term, v.translation, v.note, v.unit_label, v.created_at,
            s.due_at, s.repetitions
     FROM language_vocab v
     LEFT JOIN language_vocab_srs s ON s.vocab_id = v.id
     WHERE v.language_id=? AND v.user_id=?
     ORDER BY v.unit_label IS NULL, v.unit_label ASC, v.created_at ASC`,
    [req.params.id, req.user.uid]
  );
  res.json({ items: rows.map(mapVocabRow) });
});

router.post('/:id/vocab', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });

  const payload = req.body || {};
  const rawItems = Array.isArray(payload.items) ? payload.items : [payload];
  const items = rawItems
    .map((item) => ({
      term: sanitizeText(item?.term),
      translation: sanitizeText(item?.translation),
      note: sanitizeOptionalText(item?.note),
      unit_label: sanitizeOptionalText(item?.unit_label, 120),
    }))
    .filter((item) => item.term && item.translation);

  if (items.length === 0) {
    return res.status(400).json({ error: 'no_valid_items' });
  }

  const ts = new Date().toISOString();
  const created = [];
  for (const item of items) {
    const result = await db.run(
      'INSERT INTO language_vocab(user_id,language_id,term,translation,note,unit_label,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
      [req.user.uid, req.params.id, item.term, item.translation, item.note, item.unit_label, ts, ts]
    );
    created.push({ id: result.lastID, language_id: Number(req.params.id), ...item, created_at: ts, due_at: null, repetitions: 0, is_new: true, is_due: false });
  }
  res.json({ items: created });
});

router.put('/vocab/:vocabId', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT id FROM language_vocab WHERE id=? AND user_id=?', [req.params.vocabId, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });

  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (payload.term !== undefined) { updates.push('term=?'); values.push(sanitizeText(payload.term)); }
  if (payload.translation !== undefined) { updates.push('translation=?'); values.push(sanitizeText(payload.translation)); }
  if (payload.note !== undefined) { updates.push('note=?'); values.push(sanitizeOptionalText(payload.note)); }
  if (payload.unit_label !== undefined) { updates.push('unit_label=?'); values.push(sanitizeOptionalText(payload.unit_label, 120)); }
  if (updates.length === 0) return res.status(400).json({ error: 'no_changes' });
  updates.push('updated_at=?');
  values.push(new Date().toISOString());
  await db.run(`UPDATE language_vocab SET ${updates.join(', ')} WHERE id=? AND user_id=?`, [...values, req.params.vocabId, req.user.uid]);
  const updated = await db.get(
    'SELECT id, language_id, term, translation, note, unit_label, created_at FROM language_vocab WHERE id=?',
    [req.params.vocabId]
  );
  res.json({ item: mapVocabRow({ ...updated, due_at: null, repetitions: null }) });
});

router.delete('/vocab/:vocabId', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM language_vocab WHERE id=? AND user_id=?', [req.params.vocabId, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

/**
 * forward — слово → перевод, reverse — перевод → слово (вспомнить слово сложнее,
 * поэтому обратное направление даём словам, которые уже хоть раз угадывали).
 */
const buildExercise = (vocab, pool, { direction = 'forward' } = {}) => {
  const reverse = direction === 'reverse';
  const prompt = reverse ? vocab.translation : vocab.term;
  const answer = reverse ? vocab.term : vocab.translation;
  const base = { vocab_id: vocab.id, term: prompt, answer, direction, note: vocab.note || null, unit_label: vocab.unit_label };
  const useChoice = pool.length >= 4 && Math.random() < (reverse ? 0.5 : 0.6);
  if (!useChoice) return { ...base, type: 'translate' };
  const key = reverse ? 'term' : 'translation';
  const distractors = Array.from(new Set(pool.filter((item) => item.id !== vocab.id && item[key] !== answer).map((item) => item[key])))
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
  return { ...base, type: 'choice', options };
};

const isMistake = (item) => item.last_result === 'incorrect' || (item.ease_factor != null && item.ease_factor < 2.3);

export const PRACTICE_MODES = ['mix', 'review', 'mistakes', 'new'];

router.get('/:id/practice/session', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });

  const size = Math.min(30, Math.max(1, Number.parseInt(req.query?.size, 10) || 10));
  const mode = PRACTICE_MODES.includes(req.query?.mode) ? req.query.mode : 'mix';
  const pool = await db.all(
    `SELECT v.id, v.term, v.translation, v.note, v.unit_label, s.due_at, s.repetitions, s.ease_factor, s.last_result
     FROM language_vocab v
     LEFT JOIN language_vocab_srs s ON s.vocab_id = v.id
     WHERE v.language_id=? AND v.user_id=?`,
    [req.params.id, req.user.uid]
  );

  if (pool.length === 0) {
    return res.json({ language_id: language.id, mode, exercises: [] });
  }

  const today = todayISO();
  const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
  const due = pool.filter((item) => item.due_at && item.due_at <= today).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const fresh = pool.filter((item) => !item.due_at);
  const rest = pool.filter((item) => item.due_at && item.due_at > today).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const mistakes = pool.filter(isMistake).sort((a, b) => (a.ease_factor ?? 2.5) - (b.ease_factor ?? 2.5));

  let selected;
  if (mode === 'review') selected = due;
  else if (mode === 'new') selected = fresh;
  else if (mode === 'mistakes') selected = mistakes;
  // Микс: сначала то, что пора повторить, потом ошибки и немного новых слов
  else selected = Array.from(new Set([...due, ...mistakes, ...fresh.slice(0, Math.max(3, Math.ceil(size / 3))), ...rest]));
  selected = shuffle(selected.slice(0, size));

  const exercises = selected.map((item) =>
    buildExercise(item, pool, { direction: (item.repetitions || 0) > 0 && Math.random() < 0.4 ? 'reverse' : 'forward' })
  );

  res.json({ language_id: language.id, mode, exercises });
});

router.post('/:id/practice/complete', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });

  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  const validResults = results
    .map((entry) => ({ vocabId: Number.parseInt(entry?.vocab_id, 10), correct: !!entry?.correct }))
    .filter((entry) => Number.isInteger(entry.vocabId));

  if (validResults.length === 0) {
    return res.status(400).json({ error: 'no_results' });
  }

  const today = todayISO();
  let correctCount = 0;

  for (const { vocabId, correct } of validResults) {
    const owned = await db.get('SELECT id FROM language_vocab WHERE id=? AND user_id=? AND language_id=?', [
      vocabId,
      req.user.uid,
      req.params.id,
    ]);
    if (!owned) continue;
    if (correct) correctCount += 1;

    const srs = await db.get('SELECT ease_factor, interval_days, repetitions FROM language_vocab_srs WHERE vocab_id=?', [vocabId]);
    let ease = srs?.ease_factor ?? 2.5;
    let interval = srs?.interval_days ?? 0;
    let repetitions = srs?.repetitions ?? 0;

    if (correct) {
      repetitions += 1;
      if (repetitions === 1) interval = 1;
      else if (repetitions === 2) interval = 6;
      else interval = Math.max(1, Math.round(interval * ease));
      ease = Math.min(3.2, ease + 0.1);
    } else {
      repetitions = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    }

    const dueAt = addDaysISO(today, interval);
    const ts = new Date().toISOString();
    await db.run(
      `INSERT INTO language_vocab_srs(vocab_id, user_id, ease_factor, interval_days, repetitions, due_at, last_result, updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(vocab_id) DO UPDATE SET
         ease_factor=excluded.ease_factor,
         interval_days=excluded.interval_days,
         repetitions=excluded.repetitions,
         due_at=excluded.due_at,
         last_result=excluded.last_result,
         updated_at=excluded.updated_at`,
      [vocabId, req.user.uid, ease, interval, repetitions, dueAt, correct ? 'correct' : 'incorrect', ts]
    );
  }

  const exercisesDone = validResults.length;
  const durationRaw = Math.round(Number(req.body?.duration_sec));
  const secondsSpent = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(durationRaw, 3600) : exercisesDone * 15;
  const xpEarned = correctCount * 8 + (correctCount === exercisesDone ? 20 : 0);
  const nowTs = new Date().toISOString();

  await db.run(
    `INSERT INTO language_practice_sessions(user_id, language_id, date, exercises_done, correct_count, xp_earned, started_at, completed_at, seconds_spent)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, language_id, date) DO UPDATE SET
       exercises_done = exercises_done + excluded.exercises_done,
       correct_count = correct_count + excluded.correct_count,
       xp_earned = xp_earned + excluded.xp_earned,
       seconds_spent = COALESCE(seconds_spent,0) + excluded.seconds_spent,
       completed_at = excluded.completed_at`,
    [req.user.uid, req.params.id, today, exercisesDone, correctCount, xpEarned, nowTs, nowTs, secondsSpent]
  );

  let streak = language.streak || 0;
  let streakBest = language.streak_best || 0;
  if (language.last_practice_date === today) {
    // already practiced today, streak unchanged
  } else if (language.last_practice_date === addDaysISO(today, -1)) {
    streak += 1;
  } else {
    streak = 1;
  }
  streakBest = Math.max(streakBest, streak);
  await db.run('UPDATE languages SET streak=?, streak_best=?, last_practice_date=? WHERE id=? AND user_id=?', [
    streak,
    streakBest,
    today,
    req.params.id,
    req.user.uid,
  ]);

  const { xp: totalXp, level } = await awardXp(db, req.user.uid, xpEarned, {
    type: 'language_practice_completed',
    title: 'Языковая практика',
    text: `${language.name}: ${correctCount}/${exercisesDone} верно`,
    meta: { language_id: Number(req.params.id), exercises_done: exercisesDone, correct_count: correctCount, xp: xpEarned },
    ts: nowTs,
  });

  const goalXp = language.daily_goal_xp || 50;
  const todayRow = await db.get('SELECT xp_earned FROM language_practice_sessions WHERE user_id=? AND language_id=? AND date=?', [req.user.uid, req.params.id, today]);
  const tracked = [['practice.complete', 1]];
  if (correctCount > 0) tracked.push(['practice.correct', correctCount]);
  if (correctCount === exercisesDone) tracked.push(['practice.perfect', 1]);
  if ((todayRow?.xp_earned || 0) >= goalXp && (todayRow?.xp_earned || 0) - xpEarned < goalXp) tracked.push(['practice.goal_reached', 1]);
  await trackActions(req.user.uid, tracked);

  res.json({
    exercises_done: exercisesDone,
    correct_count: correctCount,
    xp_earned: xpEarned,
    streak,
    streak_best: streakBest,
    xp: { value: totalXp, level },
  });
});

// Кана-тренажёр: результаты раунда идут в XP, цель дня, минуты и стрик языка
router.post('/:id/kana', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });
  const total = Math.max(0, Math.min(2000, Math.round(Number(req.body?.total) || 0)));
  const correct = Math.max(0, Math.min(total, Math.round(Number(req.body?.correct) || 0)));
  if (!total) return res.status(400).json({ error: 'no_results' });
  const durationRaw = Math.round(Number(req.body?.duration_sec));
  const seconds = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(durationRaw, 7200) : total * 5;
  const xpEarned = Math.min(200, correct * 2);
  const today = todayISO();
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO language_practice_sessions(user_id, language_id, date, exercises_done, correct_count, xp_earned, started_at, completed_at, seconds_spent)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, language_id, date) DO UPDATE SET exercises_done = exercises_done + excluded.exercises_done,
       correct_count = correct_count + excluded.correct_count, xp_earned = xp_earned + excluded.xp_earned,
       seconds_spent = COALESCE(seconds_spent,0) + excluded.seconds_spent, completed_at = excluded.completed_at`,
    [req.user.uid, language.id, today, total, correct, xpEarned, ts, ts, seconds]
  );
  let streak = language.streak || 0;
  if (language.last_practice_date !== today) streak = language.last_practice_date === addDaysISO(today, -1) ? streak + 1 : 1;
  await db.run('UPDATE languages SET streak=?, streak_best=MAX(COALESCE(streak_best,0), ?), last_practice_date=? WHERE id=? AND user_id=?', [
    streak,
    streak,
    today,
    language.id,
    req.user.uid,
  ]);
  const { xp, level } = await awardXp(db, req.user.uid, xpEarned, {
    type: 'language_practice_completed',
    title: 'Тренировка каны',
    text: `${language.name}: ${correct}/${total} знаков с первой попытки`,
    meta: { language_id: language.id, kana: true, xp: xpEarned },
    ts,
  });
  await trackActions(req.user.uid, [['practice.kana', correct || 1], ['practice.complete', 1]]);
  res.json({ xp_earned: xpEarned, streak, xp: { value: xp, level } });
});

router.post('/:id/minutes', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });
  const minutes = Math.round(Number(req.body?.minutes));
  if (!Number.isFinite(minutes) || minutes === 0 || Math.abs(minutes) > 600) return res.status(400).json({ error: 'Укажите от 1 до 600 минут' });
  const today = todayISO();
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO language_practice_sessions(user_id, language_id, date, exercises_done, correct_count, xp_earned, started_at, completed_at, seconds_spent)
     VALUES(?,?,?,0,0,0,?,?,?)
     ON CONFLICT(user_id, language_id, date) DO UPDATE SET seconds_spent = MAX(0, COALESCE(seconds_spent,0) + excluded.seconds_spent), completed_at = excluded.completed_at`,
    [req.user.uid, req.params.id, today, ts, ts, minutes * 60]
  );
  const row = await db.get('SELECT seconds_spent FROM language_practice_sessions WHERE user_id=? AND language_id=? AND date=?', [req.user.uid, req.params.id, today]);
  res.json({ minutes_today: Math.round((row?.seconds_spent || 0) / 60) });
});

router.get('/:id/stats', async (req, res) => {
  const db = await getDB();
  const language = await fetchOwnedLanguage(db, req.user.uid, req.params.id);
  if (!language) return res.status(404).json({ error: 'not_found' });

  const today = todayISO();
  const mistakesRow = await db.get(
    `SELECT COUNT(*) AS count FROM language_vocab v JOIN language_vocab_srs s ON s.vocab_id = v.id
     WHERE v.language_id=? AND v.user_id=? AND (s.last_result='incorrect' OR s.ease_factor < 2.3)`,
    [req.params.id, req.user.uid]
  );
  const totalRow = await db.get('SELECT COUNT(*) AS count FROM language_vocab WHERE language_id=? AND user_id=?', [req.params.id, req.user.uid]);
  const [dueCount, newCount, todaySession] = await Promise.all([
    db.get(
      `SELECT COUNT(*) AS count FROM language_vocab v
       JOIN language_vocab_srs s ON s.vocab_id = v.id
       WHERE v.language_id=? AND v.user_id=? AND s.due_at <= ?`,
      [req.params.id, req.user.uid, today]
    ),
    db.get(
      `SELECT COUNT(*) AS count FROM language_vocab v
       LEFT JOIN language_vocab_srs s ON s.vocab_id = v.id
       WHERE v.language_id=? AND v.user_id=? AND s.vocab_id IS NULL`,
      [req.params.id, req.user.uid]
    ),
    db.get('SELECT exercises_done, correct_count, xp_earned, seconds_spent FROM language_practice_sessions WHERE user_id=? AND language_id=? AND date=?', [
      req.user.uid,
      req.params.id,
      today,
    ]),
  ]);

  res.json({
    language_id: language.id,
    streak: language.streak || 0,
    streak_best: language.streak_best || 0,
    daily_goal_xp: language.daily_goal_xp || 50,
    xp_today: todaySession?.xp_earned || 0,
    exercises_today: todaySession?.exercises_done || 0,
    correct_today: todaySession?.correct_count || 0,
    due_count: dueCount?.count || 0,
    new_count: newCount?.count || 0,
    mistakes_count: mistakesRow?.count || 0,
    words_total: totalRow?.count || 0,
    minutes_today: Math.round((todaySession?.seconds_spent || 0) / 60),
    name: language.name,
  });
});

/**
 * Ошибки из уроков курсов: слова, на которых ошиблись, сразу ставятся в повторение
 * (попадут в «Работу над ошибками»). candidates — строки из задания (слово/перевод).
 */
export async function markVocabMistakes(db, userId, languageId, candidates) {
  const list = Array.from(new Set((Array.isArray(candidates) ? candidates : []).map((v) => String(v || '').trim()).filter(Boolean))).slice(0, 200);
  if (!languageId || !list.length) return 0;
  const marks = list.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT v.id, s.ease_factor FROM language_vocab v LEFT JOIN language_vocab_srs s ON s.vocab_id=v.id
     WHERE v.user_id=? AND v.language_id=? AND (v.term IN (${marks}) OR v.translation IN (${marks}))`,
    [userId, languageId, ...list, ...list]
  );
  const today = todayISO();
  const ts = new Date().toISOString();
  for (const row of rows) {
    await db.run(
      `INSERT INTO language_vocab_srs(vocab_id, user_id, ease_factor, interval_days, repetitions, due_at, last_result, updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(vocab_id) DO UPDATE SET ease_factor=excluded.ease_factor, interval_days=0, repetitions=0,
         due_at=excluded.due_at, last_result='incorrect', updated_at=excluded.updated_at`,
      [row.id, userId, Math.max(1.3, (row.ease_factor ?? 2.5) - 0.2), 0, 0, today, 'incorrect', ts]
    );
  }
  return rows.length;
}

export default router;
