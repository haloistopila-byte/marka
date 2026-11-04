import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { applyUpdate, cleanUpUpdate, isNewer, rollBackUpdate } from './update.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const work = mkdtempSync(path.join(tmpdir(), 'marka-update-'));
const files = new Map();
let server;
let baseUrl;

function zipOf(name, build) {
  const dir = path.join(work, 'src', name);
  mkdirSync(dir, { recursive: true });
  build(dir);
  const zip = path.join(work, `${name}.zip`);
  execFileSync('tar', ['-a', '-cf', zip, '-C', dir, '.']);
  return readFileSync(zip);
}

function appZip(name, version) {
  return zipOf(name, dir => {
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
    writeFileSync(path.join(dir, 'server.js'), `// ${version}`);
  });
}

function publish({ version = '0.3.0', zip = appZip(`app-${version}`, version), declaredSha = sha256(zip), node = { version: 'v1.0.0' } }) {
  files.set('/app.zip', zip);
  files.set('/latest.json', JSON.stringify({ version, file: 'app.zip', sha256: declaredSha, node }));
}

function install(version = '0.2.0') {
  const dir = mkdtempSync(path.join(work, 'install-'));
  mkdirSync(path.join(dir, 'app'));
  mkdirSync(path.join(dir, 'runtime'));
  writeFileSync(path.join(dir, 'app', 'package.json'), JSON.stringify({ version }));
  writeFileSync(path.join(dir, 'runtime', 'node.exe'), 'old node');
  return dir;
}

const installedVersion = dir => JSON.parse(readFileSync(path.join(dir, 'app', 'package.json'), 'utf8')).version;
const run = (dir, extra = {}) => applyUpdate({ installDir: dir, baseUrl, nodeVersion: 'v1.0.0', ...extra });

before(async () => {
  server = createServer((req, res) => {
    const body = files.get(req.url);
    res.statusCode = body ? 200 : 404;
    res.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(work, { recursive: true, force: true });
});

test('isNewer compares versions as numbers', () => {
  assert.equal(isNewer('0.10.0', '0.9.0'), true);
  assert.equal(isNewer('0.2.0', '0.2.0'), false);
  assert.equal(isNewer('0.1.9', '0.2.0'), false);
});

test('a newer release replaces the app and keeps the old one until cleanup', async () => {
  const dir = install();
  publish({});
  const update = await run(dir);
  assert.deepEqual(update.swapped, [path.join(dir, 'app')]);
  assert.equal(installedVersion(dir), '0.3.0');
  assert.equal(existsSync(path.join(dir, 'app.old')), true);
  assert.equal(existsSync(path.join(dir, 'update.tmp')), false);
  cleanUpUpdate(dir);
  assert.equal(existsSync(path.join(dir, 'app.old')), false);
});

test('the same version changes nothing', async () => {
  const dir = install('0.3.0');
  publish({});
  assert.equal(await run(dir), null);
  assert.equal(existsSync(path.join(dir, 'app.old')), false);
});

test('an older release is never installed', async () => {
  const dir = install('0.4.0');
  publish({});
  assert.equal(await run(dir), null);
  assert.equal(installedVersion(dir), '0.4.0');
});

test('a package with the wrong checksum is refused', async () => {
  const dir = install();
  publish({ declaredSha: 'ab'.repeat(32) });
  assert.equal(await run(dir), null);
  assert.equal(installedVersion(dir), '0.2.0');
  assert.equal(existsSync(path.join(dir, 'update.tmp')), false);
});

test('a package whose contents do not match latest.json is refused', async () => {
  const dir = install();
  publish({ version: '0.3.0', zip: appZip('mislabelled', '0.2.5') });
  assert.equal(await run(dir), null);
  assert.equal(installedVersion(dir), '0.2.0');
});

test('an unreachable server leaves the app alone', async () => {
  const dir = install();
  assert.equal(await run(dir, { baseUrl: 'http://127.0.0.1:9' }), null);
  assert.equal(installedVersion(dir), '0.2.0');
});

test('a missing package leaves the app alone', async () => {
  const dir = install();
  publish({});
  files.delete('/app.zip');
  assert.equal(await run(dir), null);
  assert.equal(installedVersion(dir), '0.2.0');
});

function nodeRelease(reports) {
  const zip = zipOf(`node-${reports}`, dir => {
    mkdirSync(path.join(dir, 'pkg'));
    const exe = path.join(dir, 'pkg', 'node.exe');
    writeFileSync(exe, `#!/bin/sh\necho ${reports}\n`);
    chmodSync(exe, 0o755);
  });
  files.set('/node.zip', zip);
  return { version: 'v2.0.0', url: `${baseUrl}/node.zip`, entry: './pkg/node.exe', sha256: sha256(zip) };
}

test('a new Node version is swapped in with the app, and rollback restores both', { skip: process.platform === 'win32' }, async () => {
  const dir = install();
  publish({ node: nodeRelease('v2.0.0') });
  const update = await run(dir);
  assert.equal(update.swapped.length, 2);
  assert.match(readFileSync(path.join(dir, 'runtime', 'node.exe'), 'utf8'), /v2\.0\.0/);
  assert.equal(installedVersion(dir), '0.3.0');

  rollBackUpdate(update);
  assert.equal(readFileSync(path.join(dir, 'runtime', 'node.exe'), 'utf8'), 'old node');
  assert.equal(installedVersion(dir), '0.2.0');
  assert.equal(existsSync(path.join(dir, 'app.old')), false);
});

test('a Node binary reporting the wrong version stops the whole update', { skip: process.platform === 'win32' }, async () => {
  const dir = install();
  publish({ node: nodeRelease('v9.9.9') });
  assert.equal(await run(dir), null);
  assert.equal(installedVersion(dir), '0.2.0');
  assert.equal(readFileSync(path.join(dir, 'runtime', 'node.exe'), 'utf8'), 'old node');
});
