import express from 'express';
import jwt from 'jsonwebtoken';
import { getDB, JWT_SECRET } from '../../utils.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  const db = await getDB();
  try {
    const r = await db.run('INSERT INTO users(email,password,name) VALUES(?,?,?)', [email, password, name || 'User']);
    const uid = r.lastID;
    await db.run('INSERT INTO user_xp(user_id,xp,level) VALUES(?,?,?)', [uid, 0, 1]);
    const token = jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch {
    res.status(400).json({ error: 'exists' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const db = await getDB();
  const u = await db.get('SELECT * FROM users WHERE email=? AND password=?', [email, password]);
  if (!u) return res.status(401).json({ error: 'bad creds' });
  const token = jwt.sign({ uid: u.id, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

export default router;
