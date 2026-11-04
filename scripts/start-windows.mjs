import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL, isUp, openBrowser, runServer, say } from './launch.mjs';

/**
 * What jalankan-windows.bat runs: update from GitHub, build if needed, start the app, open the browser.
 * It lives here rather than in the .bat because cmd.exe reads a batch file bit by bit while running
 * it, so a batch file that updates itself can run garbage. Node has read this file in full by now.
 */

const BRANCH = 'main';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIT_TIMEOUT_MS = 60_000;

/** Runs a command and shows its output. shell is what lets Windows find npm.cmd. */
const run = (command, timeout) => spawnSync(command, { cwd: ROOT, shell: true, stdio: 'inherit', timeout }).status === 0;

function git(args) {
  const r = spawnSync(`git ${args}`, { cwd: ROOT, shell: true, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

const depsChanged = (from, to) => !git(`diff --quiet ${from} ${to} -- package.json package-lock.json`).ok;

function installAndBuild(install) {
  if (install && !run('npm ci')) return false;
  return run('npm run build');
}

/** Moves to the newest version on GitHub. Any problem here leaves the current version running. */
function pullUpdate() {
  if (!existsSync(path.join(ROOT, '.git'))) {
    say('Auto update mati: folder ini bukan hasil git clone.');
    return null;
  }
  if (!git('--version').ok) {
    say('Auto update mati: Git belum terpasang.');
    return null;
  }
  const branch = git('rev-parse --abbrev-ref HEAD').out;
  if (branch !== BRANCH) {
    say(`Auto update dilewati: folder ini memakai branch ${branch}, bukan ${BRANCH}.`);
    return null;
  }
  say('Mengecek update di GitHub...');
  const fetched = git(`fetch origin ${BRANCH}`);
  if (!fetched.ok) {
    say('Update tidak bisa dicek, app dibuka dengan versi yang ada.');
    if (fetched.err) say(fetched.err);
    return null;
  }
  const from = git('rev-parse HEAD').out;
  const to = git(`rev-parse origin/${BRANCH}`).out;
  if (from === to) {
    say('Sudah versi terbaru.');
    return null;
  }
  const merged = git(`merge --ff-only origin/${BRANCH}`);
  if (!merged.ok) {
    say('Update dilewati: ada perubahan lokal yang bentrok dengan GitHub. App dibuka dengan versi yang ada.');
    if (merged.err) say(merged.err);
    return null;
  }
  return { from, to };
}

/** A broken version on GitHub must not stop the app at an event, so go back to the one that worked. */
function rollBack({ from, to }) {
  say();
  say('Versi baru gagal disiapkan. Kembali ke versi sebelumnya...');
  if (!git(`reset --keep ${from}`).ok) return false;
  return installAndBuild(depsChanged(from, to));
}

function prepare() {
  const update = pullUpdate();
  const firstInstall = !existsSync(path.join(ROOT, 'node_modules'));
  const unbuilt = !existsSync(path.join(ROOT, 'dist', 'index.html')) || !existsSync(path.join(ROOT, 'server.js'));

  if (update) {
    say('Memasang update...');
    if (installAndBuild(firstInstall || depsChanged(update.from, update.to))) {
      say('Update terpasang.');
      return true;
    }
    return rollBack(update);
  }
  if (firstInstall || unbuilt) {
    say('Menyiapkan app, hanya lama saat pertama kali...');
    return installAndBuild(firstInstall);
  }
  return true;
}

async function main() {
  if (await isUp()) {
    say(`App sudah jalan. Membuka ${URL}`);
    openBrowser();
    return 0;
  }
  if (!prepare()) {
    say('App gagal disiapkan. Baca pesan di atas.');
    return 1;
  }
  return runServer({ root: ROOT, envDir: ROOT, version: () => git('rev-parse --short HEAD').out || 'tanpa git' });
}

process.exitCode = await main();
