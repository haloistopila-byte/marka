import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server/index.ts';

// Entry point. `npm run build` bundles this file into server.js, which the host runs.
const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);

// The compiled server.js always serves the built dist/, even without NODE_ENV
const isProd = process.env.NODE_ENV === 'production' || __filename.endsWith('.js');

startServer(rootDir, isProd);
