import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getDB, levelFromXp } from './utils.js';
import { TAG_ENTITY_TYPES, fetchTagLinks, sortTags, syncTagLinks } from './tagUtils.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, 'uploads');

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.promises
      .mkdir(uploadsDir, { recursive: true })
      .then(() => cb(null, uploadsDir))
      .catch((error) => cb(error, uploadsDir));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file?.originalname || '').slice(0, 16);
    const random = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${random}${ext}`);
  }
});

const MAX_PDF_FILE_SIZE = 512 * 1024 * 1024; // 512MB limit to allow 200MB+ uploads
const upload = multer({ storage, limits: { fileSize: MAX_PDF_FILE_SIZE } });

async function removeLocalUpload(url) {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('/uploads/')) return;
  const filename = path.basename(url);
  const filePath = path.join(uploadsDir, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore missing files
  }
}

router.post('/uploads/pdf', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'no_file' });
  const mime = (file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const isPdf = mime.includes('pdf') || ext === '.pdf';
  if (!isPdf) {
    await removeLocalUpload(`/uploads/${file.filename}`);
    return res.status(400).json({ error: 'invalid_type' });
  }
  res.json({
    url: `/uploads/${file.filename}`,
    original_name: file.originalname || file.filename,
    size: file.size
  });
});

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

async function recomputeGoal(db, userId, goalId) {
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
    const xpRow = await db.get('SELECT xp FROM user_xp WHERE user_id=?', [userId]) || { xp: 0 };
    const newXp = (xpRow.xp || 0) + 100;
    const level = levelFromXp(newXp);
    await db.run(
      'INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?',
      [userId, newXp, level, newXp, level]
    );
    await db.run(
      'INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)',
      [
        userId,
        'goal_completed',
        'Годовая цель выполнена',
        goal.title || '',
        JSON.stringify({ goal_id: goalId, completed }),
        new Date().toISOString()
      ]
    );
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

const HABIT_MILESTONES = [1, 10, 25, 50, 100, 200];
const LANGUAGE_MILESTONES = [25, 50, 75, 100];
const COURSE_MILESTONES = [50, 100];
const GOAL_MILESTONES = [50, 100];

const formatDateToIso = (date) => {
  if (!date || typeof date !== 'string') return null;
  const iso = new Date(date.endsWith('Z') ? date : `${date}T00:00:00Z`);
  if (Number.isNaN(iso.getTime())) return null;
  return iso.toISOString();
};

async function buildDynamicBadges(db, userId) {
  const dynamicBadges = [];

  const habitRows = await db.all('SELECT id, title FROM habits WHERE user_id=? ORDER BY title COLLATE NOCASE', [userId]);
  if (habitRows.length) {
    const checkStats = await db.all(
      'SELECT habit_id, COUNT(*) AS total, MAX(date) AS last_date FROM habit_checks WHERE user_id=? GROUP BY habit_id',
      [userId]
    );
    const habitStats = new Map();
    for (const row of checkStats) {
      habitStats.set(row.habit_id, {
        total: Number(row.total) || 0,
        lastDate: formatDateToIso(row.last_date)
      });
    }
    for (const habit of habitRows) {
      const stats = habitStats.get(habit.id) || { total: 0, lastDate: null };
      for (const milestone of HABIT_MILESTONES) {
        if (stats.total >= milestone) {
          const firstMilestone = milestone === HABIT_MILESTONES[0];
          dynamicBadges.push({
            id: `habit_${habit.id}_${milestone}`,
            name: firstMilestone
              ? `Первая отметка по привычке «${habit.title}»`
              : `Привычка «${habit.title}» выполнена ${milestone} раз`,
            description: `Вы отметили привычку «${habit.title}» ${stats.total} раз.`,
            icon: '✅',
            earned_at: stats.lastDate
          });
        }
      }
    }
  }

  const languageRows = await db.all(
    `SELECT l.id, l.name,
            COUNT(lp.id) AS total_pages,
            SUM(CASE WHEN lp.done = 1 THEN 1 ELSE 0 END) AS done_pages,
            MAX(lp.done_at) AS last_done
     FROM languages l
     LEFT JOIN language_pages lp
       ON lp.language_id = l.id AND lp.user_id = l.user_id
     WHERE l.user_id=?
     GROUP BY l.id, l.name
     ORDER BY l.name COLLATE NOCASE`,
    [userId]
  );
  for (const lang of languageRows) {
    const totalPages = Number(lang.total_pages) || 0;
    const donePages = Number(lang.done_pages) || 0;
    if (totalPages <= 0 || donePages <= 0) continue;
    const completion = Math.round((donePages * 100) / totalPages);
    for (const milestone of LANGUAGE_MILESTONES) {
      if (completion >= milestone) {
        dynamicBadges.push({
          id: `language_${lang.id}_${milestone}`,
          name: `Изучил язык «${lang.name}» на ${milestone}%`,
          description: `Пройдено ${donePages} из ${totalPages} учебных страниц по языку «${lang.name}».`,
          icon: '🗣️',
          earned_at: formatDateToIso(lang.last_done)
        });
      }
    }
  }

  const courseRows = await db.all(
    'SELECT id, title, progress, status, archived_at FROM courses WHERE user_id=? ORDER BY title COLLATE NOCASE',
    [userId]
  );
  for (const course of courseRows) {
    const progress = Number(course.progress) || 0;
    for (const milestone of COURSE_MILESTONES) {
      if (progress >= milestone || (milestone === 100 && (course.status === 'completed' || course.archived_at))) {
        dynamicBadges.push({
          id: `course_${course.id}_${milestone}`,
          name:
            milestone === 100
              ? `Курс «${course.title}» завершён`
              : `Продвинулся в курсе «${course.title}» на ${milestone}%`,
          description: `Текущий прогресс курса «${course.title}»: ${progress}%.`,
          icon: '🎓',
          earned_at: formatDateToIso(course.archived_at)
        });
      }
    }
  }

  const goalRows = await db.all(
    `SELECT g.id, g.title, g.target, g.completed, g.status, g.archived_at,
            MAX(l.date) AS last_log
     FROM yearly_goals g
     LEFT JOIN yearly_goal_logs l
       ON l.goal_id = g.id AND l.user_id = g.user_id
     WHERE g.user_id=?
     GROUP BY g.id, g.title, g.target, g.completed, g.status, g.archived_at
     ORDER BY g.created_at DESC`,
    [userId]
  );
  for (const goal of goalRows) {
    const target = Math.max(0, Number(goal.target) || 0);
    const completed = Math.max(0, Number(goal.completed) || 0);
    const pct = target > 0 ? Math.min(100, Math.round((completed * 100) / target)) : 0;
    for (const milestone of GOAL_MILESTONES) {
      const reached =
        milestone === 100
          ? pct >= 100 || goal.status === 'archived'
          : pct >= milestone;
      if (reached && milestone === 100) {
        dynamicBadges.push({
          id: `goal_${goal.id}_100`,
          name: `Годовая цель «${goal.title}» выполнена`,
          description: `Цель достигнута: ${completed} из ${target}.`,
          icon: '🎯',
          earned_at: formatDateToIso(goal.archived_at || goal.last_log)
        });
      } else if (reached) {
        dynamicBadges.push({
          id: `goal_${goal.id}_${milestone}`,
          name: `Цель «${goal.title}» достигнута на ${milestone}%`,
          description: `Прогресс по цели: ${completed} из ${target}.`,
          icon: '🎯',
          earned_at: formatDateToIso(goal.last_log)
        });
      }
    }
  }

  return dynamicBadges;
}

function attachGoalMeta(goal, logs) {
  const completionPct = goal.target > 0 ? Math.min(100, Math.round((goal.completed || 0) * 100 / goal.target)) : 0;
  const recent = logs.slice(0, 10);
  const todayDone = logs.some(log => log === todayISO());
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

router.get('/search', async (req, res) => {
  const db = await getDB();
  const rawQuery = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
  const query = rawQuery.toLowerCase();
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
  if (showPageResults) {
    let pageSql = 'SELECT jp.id, jp.title, jp.blocks_json, jp.updated_at, jp.created_at, jp.banner_url, jp.banner_gradient, jp.pinned FROM journal_pages jp WHERE jp.user_id=?';
    const pageParams = [req.user.uid];
    if (hasTextQuery) {
      const like = '%' + query + '%';
      pageSql += ' AND (LOWER(jp.title) LIKE ? OR LOWER(COALESCE(jp.blocks_json, "")) LIKE ?)';
      pageParams.push(like, like);
    }
    if (selectedTag) {
      pageSql +=
        ' AND EXISTS (SELECT 1 FROM tag_links tl WHERE tl.entity_type=? AND tl.entity_id=jp.id AND tl.user_id=? AND tl.tag_id=?)';
      pageParams.push(TAG_ENTITY_TYPES.PAGE, req.user.uid, selectedTag.id);
    }
    pageSql += ' ORDER BY jp.pinned DESC, jp.updated_at DESC LIMIT ?';
    pageParams.push(limit);
    const pageRows = await db.all(pageSql, pageParams);
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

  const shouldSearchOther = hasTextQuery || includeTagFilter;

  let languages = [];
  if (shouldSearchOther) {
    let languageSql = 'SELECT id, name, level, minutes_today, image_url, banner_url FROM languages WHERE user_id=?';
    const languageParams = [req.user.uid];
    if (hasTextQuery) {
      languageSql += ' AND LOWER(name) LIKE ?';
      languageParams.push('%' + query + '%');
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
      minutes_today: row.minutes_today,
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
      const like = '%' + query + '%';
      courseSql += ' AND (LOWER(title) LIKE ? OR LOWER(COALESCE(provider, "")) LIKE ?)';
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
      const like = '%' + query + '%';
      travelSql += ' AND (LOWER(title) LIKE ? OR LOWER(COALESCE(location, "")) LIKE ?)';
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

  let loans = [];
  if (shouldSearchOther) {
    let loanSql = 'SELECT id, bank, payment_monthly, remaining, due_day FROM loans WHERE user_id=?';
    const loanParams = [req.user.uid];
    if (hasTextQuery) {
      loanSql += ' AND LOWER(bank) LIKE ?';
      loanParams.push('%' + query + '%');
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
      habitSql += ' AND LOWER(title) LIKE ?';
      habitParams.push('%' + query + '%');
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
      calendarSql += ' AND (LOWER(title) LIKE ? OR LOWER(type) LIKE ?)';
      const like = '%' + query + '%';
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
    goalSql += ' AND LOWER(title) LIKE ?';
    goalParams.push('%' + query + '%');
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

  res.json({
    tags,
    selected_tag: selectedTag,
    tag_matches: tagMatches,
    pages,
    languages,
    courses,
    travel,
    loans,
    habits,
    calendar,
    goals
  });
});

router.get('/profile', async (req, res) => {
  const db = await getDB();
  const user = await db.get('SELECT id,name,avatar_url,banner_url,bio FROM users WHERE id=?', [req.user.uid]);
  const xp = await db.get('SELECT xp, level FROM user_xp WHERE user_id=?', [req.user.uid]) || { xp: 0, level: 1 };
  const storedBadges = await db.all(
    'SELECT b.*, ub.earned_at FROM user_badges ub JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=?',
    [req.user.uid]
  );
  const dynamicBadges = await buildDynamicBadges(db, req.user.uid);
  res.json({ user, xp, badges: [...storedBadges, ...dynamicBadges] });
});

router.post(
  '/profile',
  upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
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

      const bioRaw = req.body?.bio;
      if (typeof bioRaw === 'string') {
        updates.push('bio=?');
        params.push(bioRaw);
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

      if (updates.length > 0) {
        params.push(req.user.uid);
        await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id=?`, params);
      }

      const user = await db.get('SELECT id,name,avatar_url,banner_url,bio FROM users WHERE id=?', [req.user.uid]);
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
      title: '???? ? ???? ' + loan.bank,
      type: 'loan_due',
      mood: null
    });
  }

  const socials = await db.all('SELECT id, type, title, url, event_date FROM social_logs WHERE user_id=? AND event_date BETWEEN ? AND ? ORDER BY event_date ASC', [req.user.uid, startISO, endISO])
    .then(rows => rows.map(row => ({
      id: row.id ? 'social_' + row.id : 'social_' + row.event_date + '_' + (row.type || 'note'),
      user_id: req.user.uid,
      date: row.event_date,
      title: row.title || '',
      type: row.type || 'note',
      mood: null,
      url: row.url || null
    })));

  const pages = await db.all(
    'SELECT id, title, page_date, banner_url, banner_gradient FROM journal_pages WHERE user_id=? AND page_date IS NOT NULL AND page_date BETWEEN ? AND ? ORDER BY page_date ASC',
    [req.user.uid, startISO, endISO]
  )
    .then(rows => rows.map(row => ({
      id: 'page_' + row.id,
      user_id: req.user.uid,
      date: row.page_date,
      title: row.title || '��������',
      type: 'page',
      mood: null,
      page_id: row.id,
      url: '/pages/' + row.id,
      banner_url: row.banner_url || null,
      banner_gradient: row.banner_gradient || null
    })));

  res.json({ items: [...storedWithTags, ...virtual, ...socials, ...pages] });
});
router.post('/xp/add', async (req, res) => {
  const { amount = 0, note = null } = req.body || {};
  const db = await getDB();
  const row = await db.get('SELECT xp FROM user_xp WHERE user_id=?', [req.user.uid]) || { xp: 0 };
  const newXp = (row.xp || 0) + Math.max(0, amount);
  const level = levelFromXp(newXp);
  await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?',
    [req.user.uid, newXp, level, newXp, level]);
  const ts = new Date().toISOString();
  await db.run('INSERT INTO life_feed(user_id,type,title,text,meta,ts) VALUES(?,?,?,?,?,?)',
    [req.user.uid, 'xp_gain', '���������� XP', `+${amount}${note ? ` (${note})` : ''}`, JSON.stringify({ amount }), ts]);
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

router.get('/feed', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM life_feed WHERE user_id=? ORDER BY ts DESC LIMIT 200', [req.user.uid]);
  res.json({ items: rows });
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

router.get('/ui-settings', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT show_menu_counters FROM ui_settings WHERE user_id=?', [req.user.uid]);
  res.json({ show_menu_counters: row ? !!row.show_menu_counters : true });
});

router.put('/ui-settings', async (req, res) => {
  const db = await getDB();
  const showMenuCounters = req.body?.show_menu_counters !== false;
  const flag = showMenuCounters ? 1 : 0;
  await db.run('INSERT INTO ui_settings(user_id, show_menu_counters) VALUES(?, ?) ON CONFLICT(user_id) DO UPDATE SET show_menu_counters=?', [req.user.uid, flag, flag]);
  res.json({ show_menu_counters: !!flag });
});

function crud(table) {
  const routerCrud = express.Router();
  routerCrud.get('/', async (req, res) => {
    const db = await getDB();
    const rows = await db.all(`SELECT * FROM ${table} WHERE user_id=?`, [req.user.uid]);
    res.json({ items: rows });
  });
  routerCrud.post('/', async (req, res) => {
    const db = await getDB();
    const keys = Object.keys(req.body || {});
    const vals = keys.map((k) => req.body[k]);
    const placeholders = keys.map(() => '?').join(',');
    const sql = `INSERT INTO ${table}(user_id,${keys.join(',')}) VALUES(?,${placeholders})`;
    const result = await db.run(sql, [req.user.uid, ...vals]);
    res.json({ id: result.lastID });
  });
  routerCrud.put('/:id', async (req, res) => {
    const db = await getDB();
    const keys = Object.keys(req.body || {});
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
  minutes_today: row.minutes_today ?? 0,
  image_url: row.image_url || null,
  banner_url: row.banner_url || null,
  status: row.status || 'active',
  archived_at: row.archived_at,
  tags
});

const languagesRouter = express.Router();

languagesRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id,name,level,streak,minutes_today,status,image_url,banner_url,archived_at FROM languages WHERE user_id=? ORDER BY name COLLATE NOCASE', [req.user.uid]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LANGUAGE, ids);
  const active = [];
  const archived = [];
  for (const row of rows) {
    const mapped = mapLanguageRow(row, tagMap.get(row.id) || []);
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
  const row = await db.get('SELECT id,name,level,streak,minutes_today,status,image_url,banner_url,archived_at FROM languages WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
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
  const row = await db.get('SELECT id,name,level,streak,minutes_today,status,image_url,banner_url,archived_at FROM languages WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
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

languagesRouter.post('/:id/restore', async (req, res) => {
  const db = await getDB();
  const result = await db.run("UPDATE languages SET status='active', archived_at=NULL WHERE id=? AND user_id=?", [req.params.id, req.user.uid]);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

const mapCourseRow = (row, tags = []) => ({
  id: row.id,
  title: row.title,
  provider: row.provider,
  course_type: row.course_type,
  language_id: row.language_id,
  progress: row.progress ?? 0,
  status: row.status || 'in-progress',
  archived_at: row.archived_at,
  tags
});

const coursesRouter = express.Router();

coursesRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id,title,provider,course_type,language_id,progress,status,archived_at FROM courses WHERE user_id=? ORDER BY title COLLATE NOCASE', [req.user.uid]);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, ids);
  const active = [];
  const archived = [];
  for (const row of rows) {
    const mapped = mapCourseRow(row, tagMap.get(row.id) || []);
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
  const progress = Number.isFinite(Number(payload.progress)) ? Number(payload.progress) : 0;
  const status = typeof payload.status === 'string' ? payload.status : 'in-progress';
  const result = await db.run('INSERT INTO courses(user_id,title,provider,course_type,language_id,progress,status,archived_at) VALUES(?,?,?,?,?,?,?,NULL)', [req.user.uid, title, provider, courseType, languageId, progress, status]);
  const row = await db.get('SELECT id,title,provider,course_type,language_id,progress,status,archived_at FROM courses WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
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
  res.json({ course: mapCourseRow(row, tags) });
});

coursesRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
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
  if (payload.progress !== undefined) { updates.push('progress=?'); values.push(Number(payload.progress) || 0); }
  if (payload.status !== undefined) { updates.push('status=?'); values.push(String(payload.status)); }
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
  const row = await db.get('SELECT id,title,provider,course_type,language_id,progress,status,archived_at FROM courses WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.COURSE, [row.id]);
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

travelRouter.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id,title,location,date_from,date_to,status,notes FROM travel_plans WHERE user_id=? ORDER BY date_from DESC, id DESC', [req.user.uid]);
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
  const result = await db.run(
    'INSERT INTO travel_plans(user_id,title,location,date_from,date_to,status,notes) VALUES(?,?,?,?,?,?,?)',
    [req.user.uid, title, location, dateFrom, dateTo, status, notes]
  );
  const row = await db.get('SELECT id,title,location,date_from,date_to,status,notes FROM travel_plans WHERE id=? AND user_id=?', [result.lastID, req.user.uid]);
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
  const row = await db.get('SELECT id,title,location,date_from,date_to,status,notes FROM travel_plans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.TRAVEL, [row.id]);
  res.json({ travel: mapTravelRow(row, tagMap.get(row.id) || []) });
});

travelRouter.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM travel_plans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [TAG_ENTITY_TYPES.TRAVEL, req.params.id, req.user.uid]);
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
router.use('/courses', coursesRouter);
router.use('/socials', crud('socials'));
router.use('/journal', crud('journal'));
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

router.post('/yearly-goals', async (req, res) => {
  const db = await getDB();
  const { title, target = 100 } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'title_required' });
  const sanitizedTarget = Math.max(1, parseInt(target, 10) || 100);
  const result = await db.run(
    'INSERT INTO yearly_goals(user_id,title,target,completed,status,streak_current,streak_best,archived_at,created_at) VALUES(?,?,?,?,?,?,?,NULL, CURRENT_TIMESTAMP)',
    [req.user.uid, title.trim(), sanitizedTarget, 0, 'active', 0, 0]
  );
  const goal = await db.get('SELECT * FROM yearly_goals WHERE id=?', [result.lastID]);
  res.json({ goal: attachGoalMeta(goal, []) });
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
  if (updates.length) {
    values.push(req.params.id, req.user.uid);
    await db.run(`UPDATE yearly_goals SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
  }
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

export default router;





