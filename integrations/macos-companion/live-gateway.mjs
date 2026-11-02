import { WebSocket, WebSocketServer } from '../../dist/adapters/websocket/index.js';

const reads = new Set(['open', 'close', 'ping', 'presence', 'stream.status', 'history.read', 'recovery.read']);
// resync can reset an unsafe session/epoch when the upstream credential writes.
// A read-only profile must not gain that capability through credential substitution.
const writes = new Set(['edit', 'undo', 'redo', 'resync', 'title', 'stream.start', 'stream.chunk', 'stream.cancel', 'stream.finish']);

// Mutations pin the selected brain until acknowledgement. Reads only validate
// scope: they stay on the captured upstream and cannot dirty a switch barrier.
// Credentials are substituted here, never exposed to the renderer or URL.
export function attachCompanionLive({server, authenticate, coordinator, active, destination, destinationCurrent = () => true, invalidateDestination = () => {}, origin}) {
  const sockets = new Set(), destinations = new Map();
  const wss = new WebSocketServer({noServer: true, maxPayload: 3 * 1024 * 1024, perMessageDeflate: false});
  server.on('upgrade', (request, socket, head) => {
    try {
      if (sockets.size >= 64 || request.url !== '/ws' || request.headers.origin !== origin()) throw new Error();
      authenticate(request, '/ws');
      wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client));
    } catch { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); }
  });
  wss.on('connection', client => {
    sockets.add(client);
    let upstream, context, profile, dest, connected = false, authenticating = false;
    const pending = new Map();
    const helloTimer = setTimeout(() => client.close(1008, 'Authenticate first'), 5000);
    const send = packet => { if (client.readyState === WebSocket.OPEN) {if (client.bufferedAmount > 6 * 1024 * 1024) client.close(1009, 'Resynchronize'); else client.send(JSON.stringify(packet));} };
    const reject = (id, code, message) => send({id, ok: false, error: {code, message}});
    const release = id => {const entry = pending.get(id); if (entry) {pending.delete(id); entry.done();} if (client.readyState !== WebSocket.OPEN && !pending.size) upstream?.close();};
    const releaseReads = () => {for (const [id,entry] of pending) if (!entry.write) release(id);};
    const admit = (id,write) => {const done = coordinator.enter(context.generation, context.tabId); if (!write) done(); pending.set(id, {write, done:write ? done : () => {}});};
    const transition = coordinator.onTransition(() => { if (context && (context.generation !== coordinator.generation || coordinator.closing)) client.close(1008, 'Brain session changed'); });
    const check = setInterval(() => { if (context && context.generation !== coordinator.generation) client.close(1008, 'Brain session changed'); }, 250); check.unref?.();
    client.on('message', async raw => {
      let packet;
      try {
        packet = JSON.parse(raw.toString());
        if (!packet || typeof packet.id !== 'string' || packet.id.length > 128 || typeof packet.method !== 'string' || !packet.params || typeof packet.params !== 'object' || Array.isArray(packet.params)) throw new Error();
        if (!connected) {
          if (authenticating || packet.method !== 'hello' || packet.params.protocol !== 2 || packet.params.token !== 'companion-session') throw new Error();
          authenticating = true;
          context = {generation: packet.params.generation, tabId: packet.params.tabId};
          admit(packet.id, false); profile = active();
          dest = await destination(profile);
          if (client.readyState !== WebSocket.OPEN) {release(packet.id); return;}
          destinations.set(client, dest);
          if (!destinationCurrent(dest)) throw new Error();
          const recheck = coordinator.enter(context.generation, context.tabId); recheck();
          const endpoint = new URL('/ws', dest.url); endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
          upstream = new WebSocket(endpoint, {origin: new URL(dest.url).origin, maxPayload: 3 * 1024 * 1024, perMessageDeflate: false, handshakeTimeout: 10000, followRedirects: false});
          upstream.on('message', raw => {
            let response; try { response = JSON.parse(raw.toString()); } catch {upstream.close(); return;}
            if (response.id === packet.id) {connected = response.ok === true; clearTimeout(helloTimer); if (connected && profile.allowWrites !== true) response.result.principal.role = 'reader';}
            if (context.generation === coordinator.generation && destinationCurrent(dest)) send(response);
            if (response.id) release(response.id);
          });
          // An interrupted upstream with dispatched writes has an uncertain
          // outcome. Keep its admissions fenced; a switch must fail visibly.
          upstream.on('close', () => {if (client.readyState === WebSocket.OPEN) invalidateDestination(dest);releaseReads();client.close(1011, pending.size ? 'Unconfirmed write; reopen the app' : 'Backend disconnected');});
          upstream.on('error', () => {if (client.readyState === WebSocket.OPEN) invalidateDestination(dest);releaseReads();client.close(1011, 'Backend unavailable');});
          upstream.once('open', () => upstream.send(JSON.stringify({...packet, params: {token: dest.key, protocol: 2}})));
          return;
        }
        if (!destinationCurrent(dest)) {client.close(1012, 'Backend changed; resynchronize'); return;}
        if (packet.method === 'hello' || pending.has(packet.id) || pending.size >= 64) throw new Error();
        if (!reads.has(packet.method) && !writes.has(packet.method)) {reject(packet.id, 'unknown_method', 'Unsupported live operation.'); return;}
        const write = writes.has(packet.method);
        if (profile.allowWrites !== true && write) {reject(packet.id, 'read_only', 'This connection is read-only.'); return;}
        admit(packet.id, write);
        if (upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 6 * 1024 * 1024) {release(packet.id); client.close(1013, 'Resynchronize'); return;}
        upstream.send(JSON.stringify(packet));
      } catch (error) {
        if (packet?.id && pending.get(packet.id)?.write === false) release(packet.id);
        if (packet?.id) reject(packet.id, error.code || 'invalid_request', error.code ? error.message : 'Invalid live request.');
        else client.close(1008, 'Invalid live request');
      }
    });
    client.on('close', () => {clearTimeout(helloTimer); clearInterval(check); transition(); sockets.delete(client); destinations.delete(client); releaseReads(); if (!pending.size) upstream?.close();});
    client.on('error', () => client.close());
  });
  return {retireDestination: dest => { for (const [client, captured] of destinations) if (captured === dest) client.close(1012, 'Backend changed; resynchronize'); }, close: async () => {for (const socket of sockets) socket.terminate(); wss.close();}};
}
