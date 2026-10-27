// Программа изучения языка: курсы разбиты на этапы.
// Курсы одного этапа проходятся параллельно; этап 1 открыт сразу,
// следующий открывается, когда предыдущий пройден на unlock_pct процентов.

const parse = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const clampPct = (value) => Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
const courseProgress = (row) => (row.status === 'done' ? 100 : clampPct(row.progress));

/** Этапы одного языка с прогрессом и статусом блокировки. */
function buildStages(language, courses) {
  const meta = parse(language.program_json, {})?.stages || [];
  const stageNumbers = Array.from(new Set(courses.map((c) => Math.max(1, Number(c.program_stage) || 1)))).sort((a, b) => a - b);
  const count = Math.max(stageNumbers.length ? stageNumbers[stageNumbers.length - 1] : 1, meta.length, 1);
  const stages = [];
  let previous = null;
  for (let n = 1; n <= count; n += 1) {
    const list = courses.filter((c) => Math.max(1, Number(c.program_stage) || 1) === n);
    const info = meta[n - 1] || {};
    const progress = list.length ? Math.round(list.reduce((sum, c) => sum + courseProgress(c), 0) / list.length) : 0;
    const unlockPct = n === 1 ? 0 : clampPct(info.unlock_pct ?? 100);
    let unlocked = true;
    let reason = null;
    if (previous) {
      // Пустой предыдущий этап не блокирует
      const prevDone = previous.courses.length === 0 || previous.progress_pct >= unlockPct;
      unlocked = previous.unlocked && prevDone;
      if (!unlocked) {
        reason = previous.unlocked
          ? `Откроется, когда этап «${previous.title}» будет пройден на ${unlockPct}% (сейчас ${previous.progress_pct}%)`
          : `Откроется после этапа «${previous.title}»`;
      }
    }
    const stage = {
      stage: n,
      title: typeof info.title === 'string' && info.title.trim() ? info.title.trim() : `Этап ${n}`,
      unlock_pct: unlockPct,
      progress_pct: progress,
      unlocked,
      reason,
      courses: list.map((c) => ({ id: c.id, title: c.title, progress: courseProgress(c), learn_course_id: c.learn_course_id ?? null, provider: c.provider || '' })),
    };
    stages.push(stage);
    previous = stage;
  }
  return stages;
}

async function loadLanguageCourses(db, userId, languageId) {
  return db.all(
    `SELECT id, title, provider, progress, status, learn_course_id, COALESCE(program_stage,1) AS program_stage
     FROM courses WHERE user_id=? AND language_id=? AND archived_at IS NULL ORDER BY COALESCE(program_stage,1), title COLLATE NOCASE`,
    [userId, languageId]
  );
}

export async function loadProgram(db, userId, languageId) {
  const language = await db.get('SELECT id, name, program_json FROM languages WHERE id=? AND user_id=?', [languageId, userId]);
  if (!language) return null;
  const courses = await loadLanguageCourses(db, userId, languageId);
  return { language: { id: language.id, name: language.name }, stages: buildStages(language, courses) };
}

/**
 * Блокировки по всем языкам пользователя:
 * courses — Map(id курса → {stage, locked, reason}), learn — Map(id курса-тренировки → то же).
 */
export async function loadCourseLocks(db, userId) {
  const languages = await db.all('SELECT id, name, program_json FROM languages WHERE user_id=?', [userId]);
  const rows = await db.all(
    `SELECT id, title, provider, progress, status, learn_course_id, language_id, COALESCE(program_stage,1) AS program_stage
     FROM courses WHERE user_id=? AND archived_at IS NULL AND language_id IS NOT NULL`,
    [userId]
  );
  const courses = new Map();
  const learn = new Map();
  for (const language of languages) {
    const list = rows.filter((row) => row.language_id === language.id);
    if (!list.length) continue;
    for (const stage of buildStages(language, list)) {
      for (const course of stage.courses) {
        const lock = { stage: stage.stage, stage_title: stage.title, locked: !stage.unlocked, reason: stage.reason };
        courses.set(course.id, lock);
        // Курс-тренировка открыт, если открыта хотя бы одна связанная карточка
        if (course.learn_course_id) {
          const prev = learn.get(course.learn_course_id);
          if (!prev || (prev.locked && !lock.locked)) learn.set(course.learn_course_id, lock);
        }
      }
    }
  }
  return { courses, learn };
}

/** Сохраняет программу: [{ title, unlock_pct, course_ids: [] }]. Пустые этапы выбрасываются. */
export async function saveProgram(db, userId, languageId, stagesInput) {
  const owned = new Set((await loadLanguageCourses(db, userId, languageId)).map((c) => c.id));
  const stages = (Array.isArray(stagesInput) ? stagesInput : [])
    .map((stage) => ({
      title: typeof stage?.title === 'string' ? stage.title.trim().slice(0, 60) : '',
      unlock_pct: clampPct(stage?.unlock_pct ?? 100),
      course_ids: (Array.isArray(stage?.course_ids) ? stage.course_ids : []).map(Number).filter((id) => owned.has(id)),
    }))
    .filter((stage) => stage.course_ids.length);
  await db.exec('BEGIN');
  try {
    // Курсы, не попавшие ни в один этап, — в первый
    await db.run('UPDATE courses SET program_stage=1 WHERE user_id=? AND language_id=?', [userId, languageId]);
    for (const [index, stage] of stages.entries()) {
      for (const id of stage.course_ids) await db.run('UPDATE courses SET program_stage=? WHERE id=? AND user_id=?', [index + 1, id, userId]);
    }
    const json = JSON.stringify({ stages: stages.map(({ title, unlock_pct }) => ({ title, unlock_pct })) });
    await db.run('UPDATE languages SET program_json=? WHERE id=? AND user_id=?', [json, languageId, userId]);
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  return loadProgram(db, userId, languageId);
}
