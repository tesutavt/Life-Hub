import express from 'express';
import multer from 'multer';
import { parse as parseCSV } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import { getDB } from '../../utils.js';

const router = express.Router();
const upload = multer();

router.get('/transactions', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM transactions WHERE user_id=? ORDER BY ts DESC LIMIT 500', [req.user.uid]);
  res.json({ items: rows });
});

router.post('/import/csv', upload.single('file'), async (req, res) => {
  const { bank='CSV', account_mask='****' } = req.body || {};
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const text = iconv.decode(req.file.buffer, 'utf8');
  let rows = [];
  try {
    const records = parseCSV(text, { delimiter: ';', columns: true, skip_empty_lines: true });
    if (records.length && records[0]['Дата операции'] && records[0]['Сумма операции']) {
      rows = records.map(r => {
        const [d, t = '00:00:00'] = (r['Дата операции'] || '').split(' ');
        const [dd, mm, yyyy] = (d || '').split('.');
        const iso = `${yyyy}-${mm}-${dd}T${t}`;
        const amount = parseFloat((r['Сумма операции'] || '0').replace(/\s/g, '').replace(',', '.'));
        return { ts: new Date(iso).getTime(), amount, description: r['Описание'] || '', mcc: r['MCC'] ? +r['MCC'] : null };
      });
    }
  } catch {}
  const db = await getDB();
  const acc = await db.run('INSERT INTO accounts(user_id,bank,number_mask) VALUES(?,?,?)', [req.user.uid, bank, account_mask]);
  const accId = acc.lastID;
  const stmt = await db.prepare('INSERT INTO transactions(user_id,account_id,ts,amount,description,mcc) VALUES(?,?,?,?,?,?)');
  for (const r of rows) { await stmt.run(req.user.uid, accId, r.ts, r.amount, r.description, r.mcc); }
  await stmt.finalize();
  res.json({ imported: rows.length });
});

export default router;
