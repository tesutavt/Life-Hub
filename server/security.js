// Безопасность для публичного сервера (VDS): секрет токенов, хэши паролей, ограничение частоты.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.LIFEHUB_DATA_DIR || SERVER_ROOT;

/**
 * Секрет подписи JWT. Порядок: переменная JWT_SECRET → файл .jwt-secret в папке данных
 * (создаётся случайным при первом запуске). Раньше по умолчанию был общий 'supersecret',
 * с которым любой мог подделать токен на публичном сервере.
 */
export function resolveJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 16) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, '.jwt-secret');
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // файла ещё нет
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

// ───── Пароли: scrypt со случайной солью ─────
const PREFIX = 'scrypt';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

export const isHashed = (stored) => typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);

/** Проверка пароля. Старые записи с открытым паролем тоже принимаются (их перехэширует логин). */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored) return false;
  if (!isHashed(stored)) {
    const a = Buffer.from(String(password));
    const b = Buffer.from(stored);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const [, salt, hash] = stored.split('$');
  const actual = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Хэширует пароли, которые остались в открытом виде (выполняется при старте). */
export async function hashLegacyPasswords(db) {
  const rows = await db.all('SELECT id, password FROM users WHERE password IS NOT NULL AND password <> ""');
  let updated = 0;
  for (const row of rows) {
    if (isHashed(row.password)) continue;
    await db.run('UPDATE users SET password=? WHERE id=?', [hashPassword(row.password), row.id]);
    updated += 1;
  }
  return updated;
}

// ───── Простое ограничение частоты запросов (в памяти) ─────
export function rateLimit({ windowMs, max, message = 'Слишком много запросов, попробуйте позже' }) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      if (hits.size > 10_000) hits.clear();
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
