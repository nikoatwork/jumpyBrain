// Linux fixture runner used only by hosted-container-smoke.mjs. Never use a real brain.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const mode = process.argv[2], root = '/data/jumpybrain/memory';
const stateFile = '/data/jumpybrain/smoke-state.json', backup = '/data/jumpybrain/backup';
const origin = 'http://127.0.0.1:3001';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function command(args, { key = '', input, failure = false } = {}) {
  const result = spawnSync(process.execPath, ['dist/cli.js', ...args, '--json'], {
    cwd: '/app', env: { ...process.env, JUMPYBRAIN_API_KEY: key }, input, encoding: 'utf8', timeout: 90_000,
  });
  // Never include stdout in a failure: access issue returns a one-time secret.
  assert.equal(result.status === 0, !failure, `CLI ${args[0]} ${failure ? 'must fail' : 'failed'}: ${result.stderr}`);
  return failure ? undefined : JSON.parse(result.stdout);
}
const remote = (args, options) => command([...args, '--target-url', origin], options);
async function statusCode(key, url = '/memories/all/status', cookie) {
  const headers = cookie ? { Cookie: cookie } : key ? { Authorization: `Bearer ${key}` } : {};
  return (await fetch(origin + url, { headers, signal: AbortSignal.timeout(5000) })).status;
}
async function verify(state) {
  assert.equal(await statusCode(state.writer.token), 200);
  assert.equal(await statusCode(state.oldWriter.token), 401);
  const deadline = Date.now() + 10_000;
  let status, observations = 0, pendingObserved = false;
  do {
    status = remote(['status'], { key: state.reader.token });
    if (status.readiness.freshness === 'fresh') break;
    observations++;
    pendingObserved ||= await stat(path.join(root, '.jumpybrain/index-pending.json')).then(() => true, () => false);
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  // Startup/quiet-write maintenance can overlap the explicit index. Wait for
  // completed publication, retaining a strict failure if freshness never settles.
  assert.equal(status.readiness.freshness, 'fresh', JSON.stringify({ readiness: status.readiness, pendingObserved, observations }));
  if (observations) console.log(JSON.stringify({ readinessSettled: true, pendingObserved, observations }));
  const recall = remote(['recall', '--topic', 'heliotrope', '--limit', '5'], { key: state.reader.token });
  assert.match(JSON.stringify(recall), /heliotrope/);
  assert.equal(digest(await readFile(path.join(root, state.saved.file))), state.hash);
  assert.equal(digest(await readFile(path.join(root, '.jumpybrain/access.json'))), state.accessHash);
}
if (mode === 'ready') {
  const deadline = Date.now() + 60_000;
  while (true) {
    try { assert.equal(await statusCode('', '/health'), 200); break; }
    catch (error) { if (Date.now() > deadline) throw error; await new Promise(resolve => setTimeout(resolve, 200)); }
  }
} else if (mode === 'initial') {
  assert.notEqual(process.getuid(), 0);
  assert.equal(await statusCode(''), 401);
  assert.equal(await statusCode(process.env.JUMPYBRAIN_API_KEY), 200);
  // Check packaged/generated assets and actual external production dependencies.
  for (const asset of ['editor-bundle.js', 'extensions-bundle.js', 'editor-LICENSES.txt', 'feedback-config.json']) {
    assert.ok((await stat(`/app/dist/adapters/http-server/${asset}`)).size > 0);
  }
  assert.ok((await stat('/app/dist/adapters/diagnostics/build-info.json')).size > 0);
  assert.ok((await stat('/app/dist/runtime-package-lock.json')).size > 0);
  const { build, stop } = await import('/app/node_modules/esbuild/lib/main.js');
  assert.match((await build({ stdin: { contents: 'export const smoke = 1;' }, write: false })).outputFiles[0].text, /smoke/);
  stop();
  const { WebSocket } = await import('/app/dist/adapters/websocket/index.js');
  assert.equal(typeof WebSocket, 'function');
  const { checkQmdInstallation } = await import('/app/scripts/qmd-install-check.mjs');
  assert.equal(checkQmdInstallation(), true);
  const oldWriter = command(['access', 'issue', '--root', root, '--name', 'Smoke writer', '--role', 'writer']);
  const reader = command(['access', 'issue', '--root', root, '--name', 'Smoke reader', '--role', 'reader']);
  remote(['remember', '--type', 'finding', '--title', 'Reader must fail'], { key: reader.token, input: 'Forbidden fixture write', failure: true });
  const saved = remote(['remember', '--type', 'finding', '--title', 'Hosted heliotrope fixture'], { key: oldWriter.token, input: 'A heliotrope fixture survives restart and restore.\n' });
  assert.equal(saved.saved, true);
  remote(['index'], { key: oldWriter.token });
  const session = await fetch(origin + '/session', { headers: { Authorization: `Bearer ${oldWriter.token}` } });
  assert.equal(session.status, 200);
  const cookie = session.headers.get('set-cookie').split(';')[0];
  assert.equal(await statusCode('', undefined, cookie), 200);
  const writer = command(['access', 'issue', '--root', root, '--name', 'Replacement writer', '--role', 'writer']);
  assert.equal(await statusCode(writer.token), 200);
  command(['access', 'revoke', '--root', root, '--id', oldWriter.credential.id]);
  assert.equal(await statusCode('', undefined, cookie), 401);
  const state = { reader, oldWriter, writer, saved, hash: digest(await readFile(path.join(root, saved.file))),
    accessHash: digest(await readFile(path.join(root, '.jumpybrain/access.json'))) };
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  await verify(state);
  console.log(`PASS: initialization, assets, production dependencies, real QMD index/recall, reader denial, named rotation/revocation and cookie rejection (Node ${process.version}, QMD 2.8.3).`);
} else if (mode === 'persistent') {
  await verify(JSON.parse(await readFile(stateFile, 'utf8')));
  console.log('PASS: canonical bytes, revoked credentials and fresh nonempty lexical retrieval survive container replacement/restore.');
} else if (mode === 'bootstrap-accepted' || mode === 'bootstrap-rejected') {
  assert.equal(await statusCode(process.env.JUMPYBRAIN_API_KEY), mode === 'bootstrap-accepted' ? 200 : 401);
  console.log('PASS: removed bootstrap key rejected after recreation.');
} else if (mode === 'restore') {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  await mkdir(path.join(root, '.jumpybrain/recovery/fixture'), { recursive: true, mode: 0o700 });
  await writeFile(path.join(root, '.jumpybrain/recovery/fixture/source.md'), 'Retained recovery fixture\n', { mode: 0o600 });
  function upgrade(action, apply = false, failure = false) {
    const result = spawnSync(process.execPath, ['scripts/multiplayer-upgrade.mjs', '--root', root, '--backup', backup,
      '--mode', action, ...(apply ? ['--apply'] : [])], { cwd: '/app', encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status === 0, !failure, `upgrade ${action}: ${result.stderr}`);
    return failure ? undefined : JSON.parse(result.stdout);
  }
  upgrade('prepare');
  assert.equal(upgrade('prepare', true).complete, true);
  assert.equal((await stat(backup)).mode & 0o077, 0);
  const manifest = JSON.parse(await readFile(path.join(backup, 'manifest.json'), 'utf8'));
  assert.ok(manifest.files.some(file => file.path === '.jumpybrain/access.json'));
  assert.ok(manifest.files.some(file => file.path.includes('recovery/fixture')));
  assert.ok(!manifest.files.some(file => file.path.includes('qmd-cache') || file.path.includes('backend/')));
  // The helper pins the original absolute root. Simulate loss only on this disposable root.
  await rm(root, { recursive: true });
  await mkdir(root);
  assert.equal(upgrade('restore', true).restoredFiles, manifest.files.length);
  assert.equal(upgrade('verify').ok, true);
  assert.equal(digest(await readFile(path.join(root, state.saved.file))), state.hash);
  assert.equal(digest(await readFile(path.join(root, '.jumpybrain/access.json'))), state.accessHash);
  command(['index', '--root', root]);
  command(['backend', 'stop', '--root', root]);
  // Refuse restoring a backup over subsequently revoked access state.
  const extra = command(['access', 'issue', '--root', root, '--name', 'Restore refusal', '--role', 'reader']);
  command(['access', 'revoke', '--root', root, '--id', extra.credential.id]);
  upgrade('restore', true, true);
  // Retain the current revocations for subsequent persistence verification.
  state.accessHash = digest(await readFile(path.join(root, '.jumpybrain/access.json')));
  await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
  console.log('PASS: stopped-root backup, complete loss/restore with exact canonical/access/recovery bytes, index rebuild and changed-access restore refusal.');
} else {
  throw new Error('Unknown hosted fixture mode.');
}
