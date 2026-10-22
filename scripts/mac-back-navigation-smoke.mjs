// Production Electron window/gateway, disposable Markdown, no installed app changes.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime } from '../dist/server/index.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
const args = process.argv.slice(2);
assert.ok(!args.length || (args.length === 2 && args[0] === '--baseline-window'), 'Usage: node scripts/mac-back-navigation-smoke.mjs [--baseline-window path]');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-back-')));
let gateway, child, sampling;
try {
  const root = path.join(temporary, 'memory');
  await createServerMemoryRuntime({ root }).initializeMemoryRoot();
  const ids = ['1', '2', '3'].map(n => `mem_a0000000-0000-4000-8000-00000000000${n}`);
  for (const [index, id] of ids.entries()) await writeFile(path.join(root, `notes/fixture-${index}.md`),
    `---\nid: ${id}\ntype: note\ntitle: Fixture ${index}\n---\n\nBody ${index}.\n`);
  const directory = path.join(temporary, 'support');
  await mkdir(directory, { mode: 0o700 });
  const key = randomBytes(32).toString('hex');
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: root, port: 0, controlKey: key,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {}, selectFolder: async () => null },
  });
  const otherRoot = path.join(temporary, 'other-memory');
  await createServerMemoryRuntime({ root: otherRoot }).initializeMemoryRoot();
  await gateway.store.save({ kind: 'local', name: 'Other fixture', root: otherRoot }, gateway.store.snapshot().revision);
  const otherId = gateway.store.snapshot().profiles.find(profile => profile.root === otherRoot).id;
  const config = { origin: gateway.url, key, ids, userData: path.join(temporary, 'electron'), result: path.join(temporary, 'result.json'),
    otherId, baseline: !!args.length, windowModule: args.length ? pathToFileURL(path.resolve(args[1])).href : null };
  const fixture = path.join(temporary, 'fixture.json');
  await writeFile(fixture, JSON.stringify(config), { mode: 0o600 });
  const entry = path.join(temporary, 'app');
  await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-back-smoke', type: 'module', main: path.join(repo, 'integrations/electron/smoke-back-navigation.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_BACK_FIXTURE: fixture };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const gatewaySamples = [];
  sampling = setInterval(() => gatewaySamples.push({ time: Date.now(), rssKiB: Math.round(process.memoryUsage().rss / 1024) }), 100);
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output += chunk; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 120000);
  const code = await new Promise(resolve => child.once('exit', resolve));
  clearTimeout(timeout);
  clearInterval(sampling);
  assert.equal(code, 0, output.split(key).join('[redacted]'));
  const result = JSON.parse(await readFile(config.result, 'utf8'));
  assert.equal(result.ok, true, result.error);
  for (const sample of [result.warm, result.repeated]) {
    sample.gatewayRssKiB = gatewaySamples.reduce((closest, next) => Math.abs(next.time - sample.time) < Math.abs(closest.time - sample.time) ? next : closest).rssKiB;
  }
  assert.match(await readFile(path.join(root, 'notes/fixture-0.md'), 'utf8'), config.baseline ? /Body 0/ : /Back draft/);
  const deadline = Date.now() + 5000;
  while (gateway.coordinator.tabs.size && Date.now() < deadline) await new Promise(r => setTimeout(r, 40));
  assert.equal(gateway.coordinator.tabs.size, 0);
  console.log(JSON.stringify({ ...result, tabCleanup: true }));
} finally {
  clearInterval(sampling);
  if (child?.exitCode === null) child.kill('SIGKILL');
  await gateway?.close();
  await rm(temporary, { recursive: true, force: true });
}
