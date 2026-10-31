import express from 'express';
import { getDB } from '../../utils.js';
import { TAG_ENTITY_TYPES, fetchTagLinks, syncTagLinks } from '../../tagUtils.js';
import { dropEntityLinks } from './links.js';

// Вишлист: желания с картинкой, ценой, копилкой и приоритетом. Ссылку на товар можно «развернуть» —
// сервер прочитает заголовок, картинку и цену со страницы магазина (Open Graph).

const router = express.Router();

const STATUSES = ['want', 'got'];
const CURRENCIES = ['RUB', 'USD', 'EUR', 'KZT', 'BYN', 'UAH', 'JPY', 'CNY'];

const text = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)));

const mapRow = (row) => ({
  id: row.id,
  title: row.title,
  image_url: row.image_url,
  link: row.link,
  price: row.price,
  saved: row.saved || 0,
  currency: row.currency || 'RUB',
  priority: row.priority || 2,
  category: row.category,
  note: row.note,
  status: row.status || 'want',
  got_at: row.got_at,
  position: row.position,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const pickFields = (body) => ({
  title: text(body?.title, 300),
  image_url: text(body?.image_url, 2048),
  link: text(body?.link, 2048),
  price: num(body?.price),
  saved: num(body?.saved) ?? 0,
  currency: CURRENCIES.includes(body?.currency) ? body.currency : undefined,
  priority: [1, 2, 3].includes(Number(body?.priority)) ? Number(body.priority) : undefined,
  category: text(body?.category, 60),
  note: text(body?.note, 4000),
  status: STATUSES.includes(body?.status) ? body.status : undefined,
});

router.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM wishlist_items WHERE user_id=? ORDER BY status, position, created_at DESC', [req.user.uid]);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.WISH, rows.map((r) => r.id));
  res.json({ items: rows.map((r) => ({ ...mapRow(r), tags: tagMap.get(r.id) || [] })) });
});

const withTags = async (db, userId, row) => {
  const tagMap = await fetchTagLinks(db, userId, TAG_ENTITY_TYPES.WISH, [row.id]);
  return { ...mapRow(row), tags: tagMap.get(row.id) || [] };
};

router.post('/', async (req, res) => {
  const f = pickFields(req.body);
  if (!f.title) return res.status(400).json({ error: 'title_required' });
  const db = await getDB();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO wishlist_items(user_id, title, image_url, link, price, saved, currency, priority, category, note, status, position, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.uid, f.title, f.image_url, f.link, f.price, f.saved, f.currency || 'RUB', f.priority || 2, f.category, f.note, f.status || 'want', Date.now(), now, now]
  );
  if (Array.isArray(req.body?.tags)) await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.WISH, result.lastID, req.body.tags);
  const row = await db.get('SELECT * FROM wishlist_items WHERE id=?', [result.lastID]);
  res.json({ item: await withTags(db, req.user.uid, row) });
});

router.put('/:id', async (req, res) => {
  const db = await getDB();
  const existing = await db.get('SELECT * FROM wishlist_items WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const f = pickFields(req.body);
  const updates = [];
  const values = [];
  for (const key of Object.keys(f)) {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
    if (f[key] === undefined) continue;
    if (key === 'title' && !f.title) continue;
    updates.push(`${key}=?`);
    values.push(f[key]);
  }
  if (f.status && f.status !== existing.status) {
    updates.push('got_at=?');
    values.push(f.status === 'got' ? new Date().toISOString() : null);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'position') && Number.isFinite(Number(req.body.position))) {
    updates.push('position=?');
    values.push(Number(req.body.position));
  }
  if (updates.length) {
    updates.push('updated_at=?');
    values.push(new Date().toISOString(), req.params.id, req.user.uid);
    await db.run(`UPDATE wishlist_items SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
  }
  if (Array.isArray(req.body?.tags)) await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.WISH, existing.id, req.body.tags);
  const row = await db.get('SELECT * FROM wishlist_items WHERE id=?', [req.params.id]);
  res.json({ item: await withTags(db, req.user.uid, row) });
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM wishlist_items WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [TAG_ENTITY_TYPES.WISH, req.params.id, req.user.uid]);
  await dropEntityLinks(db, req.user.uid, 'wish', Number(req.params.id));
  res.json({ success: true });
});

// ── Предпросмотр ссылки: название, картинка и цена со страницы товара ──

const decodeEntities = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const metaContent = (html, names) => {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${name}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content.trim());
  }
  return null;
};

router.get('/preview', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'Нужна ссылка вида https://…' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'ru,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = (await response.text()).slice(0, 600000);
    const title = metaContent(html, ['og:title', 'twitter:title']) || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '') || null;
    let image = metaContent(html, ['og:image', 'og:image:url', 'twitter:image', 'image']);
    if (image && !/^https?:/i.test(image)) image = new URL(image, response.url || url).toString();
    let price = metaContent(html, ['product:price:amount', 'og:price:amount', 'price']);
    if (!price) price = html.match(/"price"\s*:\s*"?(\d[\d\s.,]*)"?/)?.[1] || null;
    const currency = metaContent(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']) || html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/)?.[1] || null;
    const priceNum = price ? Number(String(price).replace(/\s/g, '').replace(',', '.')) : null;
    res.json({
      title: title ? title.slice(0, 300) : null,
      image_url: image || null,
      price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
      currency: CURRENCIES.includes(currency) ? currency : null,
    });
  } catch (error) {
    res.json({ error: 'Не удалось открыть страницу: ' + (error?.name === 'AbortError' ? 'долго не отвечает' : error?.message || 'нет связи') });
  } finally {
    clearTimeout(timer);
  }
});

export default router;
