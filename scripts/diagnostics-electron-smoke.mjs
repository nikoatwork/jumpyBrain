// Disposable production Electron/window + gateway diagnostics, no personal data.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { initializeMemoryRoot } from '../dist/runtime/index.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-diagnostics-electron-')));
let gateway;
try {
  const directory = path.join(temporary, 'support'), root = path.join(temporary, 'brain');
  const received = path.join(temporary, 'received.json');
  await mkdir(directory, { mode: 0o700 }); await initializeMemoryRoot(root);
  const key = 'c'.repeat(64);
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: root, controlKey: key, port: 0,
    feedbackSender: async report => { await writeFile(received, JSON.stringify(report), { mode: 0o600 }); },
    credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null } });
  const config = path.join(temporary, 'fixture.json'), result = path.join(temporary, 'result.json');
  await writeFile(config, JSON.stringify({ runtimeRoot: repo, origin: gateway.url, key, userData: path.join(temporary, 'electron'), result, received }), { mode: 0o600 });
  const entry = path.join(temporary, 'entry'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'diagnostic-fixture', type: 'module', main: path.join(repo, 'scripts/fixtures/diagnostics-electron.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_DIAGNOSTICS_FIXTURE: config }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  // Chromium crash output can contain URLs; never echo it or bootstrap keys.
  child.stdout.resume(); child.stderr.resume();
  const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
  const code = await new Promise((resolve) => child.once('exit', resolve)); clearTimeout(timer);
  const packet = JSON.parse(await readFile(result, 'utf8').catch(() => '{"ok":false,"stage":"process_timeout"}'));
  assert.equal(code, 0, `Diagnostic Electron smoke failed at ${packet.stage}: ${packet.error ?? ''}`); assert.equal(packet.ok, true, packet.stage);
  console.log('Diagnostic Electron smoke: PASS (prior-session evidence, actual renderer crash/reload, exception categories, safe host/browser attachment, opt-out/cancellation, frozen report)');
} finally { await gateway?.close(); await rm(temporary, { recursive: true, force: true }); }
