import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-updates-smoke-')));
let gateway;
try {
  const support = path.join(temporary, 'support'), root = path.join(temporary, 'memory');
  await mkdir(support, { mode: 0o700 }); await initializeMemoryRoot(root);
  const key = randomBytes(32).toString('hex');
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: root, port: 0, controlKey: key,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null } });
  const screenshot = path.join(repo, '.local-pack/sidebar-update.png'); await mkdir(path.dirname(screenshot), { recursive: true });
  const result = path.join(temporary, 'result.json'), fixture = path.join(temporary, 'fixture.json');
  await writeFile(fixture, JSON.stringify({ origin: gateway.url, key, screenshot, result, userData: path.join(temporary, 'electron') }), { mode: 0o600 });
  const entry = path.join(temporary, 'app'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-updates-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-updates.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_ELECTRON_SMOKE_FIXTURE: fixture }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; process.stdout.write(data.toString().split(key).join('[redacted]')); });
  child.stderr.on('data', (data) => { output += data; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }); clearTimeout(timer);
  const outcome = JSON.parse(await readFile(result, 'utf8').catch(() => { throw new Error('Electron did not finish: ' + output.split(key).join('[redacted]')); })); assert.equal(outcome.ok, true, outcome.error); assert.equal(code, 0);
  console.log('Desktop updates smoke: PASS (sandbox bridge, placement, light/dark, install/retry, restart, reload, narrow layout, browser isolation)');
  console.log(screenshot);
} finally { await gateway?.close(); await rm(temporary, { recursive: true, force: true }); }
