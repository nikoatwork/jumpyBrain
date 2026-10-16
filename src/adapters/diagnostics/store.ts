import { constants } from "node:fs";
import { lstat, mkdir, open, opendir, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createDiagnosticBuffer, diagnosticId, normalizeDiagnosticSnapshot, unavailableDiagnosticSnapshot, sanitizeDiagnosticEvent, type DiagnosticComponent, type DiagnosticSnapshot } from "./events.js";

const SEGMENT = /^events-(\d{13})-[a-f0-9]{8}\.jsonl$/;
export function newDiagnosticId() { return "d_" + randomBytes(16).toString("hex"); }
export function createDiagnosticStore(options: { directory: string; component: DiagnosticComponent; now?: () => number; segmentBytes?: number; maxSegments?: number; retentionMs?: number; metadata?: { version?: string; build?: string; runtimeVersion?: string }; append?: (line: string) => Promise<void>; persist?: boolean }) {
  const now = options.now ?? Date.now;
  const segmentBytes = Math.max(2048, Math.min(1024 * 1024, options.segmentBytes ?? 1024 * 1024));
  const maximum = Math.max(1, Math.min(10, options.maxSegments ?? 10));
  const retention = Math.max(1, Math.min(7 * 86400000, options.retentionMs ?? 7 * 86400000));
  let tail: Promise<void> = Promise.resolve(), queued = 0, failures = 0, dropped = 0, active: string | null = null;
  const session = newDiagnosticId();
  let coalesced = 0;
  const recentSuccess = new Map<string, number>();
  const memory = createDiagnosticBuffer(options.component);
  // Resolve only a host-supplied trusted base's system aliases, never a managed
  // diagnostic directory or segment symlink. All descendants are checked below.
  async function directory() {
    const absolute = path.resolve(options.directory);
    const segments = absolute.split(path.sep).filter(Boolean);
    let current = path.parse(absolute).root;
    for (const part of segments) {
      current = path.join(current, part);
      try { await mkdir(current, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      let stat = await lstat(current);
      if (stat.isSymbolicLink() && process.platform === "darwin" && ["/var", "/tmp"].includes(current)) { current = await realpath(current); stat = await lstat(current); }
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("unsafe diagnostic directory");
    }
    const info = await lstat(current);
    if (info.uid !== process.getuid?.() || (info.mode & 0o077) || !(info.mode & 0o200)) throw new Error("unsafe diagnostic directory permissions");
    return current;
  }
  async function segments(dir: string) {
    const names: string[] = []; let inspected = 0;
    // Stop streaming before allocating an unbounded hostile directory listing.
    for await (const entry of await opendir(dir)) {
      if (++inspected > 64) throw new Error("too many diagnostic entries");
      if (SEGMENT.test(entry.name)) names.push(entry.name);
    }
    names.sort();
    const files = [];
    for (const name of names) {
      const info = await lstat(path.join(dir, name));
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.size > 1024 * 1024 || (info.mode & 0o077)) throw new Error("unsafe diagnostic segment");
      files.push({ name, size: info.size, time: Number(SEGMENT.exec(name)![1]) });
    }
    return files;
  }
  async function append(line: string) {
    const dir = await directory(); let files = await segments(dir);
    const expired = files.filter((f) => f.time < now() - retention);
    for (const file of expired) { await unlink(path.join(dir, file.name)); if (active === file.name) active = null; }
    files = files.filter((f) => !expired.includes(f));
    const current = files.find((f) => f.name === active);
    if (!current || current.size + Buffer.byteLength(line) > segmentBytes) {
      while (files.length >= maximum) { const file = files.shift()!; await unlink(path.join(dir, file.name)); }
      active = `events-${String(now()).padStart(13, "0")}-${randomBytes(4).toString("hex")}.jsonl`;
    }
    const file = await open(path.join(dir, active!), constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || stat.size + Buffer.byteLength(line) > segmentBytes) throw new Error("unsafe diagnostic append");
      await file.writeFile(line);
    } finally { await file.close(); }
  }
  const flush = async (timeoutMs = 500) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([tail.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(1, Math.min(timeoutMs, 2000))); })]); }
    finally { clearTimeout(timer); }
  };
  return {
    session,
    record(input: unknown) {
      let event;
      try {
        const fields = input && typeof input === "object" ? input as Record<string, unknown> : {};
        event = sanitizeDiagnosticEvent({ ...options.metadata, ...fields, at: fields.at ?? new Date(now()).toISOString(), component: options.component, session: diagnosticId(fields.session) ?? session });
      } catch { dropped++; return; }
      if (!event) { dropped++; return; }
      // Repeated healthy background reads should not consume the disk budget
      // ahead of failure evidence. Never sample failures or write outcomes.
      if (event.severity === "info" && event.outcome === "ok" && ["poll", "document_read", "status"].includes(event.operation)) {
        const key = event.operation + ":" + event.code + ":" + event.status, previous = recentSuccess.get(key), elapsed = now() - (previous ?? 0);
        if (previous !== undefined && elapsed >= 0 && elapsed < 30000) { coalesced++; return; }
        recentSuccess.set(key, now());
        if (recentSuccess.size > 16) recentSuccess.delete(recentSuccess.keys().next().value!);
      }
      memory.record(event);
      if (options.persist === false) return;
      if (queued >= 128) { dropped++; return; }
      queued++;
      const line = JSON.stringify(event) + "\n";
      tail = tail.then(() => (options.append ?? append)(line)).catch(() => { failures++; }).finally(() => { queued--; });
    },
    flush,
    async snapshot(): Promise<DiagnosticSnapshot> {
      if (options.persist === false) return { ...memory.snapshot(), coalesced };
      const settled = await flush(); const buffer = createDiagnosticBuffer(options.component);
      let truncatedBytes = 0, readFailed = !settled;
      try {
        const dir = await directory(); const files = (await segments(dir)).filter((f) => f.time >= now() - retention).slice(-maximum);
        for (const info of files) {
          const file = await open(path.join(dir, info.name), constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const stat = await file.stat();
            if (!stat.isFile() || stat.nlink !== 1 || stat.size > 1024 * 1024 || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) throw new Error("unsafe diagnostic read");
            const size = Math.min(stat.size, 65536), offset = stat.size - size;
            const data = Buffer.alloc(size); const read = await file.read(data, 0, size, offset);
            let text = data.subarray(0, read.bytesRead).toString("utf8");
            if (offset) { const end = text.indexOf("\n"); text = end < 0 ? "" : text.slice(end + 1); truncatedBytes += offset; }
            for (const line of text.split("\n")) {
              if (!line) continue;
              try { const event = sanitizeDiagnosticEvent(JSON.parse(line)); if (!event || event.component !== options.component) throw new Error(); buffer.record(event); }
              catch { readFailed = true; }
            }
          } finally { await file.close(); }
        }
      } catch { readFailed = true; }
      // Even a denied/full disk retains bounded evidence from the current process.
      const stored = buffer.snapshot(), recent = memory.snapshot();
      const identities = new Set(stored.events.map((e) => JSON.stringify(e)));
      for (const event of recent.events) if (!identities.has(JSON.stringify(event))) buffer.record(event);
      return { ...buffer.snapshot(), availability: readFailed || failures || dropped ? "degraded" : "available", failures: failures + Number(readFailed), dropped: dropped + recent.dropped + buffer.snapshot().dropped, truncatedBytes, coalesced };
    },
  };
}
export type DiagnosticStore = ReturnType<typeof createDiagnosticStore>;

// Native host writes this bounded schema snapshot atomically, not a raw log.
export async function readNativeDiagnosticSnapshot(filePath: string): Promise<DiagnosticSnapshot> {
  const unavailable = unavailableDiagnosticSnapshot("native");
  let file;
  try {
    const parent = await lstat(path.dirname(filePath));
    if (!parent.isDirectory() || parent.uid !== process.getuid?.() || (parent.mode & 0o077)) return unavailable;
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await file.stat();
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.size > 65536 || (info.mode & 0o077)) return unavailable;
    const data = Buffer.alloc(Math.min(info.size, 65536));
    const read = await file.read(data, 0, data.length, 0);
    const packet = JSON.parse(data.subarray(0, read.bytesRead).toString("utf8"));
    if (!Array.isArray(packet.events) || packet.events.length > 64) return unavailable;
    // Schema normalization is shared; native freshness and degradation remain local.
    const { coalesced, ...snapshot } = normalizeDiagnosticSnapshot({ ...unavailable,
      events: packet.events, dropped: packet.dropped }, 64);
    snapshot.events = snapshot.events.filter((event) => Date.parse(event.at) >= Date.now() - 7 * 86400000);
    snapshot.failures = Number(snapshot.events.length !== packet.events.length);
    snapshot.availability = snapshot.failures ? "degraded" : "available";
    return snapshot;
  } catch { return unavailable; } finally { await file?.close().catch(() => {}); }
}
