// Real production gateway, Markdown engines and sandboxed Mac window. Disposable data only.
// npm run build && node scripts/connection-usability-smoke.mjs [--inspect]
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from '../dist/server/index.js';
const repo = fileURLToPath(new URL('..', import.meta.url));
const electron = createRequire(new URL('../integrations/electron/package.json', import.meta.url))('electron');
assert.ok(!process.argv[2] || process.argv[2] === '--inspect');
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-connection-flow-')));
let gateway, remote, child;
try {
  const roots = {};
  const id = 'mem_b0000000-0000-4000-8000-000000000001';
  for (const name of ['Personal', 'Work', 'Remote']) {
    roots[name] = path.join(temporary, name);
    await createServerMemoryRuntime({ root: roots[name] }).initializeMemoryRoot();
    await writeFile(path.join(roots[name], 'notes', 'fixture.md'), `---\nid: ${id}\ntitle: ${name} fixture\ntype: note\n---\n\nOnly in ${name}.\n`);
  }
  const keys = new Map();
  const key = randomBytes(32).toString('hex'), remoteKey = randomBytes(32).toString('hex');
  remote = await startJumpyBrainHttpServer({ root: roots.Remote, apiKeys: [remoteKey], host: '127.0.0.1', port: 0, autoIndex: false });
  const directory = path.join(temporary, 'support'); await mkdir(directory, { mode: 0o700 });
  gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: roots.Personal, port: 0, controlKey: key,
    credentials: { get: async ref => keys.get(ref) ?? null, set: async (ref, value) => { keys.set(ref, value); }, delete: async ref => { keys.delete(ref); }, selectFolder: async () => roots.Work },
  });
  const screenshots = process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR || '/tmp/jumpybrain-connection-flow-qa';
  await mkdir(screenshots, { recursive: true });
  const config = { origin: gateway.url, key, roots, id, remote: remote.url, remoteKey, userData: path.join(temporary, 'electron'),
    result: path.join(temporary, 'result.json'), screenshots, gate: process.argv[2] ? path.join(temporary, 'continue') : null };
  const fixture = path.join(temporary, 'fixture.json'); await writeFile(fixture, JSON.stringify(config), { mode: 0o600 });
  const entry = path.join(temporary, 'app'); await mkdir(entry);
  await writeFile(path.join(entry, 'package.json'), JSON.stringify({ name: 'jumpybrain-connection-flow', main: path.join(repo, 'integrations/electron/smoke-connections.mjs') }));
  const env = { ...process.env, JUMPYBRAIN_CONNECTION_FIXTURE: fixture }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [entry], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data; if (data.toString().includes('Connection flow:')) process.stdout.write(data.toString().split(key).join('[redacted]').split(remoteKey).join('[redacted]')); });
  const timeout = setTimeout(() => child.kill('SIGKILL'), config.gate ? 900000 : 180000);
  const code = await new Promise(resolve => child.once('exit', resolve)); clearTimeout(timeout);
  assert.equal(code, 0, output.split(key).join('[redacted]').split(remoteKey).join('[redacted]'));
  const result = JSON.parse(await readFile(config.result, 'utf8')); assert.equal(result.ok, true, result.error);
  assert.equal(gateway.state().profiles.length, 1); assert.equal(gateway.state().active.root, roots.Personal);
  assert.equal(keys.size, 0, 'removed remote credentials are cleaned up');
  for (const [name, root] of Object.entries(roots)) assert.match(await readFile(path.join(root, 'notes/fixture.md'), 'utf8'), new RegExp('Only in ' + name));
  assert.match(await readFile(path.join(roots.Work, 'notes/fixture.md'), 'utf8'), /Saved before switching/);
  console.log('Connection flow: PASS (' + result.checks.join('; ') + '). Screenshots: ' + screenshots);
} finally {
  if (child?.exitCode === null) child.kill('SIGKILL');
  await gateway?.close(); await remote?.close(); await rm(temporary, { recursive: true, force: true });
}
