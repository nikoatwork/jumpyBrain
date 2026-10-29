// Disposable gateway, credentials, folders and Electron profile; no installed app changes.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await realpath(await mkdtemp('/tmp/jb-simple-setup-'));
const screenshots = path.join(repo, '.local-pack/simple-onboarding');
await mkdir(screenshots, { recursive: true });
const key = randomBytes(32).toString('hex'), credentials = new Map(), requests = [];
const remote = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url });
  res.writeHead(req.headers.authorization === 'Bearer fictional-access-key' ? 200 : 401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ memory: 'all' }));
});
await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve));
let gateway;
try {
  const support = path.join(temporary, 'support'); await mkdir(support, { mode: 0o700 });
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, port: 0, controlKey: key,
    credentials: { get: async ref => credentials.get(ref), set: async (ref, value) => credentials.set(ref, value), delete: async ref => credentials.delete(ref) } });
  const fixture = { origin: gateway.url, key, runtimeRoot: repo, home: path.join(temporary, 'home'), screenshots,
    remoteUrl: `http://127.0.0.1:${remote.address().port}`, result: path.join(temporary, 'result.json'), userData: path.join(temporary, 'electron') };
  const configPath = path.join(temporary, 'fixture.json'); await writeFile(configPath, JSON.stringify(fixture), { mode: 0o600 });
  const entry = path.join(temporary, 'entry'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'simple-onboarding-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-simple-onboarding.mjs') }));
  const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
  const env = { ...process.env, JUMPYBRAIN_SIMPLE_ONBOARDING: configPath }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); }); child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timer);
  assert.equal(code, 0, output.split(key).join('[redacted]'));
  assert.equal(JSON.parse(await readFile(fixture.result, 'utf8')).ok, true);
  assert.ok(requests.length > 0); assert.ok(requests.every(req => req.method === 'GET' && req.url === '/memories/all/status'));
  console.log('Simple onboarding PASS: default creation, existing reuse, remote retry, read-only connection, credential isolation, keyboard, light/dark wide/narrow. Screenshots: ' + screenshots);
} finally {
  await gateway?.close(); await new Promise(resolve => remote.close(resolve)); await rm(temporary, { recursive: true, force: true });
}
