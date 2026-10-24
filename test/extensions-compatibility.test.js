import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createExtensionHost } from '../dist/app/extensions/index.js';
import { seedV1Extension, v1Context, v1Revision } from '../scripts/extensions-v1-fixture.mjs';

test('frozen API v1 author types remain compatible with the distributed SDK', () => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'scripts/fixtures/extensions-v1/compatibility.ts'], { encoding: 'utf8' });
});

test('paired distribution CLI compiles using the Electron compiler without root dependencies', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-paired-compiler-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(new URL('../dist/', import.meta.url), path.join(root, 'dist'), { recursive: true });
  await cp(new URL('../package.json', import.meta.url), path.join(root, 'package.json'));
  await mkdir(path.join(root, 'integrations/electron/node_modules'), { recursive: true });
  // Match the incoming package's dependency placement; root node_modules is absent.
  await symlink(path.resolve('node_modules/esbuild'), path.join(root, 'integrations/electron/node_modules/esbuild'), 'dir');
  const installed = JSON.parse(execFileSync(process.execPath, [path.join(root, 'dist/cli.js'), 'extensions', 'install', '--source', path.resolve('scripts/fixtures/extensions-v1/source'), '--directory', path.join(root, 'support/extensions'), '--json'], { encoding: 'utf8' }));
  assert.equal(installed.manifest.id, 'v1-contract');
  assert.ok(installed.prepared.revision);
});

test('frozen v1 installed cache, state and commands survive host replacement and source recompilation', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-v1-contract-'));
  const directory = path.join(root, 'extensions'), source = path.join(root, 'packages/v1');
  let host;
  t.after(async () => { await host?.dispose(); await rm(root, { recursive: true, force: true }); });
  const files = await seedV1Extension(directory, source);
  const before = await Promise.all(files.map(file => readFile(file)));
  // A replacement host must use an existing cache without the source/old installation present.
  await rm(source, { recursive: true });
  host = await createExtensionHost({ directory });
  assert.equal(host.snapshot().extensions[0].status, 'active');
  assert.equal(host.snapshot().extensions[0].revision, v1Revision);
  assert.equal(host.snapshot().extensions.find(item => item.id === 'v1-disabled').status, 'disabled');
  let result = await host.invoke('v1-contract', 'inspect', null, v1Context());
  assert.deepEqual(result.panel.data, { version: 1, results: [{ id: 'v1-note', title: 'Version one', snippet: 'Evidence' }], hash: 'v1-hash', state: { from: 'v1' } });
  let register;
  vm.runInNewContext(await host.asset('v1-contract', v1Revision), { JumpyBrainExtensions: { register: (id, factory) => { assert.equal(id, 'v1-contract'); register = factory; } } });
  let render;
  register({ registerPanel: (id, renderer) => { assert.equal(id, 'details'); render = renderer; }, onDispose() {} });
  const container = { textContent: '' }, controller = new AbortController();
  const dispose = render(container, { old: true }, { signal: controller.signal, document: null });
  assert.equal(container.textContent, '{"old":true}'); controller.abort(); assert.equal(container.textContent, ''); dispose();
  await host.dispose();
  for (let i = 0; i < files.length; i++) {
    if (/registry(?:\.backup)?\.json$/.test(files[i])) {
      const upgraded = JSON.parse(await readFile(files[i]));
      const old = JSON.parse(before[i]);
      assert.deepEqual(upgraded.entries[0].successful, { manifest: upgraded.entries[0].manifest, prepared: { revision: v1Revision } });
      for (const entry of upgraded.entries) delete entry.successful;
      // Validation fills the historical optional capabilities list without changing policy.
      for (const entry of old.entries) entry.manifest.capabilities ??= [];
      assert.deepEqual(upgraded, old);
    } else assert.deepEqual(await readFile(files[i]), before[i]);
  }
  await cp(new URL('../scripts/fixtures/extensions-v1/source/', import.meta.url), source, { recursive: true });
  host = await createExtensionHost({ directory });
  await host.reload();
  assert.notEqual(host.snapshot().extensions[0].revision, v1Revision);
  result = await host.invoke('v1-contract', 'inspect', null, v1Context());
  assert.deepEqual(result.panel.data.state, { from: 'v1' });
  let writes = 0;
  const context = v1Context();
  context.memory.create = async input => { assert.equal(input.idempotencyKey, 'v1-key'); writes++; return { saved: true }; };
  context.memory.update = async input => { assert.equal(input.ifMatch, 'v1-hash'); writes++; return { saved: true }; };
  await assert.rejects(host.invoke('v1-contract', 'write', null, context), error => error.code === 'extension_permission_denied');
  context.allowWrites = true;
  await host.invoke('v1-contract', 'write', null, context); assert.equal(writes, 2);
  await host.emit({ type: 'document.saved', document: context.document }, context);
  await host.setEnabled('v1-contract', false);
  await host.dispose(); host = await createExtensionHost({ directory });
  assert.equal(host.snapshot().extensions[0].status, 'disabled');
  await host.setEnabled('v1-contract', true);
  assert.equal(host.snapshot().extensions[0].status, 'active');
  assert.equal(host.snapshot().extensions.find(item => item.id === 'v1-disabled').status, 'disabled');
  await host.setEnabled('v1-disabled', true);
  assert.equal(host.snapshot().extensions.find(item => item.id === 'v1-disabled').status, 'active');
  const state = JSON.parse(await readFile(path.join(directory, 'state/v1-contract.json'), 'utf8'));
  assert.deepEqual(state, { kept: { from: 'v1' }, saved: 'v1-note' });
});

test('current SDK discovers write outcomes and theme roles; confirmed/uncertain creation example never retries', async () => {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'scripts/fixtures/extensions-current-contract.ts']);
  const { build, stop } = await import('esbuild');
  try {
    const output = await build({entryPoints:['scripts/fixtures/extensions-current-contract.ts'],bundle:true,write:false,platform:'node',format:'esm'});
    const { createConfirmedNote, updateMessage } = await import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'));
    const input = {type:'note',body:'body',idempotencyKey:'persisted-original-key'};
    let calls = 0;
    const context = {memory:{create:async received => { calls++; assert.equal(received,input); return {id:'confirmed-id',saved:true,indexed:false,indexing:{status:'failed'}}; }}};
    assert.match(await createConfirmedNote(context,input), /Saved confirmed-id; indexing failed/); assert.equal(calls,1);
    context.memory.create = async received => { calls++; assert.equal(received.idempotencyKey,input.idempotencyKey); throw Error('response lost'); };
    assert.match(await createConfirmedNote(context,input), /unconfirmed.*original key/); assert.equal(calls,2);
    assert.equal(updateMessage({id:'id',unchanged:true,indexed:false,newContentHash:'hash'}),'Unchanged');
  } finally { stop(); }
});
