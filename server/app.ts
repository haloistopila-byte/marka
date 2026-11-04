import express from 'express';
import type { Express, Request, Response } from 'express';
import { applySecurity, errorHandler } from './middleware/security.ts';
import { basicAuthGate } from './middleware/basicAuth.ts';
import { router as calendarRouter, oauthCallbackRouter } from './routes/calendar.ts';
import { router as healthRouter } from './routes/health.ts';

/** Express app: security middleware and API routes. server/index.ts attaches the SPA afterwards. */
export function createApp({ isProd }: { isProd: boolean }): Express {
  const app = express();
  applySecurity(app, isProd);
  app.use(basicAuthGate);

  app.get('/robots.txt', (_req: Request, res: Response) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\n');
  });

  app.use('/api', express.json({ limit: '16kb' }));
  app.use('/api/health', healthRouter);
  app.use('/api/calendar', calendarRouter);
  app.use(oauthCallbackRouter);

  // Unknown API paths must not fall through to the SPA's index.html
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Endpoint tidak ditemukan.' });
  });

  return app;
}

export { errorHandler };
