import { spawn } from 'node:child_process';

/** Starting the server and opening the browser, shared by the git launcher and the installed app. */

const SERVER_WAIT_MS = 30_000;

export const PORT = process.env.PORT || '3000';
export const URL = `http://localhost:${PORT}`;

export const say = (message = '') => console.log(message);

export const isUp = () => fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(2000) }).then(r => r.ok, () => false);

export function openBrowser() {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '""', URL], { stdio: 'ignore', detached: true }).unref();
}

/**
 * Runs server.js from root until it stops and returns its exit code.
 * envDir is the folder holding .env. version is a function because git may have just moved.
 */
export async function runServer({ root, envDir, version }) {
  const server = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit', env: { ...process.env, HOST: '127.0.0.1', PORT, ENV_DIR: envDir } });
  const stopped = new Promise(resolve => server.on('exit', code => resolve(code ?? 1)));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill());

  const deadline = Date.now() + SERVER_WAIT_MS;
  while (Date.now() < deadline && server.exitCode === null) {
    if (await isUp()) {
      say();
      say(`Marka Photobooth jalan di ${URL} (versi ${version()})`);
      say('Biarkan jendela ini terbuka. Tutup untuk mematikan app.');
      openBrowser();
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  return stopped;
}
