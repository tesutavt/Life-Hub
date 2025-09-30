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
    const refreshToken = token.refresh_token;
    if (!refreshToken) {
      console.warn('Google Fit callback: refresh_token not returned by Google.');
    } else {
      const db = await getDB();
      await db.run('UPDATE users SET google_refresh_token=? WHERE id=?', [refreshToken, uid]);
    }
    res.send('Google Fit подключен. Можно закрывать вкладку.');
  } catch (e) {
    console.error('gf exchange', e.response?.data || e.message);
    res.status(500).json({ error: 'token_exchange_failed' });
  }
});

async function getAccessToken(refresh_token) {
  const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token,
    grant_type: 'refresh_token'
  });

  const access_token = tokenResponse.data.access_token;

  try {
    const tokenInfo = await axios.get('https://www.googleapis.com/oauth2/v3/tokeninfo', {
      params: { access_token }
    });
    const scopes = (tokenInfo.data.scope || '')
      .split(' ')
      .filter(Boolean)
      .sort();
    console.log('Google Fit access token scopes:', scopes);
  } catch (infoError) {
    console.warn('Google Fit tokeninfo failed:', infoError.response?.status, infoError.response?.statusText, infoError.response?.data || infoError.message);
  }

  return access_token;
}

function pickDataSource(sources, dataType, preferences = []) {
  const matches = sources.filter((ds) => ds?.dataType?.name === dataType);
  if (!matches.length) return null;

  for (const preferred of preferences) {
    const byPreference = matches.find((ds) => ds.dataStreamId?.includes(preferred));
    if (byPreference) return byPreference;
  }

  return matches[0];
}

function logAxiosError(label, error) {
  if (!error) return;
  const status = error.response?.status;
  const statusText = error.response?.statusText;
  const message = error.response?.data?.error?.message || error.message;
  console.error(`${label} error:`, status, statusText, message);
  if (error.response?.data?.error?.message) {
    console.error(`${label} details:`, error.response.data.error.message);
  }
}

protectedRouter.get('/metrics', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const day   = req.query.day || new Date().toISOString().slice(0, 10);
    const dayDate = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(dayDate.getTime())) {
      return res.status(400).json({ error: 'invalid_day' });
    }

    const endTimeMillis = Date.now();
    const startTimeMillis = endTimeMillis - 24 * 60 * 60 * 1000;
    const db = await getDB();
    const u = await db.get('SELECT google_refresh_token FROM users WHERE id=?', [req.user.uid]);
    if (!u?.google_refresh_token) {
      return res.json({ steps: 0, hr: 0, sleepH: 0, activeCalories: 0, source: 'local' });
    }
    const AT = await getAccessToken(u.google_refresh_token);
    const headers = { Authorization: `Bearer ${AT}` };

    let dataSources = [];
    try {
      const dataSourcesResponse = await axios.get('https://www.googleapis.com/fitness/v1/users/me/dataSources', { headers });
      dataSources = dataSourcesResponse.data?.dataSource || [];
    } catch (error) {
      logAxiosError('Google Fit dataSources', error);
      throw error;
    }

    console.log('Google Fit data sources available:', dataSources.map((ds) => ({
      id: ds.dataStreamId,
      dataType: ds.dataType?.name,
      app: ds.application?.packageName || ds.dataStreamName || ds.dataStreamId
    })));

    const stepsSource = pickDataSource(dataSources, 'com.google.step_count.delta', [
      'merge_step_deltas',
      'estimated_steps'
    ]);
    const hrSource = pickDataSource(dataSources, 'com.google.heart_rate.bpm', [
      'merge_heart_rate_bpm'
    ]);
    const sleepSource = pickDataSource(dataSources, 'com.google.sleep.segment', [
      'merge_sleep_segments'
    ]);
    const caloriesSource = pickDataSource(dataSources, 'com.google.active_energy.burned', [
      'merge_active_energy_burned'
    ]);

    const base = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate';
    const agg = async (label, dataSource) => {
      if (!dataSource?.dataStreamId) {
        console.warn(`Google Fit: no data source found for ${label}`);
        return null;
      }

      try {
        const response = await axios.post(base, {
          aggregateBy: [{ dataSourceId: dataSource.dataStreamId }],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis,
          endTimeMillis
        }, { headers });
        return response.data;
      } catch (error) {
        logAxiosError(`Google Fit aggregate ${label}`, error);
        throw error;
      }
    };

    const stepsAgg = stepsSource ? await agg('steps', stepsSource) : null;
    const steps = stepsAgg
      ? (stepsAgg.bucket?.[0]?.dataset?.[0]?.point || []).reduce((s, p) => s + (p.value?.[0]?.intVal || 0), 0)
      : 0;

    const hrAgg = hrSource ? await agg('heart_rate', hrSource) : null;
    const hrs = hrAgg?.bucket?.[0]?.dataset?.[0]?.point || [];
    const hr = hrs.length ? Math.round(hrs.reduce((a, p) => a + (p.value?.[0]?.fpVal || 0), 0) / hrs.length) : 0;

    const sleepAgg = sleepSource ? await agg('sleep', sleepSource) : null;
    const ms = (sleepAgg?.bucket?.[0]?.dataset?.[0]?.point || [])
      .map((p) => (p.endTimeNanos - p.startTimeNanos) / 1e6)
      .reduce((a, b) => a + b, 0);
    const sleepH = +(ms / 3600000).toFixed(1);
    const caloriesAgg = caloriesSource ? await agg('active_calories', caloriesSource) : null;
    const caloriesPoints = caloriesAgg?.bucket?.[0]?.dataset?.[0]?.point || [];
    const activeCalories = +caloriesPoints
      .reduce((total, point) => total + (point.value?.[0]?.fpVal || 0), 0)
      .toFixed(1);

    await db.run(
      'INSERT OR REPLACE INTO fitness_daily(user_id,date,steps,hr_rest,sleep_hours,active_calories) VALUES(?,?,?,?,?,?)',
      [req.user.uid, day, steps, hr || null, sleepH || null, activeCalories || null]
    );

    res.json({ steps, hr, sleepH, activeCalories, source: 'googlefit' });
  } catch (e) {
    logAxiosError('Google Fit metrics', e);
    res.status(500).json({ error: 'metrics_failed' });
  }
});

export default { public: publicRouter, protected: protectedRouter };
