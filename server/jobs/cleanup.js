// Автоочистка: чтобы данные приложения не разрастались годами.
// Раз в сутки (проверка каждые 6 часов, время последнего прогона хранится в cleanup.json):
//   • пустые отчёты (без единого действия) — удаляются; дневные старше 90 дней, недельные старше 2 лет;
//   • лента событий старше года;
//   • загруженные файлы, на которые больше ничего не ссылается (старше 3 дней — чтобы не задеть свежую загрузку);
//   • кэш озвучки, который не использовался 30 дней;
//   • резервные копии базы — остаются 2 последние.
import fs from 'fs';
import path from 'path';
import { getDB } from '../utils.js';
import { TTS_CACHE_DIR, UPLOADS_DIR } from '../config/paths.js';
import { DATA_DIR } from '../security.js';

const DAY = 86400_000;
const STATE_FILE = () => path.join(DATA_DIR, 'cleanup.json');

/** В отчёте есть хоть какая-то активность (та же логика, что в клиенте). */
export function reportHasActivity(report) {
  const sections = report && typeof report === 'object' ? Object.values(report.sections || {}) : [];
  return sections.some(
    (section) =>
      section &&
      ((Number(section.summary?.current) || 0) > 0 || (Array.isArray(section.items) && section.items.some((item) => (Number(item?.current) || 0) > 0)))
  );
}

const isoDaysAgo = (days) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

async function cleanReports(db) {
  let removed = 0;
  const rows = await db.all('SELECT id, data FROM progress_reports');
  const empty = rows.filter((row) => {
    try {
      return !reportHasActivity(JSON.parse(row.data));
    } catch {
      return true;
    }
  });
  for (const row of empty) {
    await db.run('DELETE FROM progress_reports WHERE id=?', [row.id]);
    removed += 1;
  }
  removed += (await db.run("DELETE FROM progress_reports WHERE period='daily' AND period_end < ?", [isoDaysAgo(90)])).changes || 0;
  removed += (await db.run("DELETE FROM progress_reports WHERE period='weekly' AND period_end < ?", [isoDaysAgo(730)])).changes || 0;
  return removed;
}

async function cleanFeed(db) {
  return (await db.run('DELETE FROM life_feed WHERE ts < ?', [new Date(Date.now() - 365 * DAY).toISOString()])).changes || 0;
}

/** Все пути загрузок, упомянутые где-либо в базе (аватары, баннеры, PDF, картинки страниц…). */
async function referencedUploads(db) {
  const refs = new Set();
  const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const { name } of tables) {
    const columns = await db.all(`PRAGMA table_info("${name}")`);
    for (const column of columns) {
      const rows = await db.all(`SELECT "${column.name}" AS v FROM "${name}" WHERE typeof("${column.name}")='text' AND "${column.name}" LIKE '%uploads%'`);
      for (const row of rows) {
        for (const match of String(row.v).matchAll(/uploads[\\/]+([^"'\s)?#\\]+)/g)) {
          try {
            refs.add(decodeURIComponent(match[1]));
          } catch {
            refs.add(match[1]);
          }
        }
      }
    }
  }
  return refs;
}

async function cleanUploads(db) {
  if (!fs.existsSync(UPLOADS_DIR)) return { files: 0, bytes: 0 };
  const refs = await referencedUploads(db);
  const cutoff = Date.now() - 3 * DAY;
  let files = 0;
  let bytes = 0;
  const walk = async (dir, rel) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, relPath);
        continue;
      }
      if (refs.has(relPath) || refs.has(entry.name)) continue;
      const stat = await fs.promises.stat(full);
      if (stat.mtimeMs > cutoff) continue;
      await fs.promises.unlink(full).catch(() => {});
      files += 1;
      bytes += stat.size;
    }
  };
  await walk(UPLOADS_DIR, '');
  return { files, bytes };
}

async function cleanTtsCache() {
  if (!fs.existsSync(TTS_CACHE_DIR)) return 0;
  const cutoff = Date.now() - 30 * DAY;
  let removed = 0;
  const walk = async (dir) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const stat = await fs.promises.stat(full);
        if (Math.max(stat.atimeMs, stat.mtimeMs) < cutoff) {
          await fs.promises.unlink(full).catch(() => {});
          removed += 1;
        }
      }
    }
  };
  await walk(TTS_CACHE_DIR);
  return removed;
}

async function cleanBackups() {
  const backups = (await fs.promises.readdir(DATA_DIR).catch(() => []))
    .filter((name) => /^lifehub\.backup-\d+\.sqlite$/.test(name))
    .sort()
    .reverse();
  for (const name of backups.slice(2)) await fs.promises.unlink(path.join(DATA_DIR, name)).catch(() => {});
  return Math.max(0, backups.length - 2);
}

export async function runCleanup() {
  const db = await getDB();
  const result = { at: new Date().toISOString() };
  const step = async (key, fn) => {
    try {
      result[key] = await fn();
    } catch (error) {
      result[key] = `error: ${error.message}`;
    }
  };
  await step('reports', () => cleanReports(db));
  await step('feed', () => cleanFeed(db));
  await step('uploads', () => cleanUploads(db));
  await step('tts', cleanTtsCache);
  await step('backups', cleanBackups);
  // Освобождаем место в файле базы после удалений
  if ((Number(result.reports) || 0) + (Number(result.feed) || 0) > 0) await db.exec('VACUUM').catch(() => {});
  try {
    fs.writeFileSync(STATE_FILE(), JSON.stringify(result, null, 2));
  } catch {
    // нет прав на запись — просто повторим в следующий раз
  }
  console.log('[cleanup]', JSON.stringify(result));
  return result;
}

export function scheduleCleanup() {
  const due = () => {
    try {
      const last = JSON.parse(fs.readFileSync(STATE_FILE(), 'utf8'))?.at;
      return !last || Date.now() - new Date(last).getTime() > DAY;
    } catch {
      return true;
    }
  };
  const tick = () => {
    if (due()) runCleanup().catch((error) => console.error('[cleanup] failed', error));
  };
  setTimeout(tick, 2 * 60_000).unref?.();
  setInterval(tick, 6 * 3600_000).unref?.();
}
