// Desktop protocol only: the app host owns packages; this adapter owns scoped HTTP effects.
import { ControlError } from './switch-coordinator.mjs';

const fail = (code, message, status = 400) => { throw new ControlError(code, message, status); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
const id = value => typeof value === 'string' && /^mem_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const name = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0');
const document = value => value === null || (exact(value, ['id', 'title']) && id(value.id) && typeof value.title === 'string' && value.title.length <= 512);
// Scope transitions are observed once by the host, never asserted by an editor tab.
const eventTypes = ['document.changed', 'document.saved', 'theme.changed'];

export function createExtensionGateway({ host, coordinator, active, targetFetch, jsonBody, json }) {
  const sessions = new Set();
  let managing = false;
  let notifiedGeneration;
  const cancel = extensionId => {
    for (const session of sessions) if (!extensionId || session.extensionId === null || session.extensionId === extensionId) session.controller.abort();
  };
  const signal = () => {
    const { revision, safeMode } = host.snapshot();
    return { revision, safeMode };
  };
  const openContext = (request, response, auth, extensionId, currentDocument, allowWrites) => {
    const generation = request ? Number(request.headers['x-companion-generation']) : coordinator.generation;
    const tabId = request?.headers['x-companion-tab'];
    const finish = coordinator.enter(generation, tabId, auth.native);
    const profile = active();
    if (!profile) { finish(); fail('offline', 'No brain is selected.', 503); }
    const session = { extensionId, controller: new AbortController(), pending: new Set(), done: false };
    sessions.add(session);
    const abort = () => session.controller.abort();
    const closed = () => { if (!response.writableEnded) abort(); };
    request?.once('aborted', abort); response?.once('close', closed);
    const check = () => {
      if (session.done || session.controller.signal.aborted) fail('extension_cancelled', 'Extension operation was cancelled.', 409);
      coordinator.fence(generation);
      if (active()?.id !== profile?.id) fail('stale_generation', 'The extension brain scope changed.', 409);
    };
    const operation = (route, options = {}, write = false) => {
      // Admission is synchronous, before any await or detached continuation can escape.
      check();
      if (write && (!allowWrites || !profile?.allowWrites)) fail('write_not_authorized', 'Explicit command and brain editing approval are required.', 403);
      const release = coordinator.enter(generation, tabId, auth.native);
      const pending = (async () => {
        try {
          const packet = await targetFetch(profile, route, { ...options, signal: session.controller.signal });
          check();
          let result;
          try { result = JSON.parse(packet.body.toString('utf8')); }
          catch { fail('invalid_target_response', 'The brain returned an invalid response.', 502); }
          if (!object(result)) fail('invalid_target_response', 'The brain returned an invalid response.', 502);
          if (packet.status < 200 || packet.status >= 300) {
            const error = new ControlError('extension_memory_failed', 'The brain rejected the extension memory operation.', packet.status);
            error.packet = result; throw error;
          }
          return result;
        } finally { release(); }
      })();
      session.pending.add(pending);
      // Attach both outcomes without creating an unhandled rejecting cleanup promise.
      void pending.then(() => session.pending.delete(pending), () => session.pending.delete(pending));
      return pending;
    };
    const post = (route, body, headers = {}, write = false, method = 'POST') => operation(route, {
      method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    }, write);
    const memory = {
      async search(input) {
        if (!exact(input, ['query', 'limit']) || !text(input.query, 2048) || !input.query.trim()
          || (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50))) fail('invalid_request', 'Search requires a query and a limit from 1 to 50.');
        const limit = input.limit ?? 12;
        const packet = await post('/memories/all/search', { query: input.query, limit });
        const seen = new Set();
        const results = (Array.isArray(packet.results) ? packet.results : []).flatMap(hit => {
          const metadata = hit?.provenance?.metadata;
          if (!id(metadata?.id) || seen.has(metadata.id)) return [];
          seen.add(metadata.id);
          return [{ id: metadata.id, title: String(metadata.title || String(hit.provenance?.file || '').split('/').pop() || 'Untitled').slice(0, 512), snippet: String(hit.snippet || '').slice(0, 4000) }];
        }).slice(0, limit);
        return { results, ...(packet.stale === undefined && packet.index?.stale === undefined ? {} : { stale: Boolean(packet.stale ?? packet.index?.stale) }), ...(packet.partial === undefined && packet.retrieval?.status === undefined ? {} : { partial: packet.partial === true || packet.retrieval?.status === 'partial' }) };
      },
      async read(documentId) {
        if (!id(documentId)) fail('invalid_request', 'Use a canonical memory ID.');
        const packet = await operation('/memories/all/documents/' + documentId);
        if (typeof packet.content !== 'string' || typeof packet.contentHash !== 'string') fail('invalid_target_response', 'The brain returned an invalid document.', 502);
        return { id: documentId, content: packet.content, hash: packet.contentHash };
      },
      async create(input) {
        if (!exact(input, ['type', 'title', 'body', 'idempotencyKey']) || input.type !== 'note' || !text(input.body, 1024 * 1024)
          || (input.title !== undefined && !text(input.title, 512)) || !text(input.idempotencyKey, 200) || /[\r\n]/.test(input.idempotencyKey)) fail('invalid_request', 'Create requires a note body and an explicit idempotency key.');
        return post('/memories/all/notes', { type: 'note', title: input.title, body: input.body }, { 'Idempotency-Key': input.idempotencyKey }, true);
      },
      async update(input) {
        if (!exact(input, ['id', 'content', 'ifMatch']) || !id(input.id) || !text(input.content, 1024 * 1024) || !/^sha256:[0-9a-f]{64}$/.test(input.ifMatch)) fail('invalid_request', 'Update requires a memory ID, content and prior sha256 hash.');
        return post('/memories/all/documents/' + input.id, { content: input.content }, { 'If-Match': input.ifMatch }, true, 'PUT');
      },
    };
    return {
      context: { signal: session.controller.signal, scope: { generation, brainId: profile?.id ?? '', tabId: typeof tabId === 'string' ? tabId : 'native' }, document: currentDocument, memory, allowWrites },
      check,
      async close() {
        session.done = true; abort();
        await Promise.allSettled([...session.pending]);
        request?.off('aborted', abort); response?.off('close', closed);
        sessions.delete(session); finish();
      },
    };
  };
  return {
    signal, cancel,
    async scopeChanged() {
      if (!active() || notifiedGeneration === coordinator.generation || coordinator.closing) return;
      let scope;
      try {
        scope = openContext(null, null, { native: true }, null, null, false);
        notifiedGeneration = coordinator.generation;
        await host.emit({ type: 'scope.changed' }, scope.context);
      }
      catch { /* Observational hooks never roll back an already committed selection. */ }
      finally { await scope?.close(); }
    },
    async dispose() { cancel(); await host.dispose(); },
    async handle(request, response, url, auth) {
      if (url.pathname !== '/companion/extensions' && !url.pathname.startsWith('/companion/extensions/')) return false;
      const asset = /^\/companion\/extensions\/assets\/([a-zA-Z0-9][a-zA-Z0-9._-]{0,79})\/([a-zA-Z0-9_-]{1,128})\.js$/.exec(url.pathname);
      if (asset && request.method === 'GET') {
        const descriptor = host.snapshot().extensions.find(extension => extension.id === asset[1]);
        if (!descriptor || descriptor.status !== 'active' || descriptor.revision !== asset[2] || !descriptor.ui) fail('not_found', 'Unknown, disabled or stale extension asset.', 404);
        const script = await host.asset(asset[1], asset[2]);
        response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(script); return true;
      }
      if (url.pathname === '/companion/extensions' && request.method === 'GET') {
        const finish = coordinator.enter(Number(request.headers['x-companion-generation']), request.headers['x-companion-tab'], auth.native);
        try { json(response, 200, host.snapshot()); } finally { finish(); }
        return true;
      }
      if (!['/companion/extensions/manage', '/companion/extensions/invoke', '/companion/extensions/event'].includes(url.pathname)) fail('not_found', 'Unknown extension route.', 404);
      if (request.method !== 'POST') fail('method_not_allowed', 'Use POST for extension actions.', 405);
      const body = await jsonBody(request);
      if (url.pathname.endsWith('/manage')) {
        if (!exact(body, ['action', 'id']) || !['reload', 'enable', 'disable', 'remove'].includes(body.action)
          || (body.action === 'reload' ? body.id !== undefined : !name(body.id))) fail('invalid_request', 'Invalid extension management request.');
        const finish = coordinator.enter(Number(request.headers['x-companion-generation']), request.headers['x-companion-tab'], auth.native);
        try {
          if (managing) fail('extension_busy', 'Another extension change is in progress.', 409);
          managing = true;
          try {
            cancel(body.action === 'reload' ? undefined : body.id);
            const snapshot = body.action === 'reload' ? await host.reload() : body.action === 'remove' ? await host.remove(body.id) : await host.setEnabled(body.id, body.action === 'enable');
            json(response, 200, snapshot);
          } finally { managing = false; }
        } finally { finish(); }
        return true;
      }
      if (managing) fail('extension_busy', 'Wait for the extension change to finish.', 409);
      const invocation = url.pathname.endsWith('/invoke');
      if (invocation) {
        if (!exact(body, ['extensionId', 'commandId', 'input', 'document', 'allowWrites']) || !name(body.extensionId) || !name(body.commandId)
          || (body.document !== undefined && !document(body.document)) || (body.allowWrites !== undefined && typeof body.allowWrites !== 'boolean')) fail('invalid_request', 'Invalid extension invocation.');
      } else if (!exact(body, ['event']) || !exact(body.event, ['type', 'document', 'theme']) || !eventTypes.includes(body.event.type)
        || (body.event.document !== undefined && !document(body.event.document)) || (body.event.theme !== undefined && !text(body.event.theme, 128))) fail('invalid_request', 'Invalid extension event.');
      const scope = openContext(request, response, auth, invocation ? body.extensionId : null, (invocation ? body.document : body.event.document) ?? null, invocation && body.allowWrites === true);
      try {
        const result = invocation ? await host.invoke(body.extensionId, body.commandId, body.input ?? null, scope.context) : await host.emit(body.event, scope.context);
        scope.check(); json(response, 200, invocation ? result ?? {} : { ok: true });
      } finally { await scope.close(); }
      return true;
    },
  };
}
