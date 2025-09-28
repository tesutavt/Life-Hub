import express from 'express';
import { getDB } from './utils.js';
import { TAG_ENTITY_TYPES, fetchTagLinks, syncTagLinks } from './tagUtils.js';

const router = express.Router();

router.get('/summary', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT id, bank, payment_monthly, remaining, due_day FROM loans WHERE user_id=?', [req.user.uid]);
  const monthlyTotal = rows.reduce((s, r) => s + (r.payment_monthly || 0), 0);
  const ids = rows.map((row) => row.id);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, ids);
  const items = rows.map((row) => ({
    id: row.id,
    bank: row.bank,
    payment_monthly: row.payment_monthly,
    remaining: row.remaining,
    due_day: row.due_day,
    tags: tagMap.get(row.id) || [],
  }));
  res.json({ items, monthlyTotal });
});

router.post('/', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const bank = typeof payload.bank === 'string' ? payload.bank : '';
  const payment = Number.isFinite(Number(payload.payment_monthly)) ? Number(payload.payment_monthly) : 0;
  const remaining = Number.isFinite(Number(payload.remaining)) ? Number(payload.remaining) : 0;
  const dueDay = typeof payload.due_day === 'string' ? payload.due_day : '1';
  const result = await db.run(
    'INSERT INTO loans(user_id,bank,payment_monthly,remaining,due_day) VALUES(?,?,?,?,?)',
    [req.user.uid, bank, payment, remaining, dueDay]
  );
  const row = await db.get(
    'SELECT id, bank, payment_monthly, remaining, due_day FROM loans WHERE id=? AND user_id=?',
    [result.lastID, req.user.uid]
  );
  let tags = [];
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, row.id, payload.tags);
    if (synced !== null) tags = synced;
  }
  if (tags.length === 0) {
    const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, [row.id]);
    tags = tagMap.get(row.id) || [];
  }
  res.json({ id: row.id, loan: { ...row, tags } });
});

router.put('/:id', async (req, res) => {
  const db = await getDB();
  const payload = req.body || {};
  const updates = [];
  const values = [];
  if (payload.bank !== undefined) { updates.push('bank=?'); values.push(String(payload.bank)); }
  if (payload.payment_monthly !== undefined) { updates.push('payment_monthly=?'); values.push(Number(payload.payment_monthly) || 0); }
  if (payload.remaining !== undefined) { updates.push('remaining=?'); values.push(Number(payload.remaining) || 0); }
  if (payload.due_day !== undefined) { updates.push('due_day=?'); values.push(String(payload.due_day)); }
  if (payload.tags !== undefined) {
    const synced = await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, req.params.id, payload.tags);
    if (synced === null) {
      return res.status(400).json({ error: 'bad_tags' });
    }
  }
  if (updates.length > 0) {
    const setClause = updates.join(', ');
    const result = await db.run(
      `UPDATE loans SET ${setClause} WHERE id=? AND user_id=?`,
      [...values, req.params.id, req.user.uid]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  }
  const row = await db.get(
    'SELECT id, bank, payment_monthly, remaining, due_day FROM loans WHERE id=? AND user_id=?',
    [req.params.id, req.user.uid]
  );
  if (!row) return res.status(404).json({ error: 'not_found' });
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.LOAN, [row.id]);
  res.json({ loan: { ...row, tags: tagMap.get(row.id) || [] } });
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM loans WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [
    TAG_ENTITY_TYPES.LOAN,
    req.params.id,
    req.user.uid,
  ]);
  res.json({ success: true });
});

export default router;
