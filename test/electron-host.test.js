import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, chmod, symlink, link, rm } from 'node:fs/promises';
import { readControlKey, probeCompanion, isAppNavigation } from '../integrations/electron/host.mjs';

const key = 'a'.repeat(64);
async function fixture(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-electron-host-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const appPath = path.join(home, 'Applications/jumpyBrain.app');
  const resources = path.join(appPath, 'Contents/Resources');
  const supportDirectory = path.join(home, 'support');
  const runtimeRoot = path.join(home, 'runtime');
  await mkdir(resources, { recursive: true });
  await mkdir(supportDirectory, { mode: 0o700 });
  await mkdir(path.join(runtimeRoot, 'dist'), { recursive: true });
  await writeFile(path.join(runtimeRoot, 'dist/cli.js'), '');
  await writeFile(path.join(supportDirectory, 'api-key'), key + '\n', { mode: 0o600 });
  const config = { port: 3787, runtimeRoot, supportDirectory };
  const save = () => writeFile(path.join(resources, 'Configuration.json'), JSON.stringify(config));
  await save();
  return { home, appPath, supportDirectory, runtimeRoot, config, save };
}

test('refuses unsafe control capabilities and support directories', async (t) => {
  const f = await fixture(t);
  const file = path.join(f.supportDirectory, 'api-key');
  await chmod(file, 0o644);
  await assert.rejects(readControlKey(f.supportDirectory), /private/);
  await chmod(file, 0o600); await writeFile(file, 'invalid');
  await assert.rejects(readControlKey(f.supportDirectory), /invalid/);
  await writeFile(file, key); await link(file, path.join(f.home, 'hardlink'));
  await assert.rejects(readControlKey(f.supportDirectory), /single-link/);
  await rm(path.join(f.home, 'hardlink')); await rm(file);
  await writeFile(path.join(f.home, 'secret'), key, { mode: 0o600 });
  await symlink(path.join(f.home, 'secret'), file);
  await assert.rejects(readControlKey(f.supportDirectory));
  await chmod(f.supportDirectory, 0o755);
  await assert.rejects(readControlKey(f.supportDirectory), /private/);
});

test('navigation permits only same-origin shell routes', () => {
  const origin = 'http://127.0.0.1:3787';
  for (const route of ['/', '/graph', '/settings', '/?brain=id&note=mem_id']) assert.equal(isAppNavigation(origin + route, origin), true);
  for (const value of ['https://example.com', 'http://localhost:3787/', 'http://127.0.0.1:3788/',
    origin + '/companion/state', 'javascript:alert(1)', 'file:///etc/passwd', 'http://user@127.0.0.1:3787/']) {
    assert.equal(isAppNavigation(value, origin), false, value);
  }
});

test('authenticates gateway state and rejects foreign services, redirects, and oversized responses', async (t) => {
  let mode = 'ok';
  const server = http.createServer((request, response) => {
    assert.equal(request.url, '/companion/state');
    assert.equal(request.headers.authorization, 'Bearer ' + key);
    if (mode === 'redirect') { response.writeHead(302, { Location: 'https://example.com' }); response.end(); }
    else if (mode === 'huge') response.end('x'.repeat(140000));
    else response.end(JSON.stringify(mode === 'ok' ? { generation: 3, profiles: [], health: 'offline' } : { ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await probeCompanion(origin, key);
  for (mode of ['foreign', 'redirect', 'huge']) await assert.rejects(probeCompanion(origin, key));
});
