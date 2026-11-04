import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL, isUp, openBrowser, runServer, say } from './launch.mjs';
import { applyUpdate, cleanUpUpdate, rollBackUpdate } from './update.mjs';

/**
 * What the installed app's shortcut runs: update, start the server, open the browser.
 * .env lives outside the install folder, so replacing app/ can never touch it.
 */

const UPDATE_URL = process.env.MARKA_UPDATE_URL || 'https://raw.githubusercontent.com/haloistopila-byte/marka/installer';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL_DIR = path.dirname(ROOT);
const DATA_DIR = path.join(process.env.APPDATA || INSTALL_DIR, 'Marka Photobooth');

const version = () => JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** The window closes when this process ends, which would take any error message with it. */
function waitForEnter() {
  say();
  say('Tekan Enter untuk menutup jendela ini.');
  return new Promise(resolve => process.stdin.once('data', resolve).once('end', resolve));
}

function prepareEnvFile() {
  mkdirSync(DATA_DIR, { recursive: true });
  const env = path.join(DATA_DIR, '.env');
  if (!existsSync(env)) copyFileSync(path.join(ROOT, '.env.example'), env);
}

process.title = 'Marka Photobooth';
// Windows refuses to rename a folder that is some process's working directory, and update renames app/
process.chdir(INSTALL_DIR);

if (await isUp()) {
  say(`App sudah jalan. Membuka ${URL}`);
  openBrowser();
} else {
  prepareEnvFile();
  cleanUpUpdate(INSTALL_DIR);
  const update = await applyUpdate({ installDir: INSTALL_DIR, baseUrl: UPDATE_URL, log: say });
  const server = { root: ROOT, envDir: DATA_DIR, version };
  let result = await runServer({ ...server, stopIfNotUp: Boolean(update) });
  if (update && !result.started) {
    // A broken release must not stop the app at an event
    say();
    say('Versi baru gagal jalan. Kembali ke versi sebelumnya...');
    rollBackUpdate(update);
    result = await runServer(server);
  }
  say();
  say('App berhenti.');
  if (result.code !== 0) await waitForEnter();
}
process.exit(0);
