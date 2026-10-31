import express from 'express';
import { getDB } from '../../utils.js';

// Связи между разделами. Вещи связаны, если у них есть общий тег или их привязали друг к другу вручную
// (например, мечта «Япония» на карте ↔ копилка «Поездка в Японию» в вишлисте ↔ страница дневника).

const router = express.Router();

// Как показать вещь каждого типа: заголовок, подпись, картинка и куда вести по клику
const DESCRIBERS = {
  page: {
    label: 'Страница',
    sql: 'SELECT id, title, banner_url AS image FROM journal_pages WHERE user_id=? AND id IN',
    search: 'SELECT id FROM journal_pages WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title || 'Без названия', image: r.image, url: `/pages/${r.id}` }),
  },
  travel: {
    label: 'Путешествие',
    sql: 'SELECT id, title, location, status, date_from FROM travel_plans WHERE user_id=? AND id IN',
    search: 'SELECT id FROM travel_plans WHERE user_id=? AND (title GLOB ? OR COALESCE(location, "") GLOB ?)',
    map: (r) => ({ title: r.title, subtitle: [r.location, r.date_from].filter(Boolean).join(' · '), url: '/travel', extra: { status: r.status } }),
  },
  wish: {
    label: 'Желание',
    sql: 'SELECT id, title, image_url AS image, price, saved, currency, status FROM wishlist_items WHERE user_id=? AND id IN',
    search: 'SELECT id FROM wishlist_items WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, image: r.image, url: '/wishlist', extra: { price: r.price, saved: r.saved || 0, currency: r.currency || 'RUB', status: r.status } }),
  },
  shelf: {
    label: 'Полка',
    sql: 'SELECT id, title, kind, cover_url AS image, status FROM shelf_items WHERE user_id=? AND id IN',
    search: 'SELECT id FROM shelf_items WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, image: r.image, url: '/shelf', extra: { kind: r.kind, status: r.status } }),
  },
  goal: {
    label: 'Цель',
    sql: 'SELECT id, title, target, completed FROM yearly_goals WHERE user_id=? AND id IN',
    search: 'SELECT id FROM yearly_goals WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, subtitle: r.target ? `${r.completed || 0} / ${r.target}` : '', url: '/year-goals' }),
  },
  habit: {
    label: 'Привычка',
    sql: 'SELECT id, title FROM habits WHERE user_id=? AND id IN',
    search: 'SELECT id FROM habits WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, url: '/habits' }),
  },
  course: {
    label: 'Курс',
    sql: 'SELECT id, title, provider FROM courses WHERE user_id=? AND id IN',
    search: 'SELECT id FROM courses WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, subtitle: r.provider || '', url: '/courses' }),
  },
  language: {
    label: 'Язык',
    sql: 'SELECT id, name AS title, image_url AS image FROM languages WHERE user_id=? AND id IN',
    search: 'SELECT id FROM languages WHERE user_id=? AND name GLOB ?',
    map: (r) => ({ title: r.title, image: r.image, url: '/languages' }),
  },
  calendar_event: {
    label: 'Событие',
    sql: 'SELECT id, title, date FROM calendar_events WHERE user_id=? AND id IN',
    search: 'SELECT id FROM calendar_events WHERE user_id=? AND title GLOB ?',
    map: (r) => ({ title: r.title, subtitle: r.date || '', url: '/calendar' }),
  },
  loan: {
    label: 'Кредит',
    sql: 'SELECT id, bank AS title, remaining FROM loans WHERE user_id=? AND id IN',
    search: 'SELECT id FROM loans WHERE user_id=? AND bank GLOB ?',
    map: (r) => ({ title: r.title, url: '/finance' }),
  },
};
export const LINK_TYPES = Object.keys(DESCRIBERS);

const isType = (t) => typeof t === 'string' && Object.prototype.hasOwnProperty.call(DESCRIBERS, t);
const toId = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Без учёта регистра для любого алфавита (как в глобальном поиске)
const globFor = (q) =>
  '*' +
  Array.from(q)
    .map((ch) => {
      if ('*?[]'.includes(ch)) return `[${ch}]`;
      const lo = ch.toLowerCase();
      const up = ch.toUpperCase();
      return lo === up ? ch : `[${lo}${up}]`;
    })
    .join('') +
  '*';

/** Описать набор вещей: [{type, id}] → карточки (несуществующие отбрасываются). */
export async function describeEntities(db, userId, refs) {
  const byType = new Map();
  refs.forEach((r) => {
    if (!isType(r.type)) return;
    if (!byType.has(r.type)) byType.set(r.type, new Set());
    byType.get(r.type).add(r.id);
  });
  const out = new Map();
  for (const [type, idSet] of byType) {
    const ids = [...idSet];
    const d = DESCRIBERS[type];
    const rows = await db.all(`${d.sql} (${ids.map(() => '?').join(',')})`, [userId, ...ids]).catch(() => []);
    rows.forEach((row) => out.set(`${type}:${row.id}`, { type, type_label: d.label, id: row.id, subtitle: '', image: null, extra: {}, ...d.map(row) }));
  }
  return out;
}

const orderPair = (aType, aId, bType, bId) => (`${aType}:${aId}` <= `${bType}:${bId}` ? [aType, aId, bType, bId] : [bType, bId, aType, aId]);

/** Всё, что связано с вещью: общие теги + ручные привязки. */
export async function relatedFor(db, userId, type, id) {
  const viaTags = await db.all(
    `SELECT tl.entity_type AS type, tl.entity_id AS id, t.id AS tag_id, t.label, t.color
       FROM tag_links tl JOIN tags t ON t.id = tl.tag_id
      WHERE tl.user_id=? AND tl.tag_id IN (SELECT tag_id FROM tag_links WHERE user_id=? AND entity_type=? AND entity_id=?)
        AND NOT (tl.entity_type=? AND tl.entity_id=?)`,
    [userId, userId, type, id, type, id]
  );
  const manual = await db.all(
    `SELECT b_type AS type, b_id AS id FROM entity_links WHERE user_id=? AND a_type=? AND a_id=?
     UNION SELECT a_type AS type, a_id AS id FROM entity_links WHERE user_id=? AND b_type=? AND b_id=?`,
    [userId, type, id, userId, type, id]
  );
  const refs = new Map();
  viaTags.forEach((r) => {
    const key = `${r.type}:${r.id}`;
    if (!refs.has(key)) refs.set(key, { type: r.type, id: r.id, tags: [], linked: false });
    refs.get(key).tags.push({ id: r.tag_id, label: r.label, color: r.color });
  });
  manual.forEach((r) => {
    const key = `${r.type}:${r.id}`;
    if (!refs.has(key)) refs.set(key, { type: r.type, id: r.id, tags: [], linked: false });
    refs.get(key).linked = true;
  });
  const described = await describeEntities(db, userId, [...refs.values()]);
  return [...refs.entries()]
    .filter(([key]) => described.has(key))
    .map(([key, r]) => ({ ...described.get(key), via_tags: r.tags, linked: r.linked }))
    .sort((a, b) => Number(b.linked) - Number(a.linked) || a.type.localeCompare(b.type));
}

router.get('/related', async (req, res) => {
  const type = req.query.type;
  const id = toId(req.query.id);
  if (!isType(type) || !id) return res.status(400).json({ error: 'bad_entity' });
  const db = await getDB();
  res.json({ items: await relatedFor(db, req.user.uid, type, id) });
});

// Сразу для многих: какие вещи типа target связаны с каждой вещью типа type (например, копилки у каждой поездки)
router.get('/related-bulk', async (req, res) => {
  const { type, target } = req.query;
  if (!isType(type) || !isType(target)) return res.status(400).json({ error: 'bad_entity' });
  const db = await getDB();
  const uid = req.user.uid;
  const pairs = await db.all(
    `SELECT a.entity_id AS src, b.entity_id AS dst FROM tag_links a JOIN tag_links b ON a.tag_id=b.tag_id AND b.user_id=a.user_id
      WHERE a.user_id=? AND a.entity_type=? AND b.entity_type=?
     UNION SELECT a_id AS src, b_id AS dst FROM entity_links WHERE user_id=? AND a_type=? AND b_type=?
     UNION SELECT b_id AS src, a_id AS dst FROM entity_links WHERE user_id=? AND b_type=? AND a_type=?`,
    [uid, type, target, uid, type, target, uid, type, target]
  );
  const described = await describeEntities(db, uid, pairs.map((p) => ({ type: target, id: p.dst })));
  const result = {};
  pairs.forEach((p) => {
    if (type === target && p.src === p.dst) return;
    const item = described.get(`${target}:${p.dst}`);
    if (!item) return;
    (result[p.src] ||= []).push(item);
  });
  res.json({ items: result });
});

// Что можно привязать: поиск по названию во всех разделах
router.get('/candidates', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (!q) return res.json({ items: [] });
  const db = await getDB();
  const glob = globFor(q);
  const refs = [];
  for (const [type, d] of Object.entries(DESCRIBERS)) {
    const params = [req.user.uid, ...Array((d.search.match(/\?/g) || []).length - 1).fill(glob)];
    const rows = await db.all(`${d.search} LIMIT 6`, params).catch(() => []);
    rows.forEach((r) => refs.push({ type, id: r.id }));
  }
  const described = await describeEntities(db, req.user.uid, refs);
  res.json({ items: refs.map((r) => described.get(`${r.type}:${r.id}`)).filter(Boolean) });
});

// Карточки для блоков страниц: описать набор вещей одним запросом (статус берётся свежий)
router.post('/describe', async (req, res) => {
  const refs = (Array.isArray(req.body?.refs) ? req.body.refs : [])
    .slice(0, 200)
    .map((r) => ({ type: r?.type, id: toId(r?.id) }))
    .filter((r) => isType(r.type) && r.id);
  const db = await getDB();
  const described = await describeEntities(db, req.user.uid, refs);
  res.json({ items: refs.map((r) => described.get(`${r.type}:${r.id}`)).filter(Boolean).map((it) => ({ ...it, done: isDone(it) })) });
});

// «Готово» у вещи каждого типа — для галочек в списке задач на странице
const DONE_STATUS = { shelf: ['done', 'active'], wish: ['got', 'want'], travel: ['done', 'planned'] };
const isDone = (it) => (DONE_STATUS[it.type] ? it.extra?.status === DONE_STATUS[it.type][0] : null);

router.post('/toggle', async (req, res) => {
  const type = req.body?.type;
  const id = toId(req.body?.id);
  if (!DONE_STATUS[type] || !id) return res.status(400).json({ error: 'not_toggleable' });
  const [doneStatus, undoneStatus] = DONE_STATUS[type];
  const status = req.body?.done ? doneStatus : undoneStatus;
  const db = await getDB();
  const table = { shelf: 'shelf_items', wish: 'wishlist_items', travel: 'travel_plans' }[type];
  const extra = type === 'wish' ? ', got_at=?' : type === 'travel' ? '' : ', updated_at=?';
  const params = [status];
  if (type === 'wish') params.push(req.body?.done ? new Date().toISOString() : null);
  if (type === 'shelf') params.push(new Date().toISOString());
  const result = await db.run(`UPDATE ${table} SET status=?${extra} WHERE id=? AND user_id=?`, [...params, id, req.user.uid]);
  if (!result.changes) return res.status(404).json({ error: 'not_found' });
  const described = await describeEntities(db, req.user.uid, [{ type, id }]);
  const item = described.get(`${type}:${id}`);
  res.json({ item: item ? { ...item, done: isDone(item) } : null });
});

const parseLink = (src) => {
  const aType = src?.a_type;
  const bType = src?.b_type;
  const aId = toId(src?.a_id);
  const bId = toId(src?.b_id);
  if (!isType(aType) || !isType(bType) || !aId || !bId || (aType === bType && aId === bId)) return null;
  return orderPair(aType, aId, bType, bId);
};

router.post('/', async (req, res) => {
  const link = parseLink(req.body);
  if (!link) return res.status(400).json({ error: 'bad_link' });
  const db = await getDB();
  const found = await describeEntities(db, req.user.uid, [
    { type: link[0], id: link[1] },
    { type: link[2], id: link[3] },
  ]);
  if (found.size < 2) return res.status(404).json({ error: 'not_found' });
  await db.run('INSERT OR IGNORE INTO entity_links(user_id, a_type, a_id, b_type, b_id) VALUES(?,?,?,?,?)', [req.user.uid, ...link]);
  res.json({ success: true });
});

router.delete('/', async (req, res) => {
  const link = parseLink(req.query);
  if (!link) return res.status(400).json({ error: 'bad_link' });
  const db = await getDB();
  await db.run('DELETE FROM entity_links WHERE user_id=? AND a_type=? AND a_id=? AND b_type=? AND b_id=?', [req.user.uid, ...link]);
  res.json({ success: true });
});

/** Убрать ручные связи удалённой вещи. */
export const dropEntityLinks = (db, userId, type, id) =>
  db.run('DELETE FROM entity_links WHERE user_id=? AND ((a_type=? AND a_id=?) OR (b_type=? AND b_id=?))', [userId, type, id, type, id]).catch(() => {});

export default router;
