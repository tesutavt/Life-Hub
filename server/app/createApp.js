import express from 'express';
import cors from 'cors';
import authRouter from '../routes/auth/index.js';
import loansRouter from '../routes/finance/loans.js';
import banksRouter from '../routes/finance/banks.js';
import fitness from '../routes/fitness/index.js';
import lifeRouter from '../routes/life/index.js';
import socialsRouter from '../routes/socials/index.js';
import pagesRouter from '../routes/pages/index.js';
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
  const corsMiddleware = cors(corsOptions);

  app.use(corsMiddleware);
  app.options('*', corsMiddleware);
  app.use(express.json({ limit: '2mb' }));

  app.use('/uploads', express.static(UPLOADS_DIR));

  app.use('/api/auth', authRouter);
  app.use('/api/fitness', fitness.public);

  app.use('/api/loans', requireAuth, loansRouter);
  app.use('/api/banks', requireAuth, banksRouter);
  app.use('/api/fitness', requireAuth, fitness.protected);
  app.use('/api/life', requireAuth, lifeRouter);
  app.use('/api/socials', requireAuth, socialsRouter);
  app.use('/api/life/pages', requireAuth, pagesRouter);

  registerClientAssets(app);

  return app;
}
