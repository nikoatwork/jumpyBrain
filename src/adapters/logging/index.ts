import { constants } from "node:fs";
import { mkdir, lstat, open, readdir, unlink, rename } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";

export interface FileLogger {
  flush?(timeoutMs?: number): Promise<boolean>;
  log(level: LogLevel, event: string, details?: Record<string, unknown>): void;
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
}

export interface FileLoggerOptions {
  root: string;
  name: string;
  now?: () => Date;
  append?: (file: string, line: string) => Promise<void>;
}

const SECRET_KEY = /authorization|api[-_]?key|token|secret|password|body|content/i;
const SECRET_VALUE = /bearer\s+\S+|api[-_]?key\s*[:=]|token\s*[:=]/i;

export function createFileLogger(options: FileLoggerOptions): FileLogger {
  const now = options.now ?? (() => new Date());
  const append = options.append ?? appendLine;
  let tail = Promise.resolve(), queued = 0;
  const log = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    try {
      if (queued >= 128) return;
      const date = now();
      const file = path.join(options.root, ".jumpybrain", "logs", `${safeName(options.name)}-${date.toISOString().slice(0, 10)}.log`);
      const line = `${formatLogLine({ date, level, event, details })}\n`;
      queued++;
      tail = tail.then(() => append(file, line)).catch(() => undefined).finally(() => { queued--; });
    } catch { /* Logging is never allowed to fail a user operation. */ }
  };
  return {
    log,
    info: (event, details) => log("info", event, details),
    warn: (event, details) => log("warn", event, details),
    error: (event, details) => log("error", event, details),
    async flush(timeoutMs = 500) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([tail.then(() => true), new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), Math.max(1, Math.min(2000, timeoutMs))); })]); }
      finally { clearTimeout(timer); }
    },
  };
}

export function formatLogLine(input: { date: Date; level: LogLevel; event: string; details?: Record<string, unknown> }): string {
  let fields: string[] = [];
  try { fields = Object.entries(input.details ?? {}).slice(0, 32)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${safeKey(key)}=${formatValue(redact(key, value, new WeakSet(), 0))}`); } catch { fields = ["details=[unavailable]"]; }
  return [input.date.toISOString(), input.level.toUpperCase(), safeName(input.event), ...fields].join(" ");
}

function redact(key: string, value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string" && SECRET_VALUE.test(value)) return "[redacted]";
  if (value && typeof value === "object") {
    if (seen.has(value) || depth >= 4) return "[omitted]";
    seen.add(value);
    if (value instanceof Error) return "[error details omitted]";
    if (Array.isArray(value)) return value.slice(0, 16).map((item) => redact(key, item, seen, depth + 1));
    return Object.fromEntries(Object.entries(value).slice(0, 16).map(([child, item]) => [safeKey(child), redact(child, item, seen, depth + 1)]));
  }
  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") return "[omitted]";
  return value;
}

function formatValue(value: unknown): string {
  const raw = typeof value === "string" ? value : value === null ? "null" : typeof value === "object" ? JSON.stringify(value) : String(value);
  const compact = raw.replace(/[\r\n\t]+/g, " ").slice(0, 300);
  return /^[A-Za-z0-9_./:@%+-]+$/.test(compact) ? compact : JSON.stringify(compact);
}

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 60) || "field";
}

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "log";
}

async function appendLine(file: string, line: string): Promise<void> {
  const dir = path.dirname(file), parent = path.dirname(dir);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (!(await lstat(parent)).isDirectory()) throw new Error("unsafe log directory");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (!(await lstat(dir)).isDirectory()) throw new Error("unsafe log directory");
  const prefix = path.basename(file).slice(0, -14);
  const managed = (await readdir(dir)).filter((name) => name.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.log(?:\.previous)?$/.test(name.slice(prefix.length))).sort();
  let total = 0;
  for (const name of managed.reverse()) {
    const target = path.join(dir, name), info = await lstat(target);
    if (!info.isFile() || info.nlink !== 1) throw new Error("unsafe log file");
    total += info.size;
    if (name !== path.basename(file) && (total > 9 * 1024 * 1024 || Date.now() - info.mtimeMs > 7 * 86400000)) await unlink(target);
  }
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.nlink !== 1) throw new Error("unsafe log file");
    if (info.size + Buffer.byteLength(line) > 1024 * 1024) {
      const previous = file + ".previous";
      try { const prior = await lstat(previous); if (!prior.isFile() || prior.nlink !== 1) throw new Error("unsafe log rotation"); await unlink(previous); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await rename(file, previous);
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const handle = await open(file, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try { const info = await handle.stat(); if (!info.isFile() || info.nlink !== 1) throw new Error("unsafe log file"); await handle.chmod(0o600); await handle.writeFile(line); }
  finally { await handle.close(); }
}
