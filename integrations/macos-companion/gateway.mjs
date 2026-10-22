// Companion-only host adapter. Never loaded by the CLI, public runtime, or hosted serve.
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lstat, realpath } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ConnectionStore } from './connections.mjs';
import { SwitchCoordinator, ControlError } from './switch-coordinator.mjs';

const MAX_BODY = 1024 * 1024;
const MAX_RESPONSE = 16 * 1024 * 1024;
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const failure = (code, message, status = 400) => { throw new ControlError(code, message, status); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).every((key) => fields.includes(key));
const safeProfile = (profile) => profile ? Object.fromEntries(Object.entries(profile).filter(([key]) => key !== 'credentialRef')) : null;

async function bytes(stream, maximum) {
  const parts = []; let count = 0;
  for await (const part of stream) {
    const data = Buffer.from(part); count += data.length;
    if (count > maximum) failure('packet_too_large', 'Request or response exceeded the companion limit.', 413);
    parts.push(data);
  }
  return Buffer.concat(parts);
}
async function jsonBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) failure('invalid_json', 'Use a JSON request.', 415);
  let packet;
  try { packet = JSON.parse((await bytes(request, 32768)).toString('utf8')); }
  catch (error) { if (error instanceof ControlError) throw error; failure('invalid_json', 'Invalid JSON request.'); }
  if (!object(packet)) failure('invalid_json', 'Use a JSON object.');
  return packet;
}
function json(response, status, packet, headers = {}) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  response.end(JSON.stringify(packet) + '\n');
}

// stdout/stdin are anonymous private pipes to Swift, not a local network capability.
export function nativeCredentials(input = process.stdin, output = process.stdout, { timeoutMs = 15000 } = {}) {
  let buffer = Buffer.alloc(0), sequence = 0, closed = false;
  let diagnosticReporter = null;
  const pending = new Map();
  const close = (report = true) => {
    if (!closed && report) diagnosticReporter?.({ operation: 'bridge', severity: 'error', outcome: 'failed', code: 'bridge_lost' });
    closed = true;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new ControlError('credential_unavailable', 'Native capability unavailable.', 503)); }
    pending.clear();
  };
  const consume = (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > 262144) { close(); return; }
    let end;
    while ((end = buffer.indexOf(10)) !== -1) {
      const frame = buffer.subarray(0, end); buffer = buffer.subarray(end + 1);
      let packet;
      try { if (frame.length > 65536) throw new Error(); packet = JSON.parse(frame.toString('utf8')); }
      catch { close(); return; }
      if (!object(packet) || !pending.has(packet.id)) { close(); return; }
      const entry = pending.get(packet.id); pending.delete(packet.id); clearTimeout(entry.timer);
      if (packet.error || (packet.result !== null && typeof packet.result !== 'string')) entry.reject(new ControlError('credential_unavailable', 'Keychain or native capability is unavailable. Re-enter the key if necessary.', 503));
      else entry.resolve(packet.result);
    }
  };
  input.on('data', consume); input.on('end', close); input.on('error', close); output.on('error', close);
  const call = (operation, fields = {}) => new Promise((resolve, reject) => {
    if (closed || pending.size >= 16) { reject(new ControlError('credential_unavailable', 'Native capability unavailable.', 503)); return; }
    const id = String(++sequence);
    const timer = setTimeout(() => { close(); }, operation === 'select-folder' ? 120000 : timeoutMs);
    pending.set(id, { resolve, reject, timer });
    output.write(JSON.stringify({ id, operation, ...fields }) + '\n');
  });
  return { setDiagnosticReporter(reporter) { diagnosticReporter = reporter; }, get: (reference) => call('get', { reference }), set: (reference, key) => call('set', { reference, key }), delete: (reference) => call('delete', { reference }), selectFolder: () => call('select-folder'), close: () => { close(false); input.off('data', consume); input.pause(); } };
}

function allowedMemoryRoute(method, pathname) {
  if (method === 'GET' && /^\/memories\/all\/(status|recent|overview|tree|graph\.json|dream\/window)$/.test(pathname)) return { write: false };
  if (method === 'POST' && /^\/memories\/all\/(search|recall|recall\/compact|expand|resolve-title)$/.test(pathname)) return { write: false };
  if (method === 'GET' && /^\/memories\/all\/documents\/mem_[0-9a-f-]+$/.test(pathname)) return { write: false };
  if (['PUT', 'DELETE'].includes(method) && /^\/memories\/all\/documents\/mem_[0-9a-f-]+$/.test(pathname)) return { write: true };
  if (method === 'POST' && /^\/memories\/all\/(notes|index)$/.test(pathname)) return { write: true };
  return null;
}

export async function startCompanionGateway({ runtimeRoot, directory, initialRoot, port = 3787, controlKey, credentials, switchTimeoutMs = 15000, targetTimeoutMs = 70000, localFactory, fetchImpl = fetch, hostInstance, feedbackSender } = {}) {
  if (!path.isAbsolute(runtimeRoot || '') || !/^[0-9a-f]{64}$/i.test(controlKey || '')) throw new Error('Invalid companion bootstrap.');
  // /var is a legitimate macOS alias; the persistence seam itself rejects symlinks.
  directory = await realpath(directory);
  const store = await ConnectionStore.open({ directory, initialRoot, credentials });
  const coordinator = new SwitchCoordinator({ timeoutMs: switchTimeoutMs });
  const { graphPageHtml } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/http-server/graph-page.js')).href);
  const { brainFaviconSvg } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/http-server/favicon.js')).href);
  const { startJumpyBrainHttpServer } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/server/index.js')).href);
  const { createFeedbackForwarder, createFeedbackHandler } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/http-server/feedback-delivery.js')).href);
  const feedback = createFeedbackHandler(feedbackSender ?? createFeedbackForwarder());
  const { createDiagnosticStore, newDiagnosticId, readNativeDiagnosticSnapshot } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/diagnostics/store.js')).href);
  const { diagnosticId, diagnosticOperation, diagnosticCode, statusCode, sanitizeDiagnosticEvent } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/diagnostics/events.js')).href);
  const { collectSupportDiagnostics } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/app/diagnostics/index.js')).href);
  const { readDiagnosticBuildInfo } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/adapters/diagnostics/build-info.js')).href);
  const runtimeInfo = readDiagnosticBuildInfo();
  const diagnostics = createDiagnosticStore({ directory: path.join(directory, 'diagnostics', 'gateway'), component: 'gateway', metadata: runtimeInfo });
  const electronDiagnostics = createDiagnosticStore({ directory: path.join(directory, 'diagnostics', 'electron'), component: 'electron' });
  diagnostics.record({ operation: 'startup', severity: 'info', outcome: 'ok', code: 'none' });
  credentials.setDiagnosticReporter?.((event) => diagnostics.record(event));
  let supportPending = null, supportAt = 0, supportCache = null, supportScope = null;
  const importedEvents = new Set();
  const localStart = localFactory || ((options) => startJumpyBrainHttpServer(options));
  let local = null, localProfile = null, localKey = null;
  let origin, cookieName;
  const cookieToken = randomBytes(32).toString('hex');
  let health = 'offline', healthAt = 0, healthPending = null, stopping = false;
  let mutation = false;
  const controllers = new Set(), requests = new Set();
  const active = () => store.get(store.snapshot().activeId);
  const stopLocal = async () => {
    const previous = local; local = null; localProfile = null; localKey = null;
    if (previous) await previous.close();
  };
  const destination = async (profile) => {
    if (!profile) failure('offline', 'No brain is selected.', 503);
    if (profile.kind === 'remote') {
      let key;
      try { key = await credentials.get(profile.credentialRef); }
      catch { failure('credential_unavailable', 'Keychain unavailable. Re-enter this connection’s key in Settings if access changed after an update.', 503); }
      if (typeof key !== 'string' || !key.trim()) failure('credential_unavailable', 'The Keychain credential is missing. Re-enter the key in Settings.', 503);
      return { url: profile.url, key };
    }
    if (!local || localProfile !== profile.id) {
      // No initialization/migration, including when the selected folder disappeared.
      try {
        const root = await lstat(profile.root), marker = await lstat(path.join(profile.root, 'jumpybrain.json'));
        if (!root.isDirectory() || root.isSymbolicLink() || !marker.isFile() || marker.nlink !== 1) throw new Error();
      } catch { failure('offline', 'The selected local memory folder is unavailable.', 503); }
      await stopLocal();
      localKey = randomBytes(32).toString('hex');
      local = await localStart({ root: profile.root, apiKeys: [localKey], host: '127.0.0.1', port: 0, autoIndex: false });
      localProfile = profile.id;
    }
    return { url: local.url, key: localKey };
  };
  // All requests to a local target are serialized through one startup promise too.
  let targetTail = Promise.resolve();
  const resolveDestination = (profile) => {
    const result = targetTail.then(() => destination(profile));
    targetTail = result.catch(() => {});
    return result;
  };
  const targetFetch = async (profile, route, options = {}, deadline = targetTimeoutMs) => {
    const started = performance.now();
    const diagnosticRequest = diagnosticId(options.headers?.['X-JumpyBrain-Request']);
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), deadline);
    try {
      const dest = await resolveDestination(profile);
      if (controller.signal.aborted) failure('target_timeout', 'Brain request timed out.', 504);
      const response = await fetchImpl(dest.url + route, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + dest.key }, redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); failure('unsafe_redirect', 'Memory server redirects are not followed.', 502); }
      let body;
      try { body = await bytes(response.body || [], MAX_RESPONSE); }
      catch (error) { controller.abort(); throw error; }
      // Do not send upstream cookies, authentication challenges, or redirects to the shell.
      diagnostics.record({ operation: diagnosticOperation(route, options.method), request: diagnosticRequest, status: response.status, durationMs: performance.now() - started,
        severity: response.ok ? 'info' : 'warn', outcome: response.ok ? 'ok' : 'failed', code: statusCode(response.status) });
      return { status: response.status, body, contentType: response.headers.get('content-type') || 'application/json' };
    } catch (error) {
      diagnostics.record({ operation: diagnosticOperation(route, options.method), request: diagnosticRequest, durationMs: performance.now() - started,
        severity: 'warn', outcome: 'failed', code: error instanceof ControlError ? diagnosticCode(error.code) : controller.signal.aborted ? 'target_timeout' : 'offline' });
      if (error instanceof ControlError) throw error;
      failure(controller.signal.aborted ? 'target_timeout' : 'offline', controller.signal.aborted ? 'Brain request timed out.' : 'The selected brain is unavailable.', controller.signal.aborted ? 504 : 503);
    } finally { clearTimeout(timer); controllers.delete(controller); }
  };
  const testProfile = async (profile) => {
    // Inactive local testing is an observational marker check; never switch/start a second engine.
    if (profile?.kind === 'local' && profile.id !== store.snapshot().activeId) {
      try { const info = await lstat(path.join(profile.root, 'jumpybrain.json')); return info.isFile() && info.nlink === 1 ? 'available' : 'offline'; }
      catch { return 'offline'; }
    }
    try {
      const response = await targetFetch(profile, '/memories/all/status', {}, 4000);
      if ([401, 403].includes(response.status)) return 'authentication_failed';
      let packet; try { packet = JSON.parse(response.body); } catch { return 'offline'; }
      return response.status === 200 && packet.memory === 'all' ? 'connected' : 'offline';
    } catch (error) { return error.code === 'credential_unavailable' ? 'credential_unavailable' : 'offline'; }
  };
  const refreshHealth = async () => {
    if (coordinator.pending || stopping) return;
    if (!healthPending && Date.now() - healthAt > 2000) {
      const id = store.snapshot().activeId, generation = coordinator.generation;
      healthPending = testProfile(active()).then((next) => {
        if (id === store.snapshot().activeId && generation === coordinator.generation) { health = next; healthAt = Date.now(); }
      }).finally(() => { healthPending = null; });
    }
    await healthPending;
  };
  const state = () => {
    const snapshot = store.snapshot(); const profile = active();
    return { ...snapshot, profiles: snapshot.profiles.map(safeProfile), active: safeProfile(profile), ...coordinator.state(), health, ...(hostInstance ? { hostInstance } : {}),
      target: profile?.kind === 'remote' ? profile.url : null };
  };
  const change = async (operation) => {
    if (mutation || coordinator.pending || coordinator.closing || stopping) failure('switch_busy', 'Another connection change is in progress.', 409);
    mutation = true;
    try { return await operation(); } finally { mutation = false; }
  };
  const switchTo = (id) => change(async () => {
    if (!store.get(id)) failure('not_found', 'Connection not found.', 404);
    if (id === store.snapshot().activeId) return state();
    await coordinator.switch(id, async () => {
      // Finish observational startup/probes as well as registered memory request scopes.
      await healthPending;
      await targetTail;
      await store.setActive(id); // Commit selected identity before attempting its availability.
      health = 'offline'; healthAt = 0;
      try { await stopLocal(); } catch { /* Selection remains committed and safely offline. */ }
    });
    await refreshHealth();
    return state();
  });
  const authenticate = (request, pathname) => {
    const authorization = request.headers.authorization;
    const native = typeof authorization === 'string' && equal(authorization, 'Bearer ' + controlKey);
    const cookies = (request.headers.cookie || '').split(';').map((value) => value.trim());
    const browser = cookies.some((value) => equal(value, cookieName + '=' + cookieToken));
    const requestOrigin = request.headers.origin;
    if (request.headers.host !== new URL(origin).host || (requestOrigin && requestOrigin !== origin)
        || (!native && request.headers['sec-fetch-site'] === 'cross-site')) failure('untrusted_origin', 'Untrusted companion origin.', 403);
    if (!native && request.method !== 'GET' && requestOrigin !== origin) failure('untrusted_origin', 'Use the companion browser session.', 403);
    if (pathname === '/companion/session') return { native: false };
    if (!native && !browser) failure('unauthorized', 'Open this page from the companion menu.', 401);
    return { native };
  };

  const handler = async (request, response) => {
    const url = new URL(request.url || '/', origin);
    const started = performance.now();
    const requestId = diagnosticId(request.headers['x-jumpybrain-request']) || newDiagnosticId();
    let errorCode = 'none';
    response.setHeader('X-JumpyBrain-Request', requestId);
    try {
      // A content-free shell is public, but never on an attacker-controlled Host.
      if (request.headers.host !== new URL(origin).host) failure('untrusted_origin', 'Untrusted companion host.', 403);
      if (request.method === 'GET' && ['/','/graph','/graph/','/settings','/settings/'].includes(url.pathname)) {
        const nonce = randomBytes(18).toString('base64url');
        const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': csp, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
        response.end(graphPageHtml(nonce, url.pathname.startsWith('/graph') ? 'graph' : url.pathname.startsWith('/settings') ? 'settings' : 'home', { companion: true })); return;
      }
      if (request.method === 'GET' && url.pathname === '/favicon.svg') {
        response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' }); response.end(brainFaviconSvg); return;
      }
      if (request.method === 'GET' && url.pathname === '/health') { json(response, 200, { ok: !stopping }); return; }
      const auth = authenticate(request, url.pathname);
      if (url.pathname === '/feedback') {
        const finish = coordinator.enter(auth.native ? coordinator.generation : Number(request.headers['x-companion-generation']), request.headers['x-companion-tab'], auth.native);
        try { await feedback(request, response); } finally { finish(); }
        return;
      }
      if (url.pathname === '/companion/diagnostics' && request.method === 'GET') {
        const finish = coordinator.enter(auth.native ? coordinator.generation : Number(request.headers['x-companion-generation']), request.headers['x-companion-tab'], auth.native);
        try {
          const profile = active();
          const scope = String(coordinator.generation) + ':' + profile?.id;
          if (!supportPending && (!supportCache || supportScope !== scope || Date.now() - supportAt > 2000)) {
            const absent = (component) => ({ component, availability: 'unavailable', events: [], dropped: 0, failures: 0, truncatedBytes: 0 });
            supportPending = collectSupportDiagnostics([
              { component: 'gateway', snapshot: () => diagnostics.snapshot() },
              { component: 'server', snapshot: () => profile?.kind === 'local' && localProfile === profile.id && local?.diagnostics ? local.diagnostics.snapshot() : Promise.resolve(absent('server')) },
              { component: 'native', snapshot: () => readNativeDiagnosticSnapshot(path.join(directory, 'native-diagnostics.json')) },
              { component: 'electron', snapshot: async () => { const source = await electronDiagnostics.snapshot(); return source.events.length ? source : absent('electron'); } },
            ]).then((sources) => { supportCache = { schema: 1, runtime: runtimeInfo, sources }; supportScope = scope; supportAt = Date.now(); return supportCache; }).finally(() => { supportPending = null; });
          }
          json(response, 200, supportPending ? await supportPending : supportCache);
        } finally { finish(); }
        return;
      }
      if (url.pathname.startsWith('/companion/')) {
        if (url.pathname === '/companion/state' && request.method === 'GET') { await refreshHealth(); json(response, 200, state()); return; }
        if (request.method !== 'POST') failure('method_not_allowed', 'Use POST for companion actions.', 405);
        const body = await jsonBody(request);
        switch (url.pathname) {
          case '/companion/shutdown': {
            if (!auth.native) failure('unauthorized', 'Native shutdown capability required.', 403);
            if (exact(body, ['action']) && body.action === 'prepare') {
              const id = await change(() => coordinator.prepareShutdown());
              json(response, 200, { id }); return;
            }
            if (exact(body, ['action', 'id']) && body.action === 'cancel' && typeof body.id === 'string') {
              coordinator.cancelShutdown(body.id); json(response, 200, { ok: true }); return;
            }
            if (exact(body, ['action', 'id']) && body.action === 'commit' && typeof body.id === 'string') {
              coordinator.commitShutdown(body.id); json(response, 200, { ok: true }); return;
            }
            failure('invalid_request', 'Invalid shutdown request.');
            return;
          }
          case '/companion/diagnostics':
            if (!auth.native) failure('unauthorized', 'Native diagnostics capability required.', 403);
            if (!exact(body, ['events']) || !Array.isArray(body.events) || body.events.length > 64) failure('invalid_request', 'Invalid diagnostic packet.');
            for (const input of body.events) {
              // The event store sanitizes before persistence. Only authenticated
              // native wrappers may submit; never accept filenames or raw logs.
              const event = sanitizeDiagnosticEvent(input);
              if (!event || event.component !== 'electron') continue;
              const identity = JSON.stringify(event);
              if (!importedEvents.has(identity)) { electronDiagnostics.record(event); importedEvents.add(identity); }
              if (importedEvents.size > 512) importedEvents.delete(importedEvents.values().next().value);
            }
            supportCache = null;
            json(response, 200, { ok: true }); return;
          case '/companion/session':
            if (!exact(body, ['token']) || !equal(body.token, controlKey)) failure('unauthorized', 'Open from the companion menu.', 401);
            json(response, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=${cookieToken}; HttpOnly; SameSite=Strict; Path=/` }); return;
          case '/companion/register':
            if (!exact(body, ['tabId','generation'])) failure('invalid_request', 'Invalid tab registration.');
            coordinator.register(body.tabId, body.generation); json(response, 200, state()); return;
          case '/companion/poll':
            if (!exact(body, ['tabId','generation'])) failure('invalid_request', 'Invalid tab poll.');
            coordinator.poll(body.tabId, body.generation); json(response, 200, state()); return;
          case '/companion/unregister':
            if (!exact(body, ['tabId','generation'])) failure('invalid_request', 'Invalid tab registration.');
            coordinator.unregister(body.tabId, body.generation); json(response, 200, { ok: true }); return;
          case '/companion/ack':
            if (!exact(body, ['tabId','switchId','ok'])) failure('invalid_request', 'Invalid save acknowledgement.');
            coordinator.acknowledge(body.tabId, body.switchId, body.ok); json(response, 200, { ok: true }); return;
          case '/companion/switch':
            if (!exact(body, ['id'])) failure('invalid_request', 'Invalid switch request.');
            json(response, 200, await switchTo(body.id)); return;
          case '/companion/profiles': {
            if (!exact(body, ['profile','revision']) || !object(body.profile)) failure('invalid_request', 'Invalid connection request.');
            await change(async () => {
              const current = active(); const input = body.profile;
              const changesActiveTarget = current && input.id === current.id && (input.kind !== current.kind || input.root !== current.root || input.url !== current.url
                || input.key !== undefined || (input.allowWrites !== undefined && input.allowWrites !== current.allowWrites));
              if (changesActiveTarget) {
                // Key repair and permission changes on the only/offline profile
                // use exactly the same save barrier as selecting another brain.
                await coordinator.switch(input.id, async () => {
                  await healthPending; await targetTail;
                  await store.save(input, body.revision);
                  health = 'offline'; healthAt = 0;
                  try { await stopLocal(); } catch {}
                });
              } else await store.save(input, body.revision);
            });
            json(response, 200, state()); return;
          }
          case '/companion/remove':
            if (!exact(body, ['id','revision'])) failure('invalid_request', 'Invalid remove request.');
            await change(() => store.remove(body.id, body.revision)); json(response, 200, state()); return;
          case '/companion/test': {
            if (!exact(body, ['id'])) failure('invalid_request', 'Invalid test request.');
            if (coordinator.pending || mutation) failure('switch_busy', 'Wait for the connection change to finish.', 409);
            const profile = store.get(body.id); if (!profile) failure('not_found', 'Connection not found.', 404);
            // Pin the selected engine while test runs; inactive remotes do not change it.
            const finish = coordinator.enter(coordinator.generation, null, true);
            try { json(response, 200, { health: await testProfile(profile) }); } finally { finish(); }
            return;
          }
          case '/companion/select-folder':
            if (!exact(body, [])) failure('invalid_request', 'Invalid folder request.');
            json(response, 200, { path: await credentials.selectFolder() }); return;
          default: failure('not_found', 'Unknown companion action.', 404);
        }
      }
      const policy = allowedMemoryRoute(request.method, url.pathname);
      if (!policy) failure('not_found', 'Unsupported companion memory operation.', 404);
      const generation = Number(request.headers['x-companion-generation']);
      const finish = coordinator.enter(generation, request.headers['x-companion-tab'], auth.native);
      try {
        const profile = active();
        if (policy.write && !profile?.allowWrites) failure('write_not_authorized', 'This brain is read only. Explicit editing approval is required in Settings.', 403);
        const body = ['POST','PUT','DELETE'].includes(request.method) ? await bytes(request, MAX_BODY) : undefined;
        const headers = {};
        for (const name of ['content-type','if-match','idempotency-key']) if (request.headers[name]) headers[name] = request.headers[name];
        headers['X-JumpyBrain-Request'] = requestId;
        const packet = await targetFetch(profile, url.pathname + url.search, { method: request.method, headers, body }, url.pathname.endsWith('/index') ? 610000 : targetTimeoutMs);
        // Response payloads preserve existing protocol; only static gateway failures are generated here.
        response.writeHead(packet.status, { 'Content-Type': packet.contentType.startsWith('application/json') ? 'application/json; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(packet.body);
      } finally { finish(); }
    } catch (error) {
      errorCode = diagnosticCode(error?.code);
      const known = error instanceof ControlError || error?.name === 'ConnectionError';
      const status = error instanceof ControlError ? error.status : error?.code === 'REVISION_CONFLICT' ? 409 : known ? 400 : 500;
      json(response, status, { error: { code: known ? error.code : 'companion_failed', message: known ? error.message : 'Companion operation failed.' } });
    } finally {
      if (url.pathname !== '/health' && !['/', '/graph', '/settings', '/favicon.svg', '/companion/diagnostics'].includes(url.pathname)) diagnostics.record({
        operation: diagnosticOperation(url.pathname, request.method), request: requestId, status: response.statusCode,
        durationMs: performance.now() - started, outcome: response.statusCode >= 400 ? 'failed' : 'ok',
        severity: response.statusCode >= 400 ? 'warn' : 'info', code: errorCode === 'none' ? statusCode(response.statusCode) : errorCode,
      });
    }
  };
  const server = http.createServer((request, response) => {
    const operation = handler(request, response).catch(() => { response.destroy(); });
    requests.add(operation); void operation.finally(() => requests.delete(operation));
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  origin = `http://127.0.0.1:${server.address().port}`; cookieName = 'jumpybrain_companion_' + server.address().port;
  return { url: origin, server, store, coordinator, state, diagnostics,
    close: async () => {
      stopping = true; coordinator.close();
      for (const controller of controllers) controller.abort();
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections(); // Also abort incomplete request-body receipt before draining handlers.
      await Promise.allSettled([...requests]);
      await healthPending; await targetTail; await stopLocal();
      server.closeAllConnections(); await closed;
      diagnostics.record({ operation: 'shutdown', severity: 'info', outcome: 'ok', code: 'none' });
      await Promise.all([diagnostics.flush(), electronDiagnostics.flush()]);
    } };
}

// Node resolves entrypoint symlinks (notably macOS /var -> /private/var).
const entryPath = process.argv[1] ? await realpath(process.argv[1]).catch(() => path.resolve(process.argv[1])) : null;
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  const [runtimeRoot, directory, initialRoot, port] = process.argv.slice(2);
  const credentials = nativeCredentials();
  const parentPID = process.ppid;
  let gateway;
  const stop = async () => {
    clearInterval(watchdog);
    await gateway?.close(); credentials.close(); process.exit(0);
  };
  const watchdog = setInterval(() => { if (parentPID <= 1 || process.ppid !== parentPID) void stop(); }, 1000);
  watchdog.unref();
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  try {
    gateway = await startCompanionGateway({ runtimeRoot, directory, initialRoot, port: Number(port), controlKey: process.env.JUMPYBRAIN_SERVER_API_KEYS, credentials, hostInstance: process.env.JUMPYBRAIN_DESKTOP_INSTANCE });
  } catch { process.stderr.write('Companion gateway could not start. Check private profile data and runtime installation.\n'); credentials.close(); process.exit(1); }
}
