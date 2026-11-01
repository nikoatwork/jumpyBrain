import { randomUUID } from "node:crypto";
import { ensureRootBackend } from "../app/backend-host/index.js";
import { resolveCliTarget } from "./targets.js";
import { createLocalMemoryTransport } from "./local-transport.js";
import type { ParsedCliArgs } from "./args.js";

const usage = "jumpybrain collaborate <open|watch|edit|stream|status|cancel|finish|undo|resync> --id <note-id> [--root <directory> | --target-url <https-origin>] [--start <UTF-16 offset> --delete <count>] [--json]. Pipe replacement text to edit, or generated UTF-8 chunks to stream. Publishing requires a connection; a lost acknowledgement is never retried automatically.";

export async function collaborateCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log(usage); return; }
  const operation = args._[1];
  const allowed = new Set(["_", "id", "root", "target-url", "remote-url", "start", "delete", "client-id", "stream-id", "json"]);
  if (args._.length !== 2 || !["open", "watch", "edit", "stream", "status", "cancel", "finish", "undo", "resync"].includes(operation)) throw new Error(usage);
  for (const [key, value] of Object.entries(args)) if (!allowed.has(key) || Array.isArray(value) && key !== "_") throw new Error("Unknown or repeated collaboration argument.");
  if (typeof args.id !== "string") throw new Error("--id is required.");
  for (const key of ["start", "delete"]) if (args[key] !== undefined && (typeof args[key] !== "string" || !/^\d+$/.test(args[key] as string) || !Number.isSafeInteger(Number(args[key])))) throw new Error(`--${key} must be a nonnegative integer.`);
  if (!["edit", "stream"].includes(operation) && (args.start !== undefined || args.delete !== undefined)) throw new Error("Offsets apply only to edit or stream.");
  if (["status", "cancel", "finish"].includes(operation) && typeof args["stream-id"] !== "string") throw new Error("--stream-id is required for stream status, cancellation or completion.");
  if (args["stream-id"] !== undefined && (!["stream", "status", "cancel", "finish"].includes(operation) || typeof args["stream-id"] !== "string" || !(args["stream-id"] as string).trim() || (args["stream-id"] as string).length > 256)) throw new Error("Use a bounded --stream-id with a streaming operation.");
  if (args.json !== undefined && args.json !== true) throw new Error("--json takes no value.");
  const target = resolveCliTarget(args, {allowDiscovery: true});
  let url: string, token: string;
  if (target.kind === "local") {
    const backend = await ensureRootBackend(target.root ?? await createLocalMemoryTransport().findMemoryRoot());
    url = backend.url; token = backend.token;
  } else { url = target.url; token = process.env.JUMPYBRAIN_API_KEY?.trim() ?? ""; if (!token) throw new Error("JUMPYBRAIN_API_KEY is required."); }
  const endpoint = new URL("/ws", url); endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(endpoint);
  const pending = new Map<string, {resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();
  let watch = false, clientId = "";
  const print = (snapshot: any) => console.log(JSON.stringify(args.json ? snapshot : {documentId: snapshot.documentId, clientId: snapshot.clientId, epoch: snapshot.epoch, revision: snapshot.revision, saved: snapshot.saved, conflict: snapshot.conflict, stream: snapshot.stream}));
  socket.addEventListener("message", event => {
    let packet: any; try { packet = JSON.parse(String(event.data)); } catch { socket.close(); return; }
    if (packet.id && pending.has(packet.id)) { const waiter = pending.get(packet.id)!; pending.delete(packet.id); clearTimeout(waiter.timer); packet.ok ? waiter.resolve(packet.result) : waiter.reject(Object.assign(new Error(packet.error?.message ?? "Live request failed."), packet.error)); }
    else if (watch && packet.event === "document") print(packet.snapshot);
  });
  socket.addEventListener("close", () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Connection lost. A dispatched operation may have committed; inspect the note before retrying.")); } pending.clear(); });
  const request = (method: string, params: object) => new Promise<any>((resolve, reject) => {
    if (socket.readyState !== WebSocket.OPEN) {reject(new Error("The backend is disconnected.")); return;}
    const id = randomUUID(); const timer = setTimeout(() => {pending.delete(id); reject(new Error("Acknowledgement timed out. Inspect canonical state before retrying.")); socket.close();}, 30_000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
  });
  const interrupted = () => socket.close();
  process.once("SIGINT", interrupted); process.once("SIGTERM", interrupted);
  try {
    await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => {socket.close(); reject(new Error("Backend connection timed out."));}, 10_000); socket.addEventListener("open", () => {clearTimeout(timer); resolve();}, {once: true}); socket.addEventListener("error", () => {clearTimeout(timer); reject(new Error("Could not connect to the backend."));}, {once: true}); });
    await request("hello", {token, protocol: 2});
    clientId = typeof args["client-id"] === "string" ? args["client-id"] : process.env.JUMPYBRAIN_CLIENT_ID?.trim() || randomUUID();
    if (!clientId || clientId.length > 128) throw new Error("--client-id must contain 1–128 characters.");
    const base = {documentId: args.id, clientId, actorKind: "agent"};
    let snapshot = await request("open", base);
    if (operation === "open") {print({...snapshot, clientId}); return;}
    if (operation === "watch") { watch = true; print({...snapshot, clientId}); await new Promise<void>(resolve => socket.addEventListener("close", () => resolve(), {once: true})); return; }
    const version = {...base, epoch: snapshot.epoch, baseRevision: snapshot.revision};
    if (["status", "cancel", "finish"].includes(operation)) snapshot = await request("stream." + operation, {...version, streamId: args["stream-id"]});
    else if (operation === "undo" || operation === "resync") snapshot = await request(operation, {...version, operationId: randomUUID()});
    else if (operation === "edit") {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of process.stdin) {const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > 2 * 1024 * 1024) throw new Error("Edit exceeds the 2 MiB live limit."); chunks.push(buffer);}
      snapshot = await request("edit", {...version, operationId: randomUUID(), start: Number(args.start ?? 0), deleteCount: Number(args.delete ?? 0), insert: new TextDecoder("utf-8", {fatal: true}).decode(Buffer.concat(chunks))});
    } else {
      const streamId = typeof args["stream-id"] === "string" ? args["stream-id"] : randomUUID(); let sequence = 0;
      snapshot = await request("stream.start", {...version, streamId, start: Number(args.start ?? snapshot.body.length)});
      const decoder = new TextDecoder("utf-8", {fatal: true});
      for await (const chunk of process.stdin) {
        const text = decoder.decode(chunk, {stream: true});
        // Bound individual operations even when the producer writes a very large chunk.
        for (let offset = 0; offset < text.length;) {let end = Math.min(text.length, offset + 8192); if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--; const insert = text.slice(offset, end); offset = end; snapshot = await request("stream.chunk", {...base, epoch: snapshot.epoch, streamId, sequence: sequence++, insert});}
      }
      const tail = decoder.decode(); if (tail) snapshot = await request("stream.chunk", {...base, epoch: snapshot.epoch, streamId, sequence: sequence++, insert: tail});
      snapshot = await request("stream.finish", {...base, epoch: snapshot.epoch, streamId});
    }
    print({...snapshot, clientId});
  } finally {socket.close(); process.off("SIGINT", interrupted); process.off("SIGTERM", interrupted); for (const waiter of pending.values()) clearTimeout(waiter.timer);}
}
