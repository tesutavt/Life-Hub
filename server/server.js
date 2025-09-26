import 'dotenv/config'; // ES-modules
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDB, requireAuth } from './utils.js';
import authRouter from './routes-auth.js';
import loansRouter from './routes-loans.js';
import banksRouter from './routes-banks.js';
import fitness from './routes-fitness.js';
import lifeRouter from './routes-life.js';
import socialsRouter from './routes-socials.js';
import pagesRouter from './routes-pages.js';

<<<<<<< HEAD
=======

>>>>>>> 4578f97d2abb3ae3db735ee40038b3b752a54983
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

await openDB();

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

<<<<<<< HEAD
=======

app.use(express.static(path.join(__dirname, "../client/dist")));
app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "../client/dist/index.html"))
);


>>>>>>> 4578f97d2abb3ae3db735ee40038b3b752a54983
// Serve client dist if present (optional)
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  try { res.sendFile(path.join(clientDist, 'index.html')); }
  catch { res.status(200).send('API running'); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
