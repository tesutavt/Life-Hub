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

async function recomputeCourseProgress(db, userId, courseId) {
  const course = await db.get('SELECT id, progress, status FROM courses WHERE id=? AND user_id=?', [courseId, userId]);
  if (!course) return null;

  const pageStats = await db.get(
    'SELECT COUNT(*) AS total, SUM(done) AS completed FROM course_pages WHERE user_id=? AND course_id=?',
    [userId, courseId]
  );
  const pdfStats = await db.get(
    'SELECT COUNT(*) AS total, SUM(done) AS completed FROM course_pdf_pages WHERE user_id=? AND course_id=?',
    [userId, courseId]
  );

  const total = Number(pageStats?.total || 0) + Number(pdfStats?.total || 0);
  const completed = Number(pageStats?.completed || 0) + Number(pdfStats?.completed || 0);
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
      'SELECT jp.id, jp.title, jp.blocks_json FROM journal_pages jp WHERE jp.user_id=? AND LOWER(COALESCE(jp.blocks_json, "")) LIKE ? ORDER BY jp.updated_at DESC LIMIT ?',
      [req.user.uid, '%' + query + '%', limit * 3]
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
    pdf_bookmarks: pdfBookmarks,
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
  const user = await db.get('SELECT id,name,avatar_url,banner_url,bio,city,weather_api_key FROM users WHERE id=?', [req.user.uid]);
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

      const cityRaw = req.body?.city;
      if (typeof cityRaw === 'string') {
        updates.push('city=?');
        params.push(cityRaw);
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

      const user = await db.get('SELECT id,name,avatar_url,banner_url,bio,city FROM users WHERE id=?', [req.user.uid]);
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
      title: row.title || 'Страница',
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
    [req.user.uid, 'xp_gain', 'Получено XP', `+${amount}${note ? ` (${note})` : ''}`, JSON.stringify({ amount }), ts]);
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

router.get('/ui-settings', async (req, res) => {
  const db = await getDB();
  const row = await db.get(
    'SELECT show_menu_counters, hidden_menu_items, notification_preferences FROM ui_settings WHERE user_id=?',
    [req.user.uid],
  );
  const hiddenMenuItems = normalizeHiddenMenuItems(row?.hidden_menu_items);
  const notificationPreferences = normalizeNotificationPreferences(row?.notification_preferences);
  res.json({
    show_menu_counters: row ? !!row.show_menu_counters : true,
    hidden_menu_items: hiddenMenuItems,
    notification_preferences: notificationPreferences,
  });
});

router.put('/ui-settings', async (req, res) => {
  const db = await getDB();
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
  const courseRows = await db.all(
    'SELECT id,title,provider,course_type,language_id,progress,status,archived_at FROM courses WHERE user_id=?',
    [req.user.uid]
  );
  const courseTagMap = await fetchTagLinks(
    db,
    req.user.uid,
    TAG_ENTITY_TYPES.COURSE,
    courseRows.map((course) => course.id)
  );
  const coursesByLanguage = new Map();
  for (const courseRow of courseRows) {
    if (courseRow.archived_at) continue;
    if (courseRow.language_id == null) continue;
    const mappedCourse = mapCourseRow(courseRow, courseTagMap.get(courseRow.id) || []);
    if (!coursesByLanguage.has(courseRow.language_id)) {
      coursesByLanguage.set(courseRow.language_id, []);
    }
    coursesByLanguage.get(courseRow.language_id).push(mappedCourse);
  }
  for (const courseList of coursesByLanguage.values()) {
    courseList.sort((a, b) => a.title.localeCompare(b.title));
  }
  const active = [];
  const archived = [];
  for (const row of rows) {
    const base = mapLanguageRow(row, tagMap.get(row.id) || []);
    const courseList = coursesByLanguage.get(row.id) || [];
    const totalCourses = courseList.length;
    const completedCourses = courseList.filter((course) => normalizeCourseProgress(course.progress) >= 100).length;
    const courseProgressPct = totalCourses > 0 ? Math.round((completedCourses * 100) / totalCourses) : 0;
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
  const progress = normalizeCourseProgress(payload.progress);
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
  await logCourseProgress(db, req.user.uid, row.id, row.progress);
  res.json({ course: mapCourseRow(row, tags) });
});

coursesRouter.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const existing = await db.get(
    'SELECT id,title,provider,course_type,language_id,progress,status,archived_at FROM courses WHERE id=? AND user_id=?',
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
      items.push(report);
    } catch {
      // skip malformed entries
    }
  }

  res.json({ items });
});

export default router;





