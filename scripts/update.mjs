import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Auto update of an installed app: replaces app/ and runtime/node.exe with the release described by
 * latest.json. No unsigned .exe is involved, because Smart App Control on Windows 11 would block it.
 * Any problem here leaves the current version in place, so an event never waits on a bad connection.
 */

const METADATA_TIMEOUT_MS = 5_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const RENAME_ATTEMPTS = 10;
const RENAME_WAIT_MS = 500;
// Bundled with Windows and signed by Microsoft. The full path keeps another tar on PATH from running.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

/** True when a is a later x.y.z version than b. */
export function isNewer(a, b) {
  return a.localeCompare(b, 'en', { numeric: true }) > 0;
}

async function download(url, sha256, timeout) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  const actual = createHash('sha256').update(data).digest('hex');
  if (sha256 && actual !== sha256) throw new Error(`Checksum ${url} tidak cocok.`);
  return data;
}

/** Antivirus can hold a file for a moment after it is written, which makes a rename fail on Windows. */
async function rename(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      return renameSync(from, to);
    } catch (err) {
      if (attempt === RENAME_ATTEMPTS) throw err;
      await new Promise(resolve => setTimeout(resolve, RENAME_WAIT_MS));
    }
  }
}

async function prepareApp(latest, baseUrl, temp) {
  const zip = path.join(temp, 'app.zip');
  writeFileSync(zip, await download(`${baseUrl}/${latest.file}`, latest.sha256, DOWNLOAD_TIMEOUT_MS));
  const dir = path.join(temp, 'app');
  mkdirSync(dir);
  execFileSync(TAR, ['-xf', zip, '-C', dir], { stdio: 'ignore' });
  const unpacked = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  if (unpacked.version !== latest.version || !existsSync(path.join(dir, 'server.js'))) throw new Error('Isi paket update tidak sesuai.');
  return dir;
}

async function prepareNode({ url, entry, sha256, version }, temp) {
  const zip = path.join(temp, 'node.zip');
  writeFileSync(zip, await download(url, sha256, DOWNLOAD_TIMEOUT_MS));
  execFileSync(TAR, ['-xf', zip, '-C', temp, entry], { stdio: 'ignore' });
  const exe = path.join(temp, entry);
  const reported = execFileSync(exe, ['--version'], { encoding: 'utf8' }).trim();
  if (reported !== version) throw new Error(`Node baru melapor versi ${reported}, seharusnya ${version}.`);
  return exe;
}

const backupOf = target => `${target}.old`;

async function swapIn(target, incoming) {
  await rename(target, backupOf(target));
  await rename(incoming, target);
}

/** Puts back everything swapped in. A running node.exe can still be renamed on Windows. */
export function rollBackUpdate({ swapped }) {
  for (const target of swapped) {
    if (!existsSync(backupOf(target))) continue;
    rmSync(target, { recursive: true, force: true });
    renameSync(backupOf(target), target);
  }
}

/** Removes what the last update left behind. Failing is harmless: the next run tries again. */
export function cleanUpUpdate(installDir) {
  for (const leftover of ['app.old', path.join('runtime', 'node.exe.old'), 'update.tmp']) {
    try {
      rmSync(path.join(installDir, leftover), { recursive: true, force: true });
    } catch {
      // Still locked by antivirus
    }
  }
}

/** Moves to the newest release. Returns what rollBackUpdate needs, or null when nothing changed. */
export async function applyUpdate({ installDir, baseUrl, nodeVersion = process.version, log = () => undefined }) {
  const appDir = path.join(installDir, 'app');
  const nodeExe = path.join(installDir, 'runtime', 'node.exe');
  const temp = path.join(installDir, 'update.tmp');
  const swapped = [];
  try {
    log('Mengecek update...');
    const current = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8')).version;
    const latest = await download(`${baseUrl}/latest.json`, null, METADATA_TIMEOUT_MS).then(data => JSON.parse(data.toString()));
    if (!isNewer(latest.version, current)) {
      log('Sudah versi terbaru.');
      return null;
    }

    log(`Mengunduh versi ${latest.version}...`);
    rmSync(temp, { recursive: true, force: true });
    mkdirSync(temp, { recursive: true });
    const incomingApp = await prepareApp(latest, baseUrl, temp);
    const incomingNode = latest.node.version === nodeVersion ? null : await prepareNode(latest.node, temp);

    // Nothing has changed until here, and from here a failure puts back what already moved
    for (const [target, incoming] of [[appDir, incomingApp], [nodeExe, incomingNode]]) {
      if (!incoming) continue;
      swapped.push(target);
      await swapIn(target, incoming);
    }
    log(`Versi ${latest.version} terpasang.`);
    return { swapped };
  } catch (err) {
    log(`Update dilewati, app dibuka dengan versi yang ada. (${err.message})`);
    if (swapped.length) {
      try {
        rollBackUpdate({ swapped });
      } catch (rollBackError) {
        log(`Gagal mengembalikan versi lama: ${rollBackError.message}`);
      }
    }
    return null;
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
  }
}
