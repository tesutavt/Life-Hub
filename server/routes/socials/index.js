import express from 'express';
import axios from 'axios';
import tmi from 'tmi.js';
import { getDB } from '../../utils.js';

const router = express.Router();

export async function ensureSocialSchema() {
  const db = await getDB();
  await db.exec(`CREATE TABLE IF NOT EXISTS social_settings(
    user_id INTEGER PRIMARY KEY,
    tg_bot_token TEXT,
    tg_chat_id TEXT,
    tg_personal_chat_id TEXT,
    twitch_channel TEXT,
    youtube_channel_id TEXT,
    tg_stream_template TEXT,
    tg_video_template TEXT,
    last_video_id TEXT,
    last_stream_live INTEGER DEFAULT 0,
    updated_at TEXT,
    twitch_bot_username TEXT,
    twitch_bot_token TEXT,
    last_stream_title TEXT,
    last_stream_game TEXT,
    last_stream_started_at TEXT,
    last_stream_updated_at TEXT
  )`);
  const settingsInfo = await db.all('PRAGMA table_info(social_settings)');
  const ensureSettingsColumn = async (name, ddl) => {
    if (!settingsInfo.some((col) => col.name === name)) {
      await db.exec(`ALTER TABLE social_settings ADD COLUMN ${name} ${ddl}`);
    }
  };
  await ensureSettingsColumn('twitch_bot_username', 'TEXT');
  await ensureSettingsColumn('twitch_bot_token', 'TEXT');
  await ensureSettingsColumn('last_stream_title', 'TEXT');
  await ensureSettingsColumn('last_stream_game', 'TEXT');
  await ensureSettingsColumn('last_stream_started_at', 'TEXT');
  await ensureSettingsColumn('last_stream_updated_at', 'TEXT');
  await ensureSettingsColumn('tg_personal_chat_id', 'TEXT');
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
  await db.exec(`CREATE TABLE IF NOT EXISTS twitch_commands(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    command TEXT,
    response TEXT,
    enabled INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT,
    UNIQUE(user_id, command)
  )`);
  await db.exec(`CREATE TABLE IF NOT EXISTS twitch_timers(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    online_interval_sec INTEGER DEFAULT 900,
    offline_interval_sec INTEGER DEFAULT 1800,
    enabled INTEGER DEFAULT 1,
    last_sent_at TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
}

// simple template fn
function tpl(str, data) {
  if (!str) return '';
  return str.replace(/\{(\w+)\}/g, (_, k) => (data?.[k] ?? ''));
}

const TWITCH_DECAPI_BASE = 'https://decapi.me/twitch';

async function fetchDecapi(endpoint) {
  try {
    const response = await axios.get(`${TWITCH_DECAPI_BASE}/${endpoint}`, {
      responseType: 'text',
      timeout: 5000
    });
    return typeof response.data === 'string' ? response.data : String(response.data ?? '');
  } catch {
    return null;
  }
}

function parseDecapiNumber(text) {
  if (!text) return null;
  const digits = String(text).replace(/[^0-9]/g, '');
  if (!digits) return null;
  const value = parseInt(digits, 10);
  return Number.isNaN(value) ? null : value;
}

async function fallbackTwitchStream(channel) {
  const uptimeText = await fetchDecapi(`uptime/${channel}`);
  const live = uptimeText ? !/offline/i.test(uptimeText) : null;
  if (!live) {
    return { live: false, viewers: null, title: null, game: null, started_at: null };
  }
  const titleText = await fetchDecapi(`status/${channel}`);
  const gameText = await fetchDecapi(`game/${channel}`);
  const viewerText = await fetchDecapi(`viewercount/${channel}`);
  return {
    live: true,
    viewers: parseDecapiNumber(viewerText),
    title: titleText && !/offline/i.test(titleText) ? titleText : null,
    game: gameText && !/not playing/i.test(gameText) ? gameText : null,
    started_at: null
  };
}

async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId || !text) return { ok:false, reason: 'missing data' };
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  const r = await axios.post(url, payload).then(r => r.data).catch(e => ({ ok:false, reason: e?.response?.data || e.message }));
  return r;
}

router.get('/settings', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const row = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  res.json({ settings: row || null });
});

router.post('/settings', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const {
    tg_bot_token = null,
    tg_chat_id = null,
    tg_personal_chat_id = null,
    twitch_channel = null,
    youtube_channel_id = null,
    tg_stream_template = null,
    tg_video_template = null,
    twitch_bot_username = null,
    twitch_bot_token = null,
  } = req.body || {};
  const now = new Date().toISOString();

  await db.run(`INSERT INTO social_settings(user_id, tg_bot_token, tg_chat_id, tg_personal_chat_id, twitch_channel, youtube_channel_id, tg_stream_template, tg_video_template, twitch_bot_username, twitch_bot_token, updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET
                  tg_bot_token=excluded.tg_bot_token,
                  tg_chat_id=excluded.tg_chat_id,
                  tg_personal_chat_id=excluded.tg_personal_chat_id,
                  twitch_channel=excluded.twitch_channel,
                  youtube_channel_id=excluded.youtube_channel_id,
                  tg_stream_template=excluded.tg_stream_template,
                  tg_video_template=excluded.tg_video_template,
                  twitch_bot_username=excluded.twitch_bot_username,
                  twitch_bot_token=excluded.twitch_bot_token,
                  updated_at=excluded.updated_at`,
                [
                  req.user.uid,
                  tg_bot_token,
                  tg_chat_id,
                  tg_personal_chat_id,
                  twitch_channel,
                  youtube_channel_id,
                  tg_stream_template,
                  tg_video_template,
                  twitch_bot_username,
                  twitch_bot_token,
                  now
                ]);
  const fresh = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({ ok:true, settings: fresh });
});

router.post('/test/telegram', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const s = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  const chatFallback = s?.tg_chat_id || s?.tg_personal_chat_id;
  if (!s?.tg_bot_token || !chatFallback) return res.status(400).json({ error: 'no_telegram' });
  const { type = 'stream', target = 'default' } = req.body || {};
  const resolvedChatId =
    target === 'personal' && s?.tg_personal_chat_id
      ? s.tg_personal_chat_id
      : target === 'channel' && s?.tg_chat_id
        ? s.tg_chat_id
        : chatFallback;
  const sample = type === 'video'
    ? { video_title: 'Demo video', video_url: 'https://youtube.com/watch?v=demo', published_at: new Date().toISOString() }
    : { stream_title: 'Demo stream', channel: normalizeTwitchChannel(s.twitch_channel) || 'channel', game: 'Just Chatting', viewers: 777 };
  const t = type === 'video' ? s.tg_video_template : s.tg_stream_template;
  const text = tpl(t || (type==='video' ? '🎬 {video_title}\n{video_url}' : '🔴 Стрим: {stream_title}\nhttps://twitch.tv/{channel}'), sample);
  const r = await sendTelegram(s.tg_bot_token, resolvedChatId, text);
  res.json({ sent: r, target: resolvedChatId === s?.tg_personal_chat_id ? 'personal' : 'channel' });
});

router.get('/twitch/commands', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const rows = await db.all(
    'SELECT id, command, response, enabled, created_at, updated_at FROM twitch_commands WHERE user_id=? ORDER BY command ASC',
    [req.user.uid]
  );
  const items = rows.map((row) => ({
    id: row.id,
    command: row.command,
    response: row.response,
    enabled: !!row.enabled,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
  res.json({ items });
});

router.post('/twitch/commands', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const command = normalizeCommandTrigger(req.body?.command);
  const response = typeof req.body?.response === 'string' ? req.body.response.trim() : '';
  const enabled = req.body?.enabled !== false;
  if (!command) return res.status(400).json({ error: 'invalid_command' });
  if (!response) return res.status(400).json({ error: 'invalid_response' });
  const existing = await db.get('SELECT id FROM twitch_commands WHERE user_id=? AND command=?', [req.user.uid, command]);
  if (existing) return res.status(409).json({ error: 'command_exists' });
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO twitch_commands(user_id, command, response, enabled, created_at, updated_at) VALUES(?,?,?,?,?,?)',
    [req.user.uid, command, response, enabled ? 1 : 0, now, now]
  );
  const row = await db.get('SELECT id, command, response, enabled, created_at, updated_at FROM twitch_commands WHERE id=last_insert_rowid()');
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({
    item: {
      id: row.id,
      command: row.command,
      response: row.response,
      enabled: !!row.enabled,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    },
  });
});

router.put('/twitch/commands/:id', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const row = await db.get('SELECT * FROM twitch_commands WHERE id=? AND user_id=?', [id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  const command = normalizeCommandTrigger(req.body?.command ?? row.command);
  const response = typeof req.body?.response === 'string' ? req.body.response.trim() : String(row.response || '');
  const enabled = req.body?.enabled == null ? !!row.enabled : !!req.body.enabled;
  if (!command) return res.status(400).json({ error: 'invalid_command' });
  if (!response) return res.status(400).json({ error: 'invalid_response' });
  const duplicate = await db.get(
    'SELECT id FROM twitch_commands WHERE user_id=? AND command=? AND id<>?',
    [req.user.uid, command, id]
  );
  if (duplicate) return res.status(409).json({ error: 'command_exists' });
  const now = new Date().toISOString();
  await db.run(
    'UPDATE twitch_commands SET command=?, response=?, enabled=?, updated_at=? WHERE id=? AND user_id=?',
    [command, response, enabled ? 1 : 0, now, id, req.user.uid]
  );
  const updated = await db.get(
    'SELECT id, command, response, enabled, created_at, updated_at FROM twitch_commands WHERE id=? AND user_id=?',
    [id, req.user.uid]
  );
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({
    item: {
      id: updated.id,
      command: updated.command,
      response: updated.response,
      enabled: !!updated.enabled,
      created_at: updated.created_at || null,
      updated_at: updated.updated_at || null,
    },
  });
});

router.delete('/twitch/commands/:id', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const row = await db.get('SELECT id FROM twitch_commands WHERE id=? AND user_id=?', [id, req.user.uid]);
  if (!row) return res.status(404).json({ error: 'not_found' });
  await db.run('DELETE FROM twitch_commands WHERE id=? AND user_id=?', [id, req.user.uid]);
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({ ok: true });
});

router.get('/twitch/timers', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const rows = await db.all(
    'SELECT id, message, online_interval_sec, offline_interval_sec, enabled, last_sent_at, created_at, updated_at FROM twitch_timers WHERE user_id=? ORDER BY id ASC',
    [req.user.uid]
  );
  const items = rows.map((row) => ({
    id: row.id,
    message: row.message,
    online_interval_sec: coerceNumber(row.online_interval_sec, 0),
    offline_interval_sec: coerceNumber(row.offline_interval_sec, 0),
    enabled: !!row.enabled,
    last_sent_at: row.last_sent_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
  res.json({ items });
});

router.post('/twitch/timers', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'invalid_message' });
  const onlineInterval = coerceNumber(req.body?.online_interval_sec, 0);
  const offlineInterval = coerceNumber(req.body?.offline_interval_sec, 0);
  const enabled = req.body?.enabled !== false;
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO twitch_timers(user_id, message, online_interval_sec, offline_interval_sec, enabled, created_at, updated_at) VALUES(?,?,?,?,?,?,?)',
    [req.user.uid, message, onlineInterval, offlineInterval, enabled ? 1 : 0, now, now]
  );
  const row = await db.get(
    'SELECT id, message, online_interval_sec, offline_interval_sec, enabled, last_sent_at, created_at, updated_at FROM twitch_timers WHERE id=last_insert_rowid()'
  );
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({
    item: {
      id: row.id,
      message: row.message,
      online_interval_sec: coerceNumber(row.online_interval_sec, 0),
      offline_interval_sec: coerceNumber(row.offline_interval_sec, 0),
      enabled: !!row.enabled,
      last_sent_at: row.last_sent_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    },
  });
});

router.put('/twitch/timers/:id', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const existing = await db.get('SELECT * FROM twitch_timers WHERE id=? AND user_id=?', [id, req.user.uid]);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const messageRaw = req.body?.message == null ? existing.message : String(req.body.message || '');
  const message = messageRaw.trim();
  if (!message) return res.status(400).json({ error: 'invalid_message' });
  const onlineInterval = coerceNumber(req.body?.online_interval_sec, existing.online_interval_sec || 0);
  const offlineInterval = coerceNumber(req.body?.offline_interval_sec, existing.offline_interval_sec || 0);
  const enabled = req.body?.enabled == null ? !!existing.enabled : !!req.body.enabled;
  const now = new Date().toISOString();
  await db.run(
    'UPDATE twitch_timers SET message=?, online_interval_sec=?, offline_interval_sec=?, enabled=?, updated_at=? WHERE id=? AND user_id=?',
    [message, onlineInterval, offlineInterval, enabled ? 1 : 0, now, id, req.user.uid]
  );
  const row = await db.get(
    'SELECT id, message, online_interval_sec, offline_interval_sec, enabled, last_sent_at, created_at, updated_at FROM twitch_timers WHERE id=? AND user_id=?',
    [id, req.user.uid]
  );
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({
    item: {
      id: row.id,
      message: row.message,
      online_interval_sec: coerceNumber(row.online_interval_sec, 0),
      offline_interval_sec: coerceNumber(row.offline_interval_sec, 0),
      enabled: !!row.enabled,
      last_sent_at: row.last_sent_at || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    },
  });
});

router.delete('/twitch/timers/:id', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
  const existing = await db.get('SELECT id FROM twitch_timers WHERE id=? AND user_id=?', [id, req.user.uid]);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  await db.run('DELETE FROM twitch_timers WHERE id=? AND user_id=?', [id, req.user.uid]);
  await twitchBot.refreshUser(req.user.uid).catch(() => {});
  res.json({ ok: true });
});

async function getTwitchAppToken() {
  const cid = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!cid || !secret) return null;
  const url = `https://id.twitch.tv/oauth2/token`;
  const r = await axios.post(url, null, { params: { client_id: cid, client_secret: secret, grant_type: 'client_credentials' } }).then(r => r.data).catch(()=>null);
  return r?.access_token || null;
}

function normalizeTwitchChannel(input) {
  if (!input) return null;
  let value = String(input).trim();
  if (!value) return null;
  const urlMatch = value.match(/twitch\.tv\/([^/?#]+)/i);
  if (urlMatch) {
    value = urlMatch[1];
  }
  if (value.startsWith('@')) {
    value = value.slice(1);
  }
  value = value.replace(/[^a-zA-Z0-9_]/g, '');
  return value ? value.toLowerCase() : null;
}

function coerceNumber(value, fallback = null) {
  if (value == null) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

function normalizeCommandTrigger(input) {
  if (!input) return null;
  let value = String(input).trim().toLowerCase();
  if (value.startsWith('!')) {
    value = value.slice(1);
  }
  value = value.replace(/[^a-z0-9_]/g, '');
  return value || null;
}

function normalizeTwitchToken(input) {
  if (!input) return null;
  let token = String(input).trim();
  if (!token) return null;
  token = token.replace(/^oauth:/i, '');
  return token ? `oauth:${token}` : null;
}

const MIN_TIMER_DELAY_SECONDS = 5;
const TIMER_STATUS_CACHE_MS = 60 * 1000;
const TIMER_IDLE_RECHECK_SECONDS = 300;

class TwitchBotManager {
  constructor() {
    this.states = new Map();
  }

  async bootstrap() {
    try {
      await ensureSocialSchema();
      const db = await getDB();
      const rows = await db.all(
        `SELECT user_id FROM social_settings WHERE twitch_channel IS NOT NULL AND TRIM(twitch_channel) <> ''`
      );
      for (const row of rows) {
        await this.refreshUser(row.user_id);
      }
    } catch {
      // ignore bootstrap errors
    }
  }

  async refreshUser(userId) {
    if (!userId) return;
    try {
      await ensureSocialSchema();
      const db = await getDB();
      const settings = await db.get(
        'SELECT twitch_channel, twitch_bot_username, twitch_bot_token FROM social_settings WHERE user_id=?',
        [userId]
      );
      const commands = await db.all(
        'SELECT id, command, response, enabled FROM twitch_commands WHERE user_id=? ORDER BY command ASC',
        [userId]
      );
      const timers = await db.all(
        'SELECT id, message, online_interval_sec, offline_interval_sec, enabled, last_sent_at FROM twitch_timers WHERE user_id=? ORDER BY id ASC',
        [userId]
      );
      await this.applyUser(userId, settings, commands, timers);
    } catch {
      // ignore refresh errors
    }
  }

  updateStatus(userId, live) {
    const state = this.states.get(userId);
    if (!state) return;
    const now = Date.now();
    const isLive = !!live;
    const prevLive = state.status.isLive;
    state.status = { isLive, lastCheck: now };
    if (prevLive !== isLive) {
      this.scheduleAllTimers(userId);
    }
  }

  async applyUser(userId, settings, commands, timers) {
    const channel = normalizeTwitchChannel(settings?.twitch_channel);
    const username = (settings?.twitch_bot_username || '').trim();
    const token = normalizeTwitchToken(settings?.twitch_bot_token || '');
    if (!channel || !username || !token) {
      this.disposeUser(userId);
      return;
    }

    const state = await this.ensureClient(userId, { channel, username, token });
    if (!state) return;

    state.commands = (commands || [])
      .filter((row) => row && row.response && normalizeCommandTrigger(row.command) && row.enabled)
      .map((row) => ({
        id: row.id,
        trigger: normalizeCommandTrigger(row.command),
        response: String(row.response || ''),
      }));

    state.timerDefs = (timers || []).map((row) => ({
      id: row.id,
      message: String(row?.message || '').trim(),
      online_interval_sec: coerceNumber(row?.online_interval_sec, 0),
      offline_interval_sec: coerceNumber(row?.offline_interval_sec, 0),
      enabled: !!row?.enabled,
      last_sent_at: row?.last_sent_at || null,
    }));

    this.scheduleAllTimers(userId);
  }

  async ensureClient(userId, settings) {
    const key = `${settings.username.toLowerCase()}@${settings.channel}`;
    let state = this.states.get(userId);
    const same = state && state.key === key && state.token === settings.token;
    if (!same) {
      if (state) {
        this.disposeUser(userId);
      }
      const client = new tmi.Client({
        identity: { username: settings.username, password: settings.token },
        channels: [`#${settings.channel}`],
        connection: { reconnect: true, secure: true },
        options: { skipMembership: true, skipUpdatingEmotesets: true },
      });
      state = {
        client,
        key,
        token: settings.token,
        channelName: settings.channel,
        channel: `#${settings.channel}`,
        username: settings.username,
        commands: [],
        timerDefs: [],
        timers: new Map(),
        broadcasterId: null,
        status: { isLive: false, lastCheck: 0 },
      };
      this.states.set(userId, state);
      client.on('message', (_target, _tags, message, self) => {
        if (self) return;
        this.handleMessage(userId, message);
      });
      client.on('connected', () => {
        state.status.lastCheck = 0;
        this.scheduleAllTimers(userId);
      });
      client.on('disconnected', () => {
        this.clearTimers(userId);
      });
      client.connect().catch(() => {});
    }
    return state;
  }

  disposeUser(userId) {
    const state = this.states.get(userId);
    if (!state) return;
    this.clearTimers(userId);
    try {
      state.client.removeAllListeners();
    } catch {
      // ignore
    }
    try {
      state.client.disconnect();
    } catch {
      // ignore
    }
    this.states.delete(userId);
  }

  handleMessage(userId, message) {
    const state = this.states.get(userId);
    if (!state || !message) return;
    const trimmed = String(message).trim();
    if (!trimmed.startsWith('!')) return;
    const trigger = normalizeCommandTrigger(trimmed.split(/\s+/)[0]);
    if (!trigger) return;
    const command = state.commands.find((cmd) => cmd.trigger === trigger);
    if (!command || !command.response) return;
    this.sendMessage(state, command.response);
  }

  async sendMessage(state, text) {
    if (!text) return;
    try {
      if (typeof state.client.readyState === 'function' && state.client.readyState() !== 'OPEN') {
        await state.client.connect();
      }
      await state.client.say(state.channel, text);
    } catch {
      // ignore send errors
    }
  }

  clearTimers(userId) {
    const state = this.states.get(userId);
    if (!state) return;
    for (const handle of state.timers.values()) {
      clearTimeout(handle);
    }
    state.timers.clear();
  }

  clearTimerHandle(userId, timerId) {
    const state = this.states.get(userId);
    if (!state || timerId == null) return;
    const handle = state.timers.get(timerId);
    if (handle) {
      clearTimeout(handle);
      state.timers.delete(timerId);
    }
  }

  scheduleAllTimers(userId) {
    const state = this.states.get(userId);
    if (!state) return;
    this.clearTimers(userId);
    for (const timer of state.timerDefs) {
      if (!timer?.enabled) continue;
      if (!timer.message || !timer.message.trim()) continue;
      this.planTimer(userId, timer);
    }
  }

  planTimer(userId, timer, options = {}) {
    const state = this.states.get(userId);
    if (!state) return;
    this.clearTimerHandle(userId, timer.id);
    const isLive = options.isLive ?? state.status.isLive;
    const intervalSec = this.resolveInterval(timer, isLive);
    const delaySec = options.forceDelaySec ?? this.computeNextDelaySec(timer, intervalSec);
    if (delaySec == null) return;
    const delayMs = Math.max(delaySec * 1000, MIN_TIMER_DELAY_SECONDS * 1000);
    const handle = setTimeout(() => this.executeTimer(userId, timer.id), delayMs);
    state.timers.set(timer.id, handle);
  }

  resolveInterval(timer, isLive) {
    const online = coerceNumber(timer.online_interval_sec, 0);
    const offline = coerceNumber(timer.offline_interval_sec, 0);
    return isLive ? online : offline;
  }

  computeNextDelaySec(timer, intervalSec) {
    if (!intervalSec || intervalSec <= 0) {
      return TIMER_IDLE_RECHECK_SECONDS;
    }
    if (!timer.last_sent_at) {
      return Math.max(intervalSec, MIN_TIMER_DELAY_SECONDS);
    }
    const last = Date.parse(timer.last_sent_at);
    if (Number.isNaN(last)) {
      return Math.max(intervalSec, MIN_TIMER_DELAY_SECONDS);
    }
    const elapsed = (Date.now() - last) / 1000;
    if (elapsed >= intervalSec) {
      return MIN_TIMER_DELAY_SECONDS;
    }
    return Math.max(intervalSec - elapsed, MIN_TIMER_DELAY_SECONDS);
  }

  async executeTimer(userId, timerId) {
    const state = this.states.get(userId);
    if (!state) return;
    const timer = state.timerDefs.find((entry) => entry.id === timerId);
    if (!timer || !timer.enabled || !timer.message?.trim()) {
      this.clearTimerHandle(userId, timerId);
      return;
    }
    this.clearTimerHandle(userId, timerId);
    const isLive = await this.ensureLiveStatus(userId, state);
    const intervalSec = this.resolveInterval(timer, isLive);
    if (intervalSec > 0) {
      await this.sendMessage(state, timer.message);
      const nowIso = new Date().toISOString();
      timer.last_sent_at = nowIso;
      try {
        const db = await getDB();
        await db.run('UPDATE twitch_timers SET last_sent_at=? WHERE id=?', [nowIso, timer.id]);
      } catch {
        // ignore db errors
      }
    }
    const nextDelay = intervalSec > 0 ? intervalSec : TIMER_IDLE_RECHECK_SECONDS;
    this.planTimer(userId, timer, { isLive, forceDelaySec: nextDelay });
  }

  async ensureLiveStatus(userId, explicitState) {
    const state = explicitState || this.states.get(userId);
    if (!state) return false;
    const now = Date.now();
    if (now - state.status.lastCheck < TIMER_STATUS_CACHE_MS) {
      return state.status.isLive;
    }
    const live = await this.fetchLiveStatus(state);
    state.status = { isLive: live, lastCheck: now };
    return live;
  }

  async fetchLiveStatus(state) {
    let isLive = null;
    if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
      try {
        const token = await getTwitchAppToken();
        if (token) {
          const headers = {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            Authorization: `Bearer ${token}`,
          };
          if (!state.broadcasterId) {
            const user = await axios
              .get('https://api.twitch.tv/helix/users', { params: { login: state.channelName }, headers })
              .then((r) => r.data?.data?.[0] || null)
              .catch(() => null);
            if (user?.id) {
              state.broadcasterId = user.id;
            }
          }
          if (state.broadcasterId) {
            const stream = await axios
              .get('https://api.twitch.tv/helix/streams', { params: { user_id: state.broadcasterId }, headers })
              .then((r) => r.data?.data?.[0] || null)
              .catch(() => null);
            if (stream) {
              isLive = true;
            } else {
              isLive = false;
            }
          }
        }
      } catch {
        // ignore helix errors
      }
    }
    if (isLive == null) {
      try {
        const fallback = await fallbackTwitchStream(state.channelName);
        isLive = !!fallback?.live;
      } catch {
        isLive = false;
      }
    }
    return !!isLive;
  }
}

const twitchBot = new TwitchBotManager();
twitchBot.bootstrap().catch(() => {});

async function twitchPoll(userId, settings) {
  const channelRaw = String(settings.twitch_channel || '').trim();
  const channelLower = normalizeTwitchChannel(channelRaw);
  if (!channelLower) return null;
  let channelLabel = channelRaw || channelLower;
  if (/twitch\.tv/i.test(channelLabel)) {
    channelLabel = channelLower;
  }
  let channelDisplay = channelLabel;
  const channel = channelLower;

  const previouslyLive = !!settings?.last_stream_live;
  let lastStreamTitle = settings?.last_stream_title || null;
  let lastStreamGame = settings?.last_stream_game || null;
  let lastStreamStartedAt = settings?.last_stream_started_at || null;
  let lastStreamUpdatedAt = settings?.last_stream_updated_at || null;

  const db = await getDB();
  const latestMetric = await db.get(
    "SELECT followers, avg_viewers, active_chatters, top_chatter FROM social_metrics WHERE user_id=? AND platform='twitch' ORDER BY id DESC LIMIT 1",
    [userId]
  );

  let headers = null;
  let user = null;
  let broadcasterId = null;

  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    const token = await getTwitchAppToken();
    if (token) {
      headers = {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`
      };
      user = await axios
        .get('https://api.twitch.tv/helix/users', { params: { login: channelLower }, headers })
        .then((r) => r.data?.data?.[0])
        .catch(() => null);
      broadcasterId = user?.id || null;
      if (user?.display_name) {
        channelDisplay = user.display_name;
      }
    }
  }

  let followers = null;
  if (headers && broadcasterId) {
    followers = await axios
      .get('https://api.twitch.tv/helix/users/follows', { params: { to_id: broadcasterId }, headers })
      .then((r) => (typeof r.data?.total === 'number' ? r.data.total : null))
      .catch(() => null);
  }
  if (followers == null) {
    followers = parseDecapiNumber(await fetchDecapi(`followers/${channelLower}`));
  }
  followers = coerceNumber(followers, latestMetric?.followers ?? 0);

  let streamInfo = null;
  if (headers && broadcasterId) {
    const stream = await axios
      .get('https://api.twitch.tv/helix/streams', { params: { user_id: broadcasterId }, headers })
      .then((r) => r.data?.data?.[0] || null)
      .catch(() => null);
    if (stream) {
      streamInfo = {
        live: true,
        viewers: typeof stream.viewer_count === 'number' ? stream.viewer_count : null,
        title: stream.title || null,
        game: stream.game_name || null,
        started_at: stream.started_at || null
      };
    }
  }
  if (!streamInfo) {
    streamInfo = await fallbackTwitchStream(channelLower);
  }

  const isLive = !!streamInfo?.live;
  if (isLive) {
    if (streamInfo?.title) {
      lastStreamTitle = streamInfo.title;
    }
    if (streamInfo?.game) {
      lastStreamGame = streamInfo.game;
    }
    if (streamInfo?.started_at) {
      lastStreamStartedAt = streamInfo.started_at;
    } else if (!previouslyLive) {
      lastStreamStartedAt = new Date().toISOString();
    }
  }
  const fallbackViewers = streamInfo && streamInfo.live ? 0 : (latestMetric?.avg_viewers ?? 0);
  const viewers = coerceNumber(streamInfo?.viewers, fallbackViewers);

  let activeChatters = null;
  let topChatter = null;
  try {
    const chatData = await axios
      .get(`https://tmi.twitch.tv/group/user/${channelLower}/chatters`)
      .then((r) => r.data)
      .catch(() => null);
    if (chatData) {
      activeChatters = coerceNumber(chatData.chatter_count, null);
      const groups = chatData.chatters || {};
      const unique = Array.from(
        new Set(
          Object.values(groups)
            .flat()
            .filter(Boolean)
            .map((name) => String(name).toLowerCase())
            .filter((name) => name && name !== channelLower)
        )
      );
      if (unique.length) {
        const nowIso = new Date().toISOString();
        await Promise.all(
          unique.map((name) =>
            db.run(
              `INSERT INTO social_chatters(user_id, platform, chatter, hits, last_seen) VALUES(?,?,?,?,?) ON CONFLICT(user_id, platform, chatter) DO UPDATE SET hits = social_chatters.hits + 1, last_seen = excluded.last_seen`,
              [userId, 'twitch', name, 1, nowIso]
            )
          )
        );
      }
      const topRow = await db.get(
        'SELECT chatter FROM social_chatters WHERE user_id=? AND platform=? ORDER BY hits DESC, last_seen DESC LIMIT 1',
        [userId, 'twitch']
      );
      topChatter = topRow?.chatter || null;
    }
  } catch {
    // ignore chatters fetch errors
  }

  activeChatters = coerceNumber(activeChatters, latestMetric?.active_chatters ?? 0);
  if (!topChatter && latestMetric?.top_chatter) {
    topChatter = latestMetric.top_chatter;
  }

  if (isLive && !previouslyLive && settings.tg_bot_token && settings.tg_chat_id) {
    const text = (settings.tg_stream_template || '🔴 Стрим: {stream_title}\nhttps://twitch.tv/{channel}')
      .replace('{stream_title}', streamInfo?.title || 'Стрим')
      .replace('{channel}', channel)
      .replace('{channel_name}', channelDisplay)
      .replace('{game}', streamInfo?.game || '')
      .replace('{viewers}', String(viewers));
    await sendTelegram(settings.tg_bot_token, settings.tg_chat_id, text).catch(() => {});
    const today = new Date().toISOString().slice(0, 10);
    await db.run(`INSERT INTO social_logs(user_id,type,title,url,event_date,created_at) VALUES(?,?,?,?,?,?)`, [
      userId,
      'stream_live',
      streamInfo?.title || 'Стрим',
      `https://twitch.tv/${channel}`,
      today,
      new Date().toISOString()
    ]);
    await db.run(`INSERT INTO life_feed(user_id,type,text,meta,ts) VALUES(?,?,?,?,?)`, [
      userId,
      'stream',
      `Начал стрим: ${streamInfo?.title || ''}`,
      JSON.stringify({ channel, display: channelDisplay }),
      new Date().toISOString()
    ]);
  }
  const statusUpdatedAt = new Date().toISOString();
  lastStreamUpdatedAt = statusUpdatedAt;
  await db.run(
    'UPDATE social_settings SET last_stream_live=?, last_stream_title=?, last_stream_game=?, last_stream_started_at=?, last_stream_updated_at=? WHERE user_id=?',
    [isLive ? 1 : 0, lastStreamTitle, lastStreamGame, lastStreamStartedAt, statusUpdatedAt, userId]
  );
  twitchBot.updateStatus(userId, isLive);

  await db.run(
    `INSERT INTO social_metrics(user_id, platform, followers, subscribers, avg_viewers, active_chatters, top_chatter, snapshot_at)` +
      ' VALUES(?,?,?,?,?,?,?,?)',
    [userId, 'twitch', followers, null, viewers, activeChatters, topChatter, new Date().toISOString()]
  );

  return {
    live: isLive,
    viewers,
    followers,
    activeChatters,
    topChatter,
    channel,
    displayName: channelDisplay,
    lastStreamTitle,
    lastStreamGame,
    lastStreamStartedAt,
    lastStreamUpdatedAt
  };
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
  await ensureSocialSchema();
  const db = await getDB();
  const s = await db.get('SELECT * FROM social_settings WHERE user_id=?', [req.user.uid]);
  if (!s) return res.status(400).json({ error: 'no_settings' });
  const tw = await twitchPoll(req.user.uid, s).catch((e)=>({ error: 'twitch_failed', details: String(e) }));
  const yt = await youtubePoll(req.user.uid, s).catch((e)=>({ error: 'youtube_failed', details: String(e) }));
  res.json({ ok:true, twitch: tw, youtube: yt });
});

router.get('/metrics', async (req, res) => {
  await ensureSocialSchema();
  const db = await getDB();
  const rows = await db.all('SELECT * FROM social_metrics WHERE user_id=? ORDER BY id DESC LIMIT 200', [req.user.uid]);

  const latestByPlatform = {};
  for (const row of rows) {
    if (!latestByPlatform[row.platform]) {
      latestByPlatform[row.platform] = row;
    }
  }

  const summary = {};
  const twitchSettings = await db.get(
    'SELECT twitch_channel, last_stream_title, last_stream_game, last_stream_started_at, last_stream_live, last_stream_updated_at FROM social_settings WHERE user_id=?',
    [req.user.uid]
  );
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
  if (twitchSettings) {
    summary.twitch = {
      ...(summary.twitch || {}),
      lastStreamTitle: twitchSettings.last_stream_title || null,
      lastStreamGame: twitchSettings.last_stream_game || null,
      lastStreamAt: twitchSettings.last_stream_started_at || null,
      lastStreamUpdatedAt: twitchSettings.last_stream_updated_at || null,
      live: !!twitchSettings.last_stream_live,
      channel: twitchSettings.twitch_channel || null
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
