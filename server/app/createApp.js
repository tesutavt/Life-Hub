import express from 'express';
import cors from 'cors';
import authRouter from '../routes/auth/index.js';
import adminRouter from '../routes/admin/index.js';
import loansRouter from '../routes/finance/loans.js';
import banksRouter from '../routes/finance/banks.js';
import fitness from '../routes/fitness/index.js';
import lifeRouter from '../routes/life/index.js';
import publicRouter from '../routes/public/index.js';
import pagesRouter from '../routes/pages/index.js';
import learnRouter from '../routes/learn/index.js';
import ttsRouter from '../routes/tts/index.js';
import remindersRouter from '../routes/reminders/index.js';
import { userRouter as achievementsRouter, adminRouter as adminAchievementsRouter, onboardingRouter } from '../routes/achievements/index.js';
import { achievementTracker } from '../achievements/engine.js';
import { requireAuth } from '../utils.js';
import { registerClientAssets } from './registerClientAssets.js';
import { createCorsOptions, parseAllowedOrigins } from '../config/cors.js';
import { UPLOADS_DIR } from '../config/paths.js';

export function createApp(options = {}) {
  const { corsOrigins } = options;
  const allowedOrigins =
    corsOrigins !== undefined ? parseAllowedOrigins(corsOrigins) : parseAllowedOrigins(process.env.CORS_ORIGINS);
  const corsOptions = createCorsOptions(allowedOrigins);

  const app = express();
  // За nginx/Caddy на VDS: TRUST_PROXY=1, чтобы видеть реальный IP клиента (лимиты запросов)
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.disable('x-powered-by');
  const corsMiddleware = cors(corsOptions);

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);
  app.use(express.json({ limit: '10mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/api', achievementTracker);

  // Проверка «это сервер Life Hub?» для экрана выбора сервера (десктоп и Android)
  app.get('/api/health', (req, res) => res.json({ app: 'lifehub', ok: true, version: process.env.npm_package_version || '1.0.0' }));
  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/fitness', fitness.public);
  app.use('/api/tts', ttsRouter);

  app.use('/api/loans', requireAuth, loansRouter);
  app.use('/api/banks', requireAuth, banksRouter);
  app.use('/api/fitness', requireAuth, fitness.protected);
  app.use('/api/life', requireAuth, lifeRouter);
  app.use('/api/life/pages', requireAuth, pagesRouter);
  app.use('/api/achievements', requireAuth, achievementsRouter);
  app.use('/api/learn', requireAuth, learnRouter);
  app.use('/api/onboarding', requireAuth, onboardingRouter);
  app.use('/api/reminders', requireAuth, remindersRouter);
  app.use('/api/admin/achievements', requireAuth, adminAchievementsRouter);
  app.use('/api/admin', requireAuth, adminRouter);

  registerClientAssets(app);

  return app;
}
