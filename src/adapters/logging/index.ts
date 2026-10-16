import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LogLevel = "info" | "warn" | "error";

export interface FileLogger {
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
  const log = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    const date = now();
    const file = path.join(options.root, ".jumpybrain", "logs", `${safeName(options.name)}-${date.toISOString().slice(0, 10)}.log`);
    void append(file, `${formatLogLine({ date, level, event, details })}\n`).catch(() => undefined);
  };
  return {
    log,
    info: (event, details) => log("info", event, details),
    warn: (event, details) => log("warn", event, details),
    error: (event, details) => log("error", event, details),
  };
}

export function formatLogLine(input: { date: Date; level: LogLevel; event: string; details?: Record<string, unknown> }): string {
  const fields = Object.entries(input.details ?? {})
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${safeKey(key)}=${formatValue(redact(key, value))}`);
  return [input.date.toISOString(), input.level.toUpperCase(), safeName(input.event), ...fields].join(" ");
}

function redact(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string" && SECRET_VALUE.test(value)) return "[redacted]";
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
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, line, "utf8");
}
