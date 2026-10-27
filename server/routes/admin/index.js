import express from 'express';
import { getDB, normalizeUsername, requireRole } from '../../utils.js';
import { hashPassword } from '../../security.js';

const router = express.Router();

router.use(requireRole('moderator', 'admin'));

router.get('/users', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    `SELECT id, email, name, username, role, is_verified, avatar_url
     FROM users
     ORDER BY is_verified DESC, role DESC, id ASC`
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name || 'User',
      username: row.username,
      role: row.role || 'user',
      is_verified: !!row.is_verified,
      avatar_url: row.avatar_url || null,
    })),
  });
});

router.patch('/users/:id', async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'bad_id' });

  const db = await getDB();
  const target = await db.get('SELECT id, role FROM users WHERE id=?', [userId]);
  if (!target) return res.status(404).json({ error: 'not_found' });

  const updates = [];
  const params = [];

  if (req.body?.is_verified !== undefined) {
    updates.push('is_verified=?');
    params.push(req.body.is_verified ? 1 : 0);
  }

  if (typeof req.body?.username === 'string') {
    const username = normalizeUsername(req.body.username);
    if (!username) return res.status(400).json({ error: 'bad_username' });
    const existing = await db.get('SELECT id FROM users WHERE LOWER(username)=LOWER(?) AND id<>?', [username, userId]);
    if (existing) return res.status(400).json({ error: 'username_taken' });
    updates.push('username=?');
    params.push(username);
  }

  if (req.body?.password !== undefined) {
    // Сброс пароля — только администратор
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'password_change_forbidden' });
    const password = String(req.body.password || '');
    if (password.length < 4) return res.status(400).json({ error: 'Пароль должен быть не короче 4 символов' });
    updates.push('password=?');
    params.push(hashPassword(password));
  }

  if (req.body?.role !== undefined) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'role_change_forbidden' });
    const nextRole = String(req.body.role || '').trim();
    if (!['user', 'moderator', 'admin'].includes(nextRole)) return res.status(400).json({ error: 'bad_role' });
    updates.push('role=?');
    params.push(nextRole);
  }

  if (!updates.length) return res.json({ success: true });

  params.push(userId);
  await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id=?`, params);

  const user = await db.get(
    'SELECT id, email, name, username, role, is_verified, avatar_url FROM users WHERE id=?',
    [userId]
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name || 'User',
      username: user.username,
      role: user.role || 'user',
      is_verified: !!user.is_verified,
      avatar_url: user.avatar_url || null,
    },
  });
});

export default router;
