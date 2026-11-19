import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, symlink, chmod, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from '../dist/cli/args.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { createServerMemoryRuntime, startJumpyBrainHttpServer } from '../dist/server/index.js';
import { createEnvFileCredentials } from '../dist/adapters/credentials/env-file.js';
const exec = promisify(execFile), repo = path.resolve('.'), key = 'e'.repeat(64);
async function fixture(t) {
  const temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-cli-connections-')));
  const support = path.join(temp, 'support'); await mkdir(support, { mode: 0o700 });
  const roots = [path.join(temp, 'one'), path.join(temp, 'two spaces')];
  for (const root of roots) {
    await createServerMemoryRuntime({ root }).initializeMemoryRoot();
    await writeFile(path.join(root, 'notes/fixture.md'), '# Disposable fixture\n');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(JUMPYBRAIN_|QMD_|XDG_)/.test(name)));
  env.HOME = temp; env.JUMPYBRAIN_MEMORY_ROOT = roots[0];
  const cli = (args) => exec(process.execPath, [path.join(repo, 'dist/cli.js'), ...args], { cwd: temp, env, timeout: 10000 });
  const run = (...args) => cli(['connections', ...args, '--directory', support, '--json']).then(r => JSON.parse(r.stdout));
  let gateway;
  const keys = new Map();
  const start = async (empty = false, credentials = { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) }) => {
    gateway = await startCompanionGateway({ runtimeRoot: repo, directory: support, initialRoot: empty ? undefined : roots[0], port: 0, controlKey: key, credentials,
      identityFile: path.join(temp, 'identity.json'), switchTimeoutMs: 2000, localFactory: async () => ({ url: 'http://127.0.0.1:1', close: async () => {} }) });
    await writeFile(path.join(support, 'api-key'), key, { mode: 0o600 });
    return gateway;
  };
  t.after(async () => { await gateway?.close(); await rm(temp, { recursive: true, force: true }); });
  const native = (route, body) => fetch(gateway.url + route, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { temp, roots, support, cli, run, start, native, env };
}
async function pending(gateway) {
  for (let n = 0; n < 200; n++) {
    if (gateway.coordinator.pending) return gateway.coordinator.pending.id;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('CLI did not enter save barrier');
}

test('connections strict flags and help are operation-free with no companion', async t => {
  const f = await fixture(t);
  for (const argv of [[], ['other'], ['list', '--root', '/x'], ['add', '--name', 'x'], ['remove', '--id', 'x', '--revision=-1'], ['select', '--id', 'x', '--revision=9007199254740992'], ['list', '--json=false'], ['list', '--directory', 'a', '--directory', 'b'], ['add', '--name=x', '--root=/x', '--revision=0', '--target-url=https://x']]) {
    assert.throws(() => parseArgs(['connections', ...argv]));
  }
  const before = await readdir(f.support);
  for (const command of ['list', 'add', 'remove', 'select']) assert.match((await f.cli(['connections', command, '--directory', '--help'])).stdout, /Usage: jumpybrain connections/);
  await assert.rejects(f.run('list'), e => /No running companion.*CLI-only/.test(e.stderr));
  assert.deepEqual(await readdir(f.support), before);
});

test('real companion CLI registration, revision fencing, app selection and CLI isolation preserve notes', async t => {
  const f = await fixture(t), gateway = await f.start();
  const before = await Promise.all(f.roots.map(root => readFile(path.join(root, 'notes/fixture.md'), 'utf8')));
  let state = await f.run('list');
  assert.equal(state.revision, 0); const original = state.activeId;
  state = await f.run('add', '--name', 'Second brain', '--root', f.roots[1], '--revision=0');
  assert.equal(state.activeId, original); assert.equal(state.revision, 1);
  const added = state.profiles.find(p => p.id !== original).id;
  assert.equal(state.profiles.length, 2);
  await assert.rejects(f.run('select', '--id', added, '--revision=0'), e => /fresh|connections list/.test(e.stderr));
  assert.equal(gateway.coordinator.pending, null); assert.equal(gateway.state().activeId, original);
  await assert.rejects(f.run('add', '--name', 'Duplicate', '--root', f.roots[1], '--revision=1'), e => /canonical destination/.test(e.stderr));
  const alias = path.join(f.temp, 'alias'); await symlink(f.roots[1], alias);
  await assert.rejects(f.run('add', '--name', 'Alias', '--root', alias, '--revision=1'), e => /canonical destination/.test(e.stderr));
  const unsafe = path.join(f.temp, 'unsafe'); await mkdir(unsafe); await symlink(path.join(f.roots[1], 'jumpybrain.json'), path.join(unsafe, 'jumpybrain.json'));
  for (const root of [unsafe, path.join(f.temp, 'missing')]) await assert.rejects(f.run('add', '--name', 'Unsafe', '--root', root, '--revision=1'), e => /never initializes/.test(e.stderr));
  state = await f.run('select', '--id', added, '--revision=1');
  assert.equal(state.activeId, added); assert.equal(state.revision, 2);
  const status = JSON.parse((await f.cli(['status', '--json'])).stdout);
  assert.equal(status.root, f.roots[0]); assert.equal(status.target.source, 'environment');
  const recipe = JSON.parse((await f.cli(['run', 'memory:status', '--json'])).stdout);
  assert.deepEqual(recipe, status);
  await assert.rejects(f.run('remove', '--id', added, '--revision=2'), e => /Switch away/.test(e.stderr));
  state = await f.run('remove', '--id', original, '--revision=2');
  assert.equal(state.profiles.length, 1); assert.equal(state.activeId, added);
  assert.deepEqual(await Promise.all(f.roots.map(root => readFile(path.join(root, 'notes/fixture.md'), 'utf8'))), before);
  assert.equal(JSON.stringify(state).includes('credentialRef'), false);
  await gateway.close();
  await assert.rejects(f.run('list'), e => /No running companion/.test(e.stderr));
});

test('CLI selection cannot bypass a registered dirty draft; explicit saved acknowledgement permits retry', async t => {
  const f = await fixture(t), gateway = await f.start();
  const state = await f.run('add', '--name', 'Other', '--root', f.roots[1], '--revision=0');
  const id = state.profiles.find(p => p.id !== state.activeId).id, generation = gateway.coordinator.generation;
  await f.native('/companion/register', { tabId: 'dirty-tab', generation });
  const rejected = assert.rejects(f.run('select', '--id', id, '--revision=1'), e => /save\/switch is blocked/.test(e.stderr));
  await f.native('/companion/ack', { tabId: 'dirty-tab', switchId: await pending(gateway), ok: false });
  await rejected;
  assert.equal(gateway.state().revision, 1); assert.equal(gateway.state().activeId, state.activeId);
  const selection = f.run('select', '--id', id, '--revision=1');
  await f.native('/companion/ack', { tabId: 'dirty-tab', switchId: await pending(gateway), ok: true });
  assert.equal((await selection).activeId, id);
  assert.ok(gateway.coordinator.generation > generation);
});

test('private control rejects browser credentials, unsafe files and unavailable live hosts without offline mutation', async t => {
  const f = await fixture(t), gateway = await f.start();
  const disk = await readFile(path.join(f.support, 'connections.json'), 'utf8');
  assert.equal((await fetch(gateway.url + '/companion/connections')).status, 401);
  assert.equal((await f.native('/companion/connections', { action: 'select', revision: 0, id: 'missing', extra: true })).status, 400);
  await chmod(path.join(f.support, 'api-key'), 0o644);
  await assert.rejects(f.run('list'), e => /Unsafe companion control/.test(e.stderr));
  await chmod(path.join(f.support, 'api-key'), 0o600);
  await writeFile(path.join(f.support, 'api-key'), 'f'.repeat(64));
  await assert.rejects(f.run('list'), e => /401/.test(e.stderr));
  assert.equal(await readFile(path.join(f.support, 'connections.json'), 'utf8'), disk);
  await gateway.close();
  await writeFile(path.join(f.support, 'extensions-control.json'), JSON.stringify({ version: 1, directory: f.support, origin: 'http://127.0.0.1:1', pid: process.pid }), { mode: 0o600 });
  await assert.rejects(f.run('add', '--name', 'Unavailable', '--root', f.roots[1], '--revision=0'));
  assert.equal(await readFile(path.join(f.support, 'connections.json'), 'utf8'), disk);
});


test('an empty companion uses the same save barrier for first registration; remote selection stays in Settings', async t => {
  const f = await fixture(t), gateway = await f.start(true);
  assert.equal((await f.run('list')).activeId, null);
  const generation = gateway.coordinator.generation;
  const added = await f.run('add', '--name', 'First', '--root', f.roots[0], '--revision=0');
  assert.equal(added.profiles.length, 1); assert.equal(added.activeId, added.profiles[0].id);
  assert.ok(gateway.coordinator.generation > generation);
  const state = await gateway.store.save({ name: 'Remote', kind: 'remote', url: 'https://example.invalid', key: 'fixture-private-secret' }, 1);
  const remote = state.profiles.find(p => p.kind === 'remote');
  const listed = JSON.stringify(await f.run('list'));
  assert.equal(listed.includes(remote.credentialRef), false); assert.equal(listed.includes('fixture-private-secret'), false);
  await assert.rejects(f.run('select', '--id', remote.id, '--revision=2'), e => /400/.test(e.stderr));
  assert.equal(gateway.store.snapshot().revision, 2);
  const session = await f.native('/companion/session', { token: key });
  const browser = await fetch(gateway.url + '/companion/connections', { headers: { Cookie: session.headers.get('set-cookie').split(';')[0], Origin: gateway.url } });
  assert.equal(browser.status, 403);
});

test('remote connections from the CLI: key from a variable or stdin, one stored copy, test, remove; deleted local folders are flagged', async t => {
  const f = await fixture(t);
  const envFile = path.join(f.temp, 'config', '.env');
  await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
  await writeFile(envFile, 'JUMPYBRAIN_API_KEY=team-key-fixture-0123456789\n', { mode: 0o600 });
  f.env.JUMPYBRAIN_ENV_FILE = envFile;
  const remoteRoot = path.join(f.temp, 'remote');
  await createServerMemoryRuntime({ root: remoteRoot }).initializeMemoryRoot();
  const server = await startJumpyBrainHttpServer({ root: remoteRoot, apiKeys: ['team-key-fixture-0123456789'], host: '127.0.0.1', port: 0, autoIndex: false });
  t.after(() => server.close());
  const gateway = await f.start(false, createEnvFileCredentials({ file: envFile }));
  const origin = new URL(server.url).origin;
  for (const argv of [['--name', 'x', '--url', origin, '--revision=0'], ['--name', 'x', '--url', origin, '--key-stdin', '--key-env', 'A', '--revision=0'], ['--name', 'x', '--root', '/x', '--url', origin, '--key-stdin', '--revision=0'], ['--name', 'x', '--root', '/x', '--allow-writes', '--revision=0'], ['--name', 'x', '--url', origin, '--key-env', 'not-a-name', '--revision=0'], ['--name', 'x', '--url', origin, '--key', 'secret', '--revision=0']]) {
    assert.throws(() => parseArgs(['connections', 'add', ...argv]));
  }
  await assert.rejects(f.run('add', '--name', 'Missing', '--url', origin, '--key-env', 'NOT_SET_ANYWHERE', '--revision=0'), e => /NOT_SET_ANYWHERE is not set/.test(e.stderr));
  assert.equal(gateway.store.snapshot().revision, 0);
  let state = await f.run('add', '--name', 'Team', '--url', origin, '--key-env', 'JUMPYBRAIN_API_KEY', '--revision=0');
  const team = state.profiles.find(p => p.kind === 'remote');
  assert.deepEqual([team.name, team.url, team.allowWrites], ['Team', origin, false]);
  assert.equal(JSON.stringify(state).includes('team-key-fixture'), false);
  const file = await readFile(envFile, 'utf8');
  assert.equal(file.match(/team-key-fixture-0123456789/g).length, 1, 'the key is referenced, not copied');
  assert.match(file, /^JUMPYBRAIN_KEYREF_[0-9A-F_]+=JUMPYBRAIN_API_KEY$/m);
  const tested = await f.run('test', '--id', team.id);
  assert.deepEqual([tested.id, tested.kind, tested.health], [team.id, 'remote', 'connected']);
  // The CLI's own target resolution follows the app connection's reference.
  const status = JSON.parse((await f.cli(['status', '--target-url', origin, '--json'])).stdout);
  assert.deepEqual([status.target.credential.source, status.target.credential.variable], ['app-connection', 'JUMPYBRAIN_API_KEY']);
  // Stdin key, writes allowed, wrong key: saved as its own copy; test reports rejection without printing it.
  const alias = origin.replace('127.0.0.1', 'localhost');
  const added = exec(process.execPath, [path.join(repo, 'dist/cli.js'), 'connections', 'add', '--name', 'Wrong', '--url', alias, '--key-stdin', '--allow-writes', '--revision=1', '--directory', f.support, '--json'], { cwd: f.temp, env: f.env, timeout: 10000 });
  added.child.stdin.end('wrong-key-fixture-abcdef\n');
  state = JSON.parse((await added).stdout);
  const wrong = state.profiles.find(p => p.url === alias);
  assert.equal(wrong.allowWrites, true);
  assert.match(await readFile(envFile, 'utf8'), /^JUMPYBRAIN_KEY_[0-9A-F_]+=wrong-key-fixture-abcdef$/m);
  const text = await f.cli(['connections', 'test', '--id', wrong.id, '--directory', f.support]);
  assert.match(text.stdout, /Wrong \(remote, .*\): the server rejected the saved key/);
  assert.equal(text.stdout.includes('wrong-key-fixture'), false);
  await assert.rejects(f.run('test', '--id', 'missing'), e => /Connection not found/.test(e.stderr));
  state = await f.run('remove', '--id', wrong.id, '--revision=2');
  assert.equal(state.profiles.some(p => p.id === wrong.id), false);
  assert.doesNotMatch(await readFile(envFile, 'utf8'), /wrong-key-fixture/);
  // A local profile whose folder was deleted is listed as unavailable and never recreated.
  state = await f.run('add', '--name', 'Doomed', '--root', f.roots[1], '--revision=3');
  const doomed = state.profiles.find(p => p.root === f.roots[1]);
  assert.equal(doomed.available, true);
  await rm(f.roots[1], { recursive: true, force: true });
  state = await f.run('list');
  assert.equal(state.profiles.find(p => p.id === doomed.id).available, false);
  assert.match((await f.cli(['connections', 'list', '--directory', f.support])).stdout, /Warning: "Doomed" points at .* missing .*connections remove --id/);
  assert.equal((await f.run('test', '--id', doomed.id)).health, 'offline');
  await assert.rejects(readdir(f.roots[1]), { code: 'ENOENT' });
});

test('status --all: CLI target and key source, app connections with health and write permission, missing local folders', async t => {
  const f = await fixture(t);
  const envFile = path.join(f.temp, 'config', '.env');
  await mkdir(path.dirname(envFile), { recursive: true, mode: 0o700 });
  await writeFile(envFile, 'JUMPYBRAIN_API_KEY=overview-key-0123456789\n', { mode: 0o600 });
  f.env.JUMPYBRAIN_ENV_FILE = envFile;
  const remoteRoot = path.join(f.temp, 'remote');
  await createServerMemoryRuntime({ root: remoteRoot }).initializeMemoryRoot();
  const server = await startJumpyBrainHttpServer({ root: remoteRoot, apiKeys: ['overview-key-0123456789'], host: '127.0.0.1', port: 0, autoIndex: false });
  t.after(() => server.close());
  const all = async (...extra) => JSON.parse((await f.cli(['status', '--all', '--directory', f.support, '--json', ...extra])).stdout);

  // App not running: the CLI target is still reported.
  let overview = await all();
  assert.deepEqual(overview.app, { running: false });
  assert.deepEqual([overview.cli.kind, overview.cli.root, overview.cli.compatible], ['local', f.roots[0], true]);
  assert.throws(() => parseArgs(['status', '--directory', f.support]), /only to status --all/);
  assert.throws(() => parseArgs(['run', 'memory:status', '--all']), /not a recipe flag/);

  await f.start(false, createEnvFileCredentials({ file: envFile }));
  const origin = new URL(server.url).origin;
  await f.run('add', '--name', 'Team', '--url', origin, '--key-env', 'JUMPYBRAIN_API_KEY', '--revision=0');
  await f.run('add', '--name', 'Gone', '--root', f.roots[1], '--revision=1');
  await rm(f.roots[1], { recursive: true, force: true });

  overview = await all('--target-url', origin);
  assert.deepEqual([overview.cli.kind, overview.cli.url, overview.cli.health, overview.cli.credential.variable], ['remote', origin, 'connected', 'JUMPYBRAIN_API_KEY']);
  assert.equal(overview.app.running, true);
  const byName = Object.fromEntries(overview.app.profiles.map(p => [p.name, p]));
  assert.deepEqual([byName.Team.kind, byName.Team.health, byName.Team.allowWrites, byName.Team.active], ['remote', 'connected', false, false]);
  assert.deepEqual([byName.Gone.available, byName.Gone.health], [false, 'offline']);
  assert.deepEqual(overview.staleLocalRoots.map(s => s.name), ['Gone']);
  const text = (await f.cli(['status', '--all', '--directory', f.support, '--target-url', origin])).stdout;
  assert.match(text, /CLI target:\n  remote .* connected\n  key: JUMPYBRAIN_API_KEY via app-connection/);
  assert.match(text, /Team \[remote\] .*: connected, read only/);
  assert.match(text, /Warning: "Gone" points at .*, which is missing/);
  assert.equal(text.includes('overview-key-0123456789') || JSON.stringify(overview).includes('overview-key-0123456789'), false);
  await assert.rejects(readdir(f.roots[1]), { code: 'ENOENT' });
});
