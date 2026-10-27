import express from 'express';
import { getDB, levelFromXp } from '../../utils.js';
import { trackActions } from '../../achievements/engine.js';
import { FORMAT_ID, generateExercises, normalizeCourse } from '../../learn/format.js';
import { AI_PROMPT, EXAMPLE_COURSE } from '../../learn/template.js';
import { recomputeCourseProgress } from '../life/index.js';
import { loadCourseLocks } from '../life/program.js';
import { markVocabMistakes } from '../life/languageLearning.js';

/** Пересчитывает прогресс обычных курсов, привязанных к курсу-тренировке. */
async function syncLinkedCourses(db, userId, learnCourseId) {
  const rows = await db.all('SELECT id FROM courses WHERE user_id=? AND learn_course_id=?', [userId, learnCourseId]);
  for (const row of rows) await recomputeCourseProgress(db, userId, row.id);
}

const router = express.Router();

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const shiftISO = (iso, days) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const parse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const ownedCourse = (db, userId, id) => db.get('SELECT * FROM lang_courses WHERE id=? AND user_id=?', [id, userId]);

export const CHECKPOINT_PASS = 80;
const CHECKPOINT_SIZE = 12;

async function loadCourseTree(db, userId, courseId) {
  const units = await db.all('SELECT * FROM lang_units WHERE course_id=? ORDER BY position, id', [courseId]);
  const checkpoints = new Map(
    (
      await db.all(
        `SELECT c.unit_id, c.attempts, c.best_score, c.passed FROM lang_unit_checkpoints c JOIN lang_units u ON u.id=c.unit_id
         WHERE c.user_id=? AND u.course_id=?`,
        [userId, courseId]
      )
    ).map((row) => [row.unit_id, row])
  );
  const lessons = await db.all(
    `SELECT l.id, l.unit_id, l.position, l.title, l.description, l.xp, l.words_json,
            p.completed_count, p.best_score, p.last_completed_at
     FROM lang_lessons l
     LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
     WHERE l.course_id=? ORDER BY l.position, l.id`,
    [userId, courseId]
  );
  // Уроки открываются последовательно: следующий доступен, когда пройден предыдущий.
  let previousDone = true;
  let currentAssigned = false;
  const byUnit = new Map(units.map((u) => [u.id, []]));
  // Сданная контрольная открывает следующий раздел, даже если не все уроки пройдены
  const passedBefore = new Set();
  units.forEach((u, index) => {
    if (index > 0 && checkpoints.get(units[index - 1].id)?.passed) passedBefore.add(u.id);
  });
  const ordered = units.flatMap((u) => lessons.filter((l) => l.unit_id === u.id));
  let currentUnit = null;
  for (const lesson of ordered) {
    if (lesson.unit_id !== currentUnit) {
      currentUnit = lesson.unit_id;
      if (passedBefore.has(currentUnit)) {
        previousDone = true;
        currentAssigned = false;
      }
    }
    const done = (lesson.completed_count || 0) > 0;
    let status = 'locked';
    if (done) status = 'done';
    else if (previousDone && !currentAssigned) {
      status = 'current';
      currentAssigned = true;
    }
    previousDone = done;
    byUnit.get(lesson.unit_id)?.push({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      xp: lesson.xp,
      words_count: parse(lesson.words_json, []).length,
      status,
      completed_count: lesson.completed_count || 0,
      best_score: lesson.best_score || 0,
    });
  }
  return units.map((u) => {
    const unitLessons = byUnit.get(u.id) || [];
    return {
      id: u.id,
      title: u.title,
      description: u.description,
      color: u.color,
      guide: u.guide,
      lessons: unitLessons,
      done_count: unitLessons.filter((l) => l.status === 'done').length,
      checkpoint: {
        attempts: checkpoints.get(u.id)?.attempts || 0,
        best_score: checkpoints.get(u.id)?.best_score || 0,
        passed: !!checkpoints.get(u.id)?.passed,
        pass_score: CHECKPOINT_PASS,
      },
    };
  });
}

async function courseSummary(db, userId, course, locks = null) {
  const lock = (locks || (await loadCourseLocks(db, userId))).learn.get(course.id);
  const totals = await db.get(
    `SELECT COUNT(l.id) AS total, SUM(CASE WHEN p.completed_count>0 THEN 1 ELSE 0 END) AS done,
            SUM(COALESCE(p.xp_total,0)) AS xp
     FROM lang_lessons l LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
     WHERE l.course_id=?`,
    [userId, course.id]
  );
  const units = await db.get('SELECT COUNT(*) AS n FROM lang_units WHERE course_id=?', [course.id]);
  const linked = await db.get('SELECT id FROM courses WHERE user_id=? AND learn_course_id=? AND archived_at IS NULL ORDER BY id LIMIT 1', [userId, course.id]);
  const total = totals?.total || 0;
  const done = totals?.done || 0;
  return {
    id: course.id,
    language_id: course.language_id,
    title: course.title,
    description: course.description,
    from_language: course.from_language,
    to_language: course.to_language,
    speech_lang: course.speech_lang,
    icon: course.icon,
    color: course.color,
    created_at: course.created_at,
    units_count: units?.n || 0,
    lessons_total: total,
    lessons_done: done,
    xp_total: totals?.xp || 0,
    progress_pct: total ? Math.round((done * 100) / total) : 0,
    linked_course_id: linked?.id ?? null,
    locked: !!lock?.locked,
    lock_reason: lock?.reason || null,
    program_stage: lock?.stage ?? null,
  };
}

router.get('/template', (req, res) => {
  res.json({ format: FORMAT_ID, example: EXAMPLE_COURSE, prompt: AI_PROMPT });
});

router.get('/courses', async (req, res) => {
  const db = await getDB();
  const where = req.query.language_id ? 'AND language_id=?' : '';
  const params = req.query.language_id ? [req.user.uid, req.query.language_id] : [req.user.uid];
  const rows = await db.all(`SELECT * FROM lang_courses WHERE user_id=? ${where} ORDER BY created_at DESC, id DESC`, params);
  const items = [];
  const locks = await loadCourseLocks(db, req.user.uid);
  for (const row of rows) items.push(await courseSummary(db, req.user.uid, row, locks));
  res.json({ items });
});

router.post('/courses/import', async (req, res) => {
  const db = await getDB();
  let course;
  try {
    course = normalizeCourse(req.body?.course ?? req.body);
  } catch (error) {
    return res.status(400).json({ error: error instanceof SyntaxError ? 'Файл не является корректным JSON' : error.message });
  }
  let languageId = Number(req.body?.language_id) || null;
  if (languageId) {
    const lang = await db.get('SELECT id FROM languages WHERE id=? AND user_id=?', [languageId, req.user.uid]);
    if (!lang) languageId = null;
  }

  const ts = new Date().toISOString();
  await db.exec('BEGIN');
  try {
    const result = await db.run(
      `INSERT INTO lang_courses(user_id, language_id, title, description, from_language, to_language, speech_lang, icon, color, source_json, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      [req.user.uid, languageId, course.title, course.description, course.from_language, course.to_language, course.speech_lang, course.icon, course.color, JSON.stringify(course), ts]
    );
    const courseId = result.lastID;
    let position = 0;
    for (const [unitIndex, unit] of course.units.entries()) {
      const unitResult = await db.run(
        'INSERT INTO lang_units(course_id, position, title, description, color, guide) VALUES(?,?,?,?,?,?)',
        [courseId, unitIndex, unit.title, unit.description, unit.color, unit.guide]
      );
      for (const lesson of unit.lessons) {
        await db.run(
          'INSERT INTO lang_lessons(course_id, unit_id, position, title, description, xp, words_json, exercises_json) VALUES(?,?,?,?,?,?,?,?)',
          [courseId, unitResult.lastID, position, lesson.title, lesson.description, lesson.xp, JSON.stringify(lesson.words), JSON.stringify(lesson.exercises)]
        );
        position += 1;
      }
    }
    await db.exec('COMMIT');
    // По умолчанию курс сразу появляется во вкладке «Курсы» с автоматическим прогрессом.
    if (req.body?.create_course !== false) {
      await db.run(
        "INSERT INTO courses(user_id,title,provider,course_type,language_id,progress,status,archived_at,learn_course_id) VALUES(?,?,?,?,?,0,'in-progress',NULL,?)",
        [req.user.uid, course.title, 'Курс-тренировка', 'study', languageId, courseId]
      );
    }
    await trackActions(req.user.uid, [['learn.course_import', 1]]);
    const row = await ownedCourse(db, req.user.uid, courseId);
    res.json({ item: await courseSummary(db, req.user.uid, row) });
  } catch (error) {
    await db.exec('ROLLBACK');
    res.status(500).json({ error: error.message || 'import_failed' });
  }
});

router.get('/courses/:id', async (req, res) => {
  const db = await getDB();
  const course = await ownedCourse(db, req.user.uid, req.params.id);
  if (!course) return res.status(404).json({ error: 'not_found' });
  res.json({ course: await courseSummary(db, req.user.uid, course), units: await loadCourseTree(db, req.user.uid, course.id) });
});

router.patch('/courses/:id', async (req, res) => {
  const db = await getDB();
  const course = await ownedCourse(db, req.user.uid, req.params.id);
  if (!course) return res.status(404).json({ error: 'not_found' });
  const languageId = req.body?.language_id ? Number(req.body.language_id) : null;
  await db.run('UPDATE lang_courses SET language_id=? WHERE id=?', [languageId, course.id]);
  res.json({ success: true });
});

router.get('/courses/:id/export', async (req, res) => {
  const db = await getDB();
  const course = await ownedCourse(db, req.user.uid, req.params.id);
  if (!course) return res.status(404).json({ error: 'not_found' });
  await trackActions(req.user.uid, [['learn.course_export', 1]]);
  res.json(parse(course.source_json, {}));
});

router.delete('/courses/:id', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM lang_courses WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  const linkedRows = await db.all('SELECT id FROM courses WHERE user_id=? AND learn_course_id=?', [req.user.uid, req.params.id]);
  await db.run('UPDATE courses SET learn_course_id=NULL WHERE user_id=? AND learn_course_id=?', [req.user.uid, req.params.id]);
  for (const row of linkedRows) await recomputeCourseProgress(db, req.user.uid, row.id);
  await trackActions(req.user.uid, [['learn.course_delete', 1]]);
  res.json({ success: true });
});

/** Упражнения урока: из файла курса или сгенерированные по словам. */
async function lessonExercises(db, lesson) {
  const words = parse(lesson.words_json, []);
  let exercises = parse(lesson.exercises_json, []);
  if (!exercises.length) {
    const poolRows = await db.all('SELECT words_json FROM lang_lessons WHERE course_id=?', [lesson.course_id]);
    const pool = poolRows.flatMap((row) => parse(row.words_json, []));
    exercises = generateExercises(words, pool.length >= 4 ? pool : words, { speech: !!lesson.speech_lang });
  } else {
    // Слова, которые есть в уроке, но не введены карточкой learn, показываем в начале.
    const introduced = new Set(exercises.filter((ex) => ex.type === 'learn').map((ex) => ex.word?.term));
    const missing = words.filter((w) => !introduced.has(w.term)).map((word) => ({ type: 'learn', word }));
    const firstPractice = exercises.findIndex((ex) => ex.type !== 'learn' && ex.type !== 'theory');
    if (missing.length) exercises.splice(firstPractice === -1 ? exercises.length : firstPractice, 0, ...missing);
  }
  return { words, exercises };
}

const shuffleList = (list) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const ownedUnit = (db, userId, unitId) =>
  db.get(
    `SELECT u.*, c.title AS course_title, c.icon AS course_icon, c.speech_lang, c.language_id, c.id AS cid
     FROM lang_units u JOIN lang_courses c ON c.id=u.course_id WHERE u.id=? AND c.user_id=?`,
    [unitId, userId]
  );

// Контрольная раздела: случайные задания из всех его уроков (без карточек «запомни» и теории)
router.get('/units/:id/checkpoint', async (req, res) => {
  const db = await getDB();
  const unit = await ownedUnit(db, req.user.uid, req.params.id);
  if (!unit) return res.status(404).json({ error: 'not_found' });
  const lock = (await loadCourseLocks(db, req.user.uid)).learn.get(unit.cid);
  if (lock?.locked) return res.status(423).json({ error: lock.reason || 'Курс пока закрыт программой обучения', locked: true });
  const lessons = await db.all('SELECT * FROM lang_lessons WHERE unit_id=? ORDER BY position, id', [unit.id]);
  const perLesson = [];
  for (const lesson of lessons) {
    const { exercises } = await lessonExercises(db, { ...lesson, speech_lang: unit.speech_lang });
    const graded = exercises.filter((ex) => ex.type !== 'learn' && ex.type !== 'theory');
    perLesson.push(shuffleList(graded).map((ex) => ({ ...ex, lesson_id: lesson.id, lesson_title: lesson.title })));
  }
  // Сначала по одному заданию из каждого урока, остальное — случайно
  const picked = [];
  perLesson.forEach((list) => list.length && picked.push(list.shift()));
  const rest = shuffleList(perLesson.flat());
  while (picked.length < CHECKPOINT_SIZE && rest.length) picked.push(rest.shift());
  if (!picked.length) return res.status(400).json({ error: 'В разделе нет заданий для контрольной' });
  const state = await db.get('SELECT attempts, best_score, passed FROM lang_unit_checkpoints WHERE user_id=? AND unit_id=?', [req.user.uid, unit.id]);
  res.json({
    id: unit.id,
    checkpoint: true,
    course_id: unit.cid,
    course_title: unit.course_title,
    course_icon: unit.course_icon,
    unit_title: unit.title,
    guide: unit.guide,
    title: `Контрольная: ${unit.title}`,
    description: null,
    xp: 20,
    speech_lang: unit.speech_lang,
    words: [],
    exercises: shuffleList(picked.slice(0, CHECKPOINT_SIZE)),
    completed_count: state?.attempts || 0,
    best_score: state?.best_score || 0,
    pass_score: CHECKPOINT_PASS,
  });
});

router.post('/units/:id/checkpoint/complete', async (req, res) => {
  const db = await getDB();
  const unit = await ownedUnit(db, req.user.uid, req.params.id);
  if (!unit) return res.status(404).json({ error: 'not_found' });
  const total = Math.max(1, Math.round(Number(req.body?.total) || 1));
  const correct = Math.max(0, Math.min(total, Math.round(Number(req.body?.correct) || 0)));
  const score = Math.round((correct * 100) / total);
  const passed = score >= CHECKPOINT_PASS;
  const prev = await db.get('SELECT passed FROM lang_unit_checkpoints WHERE user_id=? AND unit_id=?', [req.user.uid, unit.id]);
  const firstPass = passed && !prev?.passed;
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO lang_unit_checkpoints(user_id, unit_id, attempts, best_score, passed, last_score, last_at) VALUES(?,?,1,?,?,?,?)
     ON CONFLICT(user_id, unit_id) DO UPDATE SET attempts=attempts+1, best_score=MAX(best_score, excluded.best_score),
       passed=MAX(passed, excluded.passed), last_score=excluded.last_score, last_at=excluded.last_at`,
    [req.user.uid, unit.id, score, passed ? 1 : 0, score, ts]
  );

  // Опыт: за первую сдачу — 30, за остальные попытки — по 1 за верный ответ
  const xpEarned = firstPass ? 30 : Math.min(15, correct);
  const xpRow = (await db.get('SELECT xp FROM user_xp WHERE user_id=?', [req.user.uid])) || { xp: 0 };
  const newXp = (xpRow.xp || 0) + xpEarned;
  const level = levelFromXp(newXp);
  await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?', [req.user.uid, newXp, level, newXp, level]);
  if (firstPass) {
    await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)', [
      req.user.uid,
      'lesson_completed',
      `Контрольная сдана: ${unit.title}`,
      `${unit.course_title} · ${score}%`,
      JSON.stringify({ unit_id: unit.id, xp: xpEarned }),
      ts,
    ]);
  }
  if (unit.language_id) await markVocabMistakes(db, req.user.uid, unit.language_id, req.body?.mistake_words);

  // Уроки, где были ошибки, — их стоит повторить
  const weakIds = (Array.isArray(req.body?.weak_lessons) ? req.body.weak_lessons : []).map(Number).filter(Number.isInteger).slice(0, 20);
  const weak = weakIds.length
    ? await db.all(`SELECT id, title FROM lang_lessons WHERE unit_id=? AND id IN (${weakIds.map(() => '?').join(',')}) ORDER BY position`, [unit.id, ...weakIds])
    : [];
  const next = await db.get('SELECT id, title FROM lang_units WHERE course_id=? AND (position > ? OR (position = ? AND id > ?)) ORDER BY position, id LIMIT 1', [
    unit.cid,
    unit.position,
    unit.position,
    unit.id,
  ]);
  const tracked = [['learn.checkpoint_complete', 1]];
  if (passed) tracked.push(['learn.checkpoint_pass', 1]);
  if (correct > 0) tracked.push(['learn.correct', correct]);
  const unlocked = await trackActions(req.user.uid, tracked);
  res.json({
    score,
    passed,
    pass_score: CHECKPOINT_PASS,
    first_pass: firstPass,
    xp_earned: xpEarned,
    weak_lessons: weak,
    next_unit: next || null,
    achievements: unlocked.map((a) => ({ id: a.id, title: a.title, icon: a.icon })),
  });
});

router.get('/lessons/:id', async (req, res) => {
  const db = await getDB();
  const lesson = await db.get(
    `SELECT l.*, c.title AS course_title, c.speech_lang, c.icon AS course_icon, c.id AS cid, u.title AS unit_title, u.guide
     FROM lang_lessons l JOIN lang_courses c ON c.id=l.course_id JOIN lang_units u ON u.id=l.unit_id
     WHERE l.id=? AND c.user_id=?`,
    [req.params.id, req.user.uid]
  );
  if (!lesson) return res.status(404).json({ error: 'not_found' });
  // Курс ещё закрыт программой обучения языка
  const lock = (await loadCourseLocks(db, req.user.uid)).learn.get(lesson.cid);
  if (lock?.locked) return res.status(423).json({ error: lock.reason || 'Курс пока закрыт программой обучения', locked: true });
  const { words, exercises } = await lessonExercises(db, lesson);
  const progress = await db.get('SELECT completed_count, best_score FROM lang_lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.uid, lesson.id]);
  res.json({
    id: lesson.id,
    course_id: lesson.cid,
    course_title: lesson.course_title,
    course_icon: lesson.course_icon,
    unit_title: lesson.unit_title,
    guide: lesson.guide,
    title: lesson.title,
    description: lesson.description,
    xp: lesson.xp,
    speech_lang: lesson.speech_lang,
    words,
    exercises,
    completed_count: progress?.completed_count || 0,
    best_score: progress?.best_score || 0,
  });
});

router.post('/lessons/:id/complete', async (req, res) => {
  const db = await getDB();
  const lesson = await db.get(
    `SELECT l.*, c.language_id, c.title AS course_title FROM lang_lessons l JOIN lang_courses c ON c.id=l.course_id
     WHERE l.id=? AND c.user_id=?`,
    [req.params.id, req.user.uid]
  );
  if (!lesson) return res.status(404).json({ error: 'not_found' });

  const total = Math.max(1, Math.round(Number(req.body?.total) || 1));
  const correct = Math.max(0, Math.min(total, Math.round(Number(req.body?.correct) || 0)));
  const mistakes = Math.max(0, Math.round(Number(req.body?.mistakes) || 0));
  const durationRaw = Math.round(Number(req.body?.duration_sec));
  const secondsSpent = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.min(durationRaw, 3600) : total * 20;
  const failed = !!req.body?.failed;
  const score = Math.round((correct * 100) / total);

  const prev = await db.get('SELECT completed_count FROM lang_lesson_progress WHERE user_id=? AND lesson_id=?', [req.user.uid, lesson.id]);
  const isRepeat = (prev?.completed_count || 0) > 0;
  const tracked = [];

  if (failed) {
    if (lesson.language_id) await markVocabMistakes(db, req.user.uid, lesson.language_id, req.body?.mistake_words);
    tracked.push(['learn.lesson_fail', 1]);
    await trackActions(req.user.uid, tracked);
    return res.json({ xp_earned: 0, failed: true });
  }

  const perfect = mistakes === 0;
  const baseXp = lesson.xp || 10;
  const xpEarned = (isRepeat ? Math.ceil(baseXp / 2) : baseXp) + (perfect ? 5 : 0);
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO lang_lesson_progress(user_id, lesson_id, completed_count, best_score, xp_total, last_completed_at) VALUES(?,?,1,?,?,?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed_count=completed_count+1, best_score=MAX(best_score, excluded.best_score),
       xp_total=xp_total+excluded.xp_total, last_completed_at=excluded.last_completed_at`,
    [req.user.uid, lesson.id, perfect ? 100 : score, xpEarned, ts]
  );

  const xpRow = (await db.get('SELECT xp FROM user_xp WHERE user_id=?', [req.user.uid])) || { xp: 0 };
  const newXp = (xpRow.xp || 0) + xpEarned;
  const level = levelFromXp(newXp);
  await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?', [req.user.uid, newXp, level, newXp, level]);
  await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)', [
    req.user.uid,
    'lesson_completed',
    `Урок пройден: ${lesson.title}`,
    `${lesson.course_title} · ${correct}/${total} верно`,
    JSON.stringify({ lesson_id: lesson.id, xp: xpEarned }),
    ts,
  ]);

  // Курс привязан к языку → слова попадают в словарь (SRS), а занятие идёт в стрик и дневную цель языка.
  const words = parse(lesson.words_json, []);
  let streak = null;
  if (lesson.language_id) {
    const lang = await db.get('SELECT id, streak, streak_best, last_practice_date FROM languages WHERE id=? AND user_id=?', [lesson.language_id, req.user.uid]);
    if (lang) {
      const existing = new Set((await db.all('SELECT term FROM language_vocab WHERE user_id=? AND language_id=?', [req.user.uid, lang.id])).map((r) => r.term));
      for (const word of words) {
        if (existing.has(word.term)) continue;
        await db.run(
          'INSERT INTO language_vocab(user_id,language_id,term,translation,note,unit_label,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
          [req.user.uid, lang.id, word.term, word.translation, [word.reading, word.note].filter(Boolean).join(' · ') || null, lesson.course_title.slice(0, 120), ts, ts]
        );
      }
      const today = todayISO();
      await db.run(
        `INSERT INTO language_practice_sessions(user_id, language_id, date, exercises_done, correct_count, xp_earned, started_at, completed_at, seconds_spent)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, language_id, date) DO UPDATE SET exercises_done=exercises_done+excluded.exercises_done,
           correct_count=correct_count+excluded.correct_count, xp_earned=xp_earned+excluded.xp_earned,
           seconds_spent=COALESCE(seconds_spent,0)+excluded.seconds_spent, completed_at=excluded.completed_at`,
        [req.user.uid, lang.id, today, total, correct, xpEarned, ts, ts, secondsSpent]
      );
      streak = lang.streak || 0;
      if (lang.last_practice_date !== today) streak = lang.last_practice_date === shiftISO(today, -1) ? streak + 1 : 1;
      await db.run('UPDATE languages SET streak=?, streak_best=MAX(COALESCE(streak_best,0), ?), last_practice_date=? WHERE id=?', [streak, streak, today, lang.id]);
      // Слова, на которых ошиблись в уроке, — в «Работу над ошибками»
      await markVocabMistakes(db, req.user.uid, lang.id, req.body?.mistake_words);
    }
  }

  await syncLinkedCourses(db, req.user.uid, lesson.course_id);

  tracked.push(['learn.lesson_complete', 1]);
  if (correct > 0) tracked.push(['learn.correct', correct]);
  if (perfect) tracked.push(['learn.lesson_perfect', 1]);
  if (isRepeat) tracked.push(['learn.lesson_repeat', 1]);
  if (!isRepeat && words.length) tracked.push(['learn.words_learned', words.length]);

  if (!isRepeat) {
    const unitLeft = await db.get(
      `SELECT COUNT(*) AS n FROM lang_lessons l LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
       WHERE l.unit_id=? AND COALESCE(p.completed_count,0)=0`,
      [req.user.uid, lesson.unit_id]
    );
    if (!unitLeft?.n) tracked.push(['learn.unit_complete', 1]);
    const courseLeft = await db.get(
      `SELECT COUNT(*) AS n FROM lang_lessons l LEFT JOIN lang_lesson_progress p ON p.lesson_id=l.id AND p.user_id=?
       WHERE l.course_id=? AND COALESCE(p.completed_count,0)=0`,
      [req.user.uid, lesson.course_id]
    );
    if (!courseLeft?.n) tracked.push(['learn.course_complete', 1]);
  }
  const unlocked = await trackActions(req.user.uid, tracked);

  res.json({
    xp_earned: xpEarned,
    perfect,
    score,
    repeat: isRepeat,
    streak,
    xp: { value: newXp, level },
    achievements: unlocked.map((a) => ({ id: a.id, title: a.title, icon: a.icon })),
  });
});

export default router;
