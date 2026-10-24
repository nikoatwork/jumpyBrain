// Production Electron/gateway on disposable lexical brains. No live installation.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createExtensionsFixture } from './extensions-fixture.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const fixture = await createExtensionsFixture();
const output = path.resolve('.local-pack/extensions-qa/desktop'); await mkdir(output, { recursive: true });
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
let child, monitor, timeout;
const samples = [];
try {
  for (const item of fixture.packages) {
    const response = await fetch(fixture.url + '/companion/extensions/manage', { method: 'POST', headers: { Authorization: 'Bearer ' + fixture.key, 'Content-Type': 'application/json', 'X-Companion-Generation': String(fixture.gateway.coordinator.generation) }, body: JSON.stringify({ action: 'disable', id: item.id }) });
    assert.equal(response.status, 200);
  }
  const config = { url: fixture.url, key: fixture.key, ids: fixture.ids, packageIds: fixture.packages.map(p => p.id), userData: path.join(fixture.temporary, 'electron'), result: path.join(output, 'result.json') };
  const configFile = path.join(fixture.temporary, 'desktop-fixture.json'); await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  const entry = path.join(fixture.temporary, 'app'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-extension-qa', type: 'module', main: path.join(repo, 'integrations/electron/smoke-extensions.mjs') }));
  if (process.platform === 'darwin') {
    const sampler = path.join(output, 'sample-tree');
    execFileSync('clang', ['-O2', path.join(repo, 'deep-dives/desktop-ram/sample-tree.c'), '-o', sampler]);
    monitor = spawn(sampler, [String(process.pid), '150'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    monitor.stdout.on('data', chunk => { buffer += chunk; let newline; while ((newline = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); if (line) samples.push(JSON.parse(line)); } });
  }
  const env = { ...process.env, JUMPYBRAIN_EXTENSIONS_FIXTURE: configFile }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs += chunk; process.stderr.write(chunk.toString().split(fixture.key).join('[fixture-key]')); });
  timeout = setTimeout(() => child.kill('SIGKILL'), 90000);
  const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timeout);
  assert.equal(code, 0, logs.split(fixture.key).join('[fixture-key]'));
  const result = JSON.parse(await readFile(config.result, 'utf8')); assert.equal(result.ok, true, result.error);
  if (monitor) {
    monitor.kill('SIGTERM'); await new Promise(resolve => monitor.once('exit', resolve));
    await writeFile(path.join(output, 'samples.jsonl'), samples.map(s => JSON.stringify(s)).join('\n') + '\n');
    for (const name of ['baseline', 'warm', 'repeated', 'disabled']) {
      const closest = samples.filter(s => s.complete).reduce((best, next) => !best || Math.abs(next.timeMs - result[name].time) < Math.abs(best.timeMs - result[name].time) ? next : best, null);
      assert.ok(closest, 'complete process sample is available');
      const processes = closest.processes.filter(p => p.pid !== monitor.pid && !p.error);
      result[name].processTree = { physicalBytes: processes.reduce((sum, p) => sum + p.physical, 0), rssBytes: processes.reduce((sum, p) => sum + p.rss, 0), processes: processes.map(p => ({ name: p.name, physical: p.physical, rss: p.rss })) };
    }
    result.samplingScope = 'Harness Node process (gateway + real engine), Electron and its descendants. Sampler process excluded. Full native Swift helper/tray/login/updater not instantiated; directional same-workload comparison only.';
  }
  await writeFile(config.result, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally { clearTimeout(timeout); if (child?.exitCode === null) child.kill('SIGKILL'); if (monitor?.exitCode === null) monitor.kill('SIGTERM'); await fixture.close(); }
