import { spawn } from 'node:child_process';

/** Starting the server and opening the browser, shared by the git launcher and the installed app. */

// Long because antivirus scans every file the first time a new version starts
const SERVER_WAIT_MS = 120_000;

export const PORT = process.env.PORT || '3000';
export const URL = `http://localhost:${PORT}`;

export const say = (message = '') => console.log(message);

export const isUp = () => fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false);

export function openBrowser() {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', URL], { stdio: 'ignore', detached: true }).unref();
}

/**
 * Runs server.js from root until it stops. envDir is the folder holding .env. version is a function
 * because an update may have just moved it. started says whether the server ever answered.
 * stopIfNotUp ends a server that never answers, for a caller that has an older version to go back to.
 */
export async function runServer({ root, envDir, version, stopIfNotUp = false }) {
  const server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT, ENV_DIR: envDir } });
  const stopped = new Promise(resolve => server.on('exit', code => resolve(code ?? 1)));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());

  let started = false;
  const deadline = Date.now() + SERVER_WAIT_MS;
  while (!started && Date.now() < deadline && server.exitCode === null) {
    started = await isUp();
    if (!started) await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (started) {
    say();
    say(`Marka Photobooth jalan di ${URL} (versi ${version()})`);
    say('Biarkan jendela ini terbuka. Tutup untuk mematikan app.');
    openBrowser();
  } else if (stopIfNotUp) {
    server.kill();
  }
  return { code: await stopped, started };
}
