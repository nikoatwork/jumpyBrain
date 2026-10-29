import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { inspectBrainFolder, suggestLocalBrain, prepareLocalBrain, activateLocalBrain, activateRemoteBrain, companionControl, setupComplete, finishSetup } from '../integrations/electron/setup.mjs';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-desktop-setup-')));
  const cleanup = { close: async () => {} };
  t.after(async () => { await cleanup.close(); await rm(directory, { recursive: true, force: true }); });
  const root = path.join(directory, 'My brain'); await mkdir(root);
  return { directory, root, cleanup };
}
test('folder selection accepts empty/new and existing brains, rejects unrelated content and unsafe markers', async (t) => {
  const { root, directory } = await fixture(t);
  assert.deepEqual(await inspectBrainFolder(root), { root, existing: false });
  await writeFile(path.join(root, 'private.md'), 'Keep me');
  await assert.rejects(inspectBrainFolder(root), /empty folder/);
  assert.equal(await readFile(path.join(root, 'private.md'), 'utf8'), 'Keep me');
  await assert.rejects(inspectBrainFolder('relative'), /local folder/);
  await writeFile(path.join(directory, 'marker.json'), '{}');
  await symlink(path.join(directory, 'marker.json'), path.join(root, 'jumpybrain.json'));
  await assert.rejects(inspectBrainFolder(root), /regular file/);
  await rm(path.join(root, 'jumpybrain.json'));
  await initializeMemoryRoot(root);
  assert.equal((await inspectBrainFolder(root)).existing, true);
});
test('setup completion survives relaunch; malformed marker reopens onboarding', async (t) => {
  const { directory } = await fixture(t);
  assert.equal(await setupComplete(directory), false);
  await finishSetup(directory); assert.equal(await setupComplete(directory), true);
  await writeFile(path.join(directory, 'desktop-setup.json'), '{broken');
  assert.equal(await setupComplete(directory), false);
});

test('suggesting a default is read-only; explicit preparation creates it and refuses unrelated files', async (t) => {
  const { directory, root } = await fixture(t);
  const state = { profiles: [], activeId: null };
  const selected = await suggestLocalBrain(state, { home: directory });
  assert.equal(selected.root, path.join(directory, '.jumpybrain/memory'));
  await assert.rejects(readFile(path.join(selected.root, 'jumpybrain.json')), { code: 'ENOENT' });
  assert.deepEqual(await prepareLocalBrain(selected), { root: selected.root, existing: false });
  await writeFile(path.join(selected.root, 'keep.txt'), 'Keep me');
  await assert.rejects(prepareLocalBrain(selected), /empty folder/);
  await assert.rejects(suggestLocalBrain(state, { home: directory }), /isn’t ready/);
  await initializeMemoryRoot(root);
  const local = { id: 'local', kind: 'local', root };
  assert.equal((await suggestLocalBrain({ profiles: [local], activeId: 'local' }, { home: directory })).root, root);
  await assert.rejects(suggestLocalBrain({ profiles: [{ ...local, root: path.join(directory, 'missing') }], activeId: 'local' }), /saved folder/);
});

test('native picker aliases resolve before activation without a false folder-changed error', async (t) => {
  const { root, directory } = await fixture(t);
  await initializeMemoryRoot(root);
  const alias = path.join(directory, 'Folder alias'); await symlink(root, alias);
  const selected = await inspectBrainFolder(alias);
  assert.equal(selected.root, root);
  const state = await activateLocalBrain({ runtimeRoot: fileURLToPath(new URL('..', import.meta.url)) }, selected, {
    control: async () => ({ activeId: 'local', profiles: [{ id: 'local', kind: 'local', root }] }),
  });
  assert.equal(state.activeId, 'local');
});

test('remote onboarding persists keys through the gateway, checks connectivity and retries without duplicate profiles', async (t) => {
  const { directory, cleanup } = await fixture(t);
  const support = path.join(directory, 'support'); await mkdir(support, { mode: 0o700 });
  const keys = new Map();
  let health = 401;
  const key = randomBytes(32).toString('hex');
  const gateway = await startCompanionGateway({ runtimeRoot: fileURLToPath(new URL('..', import.meta.url)), directory: support,
    port: 0, controlKey: key,
    credentials: { get: async ref => keys.get(ref), set: async (ref, value) => keys.set(ref, value), delete: async ref => keys.delete(ref) },
    fetchImpl: async () => new Response(JSON.stringify({ memory: 'all' }), { status: health }),
  });
  cleanup.close = () => gateway.close();
  const connection = { origin: gateway.url, key };
  const input = { url: 'https://brain.example.com/', key: 'fixture-key' };
  await assert.rejects(activateRemoteBrain(connection, input), /key didn’t work/);
  let state = await companionControl(connection);
  assert.equal(state.profiles.length, 1); assert.equal(state.profiles[0].allowWrites, false);
  assert.equal(JSON.stringify(state).includes('fixture-key'), false);
  health = 200;
  state = await activateRemoteBrain(connection, input);
  assert.equal(state.profiles.length, 1); assert.equal(state.active.kind, 'remote');
  assert.equal(state.active.allowWrites, false);
  assert.equal((await readFile(path.join(support, 'connections.json'), 'utf8')).includes('fixture-key'), false);
  for (const url of ['http://example.com', 'https://brain.example.com/path', 'https://user:password@brain.example.com', 'http://2130706433']) {
    await assert.rejects(activateRemoteBrain(connection, { ...input, url }));
  }
});
test('initialization uses the public runtime and activates through the production save barrier; retry reuses the connection', async (t) => {
  const { root, directory, cleanup } = await fixture(t);
  const support = path.join(directory, 'support'); await mkdir(support, { mode: 0o700 });
  const runtimeRoot = fileURLToPath(new URL('..', import.meta.url));
  const key = randomBytes(32).toString('hex');
  const gateway = await startCompanionGateway({ runtimeRoot, directory: support, port: 0, controlKey: key,
    credentials: { get: async () => null, set: async () => {}, delete: async () => {} } });
  cleanup.close = () => gateway.close();
  const connection = { origin: gateway.url, key, runtimeRoot };
  let state = await activateLocalBrain(connection, await inspectBrainFolder(root));
  assert.equal(state.profiles.length, 1); assert.equal(state.active.root, root);
  assert.ok(state.starterPage);
  const starterPath = path.join(root, state.starterPage.file);
  const starter = await readFile(starterPath, 'utf8');
  assert.match(starter, /attention_at: null/);
  assert.deepEqual(starter.split(/^## /m).slice(1).map(section => (section.match(/^- \[ \]/gm) || []).length), [10, 5, 5]);
  assert.equal(state.starterPage.scope, 'brain:' + JSON.stringify([state.activeId, 'local', root]));
  const config = await readFile(path.join(root, 'jumpybrain.json'), 'utf8');
  await writeFile(path.join(root, 'notes/keep.md'), '# Keep this');
  state = await activateLocalBrain(connection, await inspectBrainFolder(root));
  assert.equal(state.profiles.length, 1);
  assert.equal(state.starterPage, undefined);
  assert.equal(await readFile(starterPath, "utf8"), starter);
  await rm(starterPath);
  assert.equal((await activateLocalBrain(connection, await inspectBrainFolder(root))).starterPage, undefined);
  await assert.rejects(readFile(starterPath), { code: "ENOENT" });
  assert.equal(await readFile(path.join(root, 'jumpybrain.json'), 'utf8'), config);
  assert.equal(await readFile(path.join(root, 'notes/keep.md'), 'utf8'), '# Keep this');
  // A live editor must acknowledge before a different root can become active.
  gateway.coordinator.register('desktop-setup-test', state.generation);
  const second = path.join(directory, 'Second brain'); await mkdir(second);
  let pending = true;
  const switching = activateLocalBrain(connection, await inspectBrainFolder(second)).then((value) => { pending = false; return value; });
  const deadline = Date.now() + 3000;
  while (!gateway.coordinator.pending && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(pending, true); assert.ok(gateway.coordinator.pending);
  const preparing = await companionControl(connection);
  gateway.coordinator.acknowledge('desktop-setup-test', preparing.switchId, true);
  const next = await switching;
  assert.equal(next.active.root, second); assert.equal(next.profiles.length, 2);
});
test('changed folder and incompatible brain are refused without rewriting their configuration', async (t) => {
  const { root } = await fixture(t);
  const selected = await inspectBrainFolder(root);
  await writeFile(path.join(root, 'jumpybrain.json'), '{"schemaVersion":999}');
  const connection = { runtimeRoot: fileURLToPath(new URL('..', import.meta.url)) };
  await assert.rejects(activateLocalBrain(connection, selected), /folder changed/);
  await assert.rejects(activateLocalBrain(connection, await inspectBrainFolder(root)));
  assert.equal(await readFile(path.join(root, 'jumpybrain.json'), 'utf8'), '{"schemaVersion":999}');
});

test('failed activation retries reuse the starter without creating duplicates', async (t) => {
  const { root } = await fixture(t);
  const connection = { runtimeRoot: fileURLToPath(new URL('..', import.meta.url)) };
  await assert.rejects(activateLocalBrain(connection, await inspectBrainFolder(root), {
    control: async () => { throw new Error('Save barrier refused'); },
  }), /Save barrier/);
  const before = await readFile(path.join(root, 'pages/today.md'), 'utf8');
  const state = await activateLocalBrain(connection, await inspectBrainFolder(root), {
    control: async () => ({ activeId: 'local', profiles: [{ id: 'local', kind: 'local', root }] }),
  });
  assert.ok(state.starterPage);
  assert.equal(await readFile(path.join(root, 'pages/today.md'), 'utf8'), before);
});
