import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { JWT_SECRET } from '../utils.js';
import { UPLOADS_DIR } from '../config/paths.js';

// Уменьшенные копии картинок для списков (баннеры страниц): огромная картинка 5000+ px раскодируется
// секунду и подвешивает интерфейс, а в карточке нужна ширина ~800 px.
// Ссылки подписаны секретом сервера — чтобы /api/thumb нельзя было использовать как открытый прокси.

const router = express.Router();
const THUMB_DIR = path.join(UPLOADS_DIR, '.thumbs');
const WIDTHS = [320, 640, 960];
const MAX_BYTES = 25 * 1024 * 1024;

const sign = (src, w) => crypto.createHmac('sha256', String(JWT_SECRET)).update(`${w}|${src}`).digest('hex').slice(0, 24);

/** Ссылка на уменьшенную копию (или null, если картинки нет). */
export const thumbUrl = (src, w = 640) => {
  if (typeof src !== 'string' || !src.trim() || src.startsWith('data:')) return null;
  const width = WIDTHS.includes(w) ? w : 640;
  return `/api/thumb?w=${width}&s=${sign(src, width)}&src=${encodeURIComponent(src)}`;
};

// Уменьшение средствами Electron (сервер встроен в десктоп-приложение); на обычном Node — отдаём оригинал
let nativeImagePromise = null;
const getNativeImage = () => {
  if (!process.versions.electron) return Promise.resolve(null);
  nativeImagePromise ||= import('electron').then((m) => m.nativeImage || m.default?.nativeImage || null).catch(() => null);
  return nativeImagePromise;
};

const readSource = async (src) => {
  if (src.startsWith('/uploads/')) {
    const file = path.join(UPLOADS_DIR, path.basename(src));
    return fs.promises.readFile(file);
  }
  if (!/^https?:\/\//i.test(src)) throw new Error('bad_src');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(src, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 LifeHub/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!String(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('not_image');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('too_big');
    return buf;
  } finally {
    clearTimeout(timer);
  }
};

router.get('/', async (req, res) => {
  const src = typeof req.query.src === 'string' ? req.query.src : '';
  const w = Number(req.query.w);
  if (!src || !WIDTHS.includes(w) || req.query.s !== sign(src, w)) return res.status(403).end();
  const key = crypto.createHash('sha1').update(`${w}|${src}`).digest('hex');
  const cached = path.join(THUMB_DIR, `${key}.jpg`);
  res.set('Cache-Control', 'private, max-age=604800');
  if (fs.existsSync(cached)) return res.type('jpg').sendFile(cached);
  try {
    const buf = await readSource(src);
    const nativeImage = await getNativeImage();
    if (nativeImage) {
      const img = nativeImage.createFromBuffer(buf);
      if (!img.isEmpty()) {
        const size = img.getSize();
        const out = size.width > w ? img.resize({ width: w, quality: 'good' }).toJPEG(82) : img.toJPEG(85);
        await fs.promises.mkdir(THUMB_DIR, { recursive: true });
        await fs.promises.writeFile(cached, out);
        return res.type('jpg').send(out);
      }
    }
    // уменьшить нечем — отдаём как есть (браузер справится, просто медленнее)
    return src.startsWith('/uploads/') ? res.sendFile(path.join(UPLOADS_DIR, path.basename(src))) : res.redirect(src);
  } catch {
    return src.startsWith('/') ? res.status(404).end() : res.redirect(src);
  }
});

export default router;
