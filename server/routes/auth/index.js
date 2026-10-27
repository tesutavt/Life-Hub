import crypto from 'crypto';
import os from 'os';
import express from 'express';
import jwt from 'jsonwebtoken';
import { generateUniqueUsername, getDB, JWT_SECRET, normalizeUsername, requireAuth } from '../../utils.js';
import { trackAction } from '../../achievements/engine.js';
import { hashPassword, isHashed, rateLimit, verifyPassword } from '../../security.js';

// Регистрацию на публичном сервере можно закрыть: ALLOW_REGISTRATION=false
const registrationOpen = () => String(process.env.ALLOW_REGISTRATION ?? 'true').toLowerCase() !== 'false';
const authLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'Слишком много попыток входа. Подождите минуту.' });

const router = express.Router();

const buildAuthPayload = (user) => ({
  uid: user.id,
  email: user.email,
  username: user.username || null,
  role: user.role || 'user',
  isVerified: !!user.is_verified
});

const signAuthToken = (user) => jwt.sign(buildAuthPayload(user), JWT_SECRET, { expiresIn: '7d' });

router.get('/config', (req, res) => {
  res.json({ registration: registrationOpen() });
});

router.post('/register', authLimiter, async (req, res) => {
  if (!registrationOpen()) return res.status(403).json({ error: 'Регистрация на этом сервере закрыта' });
  const { email, password, name } = req.body;
  if (typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'Укажите корректный email' });
  if (typeof password !== 'string' || password.length < 4) return res.status(400).json({ error: 'Пароль должен быть не короче 4 символов' });
  const db = await getDB();
  try {
    const safeName = typeof name === 'string' && name.trim() ? name.trim() : 'User';
    const requestedUsername = normalizeUsername(req.body?.username || '');
    const username = requestedUsername || (await generateUniqueUsername(db, safeName || email));
    const existing = await db.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?)', [username]);
    if (existing) return res.status(400).json({ error: 'username_taken' });
    const r = await db.run(
      "INSERT INTO users(email,password,name,username,role,is_verified,onboarding_state) VALUES(?,?,?,?,?,?,'pending')",
      [email.trim(), hashPassword(password), safeName, username, 'user', 0]
    );
    const uid = r.lastID;
    await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?)', [uid, 0, 1]);
    const user = await db.get('SELECT id,email,username,role,is_verified FROM users WHERE id=?', [uid]);
    const token = signAuthToken(user);
    trackAction(uid, 'auth.register');
    res.json({ token, user: buildAuthPayload(user) });
  } catch {
    res.status(400).json({ error: 'exists' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  const db = await getDB();
  // Вход по email или по имени пользователя
  const login = typeof email === 'string' ? email.trim() : '';
  const u = await db.get('SELECT * FROM users WHERE LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?)', [login, login.replace(/^@/, '')]);
  if (!u || !verifyPassword(password, u.password)) return res.status(401).json({ error: 'Неверный логин или пароль' });
  if (!isHashed(u.password)) await db.run('UPDATE users SET password=? WHERE id=?', [hashPassword(password), u.id]);
  const token = signAuthToken(u);
  trackAction(u.id, 'auth.login');
  res.json({ token, user: buildAuthPayload(u) });
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = await getDB();
    const user = await db.get(
      'SELECT id,email,name,username,role,is_verified,avatar_url FROM users WHERE id=?',
      [payload.uid]
    );
    if (!user) return res.status(401).json({ error: 'bad token' });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role || 'user',
        isVerified: !!user.is_verified,
        avatarUrl: user.avatar_url || null
      }
    });
  } catch {
    res.status(401).json({ error: 'bad token' });
  }
});

// ───────────── Вход на телефоне по QR-коду ─────────────
// Компьютер (уже вошедший) получает одноразовый код на 2 минуты и показывает QR;
// телефон сканирует его и обменивает код на токен — без ввода адреса и пароля.
const QR_TTL_MS = 2 * 60_000;
const qrCodes = new Map(); // code → { uid, expires }
const qrLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'Слишком много попыток. Подождите минуту.' });

/** Адреса этого компьютера в локальной сети — по ним телефон достучится до сервера. */
function lanUrls(req) {
  const port = req.socket.localPort || Number(process.env.PORT) || 4000;
  const urls = [];
  const host = String(req.headers.host || '');
  // Сервер открыт не на localhost (VDS, проброс порта) — этот адрес и есть правильный
  if (host && !/^(localhost|127\.|\[::1\])/i.test(host)) urls.push(`${req.protocol}://${host}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) urls.push(`http://${item.address}:${port}`);
    }
  }
  return Array.from(new Set(urls));
}

router.post('/qr', requireAuth, async (req, res) => {
  const now = Date.now();
  for (const [key, value] of qrCodes) if (value.expires < now) qrCodes.delete(key);
  const code = crypto.randomBytes(24).toString('base64url');
  qrCodes.set(code, { uid: req.user.uid, expires: now + QR_TTL_MS });
  res.json({ code, expires_at: new Date(now + QR_TTL_MS).toISOString(), urls: lanUrls(req) });
});

router.post('/qr/redeem', qrLimiter, async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const entry = qrCodes.get(code);
  qrCodes.delete(code); // одноразовый
  if (!entry || entry.expires < Date.now()) return res.status(400).json({ error: 'QR-код устарел — откройте его на компьютере заново' });
  const db = await getDB();
  const user = await db.get('SELECT id,email,username,role,is_verified FROM users WHERE id=?', [entry.uid]);
  if (!user) return res.status(400).json({ error: 'Пользователь не найден' });
  trackAction(user.id, 'auth.login');
  res.json({ token: signAuthToken(user), user: buildAuthPayload(user) });
});

export default router;
