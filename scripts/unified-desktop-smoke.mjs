// Production desktop lifecycle + signed internal native host, disposable data only.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { mkdtemp, realpath, mkdir, cp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServerMemoryRuntime } from '../dist/server/index.js';
const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const built = path.join(repo, '.local-pack/desktop/jumpyBrain.app/Contents/Resources');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-unified-smoke-')));
let child;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  const resources = path.join(temporary, 'Resources'); await mkdir(path.join(resources, 'native'), { recursive: true });
  await cp(path.join(built, 'native/jumpyBrain Host.app'), path.join(resources, 'native/jumpyBrain Host.app'), { recursive: true, verbatimSymlinks: true });
  await cp(path.join(built, 'MenuBarBrain.png'), path.join(resources, 'MenuBarBrain.png'));
  await symlink(path.join(built, 'runtime'), path.join(resources, 'runtime'));
  const nativeConfigFile = path.join(resources, 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  const nativeConfig = JSON.parse(await readFile(nativeConfigFile, 'utf8'));
  const support = path.join(temporary, 'support'); await mkdir(support, { mode: 0o700 });
  const root = path.join(temporary, 'memory'); await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  await writeFile(path.join(support, 'api-key'), randomBytes(32).toString('hex'), { mode: 0o600 });
  const socket = net.createServer(); await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve));
  await writeFile(nativeConfigFile, JSON.stringify({ ...nativeConfig, supportDirectory: support, memoryRoot: root, port }));
  execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', path.join(resources, 'native/jumpyBrain Host.app')], { stdio: 'pipe' });
  await writeFile(path.join(resources, 'desktop.json'), JSON.stringify({ schema: 1, supportDirectory: support, port, launchAgent: path.join(temporary, 'login.plist') }));
  const userData = path.join(temporary, 'user-data'); await mkdir(userData);
  await writeFile(path.join(userData, 'desktop-setup.json'), '{"version":1}');
  const result = path.join(temporary, 'result.json'); const configFile = path.join(temporary, 'fixture.json');
  const entry = path.join(temporary, 'app'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-unified-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-unified-app.mjs') }));
  for (const mode of ['normal', 'crash', 'recovery']) {
    await writeFile(configFile, JSON.stringify({ resources, userData, result, mode }));
    const env = { ...process.env, JUMPYBRAIN_UNIFIED_SMOKE: configFile }; delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    // Raw Electron failures can include bootstrap URLs. Keep stderr private.
    let stderr = ''; child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-10000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 75000);
    const code = await new Promise((resolve) => child.once('exit', resolve)); clearTimeout(timer);
    const report = JSON.parse(await readFile(result, 'utf8'));
    assert.equal(report.ok, true, report.error); assert.equal(report.mode, mode);
    if (mode !== 'crash') assert.equal(code, 0);
    const deadline = Date.now() + 16000;
    let stopped = false;
    while (Date.now() < deadline) {
      try { await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) }); }
      catch { stopped = true; break; }
      await pause(100);
    }
    assert.ok(stopped, 'owned gateway must stop after quit or parent crash');
    await pause(700); // Parent watchdog releases the native lock after gateway shutdown.
    console.log(`Unified desktop ${mode}: PASS`);
  }
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  await pause(1500);
  await rm(temporary, { recursive: true, force: true });
}
