// Fault injection for the production WS RPC, without changing backend code.
// Install BEFORE navigation. Browser and server still exchange real frames.
export async function installCollaborationSmokeTransport(page, { url = "**/ws" } = {}) {
  const rules = [], eventRules = [], connections = new Set(), observed = [];
  await page.routeWebSocket(url, (client) => {
    const server = client.connectToServer(), requests = new Map();
    const connection = { client, server, closed: false }; connections.add(connection);
    client.onClose((code, reason) => { connection.closed = true; connections.delete(connection); const forwarded = code >= 1000 && code <= 1014 && ![1004,1005,1006].includes(code) || code >= 3000 && code <= 4999 ? code : 1000; try { server.close({ code: forwarded, reason: reason ?? "" }); } catch {} });
    client.onMessage(async (data) => {
      if (connection.closed) return;
      const message = parse(data);
      if (message?.id !== undefined && typeof message.method === "string") {
        const rule = rules.find((rule) => !rule.used && rule.method === message.method && (!rule.when || rule.when(message)));
        if (rule) rule.used = true;
        requests.set(message.id, { method: message.method, rule }); observed.push(message);
        if (rule?.kind === "reject") { client.send(JSON.stringify({ id: message.id, ok: false, error: { code: rule.code ?? "source_unavailable", message: rule.message ?? "Injected live publication failure" } })); rule.arrived.resolve(message); return; }
        if (rule?.kind === "holdRequest") { rule.arrived.resolve(message); await rule.released.promise; }
      }
      if (!connection.closed) { try { server.send(data); } catch { /* a disposed client cannot release a held mutation */ } }
    });
    server.onMessage(async (data) => {
      if (connection.closed) return;
      const message = parse(data);
      if (message?.event === "document") {
        const held = eventRules.find((rule) => !rule.used && (!rule.documentId || rule.documentId === message.documentId) && (!rule.when || rule.when(message.snapshot)));
        if (held) { held.used = true; held.arrived.resolve(message); await held.released.promise; }
      }
      const request = message?.id !== undefined ? requests.get(message.id) : undefined;
      // Own document events can confirm a mutation before its RPC response.
      // Holding/dropping an acknowledgement must affect BOTH channels.
      const related = message?.event === "document" ? message.snapshot?.operation?.operationId : message?.ok === true ? message.result?.operation?.operationId : undefined;
      const pending = related ? [...requests.values()].find((request) => request.rule?.operationId === related) : request;
      if (request?.rule && ["holdReply", "dropReply"].includes(request.rule.kind)) { request.rule.arrived.resolve(message); if (request.rule.kind === "dropReply") { connection.closed = true; try { server.close({ code: 1011, reason: "Injected lost acknowledgement" }); } catch {} client.close({ code: 1011, reason: "Injected lost acknowledgement" }); return; } await request.rule.released.promise; }
      else if (pending?.rule && !pending.rule.rpcOnly && ["holdReply", "dropReply"].includes(pending.rule.kind)) { pending.rule.arrived.resolve(message); if (pending.rule.kind === "dropReply") { connection.closed = true; try { server.close({ code: 1011, reason: "Injected lost acknowledgement" }); } catch {} client.close({ code: 1011, reason: "Injected lost acknowledgement" }); return; } await pending.rule.released.promise; }
      if (connection.closed) return;
      try { client.send(data); } catch { /* disconnected fault target */ }
    });
  });
  function add(kind, method = "edit", options = {}) {
    const rule = { kind, method, ...options, used: false, arrived: deferred(), released: deferred() };
    const supplied = rule.when;
    rule.when = (request) => { const match = !supplied || supplied(request); if (match) rule.operationId = request.params?.operationId; return match; };
    rules.push(rule);
    return { arrived: rule.arrived.promise, release: () => rule.released.resolve(), get used() { return rule.used; } };
  }
  return {
    holdNextEvent(documentId, when) {
      const rule = { documentId, when, used: false, arrived: deferred(), released: deferred() }; eventRules.push(rule);
      return { arrived: rule.arrived.promise, release: () => rule.released.resolve(), get used() { return rule.used; } };
    },
    holdNextRequest: (method, options) => add("holdRequest", method, options),
    holdNextReply: (method, options) => add("holdReply", method, options),
    dropNextReply: (method, options) => add("dropReply", method, options),
    rejectNext: (method, options) => add("reject", method, options),
    disconnect() { for (const connection of connections) { connection.closed = true; try { connection.server.close({ code: 1012, reason: "Injected connection restart" }); } catch {} connection.client.close({ code: 1012, reason: "Injected connection restart" }); } },
    observed,
  };
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function parse(value) { try { return JSON.parse(typeof value === "string" ? value : value.toString()); } catch { return undefined; } }
