import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createExtensionGateway } from '../integrations/macos-companion/extensions-gateway.mjs';
import { SwitchCoordinator } from '../integrations/macos-companion/switch-coordinator.mjs';

const documentId = 'mem_a0000000-0000-4000-8000-000000000001';
const hash = 'sha256:' + 'a'.repeat(64);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture({ invoke, emit, targetFetch, allowWrites = true } = {}) {
  const coordinator = new SwitchCoordinator({ timeoutMs: 1000 });
  coordinator.register('tab', coordinator.generation);
  const profile = { id: 'brain-a', allowWrites };
  const calls = [];
  const host = {
    snapshot: () => ({ apiVersion: 1, revision: 'rev', safeMode: false, extensions: [{ id: 'fixture', status: 'active', revision: 'rev', ui: '/companion/extensions/assets/fixture/rev.js' }] }),
    invoke: invoke ?? (async () => undefined), emit: emit ?? (async () => {}),
    asset: async (id, revision) => { if (id !== 'fixture' || revision !== 'rev') throw new Error('stale'); return '/* prepared */'; },
    reload: async () => host.snapshot(), setEnabled: async () => host.snapshot(), remove: async () => host.snapshot(), dispose: async () => {},
  };
  const adapter = createExtensionGateway({ host, coordinator, active: () => profile,
    targetFetch: targetFetch ?? (async (...args) => { calls.push(args); return { status: 200, body: Buffer.from('{}') }; }),
    jsonBody: async request => request.body,
    json: (response, status, packet) => { response.statusCode = status; response.packet = packet; response.writableEnded = true; },
  });
  function request(route, body, { native = false, generation = coordinator.generation, tab = 'tab', method } = {}) {
    const req = Object.assign(new EventEmitter(), { body, method: method ?? (body ? 'POST' : 'GET'), headers: { 'x-companion-generation': String(generation), 'x-companion-tab': tab } });
    const response = Object.assign(new EventEmitter(), { writableEnded: false, writeHead(status, headers) { this.statusCode = status; this.headers = headers; }, end(script) { this.script = script; this.writableEnded = true; } });
    const operation = adapter.handle(req, response, new URL(route, 'http://localhost'), { native });
    return { req, response, operation };
  }
  const run = (commandId = 'run', extra = {}) => request('/companion/extensions/invoke', { extensionId: 'fixture', commandId, ...extra });
  return { adapter, coordinator, profile, calls, host, request, run };
}

test('descriptors and management require current admission, including native generation; assets require an active revision', async () => {
  const f = fixture();
  const read = f.request('/companion/extensions'); await read.operation;
  assert.equal(read.response.packet.revision, 'rev'); assert.equal(f.coordinator.inFlight, 0);
  await assert.rejects(f.request('/companion/extensions', undefined, { tab: 'unknown' }).operation, /registered/);
  await assert.rejects(f.request('/companion/extensions/manage', { action: 'reload' }, { native: true, generation: 0 }).operation, /old brain/);
  await assert.rejects(f.request('/companion/extensions/manage', { action: 'install', source: '/tmp/code' }).operation, /Invalid/);
  const script = f.request('/companion/extensions/assets/fixture/rev.js', undefined, { tab: '', generation: 0 }); await script.operation;
  assert.equal(script.response.script, '/* prepared */');
  await assert.rejects(f.request('/companion/extensions/assets/fixture/old.js').operation, /stale/);
});

test('memory wrappers normalize canonical search handles and preserve read/hash/write protocol and results', async () => {
  let context;
  const calls = [];
  const f = fixture({ invoke: async (_extension, _command, _input, current) => {
    context = current;
    const search = await current.memory.search({ query: 'bounded', limit: 2 });
    assert.deepEqual(search, { results: [{ id: documentId, title: 'Title', snippet: 'Evidence' }], stale: true, partial: true });
    assert.deepEqual(await current.memory.read(documentId), { id: documentId, content: '# saved', hash });
    const created = await current.memory.create({ type: 'note', title: 'New', body: 'body', idempotencyKey: 'explicit-replay-key' });
    assert.deepEqual(created, { saved: true, indexed: false, indexing: { status: 'pending' } });
    await current.memory.update({ id: documentId, content: '# revised', ifMatch: hash });
    return { message: 'done' };
  }, targetFetch: async (profile, route, options) => {
    calls.push({ profile, route, options });
    const payload = route.endsWith('/search') ? { results: [
      { id: 'qmd-only', snippet: 'Unusable', provenance: { metadata: {} } },
      { provenance: { metadata: { id: documentId, title: 'Title' } }, snippet: 'Evidence' },
      { provenance: { metadata: { id: documentId, title: 'Duplicate' } } },
    ], index: { stale: true }, partial: true }
      : options.method === 'POST' ? { saved: true, indexed: false, indexing: { status: 'pending' } }
      : { content: '# saved', contentHash: hash };
    return { status: 200, body: Buffer.from(JSON.stringify(payload)) };
  } });
  const r = f.run('run', { allowWrites: true, document: { id: documentId, title: 'unsaved UI title' } }); await r.operation;
  assert.equal(r.response.packet.message, 'done');
  assert.equal(calls[0].route, '/memories/all/search'); assert.deepEqual(JSON.parse(calls[0].options.body), { query: 'bounded', limit: 2 });
  assert.equal(calls[2].options.headers['Idempotency-Key'], 'explicit-replay-key');
  assert.equal(calls[3].options.headers['If-Match'], hash); assert.equal(calls[3].options.method, 'PUT');
  assert.equal(context.scope.brainId, 'brain-a'); assert.equal(context.signal.aborted, true);
  await assert.rejects(context.memory.read(documentId), /cancelled/); assert.equal(f.coordinator.inFlight, 0);
});

test('read-only target and observational events cannot inherit command write approval; validation precedes transport', async () => {
  for (const allowWrites of [true, false]) {
    let calls = 0;
    const f = fixture({ allowWrites, targetFetch: async () => { calls++; throw new Error('unexpected transport'); },
      invoke: async (_e, _c, _i, context) => {
        await assert.rejects(context.memory.search({ query: 'query', limit: 51 }), /limit/);
        await assert.rejects(context.memory.update({ id: documentId, content: 'body', ifMatch: 'stale' }), /prior sha256/);
        await assert.rejects(context.memory.create({ type: 'note', body: 'body', idempotencyKey: 'key' }), /approval/);
      }, emit: async (_event, context) => {
        assert.equal(context.allowWrites, false);
        await assert.rejects(context.memory.update({ id: documentId, content: 'body', ifMatch: hash }), /approval/);
      },
    });
    await f.run('run', { allowWrites: !allowWrites }).operation;
    await f.request('/companion/extensions/event', { event: { type: 'document.saved' } }).operation;
    assert.equal(calls, 0);
  }
});

test('scope notifications are host-owned, observational and delivered once for a committed generation', async () => {
  const events = [];
  const f = fixture({ emit: async (event, context) => {
    events.push({ type: event.type, generation: context.scope.generation, brainId: context.scope.brainId, allowWrites: context.allowWrites });
  } });
  await assert.rejects(f.request('/companion/extensions/event', { event: { type: 'scope.changed' } }).operation, /Invalid extension event/);
  await f.adapter.scopeChanged(); await f.adapter.scopeChanged();
  assert.equal(events.length, 1); assert.equal(events[0].allowWrites, false); assert.equal(events[0].brainId, 'brain-a');
  assert.equal(f.coordinator.inFlight, 0);
  f.coordinator.unregister('tab', f.coordinator.generation);
  await f.coordinator.switch('brain-b', async () => { f.profile.id = 'brain-b'; });
  await f.adapter.scopeChanged();
  assert.equal(events.length, 2); assert.equal(events[1].brainId, 'brain-b');
  assert.ok(events[1].generation > events[0].generation); assert.equal(f.coordinator.inFlight, 0);
});

test('detached memory work remains pinned through cancellation and drain; future continuations are fenced', async () => {
  const started = deferred(), settle = deferred(); let context, detached;
  const f = fixture({ invoke: async (_e, _c, _i, current) => {
    context = current;
    detached = current.memory.read(documentId); void detached.catch(() => {});
    await started.promise;
  }, targetFetch: async (_p, _r, options) => {
    started.resolve(); await settle.promise;
    assert.equal(options.signal.aborted, true);
    return { status: 200, body: Buffer.from(JSON.stringify({ content: 'old', contentHash: hash })) };
  } });
  const invocation = f.run(); await started.promise;
  // Let the handler return, aborting its lifetime while its detached fetch still drains.
  await new Promise(resolve => setImmediate(resolve));
  let switched = false;
  const switching = f.coordinator.switch('brain-b', async () => { switched = true; });
  f.coordinator.acknowledge('tab', f.coordinator.pending.id, true);
  assert.equal(switched, false); assert.ok(f.coordinator.inFlight >= 1);
  settle.resolve(); await invocation.operation; await switching;
  await assert.rejects(detached, /cancelled/); await assert.rejects(context.memory.read(documentId), /cancelled/);
  assert.equal(switched, true); assert.equal(f.coordinator.inFlight, 0);
});

test('client abort, disable and reload cancel active handlers and wait for admitted transport settlement', async () => {
  for (const action of ['abort', 'disable', 'reload']) {
    const started = deferred(), settle = deferred(); let signal;
    const f = fixture({ invoke: async (_e, _c, _i, context) => {
      signal = context.signal; await context.memory.read(documentId);
    }, targetFetch: async (_p, _r, options) => {
      started.resolve(); await settle.promise;
      assert.equal(options.signal.aborted, true);
      return { status: 200, body: Buffer.from('{}') };
    } });
    const invocation = f.run(); void invocation.operation.catch(() => {}); await started.promise;
    if (action === 'abort') invocation.req.emit('aborted');
    else await f.request('/companion/extensions/manage', { action, ...(action === 'disable' ? { id: 'fixture' } : {}) }).operation;
    assert.equal(signal.aborted, true); assert.ok(f.coordinator.inFlight > 0);
    settle.resolve(); await assert.rejects(invocation.operation, /cancelled/); assert.equal(f.coordinator.inFlight, 0);
  }
});

test('upstream conflict status and packet survive wrapper failures; acknowledged tabs cannot continue memory work', async () => {
  const packet = { error: { code: 'document_changed', message: 'Refresh before writing.' } };
  const f = fixture({ invoke: async (_e, _c, _i, context) => context.memory.update({ id: documentId, content: 'body', ifMatch: hash }),
    targetFetch: async () => ({ status: 412, body: Buffer.from(JSON.stringify(packet)) }),
  });
  await assert.rejects(f.run('run', { allowWrites: true }).operation, error => error.status === 412 && error.packet.error.code === 'document_changed');
  let context; const wait = deferred();
  f.host.invoke = async (_e, _c, _i, current) => { context = current; await wait.promise; };
  const invocation = f.run(); await new Promise(resolve => setImmediate(resolve));
  const switching = f.coordinator.switch('b', async () => {});
  f.coordinator.acknowledge('tab', f.coordinator.pending.id, true);
  await assert.rejects(context.memory.read(documentId), /confirmed/);
  wait.resolve(); await invocation.operation; await switching;
});

test('never-settling observations cannot hold switch or quit; their admitted reads still drain', async () => {
  for (const transition of ['switch', 'quit']) for (const reading of [false, true]) {
    const started = deferred(), settled = deferred(), handler = deferred(); let context, read;
    const f = fixture({ emit: async (_event, current) => {
      context = current;
      if (reading) { read = current.memory.read(documentId); void read.catch(() => {}); }
      started.resolve(); await handler.promise;
    }, targetFetch: async () => { await settled.promise; return { status: 200, body: Buffer.from(JSON.stringify({content:'old',contentHash:hash})) }; } });
    f.coordinator.unregister('tab', f.coordinator.generation);
    const observing = f.adapter.scopeChanged(); await started.promise;
    assert.equal(f.coordinator.inFlight, reading ? 1 : 0);
    let completed = false;
    const changing = (transition === 'switch' ? f.coordinator.switch('b', async () => { f.profile.id = 'b'; }) : f.coordinator.prepareShutdown()).then(value => { completed = true; return value; });
    assert.equal(context.signal.aborted, true);
    await assert.rejects(context.memory.read(documentId), /cancelled/);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, !reading);
    settled.resolve(); const lease = await changing;
    if (reading) await assert.rejects(read, /cancelled/);
    assert.equal(f.coordinator.inFlight, 0);
    if (transition === 'quit') f.coordinator.cancelShutdown(lease);
    handler.resolve(); await observing; await f.adapter.dispose();
  }
});

test('an admitted canonical write drains before clean-tab switch and quit commit', async () => {
  for (const transition of ['switch','quit']) {
    const started=deferred(),settled=deferred(); let context;
    const f=fixture({invoke:async (_e,_c,_i,current)=>{
      context=current;
      const saved=await current.memory.create({type:'note',body:'canonical',idempotencyKey:'one-write'});
      assert.equal(saved.saved,true);
    },targetFetch:async()=>{started.resolve();await settled.promise;return {status:200,body:Buffer.from('{"saved":true}')};}});
    f.coordinator.unregister('tab',f.coordinator.generation);
    const request=f.request('/companion/extensions/invoke',{extensionId:'fixture',commandId:'run',allowWrites:true},{native:true});
    await started.promise; let completed=false;
    const changing=(transition==='switch'?f.coordinator.switch('b',async()=>{f.profile.id='b';}):f.coordinator.prepareShutdown()).then(value=>{completed=true;return value;});
    await new Promise(resolve=>setImmediate(resolve)); assert.equal(completed,false); assert.ok(f.coordinator.inFlight>=1);
    settled.resolve(); await request.operation; const lease=await changing;
    assert.equal(completed,true); assert.equal(f.coordinator.inFlight,0);
    await assert.rejects(context.memory.create({type:'note',body:'late',idempotencyKey:'late'}),/cancelled/);
    if(transition==='quit')f.coordinator.cancelShutdown(lease);
    await f.adapter.dispose();
  }
});
