import express from 'express';
import axios from 'axios';
import { getDB } from './utils.js';

const router = express.Router();

async function ensureSchema() {
  const db = await getDB();
  await db.exec(`CREATE TABLE IF NOT EXISTS social_settings(
    user_id INTEGER PRIMARY KEY,
    tg_bot_token TEXT,
    tg_chat_id TEXT,
    twitch_channel TEXT,
    youtube_channel_id TEXT,
    tg_stream_template TEXT,
    tg_video_template TEXT,
    last_video_id TEXT,
    last_stream_live INTEGER DEFAULT 0,
    updated_at TEXT
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS social_metrics(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    platform TEXT,
    followers INTEGER,
    subscribers INTEGER,
    avg_viewers INTEGER,
    active_chatters INTEGER,
    top_chatter TEXT,
    snapshot_at TEXT
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS social_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT,           -- stream_live | video_released
    title TEXT,
    url TEXT,
    event_date TEXT,
    created_at TEXT
  )`);
  const metricsInfo = await db.all('PRAGMA table_info(social_metrics)');
  if (metricsInfo.length && !metricsInfo.some(col => col.name === 'top_chatter')) {
    await db.exec('ALTER TABLE social_metrics ADD COLUMN top_chatter TEXT;');
  }
  await db.exec(`CREATE TABLE IF NOT EXISTS social_chatters(
    user_id INTEGER,
    platform TEXT,
    chatter TEXT,
    hits INTEGER DEFAULT 0,
    last_seen TEXT,
    PRIMARY KEY(user_id, platform, chatter)
  )`);
}

// simple template fn
function tpl(str, data) {
  if (!str) return '';
  return str.replace(/\{(\w+)\}/g, (_, k) => (data?.[k] ?? ''));
}

async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId || !text) return { ok:false, reason: 'missing data' };
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  const r = await axios.post(url, payload).then(r => r.data).catch(e => ({ ok:false, reason: e?.response?.data || e.message }));
  return r;
}

router.get('/settings', async (req, res) => {
  await ensureSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  res.json({ settings: row || null });
});

router.post('/settings', async (req, res) => {
  await ensureSchema();
  const db = await getDB();
  const {
    tg_bot_token=null, tg_chat_id=null,
    twitch_channel=null, youtube_channel_id=null,
    tg_stream_template=null, tg_video_template=null
  } = req.body || {};
  const now = new Date().toISOString();

  await db.run(`INSERT INTO social_settings(user_id, tg_bot_token, tg_chat_id, twitch_channel, youtube_channel_id, tg_stream_template, tg_video_template, updated_at)
                VALUES(?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                  tg_bot_token=excluded.tg_bot_token,
                  tg_chat_id=excluded.tg_chat_id,
                  twitch_channel=excluded.twitch_channel,
                  youtube_channel_id=excluded.youtube_channel_id,
                  tg_stream_template=excluded.tg_stream_template,
                  tg_video_template=excluded.tg_video_template,
                  updated_at=excluded.updated_at`,
                [req.user.uid, tg_bot_token, tg_chat_id, twitch_channel, youtube_channel_id, tg_stream_template, tg_video_template, now]);
  const fresh = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  res.json({ ok:true, settings: fresh });
});

router.post('/test/telegram', async (req, res) => {
  await ensureSchema();
  const db = await getDB();
  const s = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  if (!s?.tg_bot_token || !s?.tg_chat_id) return res.status(400).json({ error: 'no_telegram' });
  const { type='stream' } = req.body || {};
  const sample = type === 'video'
    ? { video_title: 'Demo video', video_url: 'https://youtube.com/watch?v=demo', published_at: new Date().toISOString() }
    : { stream_title: 'Demo stream', channel: s.twitch_channel || 'channel', game: 'Just Chatting', viewers: 777 };
  const t = type === 'video' ? s.tg_video_template : s.tg_stream_template;
  const text = tpl(t || (type==='video' ? '🎬 {video_title}\n{video_url}' : '🔴 Стрим: {stream_title}\nhttps://twitch.tv/{channel}'), sample);
  const r = await sendTelegram(s.tg_bot_token, s.tg_chat_id, text);
  res.json({ sent: r });
});

async function getTwitchAppToken() {
  const cid = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!cid || !secret) return null;
  const url = `https://id.twitch.tv/oauth2/token`;
  const r = await axios.post(url, null, { params: { client_id: cid, client_secret: secret, grant_type: 'client_credentials' } }).then(r => r.data).catch(()=>null);
  return r?.access_token || null;
}

async function twitchPoll(userId, settings) {
  if (!settings?.twitch_channel) return null;
  const token = await getTwitchAppToken();
  if (!token) return null;
  const headers = { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };

  // user info
  const user = await axios.get('https://api.twitch.tv/helix/users', { params: { login: settings.twitch_channel }, headers })
    .then(r => r.data?.data?.[0]).catch(()=>null);
  if (!user) return null;
  const broadcaster_id = user.id;

  // followers endpoint requires user token now; skip to avoid 410 with app token
  let followers = null;
  try {
    const rawFollowers = await axios.get(`https://decapi.me/twitch/followers/${settings.twitch_channel}`).then(r => String(r.data)).catch(() => null);
    if (rawFollowers) {
      const digits = rawFollowers.replace(/[^0-9]/g, '');
      if (digits) {
        const parsed = parseInt(digits, 10);
        if (!Number.isNaN(parsed)) followers = parsed;
      }
    }
  } catch {
    followers = null;
  }

  // stream status
  const stream = await axios.get('https://api.twitch.tv/helix/streams', { params: { user_id: broadcaster_id }, headers })
    .then(r => r.data?.data?.[0] || null).catch(()=>null);
  const isLive = !!stream;
  const viewers = stream?.viewer_count || null;

  const db = await getDB();
  const prev = await db.get('SELECT last_stream_live FROM social_settings WHERE user_id=?', [userId]);

  let activeChatters = null;
  let topChatter = null;
  try {
    const chatData = await axios.get(`https://tmi.twitch.tv/group/user/${settings.twitch_channel}/chatters`).then(r => r.data).catch(() => null);
    if (chatData) {
      activeChatters = typeof chatData.chatter_count === 'number' ? chatData.chatter_count : null;
      const groups = chatData.chatters || {};
      const lowerChannel = String(settings.twitch_channel || '').toLowerCase();
      const unique = Array.from(new Set(Object.values(groups)
        .flat()
        .filter(Boolean)
        .map(name => String(name).toLowerCase())
        .filter(name => name && name !== lowerChannel)));
      if (unique.length) {
        const nowIso = new Date().toISOString();
        await Promise.all(unique.map(name => db.run(
          `INSERT INTO social_chatters(user_id, platform, chatter, hits, last_seen) VALUES(?,?,?,?,?) ON CONFLICT(user_id, platform, chatter) DO UPDATE SET hits = social_chatters.hits + 1, last_seen = excluded.last_seen`,
          [userId, 'twitch', name, 1, nowIso]
        )));
      }
      const topRow = await db.get('SELECT chatter FROM social_chatters WHERE user_id=? AND platform=? ORDER BY hits DESC, last_seen DESC LIMIT 1', [userId, 'twitch']);
      topChatter = topRow?.chatter || null;
    }
  } catch {
    // ignore chatters fetch errors
  }

  // When goes live -> feed + social_log
  if (isLive && !prev?.last_stream_live && settings.tg_bot_token && settings.tg_chat_id) {
    const text = (settings.tg_stream_template || '🔴 Стрим: {stream_title}\nhttps://twitch.tv/{channel}')
      .replace('{stream_title}', stream?.title || 'Стрим')
      .replace('{channel}', settings.twitch_channel)
      .replace('{game}', stream?.game_name || '')
      .replace('{viewers}', String(stream?.viewer_count || 0));
    await sendTelegram(settings.tg_bot_token, settings.tg_chat_id, text).catch(()=>{});
    const today = new Date().toISOString().slice(0,10);
    await db.run(`INSERT INTO social_logs(user_id,type,title,url,event_date,created_at) VALUES(?,?,?,?,?,?)`,
      [userId, 'stream_live', stream?.title || 'Стрим', `https://twitch.tv/${settings.twitch_channel}`, today, new Date().toISOString()]);
    await db.run(`INSERT INTO life_feed(user_id,type,text,meta,ts) VALUES(?,?,?,?,?)`,
      [userId, 'stream', `Начал стрим: ${stream?.title||''}`, JSON.stringify({ channel: settings.twitch_channel }), new Date().toISOString()]);
  }
  await db.run('UPDATE social_settings SET last_stream_live=? WHERE user_id=?', [isLive ? 1 : 0, userId]);

  // metrics snapshot
  await db.run(`INSERT INTO social_metrics(user_id, platform, followers, subscribers, avg_viewers, active_chatters, top_chatter, snapshot_at)
                VALUES(?,?,?,?,?,?,?,?)`,
                [userId, 'twitch', followers, null, viewers, activeChatters, topChatter, new Date().toISOString()]);

  return { live: isLive, viewers, followers, activeChatters, topChatter };
}

async function youtubePoll(userId, settings) {
  const key = process.env.YT_API_KEY;
  const ch = settings?.youtube_channel_id;
  if (!key || !ch) return null;
  const chInfo = await axios.get('https://www.googleapis.com/youtube/v3/channels', { params: { part: 'statistics', id: ch, key } })
    .then(r => r.data?.items?.[0]).catch(()=>null);
  const subs = chInfo?.statistics?.subscriberCount ? +chInfo.statistics.subscriberCount : null;

  const search = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { part: 'snippet', channelId: ch, order: 'date', maxResults: 1, type: 'video', key }
    }).then(r => r.data?.items?.[0]).catch(()=>null);
  const videoId = search?.id?.videoId || null;

  const db = await getDB();
  const prev = await db.get('SELECT last_video_id FROM social_settings WHERE user_id=?', [userId]);
  if (videoId && prev?.last_video_id !== videoId) {
    // telegram notify
    if (settings.tg_bot_token && settings.tg_chat_id) {
      const text = (settings.tg_video_template || '🎬 Новое видео: {video_title}\n{video_url}')
        .replace('{video_title}', search?.snippet?.title || 'Видео')
        .replace('{video_url}', `https://youtu.be/${videoId}`)
        .replace('{published_at}', search?.snippet?.publishedAt || '');
      await sendTelegram(settings.tg_bot_token, settings.tg_chat_id, text).catch(()=>{});
    }
    // logs (for calendar/feed)
    const date = (search?.snippet?.publishedAt || '').slice(0,10);
    await db.run(`INSERT INTO social_logs(user_id,type,title,url,event_date,created_at) VALUES(?,?,?,?,?,?)`,
      [userId, 'video_released', search?.snippet?.title || 'Видео', `https://youtu.be/${videoId}`, date || new Date().toISOString().slice(0,10), new Date().toISOString()]);
    await db.run('UPDATE social_settings SET last_video_id=? WHERE user_id=?', [videoId, userId]);
    await db.run(`INSERT INTO life_feed(user_id,type,text,meta,ts) VALUES(?,?,?,?,?)`,
      [userId, 'video', `Вышло видео: ${search?.snippet?.title||''}`, JSON.stringify({ videoId }), new Date().toISOString()]);
  }

  await db.run(`INSERT INTO social_metrics(user_id, platform, subscribers, snapshot_at)
                VALUES(?,?,?,?)`, [userId, 'youtube', subs, new Date().toISOString()]);

  return { subscribers: subs, latest_video_id: videoId };
}

router.post('/poll', async (req, res) => {
  await ensureSchema();
  const db = await getDB();
  const s = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  if (!s) return res.status(400).json({ error: 'no_settings' });
  const tw = await twitchPoll(req.user.uid, s).catch((e)=>({ error: 'twitch_failed', details: String(e) }));
  const yt = await youtubePoll(req.user.uid, s).catch((e)=>({ error: 'youtube_failed', details: String(e) }));
  res.json({ ok:true, twitch: tw, youtube: yt });
});

router.get('/metrics', async (req, res) => {
  await ensureSchema();
  const db = await getDB();
  const rows = await db.all('SELECT * FROM social_metrics WHERE user_id=? ORDER BY id DESC LIMIT 200', [req.user.uid]);

  const latestByPlatform = {};
  for (const row of rows) {
    if (!latestByPlatform[row.platform]) {
      latestByPlatform[row.platform] = row;
    }
  }

  const summary = {};
  if (latestByPlatform.twitch) {
    const avgRow = await db.get("SELECT AVG(avg_viewers) AS avg_viewers FROM social_metrics WHERE user_id=? AND platform='twitch' AND avg_viewers IS NOT NULL", [req.user.uid]);
    const topRow = await db.get('SELECT chatter, hits FROM social_chatters WHERE user_id=? AND platform=? ORDER BY hits DESC, last_seen DESC LIMIT 1', [req.user.uid, 'twitch']);
    summary.twitch = {
      followers: latestByPlatform.twitch.followers ?? null,
      currentViewers: latestByPlatform.twitch.avg_viewers ?? null,
      averageViewers: avgRow?.avg_viewers != null ? Math.round(avgRow.avg_viewers) : null,
      activeChatters: latestByPlatform.twitch.active_chatters ?? null,
      topChatter: latestByPlatform.twitch.top_chatter ?? topRow?.chatter ?? null
    };
  }
  if (latestByPlatform.youtube) {
    summary.youtube = {
      subscribers: latestByPlatform.youtube.subscribers ?? null
    };
  }

  res.json({ items: rows, summary });
});

export default router;