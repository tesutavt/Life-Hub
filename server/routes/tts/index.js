// Озвучка для уроков: mp3 по тексту с кэшем на диске.
// Синтезатор браузера/Windows часто не имеет японского (и других) голосов, поэтому
// звук берём онлайн один раз и дальше отдаём из кэша — в том числе без интернета.
//   • одиночная кана с ромадзи (?reading=ka) — живая запись, как в тренажёре каны;
//   • всё остальное — синтез Google Translate (неофициальный endpoint, может меняться).
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { TTS_CACHE_DIR } from '../../config/paths.js';
import { rateLimit } from '../../security.js';

const router = express.Router();

const MAX_TEXT = 200;
const KANA_AUDIO_URL = 'https://djtguide.neocities.org/kana/audio';
const KANA_RE = /^[\u3040-\u30ff]{1,3}$/;
const inFlight = new Map();

async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !type.includes('audio')) throw new Error(`tts source ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchAudio(text, lang, reading) {
  if (lang === 'ja' && reading && KANA_RE.test(text)) {
    try {
      return await download(`${KANA_AUDIO_URL}/${encodeURIComponent(reading)}.mp3`);
    } catch {
      // нет записи для этого слога — синтезируем
    }
  }
  const query = new URLSearchParams({ ie: 'UTF-8', client: 'tw-ob', tl: lang, q: text });
  return download(`https://translate.google.com/translate_tts?${query}`);
}

// Эндпоинт без авторизации (тег <audio> не умеет слать токен), поэтому ограничиваем частоту
router.get('/', rateLimit({ windowMs: 60_000, max: 240 }), async (req, res) => {
  const text = String(req.query.text || '').trim().slice(0, MAX_TEXT);
  const lang = String(req.query.lang || 'en').toLowerCase().split('-')[0];
  const reading = String(req.query.reading || '').trim().toLowerCase();
  if (!text || !/^[a-z]{2,3}$/.test(lang)) return res.status(400).json({ error: 'bad_request' });
  const safeReading = /^[a-z]{1,6}$/.test(reading) ? reading : '';

  const hash = crypto.createHash('sha1').update(`${lang}|${safeReading}|${text}`).digest('hex');
  const file = path.join(TTS_CACHE_DIR, lang, `${hash}.mp3`);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (fs.existsSync(file)) return res.type('audio/mpeg').sendFile(file);

  try {
    // Одновременные запросы одного и того же слова качаем один раз
    if (!inFlight.has(file)) {
      inFlight.set(
        file,
        fetchAudio(text, lang, safeReading)
          .then(async (buffer) => {
            await fs.promises.mkdir(path.dirname(file), { recursive: true });
            await fs.promises.writeFile(file, buffer);
          })
          .finally(() => inFlight.delete(file))
      );
    }
    await inFlight.get(file);
    res.type('audio/mpeg').sendFile(file);
  } catch (error) {
    res.status(502).json({ error: 'tts_unavailable', message: error.message });
  }
});

export default router;
