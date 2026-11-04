import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { cpSync, globSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds what computers install and update from, into build/release: the app as a zip, latest.json
 * and install.ps1. With --publish it also becomes the newest commit on the release branch.
 * No .exe of our own is shipped, because Smart App Control blocks unsigned ones. The zip holds only
 * JavaScript and web files, and Node comes from nodejs.org with its own valid signature.
 * .env and service account keys never go in: everything here is public.
 */

const NODE_VERSION = 'v26.13.0';
const RELEASE_BRANCH = 'installer';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'release');
const APP = path.join(ROOT, 'build', 'release-stage');
// Files in the install folder go past C:\Users\<name>\AppData\Local\Programs\Marka Photobooth\app\
const INSTALL_PREFIX_LENGTH = 75;
const WINDOWS_MAX_PATH = 259;
const WINDOWS_BAD_NAME = /[<>:"|?*\\]|[. ]$|^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

function run(command, args, cwd = ROOT) {
  const r = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) throw new Error(`${command} ${args.join(' ')} gagal.`);
}

function git(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} gagal: ${r.stderr}`);
  return r.stdout.trim();
}

const sha256 = data => createHash('sha256').update(data).digest('hex');

/** The packages server.js imports at startup. Vite is only imported in development, so it stays out. */
function serverPackages() {
  const source = readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const specifiers = [...source.matchAll(/^(?:import\s.*?|\}\s*)from\s+"([^"]+)"/gm)].map(m => m[1]);
  const packages = specifiers
    .filter(s => !s.startsWith('node:') && !s.startsWith('.') && !builtinModules.includes(s))
    .map(s => s.split('/').slice(0, s.startsWith('@') ? 2 : 1).join('/'));
  return [...new Set(packages)].sort();
}

function stageApp(manifest) {
  const packages = serverPackages();
  const dependencies = {};
  for (const name of packages) {
    if (!manifest.dependencies[name]) throw new Error(`server.js memakai ${name}, tapi tidak ada di dependencies.`);
    dependencies[name] = manifest.dependencies[name];
  }
  console.log(`Paket server: ${packages.join(', ')}`);

  rmSync(APP, { recursive: true, force: true });
  mkdirSync(path.join(APP, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'server.js'), path.join(APP, 'server.js'));
  cpSync(path.join(ROOT, 'dist'), path.join(APP, 'dist'), { recursive: true });
  cpSync(path.join(ROOT, '.env.example'), path.join(APP, '.env.example'));
  cpSync(path.join(ROOT, 'installer', 'marka.ico'), path.join(APP, 'marka.ico'));
  for (const file of ['launch.mjs', 'start-installed.mjs', 'update.mjs']) {
    cpSync(path.join(ROOT, 'scripts', file), path.join(APP, 'scripts', file));
  }

  const { name, version } = manifest;
  writeFileSync(path.join(APP, 'package.json'), JSON.stringify({ name, version, private: true, type: 'module', dependencies }, null, 2));
  // The lockfile keeps the versions identical to what the project was tested with
  cpSync(path.join(ROOT, 'package-lock.json'), path.join(APP, 'package-lock.json'));
  // --no-bin-links: tar on Windows cannot create the symlinks npm otherwise puts in node_modules/.bin
  run('npm', ['install', '--omit=dev', '--ignore-scripts', '--no-bin-links', '--os=win32', '--cpu=x64', '--no-audit', '--no-fund'], APP);
  rmSync(path.join(APP, 'package-lock.json'));

  // Not needed at runtime, and every file slows down antivirus on the first start
  for (const file of globSync('node_modules/**/*.{d.ts,map}', { cwd: APP })) rmSync(path.join(APP, file));

  // Smart App Control would block an unsigned native module, and one built here would not run on Windows
  const binaries = globSync('node_modules/**/*.{node,exe,dll}', { cwd: APP });
  if (binaries.length) throw new Error(`Ada file biner yang akan diblokir di Windows:\n${binaries.join('\n')}`);

  assertUnpacksOnWindows();
}

/** A file Windows cannot create makes the whole install or update fail, so it must stop the build. */
function assertUnpacksOnWindows() {
  const problems = [];
  const seen = new Set();
  for (const entry of readdirSync(APP, { recursive: true, withFileTypes: true })) {
    const relative = path.relative(APP, path.join(entry.parentPath, entry.name));
    if (entry.isSymbolicLink()) problems.push(`symlink: ${relative}`);
    if (WINDOWS_BAD_NAME.test(entry.name)) problems.push(`nama tidak valid: ${relative}`);
    if (relative.length + INSTALL_PREFIX_LENGTH > WINDOWS_MAX_PATH) problems.push(`path terlalu panjang: ${relative}`);
    const folded = relative.toLowerCase();
    if (seen.has(folded)) problems.push(`bentrok huruf besar-kecil: ${relative}`);
    seen.add(folded);
  }
  if (problems.length) throw new Error(`Paket tidak bisa diekstrak di Windows:\n${problems.join('\n')}`);
}

async function nodeRelease() {
  const name = `node-${NODE_VERSION}-win-x64`;
  const res = await fetch(`https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`);
  if (!res.ok) throw new Error(`Gagal mengambil checksum Node: ${res.status}`);
  const line = (await res.text()).split('\n').find(l => l.endsWith(`  ${name}.zip`));
  if (!line) throw new Error(`Node ${NODE_VERSION} untuk Windows tidak ditemukan.`);
  return { version: NODE_VERSION, url: `https://nodejs.org/dist/${NODE_VERSION}/${name}.zip`, entry: `${name}/node.exe`, sha256: line.split(' ')[0] };
}

/** Adds the release as a commit on its own branch, without touching this working folder. */
function publish(fileNames, version) {
  if (git('status', '--porcelain')) throw new Error('Commit dulu semua perubahan: rilis harus bisa dilacak ke satu commit.');
  const source = git('rev-parse', 'HEAD');
  run('git', ['push', 'origin', 'HEAD']);
  run('git', ['fetch', 'origin', RELEASE_BRANCH]);
  const parent = git('rev-parse', `origin/${RELEASE_BRANCH}`);

  const entries = fileNames.map(name => `100644 blob ${git('hash-object', '-w', path.join(OUT, name))}\t${name}\n`).join('');
  const mktree = spawnSync('git', ['mktree'], { cwd: ROOT, input: entries, encoding: 'utf8' });
  if (mktree.status !== 0) throw new Error(`git mktree gagal: ${mktree.stderr}`);
  const message = `rilis ${version}\n\nDibuat dari commit ${source}.`;
  const commit = git('commit-tree', mktree.stdout.trim(), '-p', parent, '-m', message);
  run('git', ['push', 'origin', `${commit}:refs/heads/${RELEASE_BRANCH}`]);
}

const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
run('npm', ['run', 'build']);
stageApp(manifest);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const file = `marka-app-${manifest.version}.zip`;
// Without --no-mac-metadata a Mac adds a ._ file next to many others
run('tar', ['--no-mac-metadata', '-a', '-cf', path.join(OUT, file), '-C', APP, '.']);

const latest = { version: manifest.version, file, sha256: sha256(readFileSync(path.join(OUT, file))), node: await nodeRelease() };
writeFileSync(path.join(OUT, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
cpSync(path.join(ROOT, 'installer', 'install.ps1'), path.join(OUT, 'install.ps1'));
console.log(`\nRilis ${manifest.version} siap di ${OUT}`);

if (process.argv.includes('--publish')) {
  publish([file, 'install.ps1', 'latest.json'], manifest.version);
  console.log(`Rilis ${manifest.version} dipublikasikan ke branch ${RELEASE_BRANCH}.`);
}
