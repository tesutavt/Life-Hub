import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { appendPageTagsToLinks } from './tagUtils.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

let db;
export async function openDB() {
  if (db) return db;
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  db = await open({
    filename: path.join(__dirname, 'lifehub.sqlite'),
    driver: sqlite3.Database
  });
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await db.exec(schema);
  await runMigrations(db);
  return db;
}

export async function getDB() {
  return db || openDB();
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { uid: payload.uid, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'bad token' });
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

  await database.exec("CREATE TABLE IF NOT EXISTS yearly_goal_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, goal_id INTEGER NOT NULL, date TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, goal_id, date), FOREIGN KEY(goal_id) REFERENCES yearly_goals(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");

  await database.exec('CREATE TABLE IF NOT EXISTS habit_checks (user_id INTEGER NOT NULL, habit_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY(user_id, habit_id, date), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE)');

  await database.exec("CREATE TABLE IF NOT EXISTS ui_settings (user_id INTEGER PRIMARY KEY, show_menu_counters INTEGER DEFAULT 1, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)");

  await database.exec(`CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, label TEXT NOT NULL, color TEXT DEFAULT '#6366F1', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE TABLE IF NOT EXISTS page_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, page_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, page_id, tag_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE TABLE IF NOT EXISTS tag_links (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, tag_id, entity_type, entity_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE)`);

  await database.exec(`CREATE INDEX IF NOT EXISTS idx_tag_links_user_type ON tag_links(user_id, entity_type, entity_id)`);

  await appendPageTagsToLinks(database);
}
  
