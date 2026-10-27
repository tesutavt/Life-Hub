import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendPageTagsToLinks } from './tagUtils.js';
import { hashLegacyPasswords, resolveJwtSecret } from './security.js';

export const JWT_SECRET = resolveJwtSecret();
export const RESERVED_USERNAMES = new Set([
  'login',
  'register',
  'dashboard',
  'calendar',
  'languages',
  'courses',
  'year-goals',
  'journal',
  'habits',
  'daily-missions',
  'travel',
  'settings',
  'reports',
  'pages',
  'profile-full',
  'admin',
  'api',
  'uploads',
  'assets',
  'achievements',
  'learn',
]);

let db;
let opening = null;
export async function openDB() {
  if (db) return db;
  // Модули могут запросить БД параллельно ещё до старта сервера — открываем один раз,
  // иначе миграции (ALTER TABLE) выполнятся дважды и упадут на дубликате колонки.
  if (!opening) opening = openDatabase().finally(() => { opening = null; });
  return opening;
}

async function openDatabase() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const database = await open({
    filename: process.env.LIFEHUB_DATA_DIR
      ? path.join(process.env.LIFEHUB_DATA_DIR, 'lifehub.sqlite')
      : path.join(__dirname, 'lifehub.sqlite'),
    driver: sqlite3.Database
  });
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await database.exec(schema);
  await runMigrations(database);
  const { seedDefaultAchievements } = await import('./achievements/engine.js');
  await seedDefaultAchievements(database);
  await hashLegacyPasswords(database);
  db = database;
  return db;
}

export async function getDB() {
  return db || openDB();
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const database = await getDB();
    const user = await database.get(
      'SELECT id, email, username, role, is_verified FROM users WHERE id=?',
      [payload.uid]
    );
    if (!user) return res.status(401).json({ error: 'bad token' });
    req.user = {
      uid: user.id,
      email: user.email,
      username: user.username || null,
      role: user.role || 'user',
      isVerified: !!user.is_verified
    };
    next();
  } catch {
    res.status(401).json({ error: 'bad token' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'no token' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

export function normalizeUsername(value) {
  if (typeof value !== 'string') return '';
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/[-_.]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 32);
  if (!normalized || RESERVED_USERNAMES.has(normalized)) return '';
  return normalized;
}

export async function generateUniqueUsername(database, seed, excludeUserId = null) {
  const base = normalizeUsername(seed) || 'user';
  let attempt = base;
  let suffix = 1;
  while (true) {
    const existing = await database.get(
      `SELECT id FROM users WHERE LOWER(username)=LOWER(?) ${excludeUserId ? 'AND id<>?' : ''} LIMIT 1`,
      excludeUserId ? [attempt, excludeUserId] : [attempt]
    );
    if (!existing && !RESERVED_USERNAMES.has(attempt)) return attempt;
    suffix += 1;
    attempt = `${base.slice(0, Math.max(1, 32 - String(suffix).length - 1))}-${suffix}`;
  }
}

export function levelFromXp(xp = 0) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

async function runMigrations(database) {
  const usersInfo = await database.all('PRAGMA table_info(users)').catch(() => []);
  if (usersInfo.length) {
    const hasUserColumn = (name) => usersInfo.some((col) => col.name === name);
    if (!hasUserColumn('bio')) {
      await database.exec('ALTER TABLE users ADD COLUMN bio TEXT;');
    }
    if (!hasUserColumn('city')) {
      await database.exec('ALTER TABLE users ADD COLUMN city TEXT;');
    }
    if (!hasUserColumn('profile_url')) {
      await database.exec('ALTER TABLE users ADD COLUMN profile_url TEXT;');
    }
    if (!hasUserColumn('avatar_frame_main')) {
      await database.exec('ALTER TABLE users ADD COLUMN avatar_frame_main TEXT;');
    }
    if (!hasUserColumn('avatar_frame_mini')) {
      await database.exec('ALTER TABLE users ADD COLUMN avatar_frame_mini TEXT;');
    }
    // Откуда пришли фитнес-данные с телефона (Health Connect) и когда
    if (!hasUserColumn('fitness_source')) {
      await database.exec('ALTER TABLE users ADD COLUMN fitness_source TEXT;');
    }
    if (!hasUserColumn('fitness_synced_at')) {
      await database.exec('ALTER TABLE users ADD COLUMN fitness_synced_at TEXT;');
    }
    if (!hasUserColumn('weather_api_key')) {
      await database.exec('ALTER TABLE users ADD COLUMN weather_api_key TEXT;');
    }
    if (!hasUserColumn('username')) {
      await database.exec('ALTER TABLE users ADD COLUMN username TEXT;');
    }
    if (!hasUserColumn('role')) {
      await database.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';");
    }
    if (!hasUserColumn('is_verified')) {
      await database.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;');
    }
    if (!hasUserColumn('showcase_achievements')) {
      // Витрина профиля: до 6 закреплённых ачивок (JSON-массив id)
      await database.exec('ALTER TABLE users ADD COLUMN showcase_achievements TEXT;');
    }
    if (!hasUserColumn('profile_style')) {
      // Оформление профиля: фон, главное достижение, порядок витрин (JSON)
      await database.exec('ALTER TABLE users ADD COLUMN profile_style TEXT;');
    }
    if (!hasUserColumn('reminder_settings')) {
      // Настройки напоминаний (Android/Windows), JSON — см. routes/reminders
      await database.exec('ALTER TABLE users ADD COLUMN reminder_settings TEXT;');
    }
    if (!hasUserColumn('onboarding_state')) {
      // NULL — аккаунт создан до мастера приветствия (не показываем), 'pending' — показать, 'done' — пройден
      await database.exec('ALTER TABLE users ADD COLUMN onboarding_state TEXT;');
    }

    await database.exec("UPDATE users SET role = COALESCE(NULLIF(role, ''), 'user');");
    await database.exec('UPDATE users SET is_verified = COALESCE(is_verified, 0);');
    await database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username)');

    const usersWithoutUsername = await database.all(
      'SELECT id, email, name FROM users WHERE username IS NULL OR TRIM(username) = "" ORDER BY id ASC'
    );
    for (const user of usersWithoutUsername) {
      const seed = user.name || user.email || `user-${user.id}`;
      const username = await generateUniqueUsername(database, seed, user.id);
      await database.run('UPDATE users SET username=? WHERE id=?', [username, user.id]);
    }
  }

  const uiSettingsInfo = await database.all('PRAGMA table_info(ui_settings)').catch(() => []);
  if (uiSettingsInfo.length) {
    const hasUiColumn = (name) => uiSettingsInfo.some((col) => col.name === name);
    if (!hasUiColumn('hidden_menu_items')) {
      await database.exec('ALTER TABLE ui_settings ADD COLUMN hidden_menu_items TEXT;');
    }
    if (!hasUiColumn('notification_preferences')) {
      await database.exec('ALTER TABLE ui_settings ADD COLUMN notification_preferences TEXT;');
    }
    if (!hasUiColumn('dashboard_layout')) {
      // Раскладка Дэшборда: порядок блоков, скрытые блоки, вид каждого (JSON)
      await database.exec('ALTER TABLE ui_settings ADD COLUMN dashboard_layout TEXT;');
    }
  }

  const fitnessInfo = await database.all('PRAGMA table_info(fitness_daily)').catch(() => []);
  if (fitnessInfo.length) {
    const hasFitnessColumn = (name) => fitnessInfo.some((col) => col.name === name);
    if (!hasFitnessColumn('active_calories')) {
      await database.exec('ALTER TABLE fitness_daily ADD COLUMN active_calories REAL;');
    }
  }

  const pagesInfo = await database.all('PRAGMA table_info(journal_pages)').catch(() => []);
  if (pagesInfo.length) {
    if (!pagesInfo.some(col => col.name === 'blocks_json')) {
      await database.exec('ALTER TABLE journal_pages ADD COLUMN blocks_json TEXT;');
      if (pagesInfo.some(col => col.name === 'content')) {
        await database.exec('UPDATE journal_pages SET blocks_json = content WHERE content IS NOT NULL AND blocks_json IS NULL;');
      }
    }
    if (!pagesInfo.some(col => col.name === 'page_date')) {
      await database.exec('ALTER TABLE journal_pages ADD COLUMN page_date TEXT;');
    }
    if (!pagesInfo.some(col => col.name === 'pinned')) {
      await database.exec('ALTER TABLE journal_pages ADD COLUMN pinned INTEGER DEFAULT 0;');
    }
    if (!pagesInfo.some(col => col.name === 'banner_url')) {
      await database.exec('ALTER TABLE journal_pages ADD COLUMN banner_url TEXT;');
    }
    if (!pagesInfo.some(col => col.name === 'banner_gradient')) {
      await database.exec('ALTER TABLE journal_pages ADD COLUMN banner_gradient TEXT;');
    }
  }

  const feedInfo = await database.all('PRAGMA table_info(life_feed)').catch(() => []);
  if (feedInfo.length) {
    if (!feedInfo.some(col => col.name === 'type')) {
      await database.exec('ALTER TABLE life_feed ADD COLUMN type TEXT;');
      if (feedInfo.some(col => col.name === 'kind')) {
        await database.exec('UPDATE life_feed SET type = kind WHERE kind IS NOT NULL;');
      }
    }
    if (!feedInfo.some(col => col.name === 'title')) {
      await database.exec('ALTER TABLE life_feed ADD COLUMN title TEXT;');
    }
    if (!feedInfo.some(col => col.name === 'meta')) {
      await database.exec('ALTER TABLE life_feed ADD COLUMN meta TEXT;');
      if (feedInfo.some(col => col.name === 'extra')) {
        await database.exec('UPDATE life_feed SET meta = extra WHERE extra IS NOT NULL;');
      }
    }
    if (!feedInfo.some(col => col.name === 'ts')) {
      await database.exec('ALTER TABLE life_feed ADD COLUMN ts TEXT;');
      if (feedInfo.some(col => col.name === 'created_at')) {
        await database.exec('UPDATE life_feed SET ts = created_at WHERE created_at IS NOT NULL;');
      }
    }
  }

  const goalsInfo = await database.all('PRAGMA table_info(yearly_goals)').catch(() => []);
  if (goalsInfo.length) {
    const has = (name) => goalsInfo.some(col => col.name === name);
    if (!has('target')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN target INTEGER DEFAULT 0;');
      await database.exec('UPDATE yearly_goals SET target = CASE WHEN target IS NULL OR target = 0 THEN 100 ELSE target END;');
    }
    if (!has('completed')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN completed INTEGER DEFAULT 0;');
      if (has('progress')) {
        await database.exec('UPDATE yearly_goals SET completed = progress WHERE progress IS NOT NULL;');
      }
    }
    if (!has('status')) {
      await database.exec("ALTER TABLE yearly_goals ADD COLUMN status TEXT DEFAULT 'active';");
    }
    if (!has('streak_current')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN streak_current INTEGER DEFAULT 0;');
    }
    if (!has('streak_best')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN streak_best INTEGER DEFAULT 0;');
    }
    if (!has('archived_at')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN archived_at TEXT;');
    }
    if (!has('created_at')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP;');
    }
    // Автоотметка: день засчитывается сам, когда действие выполнено auto_min раз
    if (!has('auto_action')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN auto_action TEXT;');
    }
    if (!has('auto_min')) {
      await database.exec('ALTER TABLE yearly_goals ADD COLUMN auto_min INTEGER DEFAULT 1;');
    }

    await database.exec('UPDATE yearly_goals SET target = CASE WHEN target IS NULL OR target = 0 THEN 100 ELSE target END;');
    await database.exec('UPDATE yearly_goals SET completed = COALESCE(completed, 0);');
    await database.exec("UPDATE yearly_goals SET status = COALESCE(status, 'active');");
    await database.exec("UPDATE yearly_goals SET status = 'archived', archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP) WHERE status <> 'archived' AND target > 0 AND completed >= target;");
  }

  let languagesInfo = await database.all('PRAGMA table_info(languages)').catch(() => []);
  if (languagesInfo.length) {
    const hasLanguage = (name) => languagesInfo.some((col) => col.name === name);
    const ensureLanguageColumn = async (column, statement) => {
      if (hasLanguage(column)) return;
      try {
        await database.exec(statement);
      } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (!message.includes('duplicate column name')) {
          throw error;
        }
      }
      languagesInfo = await database.all('PRAGMA table_info(languages)').catch(() => languagesInfo);
    };

    await ensureLanguageColumn('status', "ALTER TABLE languages ADD COLUMN status TEXT DEFAULT 'active';");
    await ensureLanguageColumn('archived_at', 'ALTER TABLE languages ADD COLUMN archived_at TEXT;');
    await ensureLanguageColumn('image_url', 'ALTER TABLE languages ADD COLUMN image_url TEXT;');
    await ensureLanguageColumn('banner_url', 'ALTER TABLE languages ADD COLUMN banner_url TEXT;');
    await ensureLanguageColumn('streak_best', 'ALTER TABLE languages ADD COLUMN streak_best INTEGER DEFAULT 0;');
    await ensureLanguageColumn('daily_goal_xp', 'ALTER TABLE languages ADD COLUMN daily_goal_xp INTEGER DEFAULT 50;');
    await ensureLanguageColumn('last_practice_date', 'ALTER TABLE languages ADD COLUMN last_practice_date TEXT;');
    // Программа обучения: названия этапов и порог открытия ({ stages: [{ title, unlock_pct }] })
    await ensureLanguageColumn('program_json', 'ALTER TABLE languages ADD COLUMN program_json TEXT;');
    const sessionsInfo = await database.all('PRAGMA table_info(language_practice_sessions)').catch(() => []);
    if (sessionsInfo.length && !sessionsInfo.some((col) => col.name === 'seconds_spent')) {
      // Реальное время занятий (уроки, тренировки, ручные «+15 мин»)
      await database.exec('ALTER TABLE language_practice_sessions ADD COLUMN seconds_spent INTEGER DEFAULT 0;');
    }
    await database.exec("UPDATE languages SET status = COALESCE(status, 'active');");
    await database.exec("UPDATE languages SET status = 'archived' WHERE status <> 'archived' AND archived_at IS NOT NULL;");
  }

  const coursesInfo = await database.all('PRAGMA table_info(courses)').catch(() => []);
  if (coursesInfo.length) {
    const hasCourse = (name) => coursesInfo.some(col => col.name === name);
    if (!hasCourse('course_type')) {
      await database.exec("ALTER TABLE courses ADD COLUMN course_type TEXT DEFAULT 'study';");
      await database.exec("UPDATE courses SET course_type = 'study' WHERE course_type IS NULL OR course_type = '';");
    }
    if (!hasCourse('language_id')) {
      await database.exec('ALTER TABLE courses ADD COLUMN language_id INTEGER;');
    }
    if (!hasCourse('status')) {
      await database.exec("ALTER TABLE courses ADD COLUMN status TEXT DEFAULT 'in-progress';");
    }
    if (!hasCourse('archived_at')) {
      await database.exec('ALTER TABLE courses ADD COLUMN archived_at TEXT;');
    }
    if (!hasCourse('learn_course_id')) {
      // Привязка к импортированному курсу-тренировке: прогресс считается по пройденным урокам
      await database.exec('ALTER TABLE courses ADD COLUMN learn_course_id INTEGER;');
    }
    if (!hasCourse('program_stage')) {
      // Этап в программе языка: курсы одного этапа идут параллельно
      await database.exec('ALTER TABLE courses ADD COLUMN program_stage INTEGER DEFAULT 1;');
    }
    await database.exec("UPDATE courses SET status = COALESCE(status, 'in-progress');");
  }

  const travelInfo = await database.all('PRAGMA table_info(travel_plans)').catch(() => []);
  if (travelInfo.length) {
    const hasTravel = (name) => travelInfo.some(col => col.name === name);
    if (!hasTravel('status')) {
      await database.exec("ALTER TABLE travel_plans ADD COLUMN status TEXT DEFAULT 'planned';");
    }
    await database.exec("UPDATE travel_plans SET status = COALESCE(status, 'planned');");
  }

  await database.exec("CREATE TABLE IF NOT EXISTS language_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, language_id INTEGER NOT NULL, page_id INTEGER NOT NULL, done INTEGER DEFAULT 0, done_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, language_id, page_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(language_id) REFERENCES languages(id) ON DELETE CASCADE, FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE)");

  await database.exec(
    "CREATE TABLE IF NOT EXISTS language_pdf_pages (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "user_id INTEGER NOT NULL, " +
      "language_id INTEGER NOT NULL, " +
      "title TEXT NOT NULL, " +
      "pdf_url TEXT NOT NULL, " +
      "page_number INTEGER, " +
      "done INTEGER DEFAULT 0, " +
      "done_at TEXT, " +
      "original_name TEXT, " +
      "created_at TEXT DEFAULT CURRENT_TIMESTAMP, " +
      "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, " +
      "FOREIGN KEY(language_id) REFERENCES languages(id) ON DELETE CASCADE" +
    ")"
  );
  await database.exec(
    'CREATE INDEX IF NOT EXISTS idx_language_pdf_pages_user ON language_pdf_pages(user_id, language_id, done)'
  );

  await database.exec(
    'CREATE TABLE IF NOT EXISTS course_pages (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'user_id INTEGER NOT NULL, ' +
      'course_id INTEGER NOT NULL, ' +
      'page_id INTEGER NOT NULL, ' +
      'done INTEGER DEFAULT 0, ' +
      'done_at TEXT, ' +
      'created_at TEXT DEFAULT CURRENT_TIMESTAMP, ' +
      'UNIQUE(user_id, course_id, page_id), ' +
      'FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, ' +
      'FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE, ' +
      'FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE' +
    ')'
  );

  await database.exec(
    'CREATE TABLE IF NOT EXISTS course_pdf_pages (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'user_id INTEGER NOT NULL, ' +
      'course_id INTEGER NOT NULL, ' +
      'title TEXT NOT NULL, ' +
      'pdf_url TEXT NOT NULL, ' +
      'page_number INTEGER, ' +
      'done INTEGER DEFAULT 0, ' +
      'done_at TEXT, ' +
      'original_name TEXT, ' +
      'created_at TEXT DEFAULT CURRENT_TIMESTAMP, ' +
      'FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, ' +
      'FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE' +
    ')'
  );

  await database.exec(
    'CREATE INDEX IF NOT EXISTS idx_course_pdf_pages_user ON course_pdf_pages(user_id, course_id, done)'
  );

  await database.exec("CREATE TABLE IF NOT EXISTS yearly_goal_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, goal_id INTEGER NOT NULL, date TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, goal_id, date), FOREIGN KEY(goal_id) REFERENCES yearly_goals(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");

  await database.exec('CREATE TABLE IF NOT EXISTS habit_checks (user_id INTEGER NOT NULL, habit_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY(user_id, habit_id, date), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE)');

  const transactionsInfo = await database.all('PRAGMA table_info(transactions)').catch(() => []);
  if (transactionsInfo.length && !transactionsInfo.some((col) => col.name === 'category')) {
    // Категория для расходов, добавленных вручную (у импортированных её определяет MCC/описание)
    await database.exec('ALTER TABLE transactions ADD COLUMN category TEXT;');
  }

  const calendarInfo = await database.all('PRAGMA table_info(calendar_events)').catch(() => []);
  if (calendarInfo.length && !calendarInfo.some((col) => col.name === 'plan_key')) {
    // События, созданные планировщиком обучения (чтобы пересоздавать план без дублей)
    await database.exec('ALTER TABLE calendar_events ADD COLUMN plan_key TEXT;');
  }

  await database.exec("CREATE TABLE IF NOT EXISTS ui_settings (user_id INTEGER PRIMARY KEY, show_menu_counters INTEGER DEFAULT 1, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");

  await database.exec(
    'CREATE TABLE IF NOT EXISTS course_progress_logs (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'user_id INTEGER NOT NULL, ' +
      'course_id INTEGER NOT NULL, ' +
      'progress INTEGER NOT NULL, ' +
      'logged_at TEXT NOT NULL, ' +
      'FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, ' +
      'FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE' +
    ')'
  );
  await database.exec('CREATE INDEX IF NOT EXISTS idx_course_progress_logs_user ON course_progress_logs(user_id, course_id, logged_at)');

await database.exec(
  'CREATE TABLE IF NOT EXISTS progress_reports (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'user_id INTEGER NOT NULL, ' +
    'period TEXT NOT NULL, ' +
    'period_key TEXT NOT NULL, ' +
    'period_start TEXT NOT NULL, ' +
    'period_end TEXT NOT NULL, ' +
    'data TEXT NOT NULL, ' +
    'generated_at TEXT DEFAULT CURRENT_TIMESTAMP, ' +
    'FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, ' +
    'UNIQUE(user_id, period, period_key)' + // закрывающая скобка была потеряна
  ');' // <-- точка с запятой после скобки
);
  await database.exec('CREATE INDEX IF NOT EXISTS idx_progress_reports_user ON progress_reports(user_id, period, period_start)');

  await database.exec(`CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, color TEXT DEFAULT '#6366F1', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE TABLE IF NOT EXISTS page_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, page_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, page_id, tag_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE TABLE IF NOT EXISTS tag_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, tag_id, entity_type, entity_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE INDEX IF NOT EXISTS idx_tag_links_user_type ON tag_links(user_id, entity_type, entity_id)`);

  const weeklyCompletionsInfo = await database.all('PRAGMA table_info(weekly_mission_completions)').catch(() => []);
  if (weeklyCompletionsInfo.length && !weeklyCompletionsInfo.some((col) => col.name === 'definition_key')) {
    // Leftover table from an earlier, incompatible weekly-missions prototype (mission_key/progress_value/week_end
    // columns, never wired to any route) — safe to drop and let schema.sql recreate it with the current shape.
    await database.exec('DROP TABLE weekly_mission_completions');
    await database.exec(
      'CREATE TABLE IF NOT EXISTS weekly_mission_completions(' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
        'user_id INTEGER NOT NULL, ' +
        'definition_key TEXT NOT NULL, ' +
        'week_start TEXT NOT NULL, ' +
        'points_awarded INTEGER DEFAULT 0, ' +
        'xp_awarded INTEGER DEFAULT 0, ' +
        'completed_at TEXT DEFAULT CURRENT_TIMESTAMP, ' +
        'UNIQUE(user_id, definition_key, week_start), ' +
        'FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE' +
      ')'
    );
  }

  await appendPageTagsToLinks(database);
}
  
