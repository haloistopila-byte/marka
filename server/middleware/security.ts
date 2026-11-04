import type { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from '../config.ts';

export function applySecurity(app: Express, isProd: boolean) {
  // Behind the hosting provider's proxy: honour X-Forwarded-*
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // A CSP needs testing in production first (Google Fonts, Vite in dev)
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: isProd ? { maxAge: 15552000, includeSubDomains: true } : false
    })
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  app.use(compression());

  const devOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  app.use(
    '/api',
    cors({
      origin(origin, cb) {
        cb(null, !origin || config.allowedOrigins.includes(origin) || (!isProd && devOrigin.test(origin)));
      },
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600
    })
  );

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use(
    '/api',
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false, validate: { trustProxy: false } })
  );
}

/** Last-resort error handler: log details on the server, return a generic message. */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('[Server] Unhandled error:', err);
  if (res.headersSent) return;
  res.status(status).json({ success: false, error: status < 500 && err?.message ? err.message : 'Terjadi kesalahan pada server.' });
}
