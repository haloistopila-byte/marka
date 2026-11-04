import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { cpSync, existsSync, globSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds build/installer/Marka-Photobooth-Setup-<version>.exe: the built app, only the packages the
 * server imports, and its own Node, so the target computer needs neither Node nor Git.
 * Needs makensis (brew install makensis on a Mac, https://nsis.sourceforge.io on Windows).
 * Never puts .env or a service account key in: the installer can be passed around freely.
 */

const NODE_VERSION = 'v26.13.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'build', 'installer');
const STAGE = path.join(OUT_DIR, 'stage');
const CACHE = path.join(OUT_DIR, 'cache');
const APP = path.join(STAGE, 'app');
const EXE = 'MarkaPhotobooth.exe';
// Files in the install folder go past C:\Users\<name>\AppData\Local\Programs\Marka Photobooth\app\
const INSTALL_PREFIX_LENGTH = 75;
const WINDOWS_MAX_PATH = 259;

function run(command, args, cwd = ROOT) {
  const r = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} gagal.`);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The packages server.js imports at startup. Vite is only imported in development, so it stays out. */
function serverPackages() {
  const source = readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const specifiers = [...source.matchAll(/^(?:import\s.*?|\}\s*)from\s+"([^"]+)"/gm)].map(m => m[1]);
  const packages = specifiers
    .filter(s => !s.startsWith('node:') && !s.startsWith('.') && !builtinModules.includes(s))
    .map(s => s.split('/').slice(0, s.startsWith('@') ? 2 : 1).join('/'));
  return [...new Set(packages)].sort();
}

function stageApp() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packages = serverPackages();
  const dependencies = {};
  for (const name of packages) {
    if (!manifest.dependencies[name]) throw new Error(`server.js memakai ${name}, tapi tidak ada di dependencies.`);
    dependencies[name] = manifest.dependencies[name];
  }
  console.log(`Paket server: ${packages.join(', ')}`);

  mkdirSync(path.join(APP, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'server.js'), path.join(APP, 'server.js'));
  cpSync(path.join(ROOT, 'dist'), path.join(APP, 'dist'), { recursive: true });
  for (const file of ['launch.mjs', 'start-installed.mjs']) {
    cpSync(path.join(ROOT, 'scripts', file), path.join(APP, 'scripts', file));
  }
  cpSync(path.join(ROOT, '.env.example'), path.join(STAGE, '.env.example'));

  const { name, version } = manifest;
  writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name, version, private: true, type: 'module', dependencies }, null, 2));
  // The lockfile keeps the versions identical to what the project was tested with
  cpSync(path.join(ROOT, 'package-lock.json'), path.join(APP, 'package-lock.json'));
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--os=win32', '--cpu=x64', '--no-audit', '--no-fund'], APP);
  rmSync(path.join(APP, 'package-lock.json'));

  // A native module would be built for this Mac and crash on Windows
  const native = globSync('node_modules/**/*.node', { cwd: APP });
  if (native.length) throw new Error(`Ada modul native yang tidak bisa dibawa ke Windows:\n${native.join('\n')}`);

  const longest = globSync('**/*', { cwd: APP }).reduce((a, b) => (b.length > a.length ? b : a), '');
  if (longest.length + INSTALL_PREFIX_LENGTH > WINDOWS_MAX_PATH) throw new Error(`Path terlalu panjang untuk Windows: ${longest}`);
  return version;
}

async function stageNode() {
  const name = `node-${NODE_VERSION}-win-x64`;
  const zip = path.join(CACHE, `${name}.zip`);
  mkdirSync(CACHE, { recursive: true });
  if (!existsSync(zip)) {
    console.log(`Mengunduh Node ${NODE_VERSION} untuk Windows...`);
    writeFileSync(zip, await download(`https://nodejs.org/dist/${NODE_VERSION}/${name}.zip`));
  }
  const sums = (await download(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`)).toString();
  const expected = sums.split('\n').find(line => line.endsWith(`  ${name}.zip`))?.split(' ')[0];
  const actual = createHash('sha256').update(readFileSync(zip)).digest('hex');
  if (!expected || expected !== actual) {
    rmSync(zip);
    throw new Error(`Checksum Node tidak cocok (${actual}). File dihapus, coba lagi.`);
  }
  const runtime = path.join(STAGE, 'runtime');
  mkdirSync(runtime, { recursive: true });
  run('tar', ['-xf', zip, '-C', runtime, '--strip-components=1', `${name}/node.exe`]);
  // Its own name lets the installer stop this app without touching any other Node on the computer
  renameSync(path.join(runtime, 'node.exe'), path.join(runtime, EXE));
}

run('npm', ['run', 'build']);
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });
const version = stageApp();
await stageNode();

const out = path.join(OUT_DIR, `Marka-Photobooth-Setup-${version}.exe`);
run('makensis', ['-V2', `-DVERSION=${version}`, `-DSTAGE=${STAGE}`, `-DOUT=${out}`, path.join(ROOT, 'installer', 'marka.nsi')]);
console.log(`\nInstaller siap: ${out}`);
