import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL, isUp, openBrowser, runServer, say } from './launch.mjs';

/**
 * What the installed app's shortcut runs. Everything is already built, so unlike start-windows.mjs
 * this neither updates nor builds. .env lives outside the install folder so a new installer keeps it.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(process.env.APPDATA || ROOT, 'Marka Photobooth');
const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/** The window closes when this process ends, which would take any error message with it. */
function waitForEnter() {
  say();
  say('Tekan Enter untuk menutup jendela ini.');
  return new Promise(resolve => process.stdin.once('data', resolve).once('end', resolve));
}

process.title = 'Marka Photobooth';

if (await isUp()) {
  say(`App sudah jalan. Membuka ${URL}`);
  openBrowser();
} else {
  mkdirSync(DATA_DIR, { recursive: true });
  const code = await runServer({ root: ROOT, envDir: DATA_DIR, version: () => version });
  say();
  say('App berhenti.');
  if (code !== 0) await waitForEnter();
}
process.exit(0);
