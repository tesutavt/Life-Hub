import express from 'express';
import { getDB } from './utils.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM loans WHERE user_id=?', [req.user.uid]);
  const monthlyTotal = rows.reduce((s, r) => s + (r.payment_monthly || 0), 0);
  res.json({ items: rows, monthlyTotal });
});

router.post('/', async (req, res) => {
  const db = await getDB();
  const { bank, payment_monthly, remaining, due_day } = req.body;
  const r = await db.run('INSERT INTO loans(user_id,bank,payment_monthly,remaining,due_day) VALUES(?,?,?,?,?)',
    [req.user.uid, bank, payment_monthly || 0, remaining || 0, due_day || '1']);
  res.json({ id: r.lastID });
});

router.put('/:id', async (req, res) => {
  const db = await getDB();
  const { bank, payment_monthly, remaining, due_day } = req.body;
  await db.run(`UPDATE loans SET bank=?, payment_monthly=?, remaining=?, due_day=?
                WHERE id=? AND user_id=?`,
    [bank, payment_monthly, remaining, due_day, req.params.id, req.user.uid]);
  res.json({ success: true });
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM loans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  res.json({ success: true });
});

export default router;
