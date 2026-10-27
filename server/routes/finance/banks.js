import express from 'express';
import multer from 'multer';
import { getDB } from '../../utils.js';
import { parseStatement } from './statement.js';

const router = express.Router();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

const parseDay = (value, endOfDay = false) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime();
};

// ?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=… (по умолчанию последние 500)
router.get('/transactions', async (req, res) => {
  const db = await getDB();
  const from = parseDay(req.query.from);
  const to = parseDay(req.query.to, true);
  const limit = Math.min(5000, Math.max(1, Number(req.query.limit) || 500));
  const where = ['t.user_id=?'];
  const params = [req.user.uid];
  if (from) {
    where.push('t.ts >= ?');
    params.push(from);
  }
  if (to) {
    where.push('t.ts <= ?');
    params.push(to);
  }
  const rows = await db.all(
    `SELECT t.*, a.bank AS account_bank FROM transactions t LEFT JOIN accounts a ON a.id=t.account_id
     WHERE ${where.join(' AND ')} ORDER BY t.ts DESC LIMIT ?`,
    [...params, limit]
  );
  res.json({ items: rows });
});

router.get('/accounts', async (req, res) => {
  const db = await getDB();
  const rows = await db.all(
    `SELECT a.id, a.bank, a.number_mask, COUNT(t.id) AS transactions, MIN(t.ts) AS first_ts, MAX(t.ts) AS last_ts
     FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id WHERE a.user_id=? GROUP BY a.id ORDER BY a.id DESC`,
    [req.user.uid]
  );
  res.json({ items: rows });
});

// Ручной расход или доход: { amount, kind: 'expense'|'income', category, description, date: 'YYYY-MM-DD' }
router.post('/transactions', async (req, res) => {
  const amount = Math.abs(Number(String(req.body?.amount ?? '').replace(',', '.')));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return res.status(400).json({ error: 'Укажите сумму больше нуля' });
  const kind = req.body?.kind === 'income' ? 'income' : 'expense';
  const category = typeof req.body?.category === 'string' ? req.body.category.trim().slice(0, 60) || null : null;
  const description = typeof req.body?.description === 'string' ? req.body.description.trim().slice(0, 300) : '';
  const day = parseDay(req.body?.date);
  // Время дня — текущее, чтобы записи за один день не сливались по порядку
  const now = new Date();
  const ts = day ? day + (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000 : now.getTime();
  const db = await getDB();
  const result = await db.run(
    'INSERT INTO transactions(user_id,account_id,ts,amount,description,mcc,category) VALUES(?,?,?,?,?,?,?)',
    [req.user.uid, null, ts, kind === 'income' ? amount : -amount, description || category || '', null, category]
  );
  res.json({ item: await db.get('SELECT * FROM transactions WHERE id=?', [result.lastID]) });
});

// Сменить категорию или описание записи
router.patch('/transactions/:id', async (req, res) => {
  const db = await getDB();
  const updates = [];
  const params = [];
  if (req.body?.category !== undefined) {
    updates.push('category=?');
    params.push(typeof req.body.category === 'string' ? req.body.category.trim().slice(0, 60) || null : null);
  }
  if (typeof req.body?.description === 'string') {
    updates.push('description=?');
    params.push(req.body.description.trim().slice(0, 300));
  }
  if (!updates.length) return res.status(400).json({ error: 'no_changes' });
  const result = await db.run(`UPDATE transactions SET ${updates.join(', ')} WHERE id=? AND user_id=?`, [...params, req.params.id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ item: await db.get('SELECT * FROM transactions WHERE id=?', [req.params.id]) });
});

router.delete('/transactions/:id', async (req, res) => {
  const db = await getDB();
  const result = await db.run('DELETE FROM transactions WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

// Удалить импортированную выписку целиком (счёт и его операции)
router.delete('/accounts/:id', async (req, res) => {
  const db = await getDB();
  const account = await db.get('SELECT id FROM accounts WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!account) return res.status(404).json({ error: 'not_found' });
  const removed = await db.run('DELETE FROM transactions WHERE account_id=? AND user_id=?', [account.id, req.user.uid]);
  await db.run('DELETE FROM accounts WHERE id=?', [account.id]);
  res.json({ removed: removed.changes || 0 });
});

// Импорт выписки (CSV): Тинькофф, Сбер, Альфа и другие — колонки определяются по заголовкам
router.post('/import/csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
  let parsed;
  try {
    parsed = parseStatement(req.file.buffer);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (!parsed.rows.length) return res.status(400).json({ error: 'В файле не нашлось ни одной операции' });

  const bank = typeof req.body?.bank === 'string' && req.body.bank.trim() ? req.body.bank.trim().slice(0, 60) : req.file.originalname.replace(/\.[^.]+$/, '').slice(0, 60);
  const mask = typeof req.body?.account_mask === 'string' ? req.body.account_mask.trim().slice(0, 20) : '';
  const db = await getDB();
  const acc = await db.run('INSERT INTO accounts(user_id,bank,number_mask) VALUES(?,?,?)', [req.user.uid, bank, mask || null]);
  // Повторно загруженные операции (та же дата, сумма и описание) пропускаем
  const existing = new Set(
    (await db.all('SELECT ts, amount, description FROM transactions WHERE user_id=?', [req.user.uid])).map((r) => `${r.ts}|${r.amount}|${r.description || ''}`)
  );
  let imported = 0;
  let duplicates = 0;
  await db.exec('BEGIN');
  try {
    for (const row of parsed.rows) {
      const key = `${row.ts}|${row.amount}|${row.description || ''}`;
      if (existing.has(key)) {
        duplicates += 1;
        continue;
      }
      existing.add(key);
      await db.run('INSERT INTO transactions(user_id,account_id,ts,amount,description,mcc,category) VALUES(?,?,?,?,?,?,?)', [
        req.user.uid,
        acc.lastID,
        row.ts,
        row.amount,
        row.description,
        row.mcc,
        row.category,
      ]);
      imported += 1;
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    await db.run('DELETE FROM accounts WHERE id=?', [acc.lastID]);
    return res.status(500).json({ error: error.message });
  }
  if (!imported) await db.run('DELETE FROM accounts WHERE id=?', [acc.lastID]);
  res.json({ imported, duplicates, skipped: parsed.skipped, columns: parsed.columns });
});

export default router;
