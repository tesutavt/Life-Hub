import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { getDB } from '../../utils.js';

const CLIENT_ID =
  process.env.GF_CLIENT_ID ||
  '750363365159-qlt6h7hsa5h3k0fqt459k52r4ehgfl8v.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.GF_CLIENT_SECRET || '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';
const REDIRECT = process.env.GF_REDIRECT || 'http://localhost:4000/api/fitness/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.blood_pressure.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
  'https://www.googleapis.com/auth/fitness.location.read'
].join(' ');

const DAY_MS = 86400000;
const DEFAULT_RANGE_DAYS = 7;
const MAX_RANGE_DAYS = 90;
const REFRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const CURRENT_DAY_REFRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes for same-day data

const SLEEP_STAGE = {
  1: 'awake',
  2: 'sleep',
  3: 'out',
  4: 'light',
  5: 'deep',
  6: 'rem'
};

const NANOS_IN_MILLI = 1000000n;

const publicRouter = express.Router();
const protectedRouter = express.Router();

publicRouter.get('/google/auth', (req, res) => {
  const token = req.query.token || '';
  let uid = '';
  try {
    uid = jwt.decode(token)?.uid || '';
  } catch {
    uid = '';
  }
  if (!uid) return res.status(400).json({ error: 'no_uid' });
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?response_type=code&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent` +
    `&state=${encodeURIComponent(uid)}`;
  res.redirect(url);
});

publicRouter.get('/google/callback', async (req, res) => {
  const { code, state: uid } = req.query;
  try {
    const token = await axios
      .post('https://oauth2.googleapis.com/token', {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code'
      })
      .then((r) => r.data);
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
    console.warn(
      'Google Fit tokeninfo failed:',
      infoError.response?.status,
      infoError.response?.statusText,
      infoError.response?.data || infoError.message
    );
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

const toDateISO = (date) => date.toISOString().slice(0, 10);
const startOfUtcDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const addDaysUtc = (date, amount) => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
};

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

function clampRangeDays(startDate, endDate) {
  if (startDate.getTime() > endDate.getTime()) {
    return clampRangeDays(endDate, startDate);
  }
  const diffDays = Math.floor((endDate.getTime() - startDate.getTime()) / DAY_MS) + 1;
  if (diffDays > MAX_RANGE_DAYS) {
    const clampedStart = addDaysUtc(endDate, -(MAX_RANGE_DAYS - 1));
    return { start: clampedStart, end: endDate };
  }
  return { start: startDate, end: endDate };
}

function parseRangeParams(query) {
  const now = startOfUtcDay(new Date());
  let endDate = parseDateOnly(query?.end) || now;
  let startDate = parseDateOnly(query?.start);
  if (!startDate) {
    startDate = addDaysUtc(endDate, -(DEFAULT_RANGE_DAYS - 1));
  }
  if (startDate.getTime() > endDate.getTime()) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }
  const { start, end } = clampRangeDays(startDate, endDate);
  return {
    start,
    end,
    startIso: toDateISO(start),
    endIso: toDateISO(end)
  };
}

function buildDateList(startIso, endIso) {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (!start || !end) return [];
  const dates = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toDateISO(cursor));
    cursor = addDaysUtc(cursor, 1);
  }
  return dates;
}

async function aggregateBuckets(headers, dataTypeName, dataSource, startTimeMillis, endTimeMillis, label) {
  const aggregateBy = [];
  if (dataSource?.dataStreamId) {
    aggregateBy.push({ dataSourceId: dataSource.dataStreamId });
  } else if (dataTypeName) {
    aggregateBy.push({ dataTypeName });
  }
  if (!aggregateBy.length) return [];
  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy,
        bucketByTime: { durationMillis: DAY_MS },
        startTimeMillis,
        endTimeMillis
      },
      { headers }
    );
    return response.data?.bucket || [];
  } catch (error) {
    logAxiosError(`Google Fit aggregate ${label}`, error);
    return [];
  }
}

function ensureActivityEntry(map, date) {
  if (!map.has(date)) {
    map.set(date, {
      steps: 0,
      calories: 0,
      distance: 0,
      moveMinutes: 0,
      activeMinutes: 0
    });
  }
  return map.get(date);
}

function ensureHeartEntry(map, date) {
  if (!map.has(date)) {
    map.set(date, { sum: 0, samples: 0, min: null, max: null });
  }
  return map.get(date);
}

function ensureSleepEntry(map, date) {
  if (!map.has(date)) {
    map.set(date, {
      duration: 0,
      deep: 0,
      light: 0,
      rem: 0,
      awake: 0,
      sessions: 0
    });
  }
  return map.get(date);
}

function toBigIntValue(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && 'intVal' in value) {
    return toBigIntValue(value.intVal);
  }
  return null;
}

function pointTimeNanos(point, nanosKey, millisKey) {
  if (!point) return null;
  const nanos = toBigIntValue(point[nanosKey]);
  if (nanos !== null) return nanos;
  const millis = toBigIntValue(point[millisKey]);
  if (millis !== null) return millis * NANOS_IN_MILLI;
  return null;
}

function pointDurationMinutes(point) {
  const start = pointTimeNanos(point, 'startTimeNanos', 'startTimeMillis');
  const end = pointTimeNanos(point, 'endTimeNanos', 'endTimeMillis');
  if (start === null || end === null) return 0;
  const diff = end - start;
  if (diff <= 0) return 0;
  const minutes = Number(diff) / 1e9 / 60;
  return Number.isFinite(minutes) ? minutes : 0;
}

function nanosToIsoDate(nanos) {
  if (nanos === null) return null;
  const millis = Number(nanos / NANOS_IN_MILLI);
  if (!Number.isFinite(millis)) return null;
  return toDateISO(new Date(millis));
}

function millisToNanosString(millis) {
  if (!Number.isFinite(millis)) return '';
  try {
    return (BigInt(Math.trunc(millis)) * NANOS_IN_MILLI).toString();
  } catch {
    return '';
  }
}

function extractSleepStageValue(point) {
  const values = Array.isArray(point?.value) ? point.value : [];
  if (!values.length) return null;
  const entry = values[0];
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.intVal === 'number') return entry.intVal;
  if (typeof entry.fpVal === 'number') return Math.round(entry.fpVal);
  if (entry.value && typeof entry.value === 'object' && typeof entry.value.intVal === 'number') {
    return entry.value.intVal;
  }
  const mapVals = Array.isArray(entry.mapVal) ? entry.mapVal : [];
  for (const mapEntry of mapVals) {
    if (mapEntry && typeof mapEntry === 'object') {
      const valObj = mapEntry.value;
      if (valObj && typeof valObj.intVal === 'number') {
        return valObj.intVal;
      }
      if (typeof mapEntry.intVal === 'number') {
        return mapEntry.intVal;
      }
    }
  }
  return null;
}

function sessionTimeMillis(entry, millisKey, nanosKey) {
  if (!entry) return null;
  const millisValue = toBigIntValue(entry[millisKey]);
  if (millisValue !== null) {
    const millis = Number(millisValue);
    return Number.isFinite(millis) ? millis : null;
  }
  const nanosValue = toBigIntValue(entry[nanosKey]);
  if (nanosValue !== null) {
    const millis = Number(nanosValue / NANOS_IN_MILLI);
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

async function fetchSleepSessions(headers, startTimeMillis, endTimeMillis) {
  const sessions = [];
  const url = 'https://www.googleapis.com/fitness/v1/users/me/sessions';
  const adjustedStart = Math.max(0, startTimeMillis - DAY_MS);
  const startIso = new Date(adjustedStart).toISOString();
  const adjustedEnd = endTimeMillis + DAY_MS;
  const endIso = new Date(adjustedEnd).toISOString();
  let pageToken = null;
  try {
    do {
      const params = {
        startTime: startIso,
        endTime: endIso,
        activityType: 72
      };
      if (pageToken) params.pageToken = pageToken;
      const response = await axios.get(url, { headers, params });
      const list = Array.isArray(response.data?.session) ? response.data.session : [];
      sessions.push(...list);
      pageToken = response.data?.nextPageToken || null;
    } while (pageToken);
  } catch (error) {
    logAxiosError('Google Fit sleep sessions', error);
  }
  return sessions;
}

async function fetchSleepSegmentsForSession(headers, dataSource, sessionStartMillis, sessionEndMillis) {
  if (!Number.isFinite(sessionStartMillis) || !Number.isFinite(sessionEndMillis)) return [];
  if (sessionEndMillis <= sessionStartMillis) return [];
  const aggregateBy = [];
  if (dataSource?.dataStreamId) {
    aggregateBy.push({ dataSourceId: dataSource.dataStreamId });
  } else {
    aggregateBy.push({ dataTypeName: 'com.google.sleep.segment' });
  }
  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy,
        startTimeMillis: sessionStartMillis,
        endTimeMillis: sessionEndMillis
      },
      { headers }
    );
    const buckets = Array.isArray(response.data?.bucket) ? response.data.bucket : [];
    const points = [];
    for (const bucket of buckets) {
      const datasets = Array.isArray(bucket?.dataset) ? bucket.dataset : [];
      for (const dataset of datasets) {
        const datasetPoints = Array.isArray(dataset?.point) ? dataset.point : [];
        points.push(...datasetPoints);
      }
    }
    return points;
  } catch (error) {
    logAxiosError('Google Fit sleep segments', error);
    return [];
  }
}

async function collectSleepDataFromSessions(
  headers,
  dataSource,
  startTimeMillis,
  endTimeMillis,
  startIso,
  endIso
) {
  const sleepMap = new Map();
  const sessions = await fetchSleepSessions(headers, startTimeMillis, endTimeMillis);
  for (const session of sessions) {
    const sessionStart = sessionTimeMillis(session, 'startTimeMillis', 'startTimeNanos');
    const sessionEnd = sessionTimeMillis(session, 'endTimeMillis', 'endTimeNanos');
    if (sessionStart === null || sessionEnd === null) continue;
    if (sessionEnd <= sessionStart) continue;
    if (sessionEnd < startTimeMillis || sessionStart >= endTimeMillis + DAY_MS) continue;
    const dateIso = toDateISO(new Date(sessionEnd));
    if (!dateIso) continue;
    if (startIso && dateIso < startIso) continue;
    if (endIso && dateIso > endIso) continue;
    const points = await fetchSleepSegmentsForSession(headers, dataSource, sessionStart, sessionEnd);
    if (!points.length) continue;
    const entry = ensureSleepEntry(sleepMap, dateIso);
    entry.sessions += 1;
    for (const point of points) {
      const stageValue = extractSleepStageValue(point);
      const stage = stageValue !== null ? SLEEP_STAGE[stageValue] || 'unknown' : 'unknown';
      const durationMinutes = pointDurationMinutes(point);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
      entry.duration += durationMinutes;
      if (stage === 'deep') entry.deep += durationMinutes;
      else if (stage === 'light' || stage === 'sleep') entry.light += durationMinutes;
      else if (stage === 'rem') entry.rem += durationMinutes;
      else entry.awake += durationMinutes;
    }
  }
  return sleepMap;
}

async function collectSleepData(headers, sleepSource, startTimeMillis, endTimeMillis, startIso, endIso) {
  const sessionMap = await collectSleepDataFromSessions(
    headers,
    sleepSource,
    startTimeMillis,
    endTimeMillis,
    startIso,
    endIso
  );
  if (sessionMap.size) {
    return sessionMap;
  }

  let buckets = await aggregateBuckets(
    headers,
    'com.google.sleep.segment',
    sleepSource,
    startTimeMillis,
    endTimeMillis,
    'sleep'
  );

  if (!buckets.length) {
    buckets = await fetchSleepBucketsFromDataset(headers, sleepSource, startTimeMillis, endTimeMillis);
  }

  const fallbackMap = new Map();
  for (const bucket of buckets) {
    const date = bucketStartIso(bucket);
    if (!date) continue;
    const points = bucket?.dataset?.[0]?.point || [];
    if (!points.length) continue;
    const entry = ensureSleepEntry(fallbackMap, date);
    for (const point of points) {
      const stageValue = extractSleepStageValue(point);
      const stage = stageValue !== null ? SLEEP_STAGE[stageValue] || 'unknown' : 'unknown';
      const durationMinutes = pointDurationMinutes(point);
      if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) continue;
      entry.duration += durationMinutes;
      if (stage === 'deep') entry.deep += durationMinutes;
      else if (stage === 'light' || stage === 'sleep') entry.light += durationMinutes;
      else if (stage === 'rem') entry.rem += durationMinutes;
      else entry.awake += durationMinutes;
    }
    if (entry.duration > 0) {
      entry.sessions = Math.max(1, entry.sessions || 0);
    }
  }

  return fallbackMap;
}

async function fetchSleepBucketsFromDataset(headers, dataSource, startTimeMillis, endTimeMillis) {
  const dataSourceId = dataSource?.dataStreamId || 'derived:com.google.android.gms:merge_sleep_segments';
  if (!dataSourceId) return [];
  const datasetStart = millisToNanosString(startTimeMillis);
  const datasetEnd = millisToNanosString(endTimeMillis);
  if (!datasetStart || !datasetEnd) return [];
  const datasetId = `${datasetStart}-${datasetEnd}`;
  const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(
    dataSourceId
  )}/datasets/${datasetId}`;
  try {
    const response = await axios.get(url, { headers });
    const points = Array.isArray(response.data?.point) ? response.data.point : [];
    const bucketMap = new Map();
    for (const point of points) {
      const startNanos = pointTimeNanos(point, 'startTimeNanos', 'startTimeMillis');
      if (startNanos === null) continue;
      const dateIso = nanosToIsoDate(startNanos);
      if (!dateIso) continue;
      if (!bucketMap.has(dateIso)) {
        const startMillis = Number(startNanos / NANOS_IN_MILLI);
        bucketMap.set(dateIso, {
          startTimeMillis: Number.isFinite(startMillis) ? startMillis : undefined,
          startTimeNanos: startNanos.toString(),
          dataset: [{ point: [] }]
        });
      }
      const bucket = bucketMap.get(dateIso);
      bucket.dataset[0].point.push(point);
    }
    return Array.from(bucketMap.values());
  } catch (error) {
    logAxiosError('Google Fit sleep dataset', error);
    return [];
  }
}

function bucketStartIso(bucket) {
  if (!bucket) return null;
  if (bucket.startTimeMillis) {
    const ms = Number(bucket.startTimeMillis);
    if (!Number.isNaN(ms)) {
      return toDateISO(new Date(ms));
    }
  }
  if (bucket.startTimeNanos) {
    const ms = Number(bucket.startTimeNanos) / 1e6;
    if (!Number.isNaN(ms)) {
      return toDateISO(new Date(ms));
    }
  }
  return null;
}

async function syncGoogleFitDataForUser(db, userId, refreshToken, startIso, endIso) {
  if (!refreshToken) return;
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (!start || !end) return;
  const startTimeMillis = start.getTime();
  const endTimeMillis = addDaysUtc(end, 1).getTime();
  try {
    const accessToken = await getAccessToken(refreshToken);
    const headers = { Authorization: `Bearer ${accessToken}` };

    let dataSources = [];
    try {
      const dataSourcesResponse = await axios.get(
        'https://www.googleapis.com/fitness/v1/users/me/dataSources',
        { headers }
      );
      dataSources = dataSourcesResponse.data?.dataSource || [];
    } catch (error) {
      logAxiosError('Google Fit dataSources', error);
    }

    const stepsSource = pickDataSource(dataSources, 'com.google.step_count.delta', [
      'merge_step_deltas',
      'estimated_steps'
    ]);
    const caloriesSource = pickDataSource(dataSources, 'com.google.active_energy.burned', [
      'merge_active_energy_burned'
    ]);
    const distanceSource = pickDataSource(dataSources, 'com.google.distance.delta', [
      'merge_distance_delta'
    ]);
    const moveSource = pickDataSource(dataSources, 'com.google.move_minutes', [
      'merge_move_minutes'
    ]);
    const activeMinutesSource = pickDataSource(dataSources, 'com.google.active_minutes', [
      'merge_active_minutes'
    ]);
    const hrSource = pickDataSource(dataSources, 'com.google.heart_rate.bpm', ['merge_heart_rate_bpm']);
    const sleepSource = pickDataSource(dataSources, 'com.google.sleep.segment', ['merge_sleep_segments']);

    let [
      stepsBuckets,
      caloriesBuckets,
      distanceBuckets,
      moveBuckets,
      activeMinutesBuckets,
      hrBuckets
    ] = await Promise.all([
      aggregateBuckets(headers, 'com.google.step_count.delta', stepsSource, startTimeMillis, endTimeMillis, 'steps'),
      aggregateBuckets(
        headers,
        'com.google.active_energy.burned',
        caloriesSource,
        startTimeMillis,
        endTimeMillis,
        'active_calories'
      ),
      aggregateBuckets(
        headers,
        'com.google.distance.delta',
        distanceSource,
        startTimeMillis,
        endTimeMillis,
        'distance'
      ),
      aggregateBuckets(headers, 'com.google.move_minutes', moveSource, startTimeMillis, endTimeMillis, 'move_minutes'),
      aggregateBuckets(
        headers,
        'com.google.active_minutes',
        activeMinutesSource,
        startTimeMillis,
        endTimeMillis,
        'active_minutes'
      ),
      aggregateBuckets(headers, 'com.google.heart_rate.bpm', hrSource, startTimeMillis, endTimeMillis, 'heart_rate')
    ]);

    const activityMap = new Map();
    const heartMap = new Map();
    const sleepMap = await collectSleepData(
      headers,
      sleepSource,
      startTimeMillis,
      endTimeMillis,
      startIso,
      endIso
    );

    for (const bucket of stepsBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      let total = 0;
      for (const point of points) {
        const value = Number(point?.value?.[0]?.intVal ?? point?.value?.[0]?.fpVal ?? 0);
        if (Number.isFinite(value)) total += value;
      }
      const entry = ensureActivityEntry(activityMap, date);
      entry.steps += Math.round(total);
    }

    for (const bucket of caloriesBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      let total = 0;
      for (const point of points) {
        const value = Number(point?.value?.[0]?.fpVal ?? point?.value?.[0]?.intVal ?? 0);
        if (Number.isFinite(value)) total += value;
      }
      const entry = ensureActivityEntry(activityMap, date);
      entry.calories += Number(total.toFixed(2));
    }

    for (const bucket of distanceBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      let total = 0;
      for (const point of points) {
        const value = Number(point?.value?.[0]?.fpVal ?? point?.value?.[0]?.intVal ?? 0);
        if (Number.isFinite(value)) total += value;
      }
      const entry = ensureActivityEntry(activityMap, date);
      entry.distance += Number((total / 1000).toFixed(3));
    }

    for (const bucket of moveBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      let total = 0;
      for (const point of points) {
        const value = Number(point?.value?.[0]?.intVal ?? point?.value?.[0]?.fpVal ?? 0);
        if (Number.isFinite(value)) total += value;
      }
      const entry = ensureActivityEntry(activityMap, date);
      entry.moveMinutes += Math.round(total);
    }

    for (const bucket of activeMinutesBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      let total = 0;
      for (const point of points) {
        const value = Number(point?.value?.[0]?.intVal ?? point?.value?.[0]?.fpVal ?? 0);
        if (Number.isFinite(value)) total += value;
      }
      const entry = ensureActivityEntry(activityMap, date);
      entry.activeMinutes += Math.round(total);
    }

    for (const bucket of hrBuckets) {
      const date = bucketStartIso(bucket);
      if (!date) continue;
      const points = bucket?.dataset?.[0]?.point || [];
      if (!points.length) continue;
      const entry = ensureHeartEntry(heartMap, date);
      for (const point of points) {
        const value = Number(point?.value?.[0]?.fpVal ?? point?.value?.[0]?.intVal ?? 0);
        if (!Number.isFinite(value) || value <= 0) continue;
        entry.sum += value;
        entry.samples += 1;
        entry.min = entry.min === null ? value : Math.min(entry.min, value);
        entry.max = entry.max === null ? value : Math.max(entry.max, value);
      }
    }

    const nowIso = new Date().toISOString();
    const dateList = buildDateList(startIso, endIso);
    await db.exec('BEGIN');
    try {
      for (const date of dateList) {
        const activity = activityMap.get(date) || {
          steps: 0,
          calories: 0,
          distance: 0,
          moveMinutes: 0,
          activeMinutes: 0
        };
        const heart = heartMap.get(date) || { sum: 0, samples: 0, min: null, max: null };
        const sleep = sleepMap.get(date) || {
          duration: 0,
          deep: 0,
          light: 0,
          rem: 0,
          awake: 0,
          sessions: 0
        };
        const avgBpm = heart.samples > 0 ? heart.sum / heart.samples : null;
        const minBpm = heart.samples > 0 ? heart.min : null;
        const maxBpm = heart.samples > 0 ? heart.max : null;
        const sleepMinutes = Number(sleep.duration?.toFixed(2) || 0);
        const deepMinutes = Number((sleep.deep || 0).toFixed(2));
        const lightMinutes = Number((sleep.light || 0).toFixed(2));
        const remMinutes = Number((sleep.rem || 0).toFixed(2));
        const awakeMinutes = Number((sleep.awake || 0).toFixed(2));

        await db.run(
          'INSERT INTO fitness_activity(user_id,date,steps,calories,distance,move_minutes,active_minutes,updated_at) VALUES(?,?,?,?,?,?,?,?) ' +
            'ON CONFLICT(user_id,date) DO UPDATE SET steps=excluded.steps, calories=excluded.calories, distance=excluded.distance, move_minutes=excluded.move_minutes, active_minutes=excluded.active_minutes, updated_at=excluded.updated_at',
          [
            userId,
            date,
            Math.max(0, Math.round(activity.steps || 0)),
            Number((activity.calories || 0).toFixed(2)),
            Number((activity.distance || 0).toFixed(3)),
            Math.max(0, Math.round(activity.moveMinutes || 0)),
            Math.max(0, Math.round(activity.activeMinutes || 0)),
            nowIso
          ]
        );

        await db.run(
          'INSERT INTO fitness_heart_rate(user_id,date,avg_bpm,min_bpm,max_bpm,samples,updated_at) VALUES(?,?,?,?,?,?,?) ' +
            'ON CONFLICT(user_id,date) DO UPDATE SET avg_bpm=excluded.avg_bpm, min_bpm=excluded.min_bpm, max_bpm=excluded.max_bpm, samples=excluded.samples, updated_at=excluded.updated_at',
          [
            userId,
            date,
            avgBpm !== null ? Number(avgBpm.toFixed(1)) : null,
            minBpm !== null ? Number(minBpm.toFixed(1)) : null,
            maxBpm !== null ? Number(maxBpm.toFixed(1)) : null,
            heart.samples || 0,
            nowIso
          ]
        );

        await db.run(
          'INSERT INTO fitness_sleep(user_id,date,duration_minutes,deep_minutes,light_minutes,rem_minutes,awake_minutes,sessions,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ' +
            'ON CONFLICT(user_id,date) DO UPDATE SET duration_minutes=excluded.duration_minutes, deep_minutes=excluded.deep_minutes, light_minutes=excluded.light_minutes, rem_minutes=excluded.rem_minutes, awake_minutes=excluded.awake_minutes, sessions=excluded.sessions, updated_at=excluded.updated_at',
          [
            userId,
            date,
            sleepMinutes,
            deepMinutes,
            lightMinutes,
            remMinutes,
            awakeMinutes,
            sleepMinutes > 0 ? 1 : 0,
            nowIso
          ]
        );

        await db.run(
          'INSERT INTO fitness_daily(user_id,date,steps,hr_rest,sleep_hours,active_calories) VALUES(?,?,?,?,?,?) ' +
            'ON CONFLICT(user_id,date) DO UPDATE SET steps=excluded.steps, hr_rest=excluded.hr_rest, sleep_hours=excluded.sleep_hours, active_calories=excluded.active_calories',
          [
            userId,
            date,
            Math.max(0, Math.round(activity.steps || 0)),
            avgBpm !== null ? Math.round(avgBpm) : null,
            sleepMinutes ? Number((sleepMinutes / 60).toFixed(2)) : null,
            Number((activity.calories || 0).toFixed(2)) || null
          ]
        );
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }
  } catch (error) {
    logAxiosError(`Google Fit sync user ${userId}`, error);
  }
}

async function countTableRows(db, table, userId, startIso, endIso) {
  const row = await db.get(
    `SELECT COUNT(*) AS count FROM ${table} WHERE user_id=? AND date BETWEEN ? AND ?`,
    [userId, startIso, endIso]
  );
  return Number(row?.count || 0);
}

async function latestUpdatedAt(db, table, userId, startIso, endIso) {
  const row = await db.get(
    `SELECT MAX(updated_at) AS updated_at FROM ${table} WHERE user_id=? AND date BETWEEN ? AND ?`,
    [userId, startIso, endIso]
  );
  const ts = row?.updated_at ? Date.parse(row.updated_at) : NaN;
  return Number.isNaN(ts) ? null : ts;
}

async function ensureRangeSynced(userId, startIso, endIso, force = false) {
  const db = await getDB();
  const user = await db.get('SELECT google_refresh_token FROM users WHERE id=?', [userId]);
  if (!user?.google_refresh_token) return false;
  const dateList = buildDateList(startIso, endIso);
  const expectedDays = dateList.length;
  if (expectedDays === 0) return false;

  const todayIso = toDateISO(startOfUtcDay(new Date()));
  const includesToday = dateList.includes(todayIso);

  let shouldSync = force;
  if (!shouldSync) {
    const [activityCount, hrCount, sleepCount] = await Promise.all([
      countTableRows(db, 'fitness_activity', userId, startIso, endIso),
      countTableRows(db, 'fitness_heart_rate', userId, startIso, endIso),
      countTableRows(db, 'fitness_sleep', userId, startIso, endIso)
    ]);
    if (
      activityCount < expectedDays ||
      hrCount < expectedDays ||
      sleepCount < expectedDays
    ) {
      shouldSync = true;
    }
  }

  if (!shouldSync) {
    const latest = await latestUpdatedAt(db, 'fitness_activity', userId, startIso, endIso);
    const threshold = includesToday ? CURRENT_DAY_REFRESH_THRESHOLD_MS : REFRESH_THRESHOLD_MS;
    if (!latest || Date.now() - latest > threshold) {
      shouldSync = true;
    }
  }

  if (shouldSync) {
    await syncGoogleFitDataForUser(db, userId, user.google_refresh_token, startIso, endIso);
    return true;
  }
  return false;
}

function mapActivityRow(row) {
  return {
    date: row.date,
    steps: Number(row.steps || 0),
    calories: Number(row.calories || 0),
    distance_km: Number(row.distance || 0),
    move_minutes: Number(row.move_minutes || 0),
    active_minutes: Number(row.active_minutes || 0)
  };
}

function mapHeartRow(row) {
  return {
    date: row.date,
    avg_bpm: row.avg_bpm !== null && row.avg_bpm !== undefined ? Number(row.avg_bpm) : null,
    min_bpm: row.min_bpm !== null && row.min_bpm !== undefined ? Number(row.min_bpm) : null,
    max_bpm: row.max_bpm !== null && row.max_bpm !== undefined ? Number(row.max_bpm) : null,
    samples: Number(row.samples || 0)
  };
}

function mapSleepRow(row) {
  const duration = Number(row.duration_minutes || 0);
  const deep = Number(row.deep_minutes || 0);
  const light = Number(row.light_minutes || 0);
  const rem = Number(row.rem_minutes || 0);
  const awake = Number(row.awake_minutes || 0);
  return {
    date: row.date,
    duration_minutes: duration,
    duration_hours: Number((duration / 60).toFixed(2)),
    deep_minutes: deep,
    deep_hours: Number((deep / 60).toFixed(2)),
    light_minutes: light,
    light_hours: Number((light / 60).toFixed(2)),
    rem_minutes: rem,
    rem_hours: Number((rem / 60).toFixed(2)),
    awake_minutes: awake,
    awake_hours: Number((awake / 60).toFixed(2)),
    sessions: Number(row.sessions || (duration > 0 ? 1 : 0))
  };
}

protectedRouter.get('/activity', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const range = parseRangeParams(req.query || {});
    const force = req.query?.refresh === '1' || req.query?.refresh === 'true';
    await ensureRangeSynced(req.user.uid, range.startIso, range.endIso, force);
    const db = await getDB();
    const rows = await db.all(
      'SELECT date, steps, calories, distance, move_minutes, active_minutes FROM fitness_activity WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date ASC',
      [req.user.uid, range.startIso, range.endIso]
    );
    res.json({
      range: { start: range.startIso, end: range.endIso },
      items: rows.map(mapActivityRow)
    });
  } catch (error) {
    console.error('fitness activity', error.message || error);
    res.status(500).json({ error: 'activity_failed' });
  }
});

protectedRouter.get('/heart_rate', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const range = parseRangeParams(req.query || {});
    const force = req.query?.refresh === '1' || req.query?.refresh === 'true';
    await ensureRangeSynced(req.user.uid, range.startIso, range.endIso, force);
    const db = await getDB();
    const rows = await db.all(
      'SELECT date, avg_bpm, min_bpm, max_bpm, samples FROM fitness_heart_rate WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date ASC',
      [req.user.uid, range.startIso, range.endIso]
    );
    res.json({
      range: { start: range.startIso, end: range.endIso },
      items: rows.map(mapHeartRow)
    });
  } catch (error) {
    console.error('fitness heart_rate', error.message || error);
    res.status(500).json({ error: 'heart_rate_failed' });
  }
});

protectedRouter.get('/sleep', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const range = parseRangeParams(req.query || {});
    const force = req.query?.refresh === '1' || req.query?.refresh === 'true';
    await ensureRangeSynced(req.user.uid, range.startIso, range.endIso, force);
    const db = await getDB();
    const rows = await db.all(
      'SELECT date, duration_minutes, deep_minutes, light_minutes, rem_minutes, awake_minutes, sessions FROM fitness_sleep WHERE user_id=? AND date BETWEEN ? AND ? ORDER BY date ASC',
      [req.user.uid, range.startIso, range.endIso]
    );
    res.json({
      range: { start: range.startIso, end: range.endIso },
      items: rows.map(mapSleepRow)
    });
  } catch (error) {
    console.error('fitness sleep', error.message || error);
    res.status(500).json({ error: 'sleep_failed' });
  }
});

protectedRouter.get('/metrics', async (req, res) => {
  try {
    if (!req.user?.uid) return res.status(401).json({ error: 'no token' });
    const dayParam = typeof req.query?.day === 'string' ? req.query.day.slice(0, 10) : null;
    const dayDate = parseDateOnly(dayParam) || startOfUtcDay(new Date());
    const dayIso = toDateISO(dayDate);
    await ensureRangeSynced(req.user.uid, dayIso, dayIso, req.query?.refresh === '1');
    const db = await getDB();
    const activity = await db.get(
      'SELECT steps, calories FROM fitness_activity WHERE user_id=? AND date=?',
      [req.user.uid, dayIso]
    );
    const heart = await db.get(
      'SELECT avg_bpm FROM fitness_heart_rate WHERE user_id=? AND date=?',
      [req.user.uid, dayIso]
    );
    const sleep = await db.get(
      'SELECT duration_minutes FROM fitness_sleep WHERE user_id=? AND date=?',
      [req.user.uid, dayIso]
    );

    const steps = Number(activity?.steps || 0);
    const hr = heart?.avg_bpm ? Math.round(Number(heart.avg_bpm)) : 0;
    const sleepHours = sleep?.duration_minutes
      ? Number((Number(sleep.duration_minutes) / 60).toFixed(1))
      : 0;
    const activeCalories = activity?.calories ? Number(activity.calories) : 0;

    res.json({ steps, hr, sleepH: sleepHours, activeCalories, source: 'database' });
  } catch (error) {
    console.error('fitness metrics', error.message || error);
    res.status(500).json({ error: 'metrics_failed' });
  }
});

let intervalHandle = null;
let syncInProgress = false;

async function runFitnessSync(rangeDays = 30) {
  const db = await getDB();
  const users = await db.all(
    "SELECT id, google_refresh_token FROM users WHERE google_refresh_token IS NOT NULL AND TRIM(google_refresh_token) <> ''"
  );
  if (!users.length) return;
  const end = startOfUtcDay(new Date());
  const start = addDaysUtc(end, -(Math.max(1, rangeDays) - 1));
  const startIso = toDateISO(start);
  const endIso = toDateISO(end);
  for (const user of users) {
    try {
      await syncGoogleFitDataForUser(db, user.id, user.google_refresh_token, startIso, endIso);
    } catch (error) {
      console.error('Scheduled Google Fit sync failed for user', user.id, error?.message || error);
    }
  }
}

async function queueFitnessSync(rangeDays = 30) {
  if (syncInProgress) {
    return;
  }
  syncInProgress = true;
  try {
    await runFitnessSync(rangeDays);
  } catch (error) {
    console.error('Google Fit scheduled sync error', error?.message || error);
  } finally {
    syncInProgress = false;
  }
}

export async function triggerFitnessSync(rangeDays = 30) {
  await queueFitnessSync(rangeDays);
}

export function scheduleFitnessSync({ intervalHours = 1, rangeDays = 30 } = {}) {
  if (intervalHandle) return intervalHandle;
  const hours = Math.max(1, Number(intervalHours) || 3);
  const intervalMs = hours * 60 * 60 * 1000;
  const runner = () => {
    queueFitnessSync(rangeDays).catch((error) => {
      console.error('Google Fit scheduled sync failed', error?.message || error);
    });
  };
  intervalHandle = setInterval(runner, intervalMs);
  runner();
  return intervalHandle;
}

export default { public: publicRouter, protected: protectedRouter };
