// Disposable production gateway and the actual sandboxed Electron window.
// Verifies the one permitted subframe (the drawing editor) and native drawing input.
// Run after `npm run build`: node scripts/drawings-electron-smoke.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime } from '../dist/server/index.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-drawings-electron-')));
const root = path.join(temporary, 'memory'), support = path.join(temporary, 'support');
let gateway;
try {
  await mkdir(support, { mode: 0o700 });
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const controlKey = randomBytes(32).toString('hex');
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: root, port: 0, controlKey,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null } });
  const fixture = path.join(temporary, 'fixture.json'), result = path.join(temporary, 'result.json');
  await writeFile(fixture, JSON.stringify({ origin: gateway.url, key: controlKey, result, userData: path.join(temporary, 'electron'),
    screenshot: process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR ? path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR, 'drawing-electron.png') : null }), { mode: 0o600 });
  const entry = path.join(temporary, 'app'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-drawings-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-drawings.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_DRAWINGS_FIXTURE: fixture }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', () => {});
  const timeout = setTimeout(() => child.kill('SIGKILL'), 60000);
  const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timeout);
  const report = JSON.parse(await readFile(result, 'utf8').catch(() => '{"ok":false,"error":"The Electron fixture wrote no result."}'));
  if (!report.ok) console.error('Electron drawing fixture: ' + report.error);
  assert.equal(report.ok, true, report.error);
  assert.equal(code, 0, report.error);
  const stored = JSON.parse(await readFile(path.join(root, 'drawings', 'Untitled drawing.excalidraw'), 'utf8'));
  assert.equal(stored.type, 'excalidraw');
  assert.equal(stored.elements.filter(item => item.type === 'rectangle').length, 1, 'the native window saved the drawn shape into the local brain');
  process.stdout.write(output.split(controlKey).join('[redacted]'));
} finally { await gateway?.close(); await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
