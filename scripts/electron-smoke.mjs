// Production Electron window + production gateway, disposable local memory only.
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
const electronRequire = createRequire(new URL('../integrations/electron/package.json', import.meta.url));
const electron = electronRequire('electron');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-electron-smoke-')));
const root = path.join(temporary, 'memory');
const support = path.join(temporary, 'support');
let gateway;
const feedbackReports = [];
try {
  await mkdir(support, { mode: 0o700 });
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const id = 'mem_a0000000-0000-4000-8000-000000000001';
  const note = path.join(root, 'notes/electron-fixture.md');
  await writeFile(note, `---\nid: ${id}\ntype: note\ntitle: Electron fixture\ncreated_at: 2026-10-16T10:00:00.000Z\n---\n\n# Desktop fixture\n\nOriginal fixture body.\n`);
  const controlKey = randomBytes(32).toString('hex');
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support,
    initialRoot: root, port: 0, controlKey,
    feedbackSender: async report => { feedbackReports.push(report); },
    credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null },
  });
  const setupRoot = path.join(temporary, 'Chosen local brain');
  await mkdir(setupRoot);
  const invalidRoot = path.join(temporary, 'Unrelated files');
  await mkdir(invalidRoot); await writeFile(path.join(invalidRoot, 'keep.txt'), 'Untouched');
  const screenshot = path.join(repo, '.local-pack/desktop/welcome.png');
  await mkdir(path.dirname(screenshot), { recursive: true });
  const configPath = path.join(temporary, 'fixture.json');
  await writeFile(configPath, JSON.stringify({ origin: gateway.url, key: controlKey, id, runtimeRoot: repo, setupRoot, invalidRoot, screenshot, runtimeRoot: repo,
    userData: path.join(temporary, 'electron'), result: path.join(temporary, 'result.json') }), { mode: 0o600 });
  const env = { ...process.env, JUMPYBRAIN_ELECTRON_SMOKE_FIXTURE: configPath };
  delete env.ELECTRON_RUN_AS_NODE;
  const entry = path.join(temporary, 'smoke-app');
  await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-electron-smoke',
    type: 'module', main: path.join(repo, 'integrations/electron/smoke-app.mjs') }));
  const child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk.toString().split(controlKey).join('[redacted]')); });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 90000);
  const code = await new Promise((resolve) => child.on('exit', resolve));
  clearTimeout(timer);
  // Never echo raw Chromium load errors, which can include the bootstrap token.
  output = output.split(controlKey).join('[redacted]');
  assert.equal(code, 0, output);
  const result = JSON.parse(await readFile(path.join(temporary, 'result.json'), 'utf8'));
  assert.equal(result.ok, true, result.error);
  assert.equal(feedbackReports.length, 1);
  assert.equal(feedbackReports[0].message, 'Electron feedback');
  assert.ok(JSON.parse(feedbackReports[0].diagnostics).events);
  assert.ok(!JSON.stringify(feedbackReports).includes(controlKey));
  assert.match(await readFile(note, 'utf8'), /Saved from Electron/);
  const deadline = Date.now() + 5000;
  while (gateway.coordinator.tabs.size && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(gateway.coordinator.tabs.size, 0, 'closed Electron window must unregister');
  console.log(`Electron smoke: PASS (${result.checks.join(', ')}, tab cleanup, canonical fixture save)`);
} finally {
  await gateway?.close();
  await rm(temporary, { recursive: true, force: true });
}
