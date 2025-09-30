import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { getDB } from './utils.js';

const CLIENT_ID     = process.env.GF_CLIENT_ID     || '750363365159-qlt6h7hsa5h3k0fqt459k52r4ehgfl8v.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GF_CLIENT_SECRET || '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';
const REDIRECT      = process.env.GF_REDIRECT      || 'http://localhost:4000/api/fitness/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read'
].join(' ');

const publicRouter = express.Router();
const protectedRouter = express.Router();

publicRouter.get('/google/auth', (req, res) => {
  const token = req.query.token || '';
  let uid = '';
  try { uid = jwt.decode(token)?.uid || ''; } catch {}
  if (!uid) return res.status(400).json({ error: 'no_uid' });
  const url = 'https://accounts.google.com/o/oauth2/v2/auth'
    + `?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}`
    + `&redirect_uri=${encodeURIComponent(REDIRECT)}`
    + `&scope=${encodeURIComponent(SCOPES)}`
    + `&access_type=offline&prompt=consent`
    + `&state=${encodeURIComponent(uid)}`;
  res.redirect(url);
});

publicRouter.get('/google/callback', async (req, res) => {
  const { code, state: uid } = req.query;
  try {
    const token = await axios.post('https://oauth2.googleapis.com/token', {
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: 'authorization_code'
    }).then(r => r.data);
    const db = await getDB();
    await db.run('UPDATE users SET google_refresh_token=? WHERE id=?', [token.refresh_token, uid]);
    res.send('Google Fit подключен. Можно закрывать вкладку.');
  } catch (e) {
    console.error('gf exchange', e.response?.data || e.message);
    res.status(500).json({ error: 'token_exchange_failed' });
  }
});

async function getAccessToken(refresh_token) {
  const r = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token, grant_type: 'refresh_token'
  });
  return r.data.access_token;
}

protectedRouter.get('/metrics', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const day   = req.query.day || new Date().toISOString().slice(0, 10);
    const dayDate = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(dayDate.getTime())) {
      return res.status(400).json({ error: 'invalid_day' });
    }
    const start = dayDate.getTime();
    const endOfDay = start + 86400000;
    const now = Date.now();
    const end = Math.min(endOfDay, now);
    if (end <= start) {
      return res.json({ steps: 0, hr: 0, sleepH: 0, activeCalories: 0, source: 'googlefit' });
    }
    const db = await getDB();
    const u = await db.get('SELECT google_refresh_token FROM users WHERE id=?', [req.user.uid]);
    if (!u?.google_refresh_token) {
      return res.json({ steps: 0, hr: 0, sleepH: 0, activeCalories: 0, source: 'local' });
    }
    const AT = await getAccessToken(u.google_refresh_token);
    const headers = { Authorization: `Bearer ${AT}` };
    const base = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
    const agg = async (ds) => axios.post(base, {
      aggregateBy: [{ dataSourceId: ds }],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis: start, endTimeMillis: end
    }, { headers }).then(r => r.data);

    const DS_STEPS    = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';
    const DS_HR       = 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm';
    const DS_SLEEP    = 'derived:com.google.sleep.segment:com.google.android.gms:merge_sleep_segments';
    const DS_CALORIES = 'derived:com.google.active_energy.burned:com.google.android.gms:merge_active_energy_burned';

    const stepsAgg = await agg(DS_STEPS);
    const steps = (stepsAgg.bucket?.[0]?.dataset?.[0]?.point || []).reduce((s,p)=> s + (p.value?.[0]?.intVal || 0), 0);

    const hrAgg = await agg(DS_HR);
    const hrs = (hrAgg.bucket?.[0]?.dataset?.[0]?.point || []);
    const hr = hrs.length ? Math.round(hrs.reduce((a,p)=>a+(p.value?.[0]?.fpVal||0),0)/hrs.length) : 0;

    const sleepAgg = await agg(DS_SLEEP);
    const ms = (sleepAgg.bucket?.[0]?.dataset?.[0]?.point || [])
      .map(p => (p.endTimeNanos - p.startTimeNanos) / 1e6)
      .reduce((a, b) => a + b, 0);
    const sleepH = +(ms / 3600000).toFixed(1);

    const caloriesAgg = await agg(DS_CALORIES);
    const caloriesPoints = caloriesAgg.bucket?.[0]?.dataset?.[0]?.point || [];
    const activeCalories = +caloriesPoints
      .reduce((total, point) => total + (point.value?.[0]?.fpVal || 0), 0)
      .toFixed(1);

    await db.run(
      'INSERT OR REPLACE INTO fitness_daily(user_id,date,steps,hr_rest,sleep_hours,active_calories) VALUES(?,?,?,?,?,?)',
      [req.user.uid, day, steps, hr || null, sleepH || null, activeCalories || null]
    );

    res.json({ steps, hr, sleepH, activeCalories, source: 'googlefit' });
  } catch (e) {
    console.error('metrics', e);
    res.status(500).json({ error: 'metrics_failed' });
  }
});

export default { public: publicRouter, protected: protectedRouter };
