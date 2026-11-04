import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { config } from './config.ts';
import { createApp, errorHandler } from './app.ts';

/**
 * Start the full-stack server.
 * @param rootDir project root (where dist/ lives). Passed in because the bundled server.js and the
 *                TypeScript sources sit in different folders.
 */
export async function startServer(rootDir: string, isProd: boolean) {
  const app = createApp({ isProd });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(rootDir, 'dist');
    // Vite fingerprints everything in /assets, so those files can be cached forever
    app.use('/assets', express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }));
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.use((_req: Request, res: Response) => {
      // index.html must always be revalidated so a deploy is picked up immediately
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Server] Marka Photobooth running on port ${config.port} (${isProd ? 'production' : 'development'})`);
  });
}
