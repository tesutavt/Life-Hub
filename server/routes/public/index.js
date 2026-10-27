import express from 'express';
import { getDB } from '../../utils.js';

const router = express.Router();

router.get('/profiles/:username', async (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  if (!username) return res.status(400).json({ error: 'username_required' });

  const db = await getDB();
  const user = await db.get(
    `SELECT id, name, username, bio, city, avatar_url, banner_url, profile_url, role, is_verified
     FROM users
     WHERE LOWER(username)=LOWER(?)`,
    [username]
  );
  if (!user) return res.status(404).json({ error: 'not_found' });

  const [pages, languages, courses, travel] = await Promise.all([
    db.get('SELECT COUNT(*) AS count FROM journal_pages WHERE user_id=?', [user.id]),
    db.get('SELECT COUNT(*) AS count FROM languages WHERE user_id=? AND COALESCE(status, "active") <> "archived"', [user.id]),
    db.get('SELECT COUNT(*) AS count FROM courses WHERE user_id=? AND COALESCE(status, "in-progress") <> "archived"', [user.id]),
    db.get('SELECT COUNT(*) AS count FROM travel_plans WHERE user_id=?', [user.id]),
  ]);

  res.json({
    user: {
      id: user.id,
      name: user.name || 'User',
      username: user.username,
      bio: user.bio || '',
      city: user.city || '',
      avatar_url: user.avatar_url || null,
      banner_url: user.banner_url || null,
      profile_url: user.profile_url || null,
      role: user.role || 'user',
      is_verified: !!user.is_verified,
    },
    stats: {
      pages: Number(pages?.count) || 0,
      languages: Number(languages?.count) || 0,
      courses: Number(courses?.count) || 0,
      travel: Number(travel?.count) || 0,
    },
  });
});

export default router;
