import { WebSocket, WebSocketServer } from '../../dist/adapters/websocket/index.js';

// Each admitted operation pins the selected brain until its acknowledgement.
// Credentials are substituted here, never exposed to the renderer or URL.
export function attachCompanionLive({server, authenticate, coordinator, active, destination, origin}) {
  const sockets = new Set();
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
    let upstream, context, profile, connected = false, authenticating = false;
    const pending = new Map();
    const helloTimer = setTimeout(() => client.close(1008, 'Authenticate first'), 5000);
    const send = packet => { if (client.readyState === WebSocket.OPEN) {if (client.bufferedAmount > 6 * 1024 * 1024) client.close(1009, 'Resynchronize'); else client.send(JSON.stringify(packet));} };
    const reject = (id, code, message) => send({id, ok: false, error: {code, message}});
    const release = id => {const done = pending.get(id); if (done) {pending.delete(id); done();} if (client.readyState !== WebSocket.OPEN && !pending.size) upstream?.close();};
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
          const done = coordinator.enter(context.generation, context.tabId);
          pending.set(packet.id, done); profile = active();
          const dest = await destination(profile);
          const endpoint = new URL('/ws', dest.url); endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
          upstream = new WebSocket(endpoint, {origin: new URL(dest.url).origin, maxPayload: 3 * 1024 * 1024, perMessageDeflate: false, handshakeTimeout: 10000, followRedirects: false});
          upstream.on('message', raw => {
            let response; try { response = JSON.parse(raw.toString()); } catch {upstream.close(); return;}
            if (response.id === packet.id) {connected = response.ok === true; clearTimeout(helloTimer); if (connected && profile.allowWrites !== true) response.result.principal.role = 'reader';}
            if (context.generation === coordinator.generation) send(response);
            if (response.id) release(response.id);
          });
          // An interrupted upstream with dispatched writes has an uncertain
          // outcome. Keep its admissions fenced; a switch must fail visibly.
          upstream.on('close', () => client.close(1011, pending.size ? 'Unconfirmed write; reopen the app' : 'Backend disconnected'));
          upstream.on('error', () => client.close(1011, 'Backend unavailable'));
          upstream.once('open', () => upstream.send(JSON.stringify({...packet, params: {token: dest.key, protocol: 2}})));
          return;
        }
        if (packet.method === 'hello' || pending.has(packet.id) || pending.size >= 64) throw new Error();
        if (!['open', 'close', 'ping', 'edit', 'undo', 'presence', 'resync', 'title', 'stream.start', 'stream.chunk', 'stream.cancel', 'stream.finish', 'stream.status'].includes(packet.method)) {reject(packet.id, 'unknown_method', 'Unsupported live operation.'); return;}
        if (profile.allowWrites !== true && !['open', 'close', 'ping', 'presence', 'stream.status'].includes(packet.method)) {reject(packet.id, 'read_only', 'This connection is read-only.'); return;}
        const done = coordinator.enter(context.generation, context.tabId); pending.set(packet.id, done);
        if (upstream.readyState !== WebSocket.OPEN || upstream.bufferedAmount > 6 * 1024 * 1024) {release(packet.id); client.close(1013, 'Resynchronize'); return;}
        upstream.send(JSON.stringify(packet));
      } catch (error) {
        if (packet?.id) reject(packet.id, error.code || 'invalid_request', error.code ? error.message : 'Invalid live request.');
        else client.close(1008, 'Invalid live request');
      }
    });
    client.on('close', () => {clearTimeout(helloTimer); clearInterval(check); transition(); sockets.delete(client); if (!pending.size) upstream?.close();});
    client.on('error', () => client.close());
  });
  return {close: async () => {for (const socket of sockets) socket.terminate(); wss.close();}};
}
