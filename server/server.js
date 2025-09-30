import 'dotenv/config'; // ES-modules
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDB, requireAuth } from './utils.js';
import authRouter from './routes-auth.js';
import loansRouter from './routes-loans.js';
import banksRouter from './routes-banks.js';
import fitness, { scheduleFitnessSync } from './routes-fitness.js';
import lifeRouter from './routes-life.js';
import socialsRouter from './routes-socials.js';
import pagesRouter from './routes-pages.js';


const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultOrigins = ['http://localhost:5173'];
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  allowedOrigins.push(...defaultOrigins);
}

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      // Same-origin or server-to-server requests
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

await openDB();
scheduleFitnessSync();

// Public
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // <- тут
app.use('/api/auth', authRouter);
// Google Fit public endpoints (auth/callback)
app.use('/api/fitness', fitness.public);

// Protected
app.use('/api/loans', requireAuth, loansRouter);
app.use('/api/banks', requireAuth, banksRouter);
app.use('/api/fitness', requireAuth, fitness.protected);
app.use('/api/life', requireAuth, lifeRouter);
app.use('/api/socials', requireAuth, socialsRouter);
app.use('/api/life/pages', requireAuth, pagesRouter);


app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "../client/dist/index.html"))
);


// Serve client dist if present (optional)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  try { res.sendFile(path.join(clientDist, 'index.html')); }
  catch { res.status(200).send('API running'); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
