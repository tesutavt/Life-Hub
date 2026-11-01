import express from 'express';
import { getDB } from '../../utils.js';

// ══════════════════════ Плеер на полке ══════════════════════
// Логика как в H:\Project\test: открываем страницу сайта, выбираем озвучку и серию, забираем плеер (iframe).
// Страницу тайтла находим поиском по сайту: /search?word={название} → блоки .image-block со ссылками.
// Пользователь подтверждает «Это то аниме?» — ссылка запоминается в карточке; «Нет» — открываем следующий результат.
// Вместо puppeteer — скрытое окно Electron (сервер встроен в десктоп-приложение, отдельный Chromium не нужен).

/**
 * Адрес сайта по умолчанию (например, 'https://мой-сайт.ru').
 * Обычно задаётся в приложении: «Настройки → Интеграции → Плеер» — тогда эта строка не нужна.
 */
export const PLAYER_SITE = '';

/** Поиск на сайте: {name} — название тайтла. */
const SEARCH_PATH = '/search?word={name}';

// Где что на страницах сайта (плеер — как в H:\Project\test\server.js)
const SEL = {
  searchItem: '.image-block',
  block: '#video',
  dubInput: '#video .selectors input[role=combobox]',
  dubOption: '[id*="-option-"]',
  episodes: '#video .Yqy0 > div',
};

const router = express.Router();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let electronPromise = null;
const getElectron = () => {
  if (!process.versions.electron) return Promise.resolve(null);
  electronPromise ||= import('electron').then((m) => (m.BrowserWindow ? m : m.default)).catch(() => null);
  return electronPromise;
};

/** Из того, что вписано в настройках, берём только сам сайт: https://мой-сайт.ru */
const siteOrigin = (value) => {
  try {
    return value ? new URL(value.replace(/\{[^}]*\}/g, 'x')).origin : null;
  } catch {
    return null;
  }
};

const parseMeta = (item) => {
  try {
    return item.meta ? JSON.parse(item.meta) : {};
  } catch {
    return {};
  }
};

// ── похожесть названий: результаты поиска, где совпадает больше слов, — выше ──
const words = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length > 1);
const similarity = (candidate, names) => {
  const c = new Set(words(candidate));
  if (!c.size) return 0;
  return Math.max(
    0,
    ...names.map((n) => {
      const w = words(n);
      if (!w.length) return 0;
      const hit = w.filter((x) => c.has(x)).length;
      return hit / Math.max(w.length, c.size);
    })
  );
};

// ── окно браузера ──
const sameAsPuppeteerUA = (ua) => ua.replace(/\s*(Electron|life-hub[\w-]*|Life Hub)\/[\d.]+/gi, '');

const openWindow = async () => {
  const electron = await getElectron();
  if (!electron?.BrowserWindow) return null;
  // как у puppeteer: окно 800×600 (страница может показывать озвучки по-разному на узком и широком экране)
  const win = new electron.BrowserWindow({
    show: false, width: 800, height: 600, useContentSize: true, paintWhenInitiallyHidden: true,
    webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setUserAgent(sameAsPuppeteerUA(win.webContents.getUserAgent()));
  return win;
};

const load = async (win, url) => {
  await Promise.race([win.loadURL(url).catch(() => {}), sleep(30000)]);
  await sleep(1500); // дать странице дорисоваться (аналог networkidle2)
};

/** Настоящий клик мышью по элементу (index — какой из найденных), как tab.click() в puppeteer. */
const clickAt = async (wc, selector, index = 0) => {
  const rect = await wc.executeJavaScript(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!rect) return false;
  wc.focus();
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
    wc.sendInputEvent({ type, x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await sleep(60);
  }
  return true;
};

/** Запасной способ открыть список: события из страницы и стрелка вниз (MUI Autocomplete открывается по ArrowDown). */
const openListFallback = async (wc, selector) => {
  await wc.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.focus();
    const o = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new PointerEvent('pointerup', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
    return true;
  })()`).catch(() => false);
  await sleep(400);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
};

const waitFor = async (wc, selector, timeout) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await wc.executeJavaScript(`!!document.querySelector(${JSON.stringify(selector)})`).catch(() => false)) return true;
    await sleep(250);
  }
  return false;
};
const texts = (wc, selector) =>
  wc.executeJavaScript(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.textContent.trim())`);

/** Поиск на сайте: результаты из блоков .image-block — ссылка, название, картинка. Похожие по названию — выше. */
async function searchSite(win, origin, names) {
  const seen = new Map();
  for (const name of names.filter(Boolean)) {
    const url = origin + SEARCH_PATH.replace('{name}', encodeURIComponent(name));
    await load(win, url);
    if (!(await waitFor(win.webContents, SEL.searchItem, 8000))) continue;
    const found = await win.webContents.executeJavaScript(`[...document.querySelectorAll(${JSON.stringify(SEL.searchItem)})].map((el) => {
      const a = el.matches('a[href]') ? el : el.querySelector('a[href]') || el.closest('a[href]');
      const img = el.querySelector('img');
      const card = el.closest('a, li, article, div') || el;
      const title = el.getAttribute('title') || (a && a.getAttribute('title')) || (img && img.getAttribute('alt')) || card.textContent.trim().split('\\n')[0] || '';
      return { href: a ? a.href : null, title: title.trim().slice(0, 200), image: img ? img.currentSrc || img.src : null };
    }).filter((x) => x.href)`);
    found.forEach((x, i) => {
      if (!seen.has(x.href)) seen.set(x.href, { ...x, order: seen.size + i / 1000 });
    });
    if (seen.size) break; // по первому названию нашлось — второй поиск не нужен
  }
  return [...seen.values()]
    .map((x) => ({ ...x, score: similarity(x.title, names) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ href, title, image }) => ({ href, title, image }));
}

// dub и ep — номера (с 0) озвучки и серии; пусто — оставить как на сайте
async function readPlayer(win, url, dub, ep) {
  const wc = win.webContents;
  const steps = [];
  await load(win, url);
  if (!(await waitFor(wc, SEL.block, 10000))) return { error: `На странице нет плеера (${SEL.block})`, steps };

  let dubs = [];
  let dubIndex = 0;
  // список озвучек часто дорисовывается позже серий — ждём подольше
  if (await waitFor(wc, SEL.dubInput, 6000)) {
    steps.push('нашёл поле озвучки');
    await clickAt(wc, SEL.dubInput);
    let opened = await waitFor(wc, SEL.dubOption, 3000);
    if (!opened) {
      steps.push('клик не открыл список — пробую иначе');
      await openListFallback(wc, SEL.dubInput);
      opened = await waitFor(wc, SEL.dubOption, 3000);
    }
    steps.push(opened ? 'список озвучек открылся' : 'список озвучек не открылся');
    dubs = await texts(wc, SEL.dubOption);
    if (dub !== '' && dubs[+dub] !== undefined) {
      dubIndex = +dub;
      await clickAt(wc, SEL.dubOption, dubIndex);
      await sleep(1500);
    } else {
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
    }
  } else steps.push(`поле озвучки (${SEL.dubInput}) не найдено`);

  const episodes = await texts(wc, SEL.episodes);
  const epIndex = ep !== '' ? +ep : 0;
  if (ep !== '' && episodes[epIndex] !== undefined) {
    await clickAt(wc, SEL.episodes, epIndex);
    await sleep(1500);
  }

  // отдаём только адрес плеера (iframe)
  const src = await wc.executeJavaScript(`(() => {
    const b = document.querySelector(${JSON.stringify(SEL.block)});
    const f = b && b.querySelector('iframe');
    return f ? f.src : null;
  })()`);
  if (!src) return { error: 'В блоке плеера нет iframe', dubs, dub: dubIndex, episodes, ep: epIndex, steps };
  return { dubs, dub: dubIndex, episodes, ep: epIndex, src, steps };
}

// Один запрос за раз: каждый открывает своё скрытое окно
let queue = Promise.resolve();
const exclusive = (fn) => {
  const job = queue.then(fn);
  queue = job.catch(() => {});
  return job;
};

// Сайт задаётся в «Настройки → Интеграции» (без пересборки приложения)
const userSite = async (db, uid) => (await db.get('SELECT player_site FROM users WHERE id=?', [uid]).catch(() => null))?.player_site || null;

router.get('/config', async (req, res) => {
  const db = await getDB();
  const site = await userSite(db, req.user.uid);
  res.json({ site: site || '', code_site: PLAYER_SITE, configured: !!(site || PLAYER_SITE), desktop: !!process.versions.electron });
});

router.put('/config', async (req, res) => {
  const site = typeof req.body?.site === 'string' ? req.body.site.trim().slice(0, 500) : '';
  if (site && !siteOrigin(site)) return res.status(400).json({ error: 'Ссылка должна начинаться с http:// или https://' });
  const db = await getDB();
  await db.run('UPDATE users SET player_site=? WHERE id=?', [site ? siteOrigin(site) : null, req.user.uid]);
  res.json({ site: site ? siteOrigin(site) : '', configured: !!(site || PLAYER_SITE) });
});

/**
 * Открыть плеер. Тело: { item_id, dub, ep, search?: true, candidate?: N, url?: адрес результата }.
 * Без search — берём подтверждённую ссылку из карточки; иначе ищем на сайте и открываем результат № candidate.
 */
router.post('/', async (req, res) => {
  const db = await getDB();
  const item = await db.get('SELECT * FROM shelf_items WHERE id=? AND user_id=?', [Number(req.body?.item_id), req.user.uid]);
  if (!item) return res.status(404).json({ error: 'not_found' });
  const meta = parseMeta(item);
  const origin = siteOrigin(await userSite(db, req.user.uid)) || siteOrigin(PLAYER_SITE);
  const dub = req.body?.dub === undefined || req.body?.dub === null ? '' : String(req.body.dub);
  const ep = req.body?.ep === undefined || req.body?.ep === null ? '' : String(req.body.ep);
  const saved = meta.player_url && /^https?:\/\//i.test(meta.player_url) ? meta.player_url : null;
  if (!saved && !origin) return res.status(400).json({ error: 'Не задан сайт для плеера: «Настройки → Интеграции → Плеер»' });

  try {
    const result = await exclusive(async () => {
      const win = await openWindow();
      if (!win) return { error: 'Плеер работает в приложении Life Hub для Windows' };
      try {
        // 1) подтверждённая ссылка (или конкретный результат, который уже показан)
        const direct = typeof req.body?.url === 'string' && /^https?:\/\//i.test(req.body.url) ? req.body.url : !req.body?.search && saved ? saved : null;
        if (direct) {
          const r = await readPlayer(win, direct, dub, ep);
          return { ...r, page: direct, confirmed: direct === saved };
        }
        // 2) поиск по сайту
        if (!origin) return { error: 'Не задан сайт для плеера' };
        const names = [item.title, meta.original_title].filter((x, i, a) => x && a.indexOf(x) === i);
        const candidates = await searchSite(win, origin, names);
        if (!candidates.length) return { error: `На сайте ничего не нашлось по запросу «${item.title}»`, candidates: [], page: origin + SEARCH_PATH.replace('{name}', encodeURIComponent(item.title)) };
        const index = Math.min(Math.max(Number(req.body?.candidate) || 0, 0), candidates.length - 1);
        const r = await readPlayer(win, candidates[index].href, dub, ep);
        return { ...r, page: candidates[index].href, candidates, candidate: index, confirmed: false };
      } finally {
        win.destroy();
      }
    });
    res.json(result);
  } catch (e) {
    res.json({ error: 'Ошибка: ' + (e?.message || 'не удалось открыть страницу') });
  }
});

/** «Это то аниме» — запомнить ссылку в карточке; пустая ссылка — забыть (искать заново). */
router.post('/confirm', async (req, res) => {
  const db = await getDB();
  const item = await db.get('SELECT * FROM shelf_items WHERE id=? AND user_id=?', [Number(req.body?.item_id), req.user.uid]);
  if (!item) return res.status(404).json({ error: 'not_found' });
  const meta = parseMeta(item);
  const url = typeof req.body?.url === 'string' && /^https?:\/\//i.test(req.body.url) ? req.body.url.slice(0, 2048) : null;
  if (url) meta.player_url = url;
  else delete meta.player_url;
  await db.run('UPDATE shelf_items SET meta=?, updated_at=? WHERE id=?', [JSON.stringify(meta), new Date().toISOString(), item.id]);
  res.json({ ok: true, player_url: url });
});

export default router;
