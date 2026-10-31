import express from 'express';
import { getDB } from '../../utils.js';
import { TAG_ENTITY_TYPES, fetchTagLinks, syncTagLinks } from '../../tagUtils.js';
import { dropEntityLinks } from './links.js';

// Полка: книги, манга, аниме, фильмы, сериалы, игры, музыка — со сведениями из открытых баз.
// Поиск идёт через сервер: внешние сайты не всегда пускают браузер (CORS), а телефону так проще.

const router = express.Router();

export const SHELF_KINDS = ['book', 'manga', 'anime', 'movie', 'series', 'game', 'music'];
const STATUSES = ['planned', 'active', 'paused', 'done', 'dropped'];

const text = (v, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const stripHtml = (v) => (typeof v === 'string' ? v.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : null);

const mapRow = (row) => {
  let meta = {};
  try {
    meta = row.meta ? JSON.parse(row.meta) : {};
  } catch {
    meta = {};
  }
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    author: row.author,
    year: row.year,
    cover_url: row.cover_url,
    description: row.description,
    source: row.source,
    external_id: row.external_id,
    external_url: row.external_url,
    status: row.status,
    rating: row.rating,
    notes: row.notes,
    position: row.position,
    meta,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LifeHub/1.0 (personal app)', Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

// ── Поиск по внешним базам: единый формат результата ──

// Shikimori — русские названия и описания аниме/манги (зеркала: .io, .one)
const SHIKI_HOSTS = ['https://shikimori.io', 'https://shikimori.one'];
const shikiFetch = async (path) => {
  let lastError;
  for (const host of SHIKI_HOSTS) {
    try {
      return { host, data: await fetchJson(host + path) };
    } catch (error) {
      // 404 — ответ по существу (нет такого профиля/тайтла), зеркало спрашивать незачем
      if (/HTTP 404/.test(error?.message || '')) throw error;
      lastError = error;
    }
  }
  throw lastError;
};
const cleanShiki = (v) => (typeof v === 'string' ? v.replace(/\[\/?[a-z_]+(=[^\]]*)?\]/gi, '').replace(/\s+/g, ' ').trim() : null);

const searchShikimori = async (kind, q) => {
  const { host, data } = await shikiFetch(`/api/${kind === 'anime' ? 'animes' : 'mangas'}?search=${encodeURIComponent(q)}&limit=12`);
  return (data || []).map((x) => ({
    title: x.russian || x.name,
    original_title: x.name,
    author: null,
    year: Number((x.aired_on || x.released_on || '').slice(0, 4)) || null,
    cover_url: x.image?.original ? host + x.image.original : null,
    description: null,
    source: 'shikimori',
    external_id: String(x.id),
    external_url: x.url ? host + x.url : null,
    meta: { score: Number(x.score) || null, episodes: x.episodes || null, chapters: x.chapters || null, volumes: x.volumes || null, type: x.kind || null, genres: [] },
  }));
};

// Steam — игры с русским описанием и вертикальной обложкой
const searchSteam = async (q) => {
  const data = await fetchJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=russian&cc=RU`);
  return (data?.items || []).filter((x) => x.type === 'app').slice(0, 12).map((x) => ({
    title: x.name,
    author: null,
    year: null,
    cover_url: `https://cdn.akamai.steamstatic.com/steam/apps/${x.id}/library_600x900.jpg`,
    description: null,
    source: 'steam',
    external_id: String(x.id),
    external_url: `https://store.steampowered.com/app/${x.id}`,
    meta: { score: x.metascore ? Number(x.metascore) / 10 : null, genres: [] },
  }));
};
const searchJikan = async (kind, q) => {
  const data = await fetchJson(`https://api.jikan.moe/v4/${kind}?q=${encodeURIComponent(q)}&limit=12&sfw=true`);
  return (data?.data || []).map((x) => ({
    title: x.title_english || x.title,
    original_title: x.title,
    author: kind === 'manga' ? (x.authors || []).map((a) => a.name).join(', ') || null : (x.studios || []).map((s) => s.name).join(', ') || null,
    year: x.year || (x.published?.prop?.from?.year ?? x.aired?.prop?.from?.year) || null,
    cover_url: x.images?.jpg?.large_image_url || x.images?.jpg?.image_url || null,
    description: x.synopsis || null,
    source: 'myanimelist',
    external_id: String(x.mal_id),
    external_url: x.url,
    meta: {
      score: x.score ?? null,
      episodes: x.episodes ?? null,
      chapters: x.chapters ?? null,
      volumes: x.volumes ?? null,
      genres: (x.genres || []).map((g) => g.name),
      type: x.type ?? null,
    },
  }));
};

const searchBooks = async (q) => {
  const data = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median,first_sentence`);
  return (data?.docs || []).map((x) => ({
    title: x.title,
    author: (x.author_name || []).slice(0, 2).join(', ') || null,
    year: x.first_publish_year || null,
    cover_url: x.cover_i ? `https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg` : null,
    description: null, // полное (по возможности русское) описание — через /details
    source: 'openlibrary',
    external_id: x.key,
    external_url: `https://openlibrary.org${x.key}`,
    meta: { pages: x.number_of_pages_median ?? null, genres: (x.subject || []).slice(0, 5) },
  }));
};

const searchSeries = async (q) => {
  const data = await fetchJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  return (data || []).slice(0, 12).map(({ show: x }) => ({
    title: x.name,
    author: x.network?.name || x.webChannel?.name || null,
    year: x.premiered ? Number(x.premiered.slice(0, 4)) : null,
    cover_url: x.image?.original || x.image?.medium || null,
    description: null, // русское описание — через /details, английское — запасным
    summary_en: stripHtml(x.summary),
    source: 'tvmaze',
    external_id: String(x.id),
    external_url: x.url,
    meta: { score: x.rating?.average ?? null, genres: x.genres || [], status: x.status || null },
  }));
};

// Фильмы, игры, музыка — Википедия (сначала русская)
const WIKI_HINT = { movie: 'фильм', game: 'компьютерная игра', music: 'альбом' };
const searchWikipedia = async (kind, q) => {
  const lang = /[а-яё]/i.test(q) ? 'ru' : 'en';
  const hint = lang === 'ru' ? WIKI_HINT[kind] : { movie: 'film', game: 'video game', music: 'album' }[kind];
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=10` +
    `&gsrsearch=${encodeURIComponent(`${q} ${hint}`)}&prop=extracts|pageimages|info&exintro=1&explaintext=1&exsentences=4&pithumbsize=400&pilicense=any&inprop=url`;
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((p) => {
    const year = Number((p.extract || '').match(/\b(19|20)\d{2}\b/)?.[0]) || null;
    return {
      title: p.title.replace(/\s*\((фильм|film|игра|video game|альбом|album)[^)]*\)\s*$/i, ''),
      author: null,
      year,
      cover_url: p.thumbnail?.source || null,
      description: p.extract || null,
      source: `wikipedia-${lang}`,
      external_id: String(p.pageid),
      external_url: p.fullurl || null,
      meta: {},
    };
  });
};

// Краткое русское описание из Википедии — для книг и сериалов, у которых в базах описание только на английском
const WIKI_RU_HINT = { book: 'роман книга', series: 'телесериал', movie: 'фильм' };
const wikiRuSummary = async (kind, title, year) => {
  if (!title) return null;
  const url =
    'https://ru.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=3' +
    `&gsrsearch=${encodeURIComponent(`${title} ${year || ''} ${WIKI_RU_HINT[kind] || ''}`.trim())}&prop=extracts|pageimages&exintro=1&explaintext=1&exsentences=5&pithumbsize=400&pilicense=any`;
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const words = title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  // берём статью, в названии которой есть слова из заголовка — иначе Википедия может подсунуть что-то постороннее
  const page = pages.find((p) => words.some((w) => p.title.toLowerCase().includes(w))) || null;
  return page?.extract ? { description: page.extract, cover_url: page.thumbnail?.source || null } : null;
};

router.get('/search', async (req, res) => {
  const kind = SHELF_KINDS.includes(req.query.kind) ? req.query.kind : 'book';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
  if (!q) return res.json({ items: [] });
  try {
    let items;
    if (kind === 'anime' || kind === 'manga') items = await searchShikimori(kind, q).catch(() => searchJikan(kind, q));
    else if (kind === 'game') items = await searchSteam(q).then((list) => (list.length ? list : searchWikipedia(kind, q)));
    else if (kind === 'book') items = await searchBooks(q);
    else if (kind === 'series') items = await searchSeries(q);
    else items = await searchWikipedia(kind, q);
    res.json({ items: items.filter((x) => x.title) });
  } catch (error) {
    res.status(502).json({ error: 'Не удалось получить данные с внешнего сайта: ' + (error?.message || 'нет связи') });
  }
});

// Полное описание выбранного результата (подгружается при выборе, чтобы поиск был быстрым)
router.get('/details', async (req, res) => {
  const source = String(req.query.source || '');
  const id = String(req.query.external_id || '');
  const kind = SHELF_KINDS.includes(req.query.kind) ? req.query.kind : 'book';
  try {
    if (source === 'shikimori') {
      // у синхронизированных из списка id с префиксом: a123 — аниме, m123 — манга/ранобэ
      const isAnime = id.startsWith('a') || (kind === 'anime' && !id.startsWith('m'));
      const { data } = await shikiFetch(`/api/${isAnime ? 'animes' : 'mangas'}/${encodeURIComponent(id.replace(/^[am]/, ''))}`);
      return res.json({
        description: cleanShiki(data?.description),
        author: (data?.studios || []).map((x) => x.name).join(', ') || null,
        meta: { genres: (data?.genres || []).map((g) => g.russian || g.name), duration: data?.duration || null, status: data?.status || null },
      });
    }
    if (source === 'steam') {
      const data = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(id)}&l=russian`);
      const d = data?.[id]?.data || {};
      return res.json({
        description: stripHtml(d.short_description),
        author: (d.developers || []).join(', ') || null,
        year: Number((d.release_date?.date || '').match(/(19|20)\d{2}/)?.[0]) || null,
        meta: { genres: (d.genres || []).map((g) => g.description) },
      });
    }
    if (source === 'openlibrary' || source === 'tvmaze') {
      const title = typeof req.query.title === 'string' ? req.query.title.slice(0, 200) : '';
      const ru = await wikiRuSummary(kind, title, req.query.year).catch(() => null);
      if (ru) return res.json({ description: ru.description, cover_url: ru.cover_url, meta: {} });
      if (source === 'openlibrary' && id.startsWith('/works/')) {
        const data = await fetchJson(`https://openlibrary.org${id}.json`);
        const desc = typeof data?.description === 'string' ? data.description : data?.description?.value;
        return res.json({ description: desc ? desc.slice(0, 3000) : null, meta: {} });
      }
      return res.json({});
    }
    res.json({});
  } catch (error) {
    res.json({ error: error?.message || 'нет связи' });
  }
});

// ── Синхронизация со списками Shikimori (открытый профиль, без входа) ──

const SHIKI_STATUS = { planned: 'planned', watching: 'active', rewatching: 'active', on_hold: 'paused', completed: 'done', dropped: 'dropped' };
const NOVEL_KINDS = ['light_novel', 'novel'];

const fetchShikiRates = async (nick, target) => {
  const all = [];
  for (let page = 1; page <= 10; page++) {
    const { host, data } = await shikiFetch(`/api/users/${encodeURIComponent(nick)}/${target}_rates?limit=5000&page=${page}`);
    const list = Array.isArray(data) ? data : [];
    all.push(...list.map((rate) => ({ rate, host })));
    if (list.length < 5000) break;
  }
  return all;
};

export const syncShikimori = async (userId, nick) => {
  const db = await getDB();
  const rates = [...(await fetchShikiRates(nick, 'anime')), ...(await fetchShikiRates(nick, 'manga'))];
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  for (const { rate, host } of rates) {
    const title = rate.anime || rate.manga;
    if (!title?.id) continue;
    const kind = rate.anime ? 'anime' : NOVEL_KINDS.includes(title.kind) ? 'book' : 'manga';
    const externalId = `${rate.anime ? 'a' : 'm'}${title.id}`;
    const status = SHIKI_STATUS[rate.status] || 'planned';
    const rating = Number(rate.score) || null;
    const progress = rate.anime ? rate.episodes || 0 : rate.chapters || 0;
    const existing = await db.get("SELECT * FROM shelf_items WHERE user_id=? AND source='shikimori' AND (external_id=? OR external_id=?) AND kind=?", [userId, externalId, String(title.id), kind]);
    if (existing) {
      let meta = {};
      try {
        meta = JSON.parse(existing.meta || '{}');
      } catch {
        meta = {};
      }
      if (existing.status === status && (existing.rating || null) === rating && (meta.progress || 0) === progress) continue;
      meta.progress = progress;
      await db.run('UPDATE shelf_items SET status=?, rating=?, meta=?, external_id=?, updated_at=? WHERE id=?', [status, rating, JSON.stringify(meta), externalId, now, existing.id]);
      updated++;
      continue;
    }
    const meta = {
      score: Number(title.score) || null,
      episodes: title.episodes || null,
      chapters: title.chapters || null,
      volumes: title.volumes || null,
      type: title.kind || null,
      original_title: title.name,
      progress,
      genres: [],
    };
    await db.run(
      `INSERT INTO shelf_items(user_id, kind, title, author, year, cover_url, description, source, external_id, external_url, status, rating, notes, meta, position, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId, kind, title.russian || title.name, null,
        Number((title.aired_on || title.released_on || '').slice(0, 4)) || null,
        title.image?.original ? host + title.image.original : null,
        null, 'shikimori', externalId, title.url ? host + title.url : null,
        status, rating, null, JSON.stringify(meta), Date.now(), now, now,
      ]
    );
    added++;
  }
  await db.run('UPDATE users SET shikimori_synced_at=? WHERE id=?', [now, userId]);
  return { added, updated, total: rates.length, synced_at: now };
};

router.get('/shikimori', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT shikimori_nick, shikimori_synced_at FROM users WHERE id=?', [req.user.uid]);
  res.json({ nickname: row?.shikimori_nick || null, synced_at: row?.shikimori_synced_at || null });
});

// Привязать ник (или отвязать пустым) и сразу синхронизировать
router.put('/shikimori', async (req, res) => {
  const nick = text(req.body?.nickname, 80);
  const db = await getDB();
  if (!nick) {
    await db.run('UPDATE users SET shikimori_nick=NULL, shikimori_synced_at=NULL WHERE id=?', [req.user.uid]);
    return res.json({ nickname: null });
  }
  try {
    const result = await syncShikimori(req.user.uid, nick);
    await db.run('UPDATE users SET shikimori_nick=? WHERE id=?', [nick, req.user.uid]);
    res.json({ nickname: nick, ...result });
  } catch (error) {
    const notFound = /HTTP 404/.test(error?.message || '');
    res.status(notFound ? 404 : 502).json({ error: notFound ? 'Профиль не найден на Shikimori — проверьте ник' : 'Shikimori не ответил: ' + (error?.message || 'нет связи') });
  }
});

router.post('/shikimori/sync', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT shikimori_nick FROM users WHERE id=?', [req.user.uid]);
  if (!row?.shikimori_nick) return res.status(400).json({ error: 'Shikimori не привязан' });
  try {
    res.json({ nickname: row.shikimori_nick, ...(await syncShikimori(req.user.uid, row.shikimori_nick)) });
  } catch (error) {
    res.status(502).json({ error: 'Shikimori не ответил: ' + (error?.message || 'нет связи') });
  }
});

// ── Steam: игры из библиотеки (нужен бесплатный ключ Steam Web API — без него Steam список игр не отдаёт) ──

const STEAM_API = 'https://api.steampowered.com';

const fetchText = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'LifeHub/1.0 (personal app)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};
const xmlTag = (xml, tag) => xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`))?.[1]?.trim() || null;

/** Открытый XML профиля (работает без ключа): SteamID64 и недавно игранные игры с часами. */
const steamProfileXml = async (steamIdOrVanity) => {
  const path = /^\d{17}$/.test(steamIdOrVanity) ? `profiles/${steamIdOrVanity}` : `id/${encodeURIComponent(steamIdOrVanity)}`;
  const xml = await fetchText(`https://steamcommunity.com/${path}/?xml=1`);
  if (/<error>/.test(xml)) throw new Error('Профиль Steam не найден — проверьте ссылку');
  const games = [...xml.matchAll(/<mostPlayedGame>([\s\S]*?)<\/mostPlayedGame>/g)].map((m) => ({
    appid: Number(xmlTag(m[1], 'gameLink')?.match(/app\/(\d+)/)?.[1]) || null,
    name: xmlTag(m[1], 'gameName'),
    hours: Number(xmlTag(m[1], 'hoursOnRecord')?.replace(',', '')) || 0,
    recent: Number(xmlTag(m[1], 'hoursPlayed')) > 0,
    lastPlayed: null,
  }));
  return { steamId: xmlTag(xml, 'steamID64'), privacy: xmlTag(xml, 'privacyState'), games };
};

/** Ссылка на профиль, ник из ссылки или SteamID64 → SteamID64 (без ключа — через открытый XML профиля). */
const resolveSteamId = async (input) => {
  const raw = String(input || '').trim();
  const direct = raw.match(/(?:profiles\/)?(\d{17})/);
  if (direct) return direct[1];
  const vanity = raw.match(/\/id\/([^/?#]+)/)?.[1] || (/^[A-Za-z0-9_-]{2,64}$/.test(raw) ? raw : null);
  if (!vanity) throw new Error('Не понял ссылку на профиль Steam');
  const { steamId } = await steamProfileXml(vanity);
  if (!steamId) throw new Error('Профиль Steam не найден — проверьте ссылку');
  return steamId;
};

/** Игры профиля в одном виде: с ключом — вся библиотека, без ключа — недавние игры из профиля. */
const steamGames = async (steamId, key) => {
  if (!key) {
    const { games, privacy } = await steamProfileXml(steamId);
    if (privacy && privacy !== 'public' && !games.length) throw new Error('Профиль Steam закрыт — откройте его в настройках приватности');
    return { games, full: false };
  }
  const data = await fetchJson(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(key)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`);
  const list = data?.response?.games;
  if (!Array.isArray(list)) throw new Error('Steam не отдал игры — откройте «Сведения об играх» в настройках приватности профиля');
  const monthAgo = Date.now() / 1000 - 30 * 86400;
  return {
    full: true,
    games: list.map((g) => ({
      appid: g.appid,
      name: g.name,
      hours: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
      recent: (g.playtime_2weeks || 0) > 0 || (g.rtime_last_played || 0) > monthAgo,
      lastPlayed: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString().slice(0, 10) : null,
    })),
  };
};

export const syncSteam = async (userId) => {
  const db = await getDB();
  const user = await db.get('SELECT steam_id, steam_key FROM users WHERE id=?', [userId]);
  if (!user?.steam_id) throw new Error('Steam не подключён');
  const { games, full } = await steamGames(user.steam_id, user.steam_key);
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  for (const g of games) {
    if (!g?.appid || !g?.name) continue;
    const { hours, recent, lastPlayed } = g;
    const existing = await db.get("SELECT * FROM shelf_items WHERE user_id=? AND kind='game' AND source='steam' AND external_id=?", [userId, String(g.appid)]);
    if (existing) {
      let meta = {};
      try {
        meta = JSON.parse(existing.meta || '{}');
      } catch {
        meta = {};
      }
      if (meta.hours === hours && (meta.last_played === lastPlayed || !lastPlayed)) continue;
      meta.hours = hours;
      if (lastPlayed) meta.last_played = lastPlayed;
      // статус меняем только сами-собой-понятный: «Хочу» → «Играю», когда появились часы; остальное решает пользователь
      const status = existing.status === 'planned' && hours > 0 ? 'active' : existing.status;
      await db.run('UPDATE shelf_items SET meta=?, status=?, updated_at=? WHERE id=?', [JSON.stringify(meta), status, now, existing.id]);
      updated++;
      continue;
    }
    const status = hours === 0 ? 'planned' : recent ? 'active' : 'paused';
    await db.run(
      `INSERT INTO shelf_items(user_id, kind, title, author, year, cover_url, description, source, external_id, external_url, status, rating, notes, meta, position, created_at, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        userId, 'game', g.name, null, null,
        `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
        null, 'steam', String(g.appid), `https://store.steampowered.com/app/${g.appid}`,
        status, null, null, JSON.stringify({ hours, last_played: lastPlayed, genres: [] }), Date.now(), now, now,
      ]
    );
    added++;
  }
  await db.run('UPDATE users SET steam_synced_at=? WHERE id=?', [now, userId]);
  return { added, updated, total: games.length, full, synced_at: now };
};

/** Состояние всех интеграций полки — для настроек и кнопки синхронизации. */
router.get('/integrations', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT shikimori_nick, shikimori_synced_at, steam_id, steam_profile, steam_key, steam_synced_at FROM users WHERE id=?', [req.user.uid]);
  res.json({
    shikimori: { nickname: row?.shikimori_nick || null, synced_at: row?.shikimori_synced_at || null },
    steam: { steam_id: row?.steam_id || null, profile: row?.steam_profile || null, has_key: !!row?.steam_key, synced_at: row?.steam_synced_at || null },
  });
});

router.put('/steam', async (req, res) => {
  const db = await getDB();
  const profile = text(req.body?.profile, 300);
  if (!profile) {
    await db.run('UPDATE users SET steam_id=NULL, steam_profile=NULL, steam_key=NULL, steam_synced_at=NULL WHERE id=?', [req.user.uid]);
    return res.json({ steam_id: null });
  }
  const current = await db.get('SELECT steam_key FROM users WHERE id=?', [req.user.uid]);
  // ключ необязателен: без него — недавние игры из профиля, с ним — вся библиотека; пустая строка убирает ключ
  const key = req.body?.key === '' ? null : text(req.body?.key, 64) || current?.steam_key || null;
  try {
    const steamId = await resolveSteamId(profile);
    await db.run('UPDATE users SET steam_id=?, steam_profile=?, steam_key=? WHERE id=?', [steamId, profile, key, req.user.uid]);
    const result = await syncSteam(req.user.uid);
    res.json({ steam_id: steamId, ...result });
  } catch (error) {
    const msg = error?.message || 'нет связи';
    res.status(/HTTP 403|HTTP 401/.test(msg) ? 400 : 502).json({ error: /HTTP 40[13]/.test(msg) ? 'Steam не принял ключ — проверьте ключ Web API' : msg });
  }
});

router.post('/steam/sync', async (req, res) => {
  try {
    res.json(await syncSteam(req.user.uid));
  } catch (error) {
    res.status(502).json({ error: error?.message || 'Steam не ответил' });
  }
});

/** Обновить всё подключённое разом (кнопка на полке и автообновление при открытии). */
router.post('/integrations/sync', async (req, res) => {
  const db = await getDB();
  const row = await db.get('SELECT shikimori_nick, steam_id, steam_key FROM users WHERE id=?', [req.user.uid]);
  const out = {};
  if (row?.shikimori_nick) out.shikimori = await syncShikimori(req.user.uid, row.shikimori_nick).catch((e) => ({ error: e?.message }));
  if (row?.steam_id) out.steam = await syncSteam(req.user.uid).catch((e) => ({ error: e?.message }));
  res.json(out);
});

router.get('/', async (req, res) => {
  const db = await getDB();
  const rows = await db.all('SELECT * FROM shelf_items WHERE user_id=? ORDER BY kind, position, created_at DESC', [req.user.uid]);
  const tagMap = await fetchTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.SHELF, rows.map((r) => r.id));
  res.json({ items: rows.map((r) => ({ ...mapRow(r), tags: tagMap.get(r.id) || [] })) });
});

const withTags = async (db, userId, row) => {
  const tagMap = await fetchTagLinks(db, userId, TAG_ENTITY_TYPES.SHELF, [row.id]);
  return { ...mapRow(row), tags: tagMap.get(row.id) || [] };
};

const pickFields = (body) => ({
  kind: SHELF_KINDS.includes(body?.kind) ? body.kind : undefined,
  title: text(body?.title, 300),
  author: text(body?.author, 300),
  year: Number.isFinite(Number(body?.year)) && body?.year !== null && body?.year !== '' ? Math.round(Number(body.year)) : null,
  cover_url: text(body?.cover_url, 2048),
  description: text(body?.description, 6000),
  source: text(body?.source, 40),
  external_id: text(body?.external_id, 120),
  external_url: text(body?.external_url, 2048),
  status: STATUSES.includes(body?.status) ? body.status : undefined,
  rating: Number.isFinite(Number(body?.rating)) ? Math.min(10, Math.max(0, Math.round(Number(body.rating)))) : null,
  notes: text(body?.notes, 6000),
  meta: body?.meta && typeof body.meta === 'object' ? JSON.stringify(body.meta).slice(0, 8000) : null,
});

router.post('/', async (req, res) => {
  const f = pickFields(req.body);
  if (!f.title) return res.status(400).json({ error: 'title_required' });
  const db = await getDB();
  const now = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO shelf_items(user_id, kind, title, author, year, cover_url, description, source, external_id, external_url, status, rating, notes, meta, position, created_at, updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [req.user.uid, f.kind || 'book', f.title, f.author, f.year, f.cover_url, f.description, f.source, f.external_id, f.external_url, f.status || 'planned', f.rating, f.notes, f.meta, Date.now(), now, now]
  );
  if (Array.isArray(req.body?.tags)) await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.SHELF, result.lastID, req.body.tags);
  const row = await db.get('SELECT * FROM shelf_items WHERE id=?', [result.lastID]);
  res.json({ item: await withTags(db, req.user.uid, row) });
});

router.put('/:id', async (req, res) => {
  const db = await getDB();
  const existing = await db.get('SELECT * FROM shelf_items WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const f = pickFields(req.body);
  const updates = [];
  const values = [];
  for (const key of Object.keys(f)) {
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, key)) continue;
    if (f[key] === undefined) continue;
    updates.push(`${key}=?`);
    values.push(f[key]);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'position') && Number.isFinite(Number(req.body.position))) {
    updates.push('position=?');
    values.push(Number(req.body.position));
  }
  if (updates.length) {
    updates.push('updated_at=?');
    values.push(new Date().toISOString(), req.params.id, req.user.uid);
    await db.run(`UPDATE shelf_items SET ${updates.join(', ')} WHERE id=? AND user_id=?`, values);
  }
  if (Array.isArray(req.body?.tags)) await syncTagLinks(db, req.user.uid, TAG_ENTITY_TYPES.SHELF, existing.id, req.body.tags);
  const row = await db.get('SELECT * FROM shelf_items WHERE id=?', [req.params.id]);
  res.json({ item: await withTags(db, req.user.uid, row) });
});

router.delete('/:id', async (req, res) => {
  const db = await getDB();
  await db.run('DELETE FROM shelf_items WHERE id=? AND user_id=?', [req.params.id, req.user.uid]);
  await db.run('DELETE FROM tag_links WHERE entity_type=? AND entity_id=? AND user_id=?', [TAG_ENTITY_TYPES.SHELF, req.params.id, req.user.uid]);
  await dropEntityLinks(db, req.user.uid, 'shelf', Number(req.params.id));
  res.json({ success: true });
});

export default router;
