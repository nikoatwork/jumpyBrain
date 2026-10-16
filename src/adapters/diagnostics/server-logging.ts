import { AsyncLocalStorage } from "node:async_hooks";
import type { FileLogger, LogLevel } from "../logging/index.js";
import { diagnosticCode, diagnosticOperation, statusCode } from "./events.js";
import type { DiagnosticStore } from "./store.js";
export const diagnosticRequestContext = new AsyncLocalStorage<string>();
export function diagnosticServerLogger(base: FileLogger, store: DiagnosticStore): FileLogger {
  const log = (level: LogLevel, event: string, details: Record<string, unknown> = {}) => {
    if (details.saved === true) store.record({ operation: "create", request: diagnosticRequestContext.getStore(), severity: "info", outcome: "ok", code: "saved" });
    if (details.saved === true && details.indexing_status === "failed") store.record({ operation: "index", request: diagnosticRequestContext.getStore(), severity: "warn", outcome: "pending", code: "index_state_failed" });
    const operation = event.includes("index") ? "index" : diagnosticOperation(details.path, typeof details.method === "string" ? details.method : "GET");
    const failed = level === "error" || event.endsWith("failure") || typeof details.status === "number" && details.status >= 400;
    const code = diagnosticCode(details.error_code ?? details.code);
    store.record({ operation, request: diagnosticRequestContext.getStore(), severity: failed ? "warn" : level,
      outcome: failed ? "failed" : details.stale === true ? "pending" : "ok",
      code: code === "unknown" ? failed ? statusCode(details.status) : details.stale === true ? "pending" : "none" : code,
      status: details.status, durationMs: details.duration_ms });
    try { base[level](event, details); } catch { /* Infrastructure diagnostics cannot fail requests. */ }
  };
  return { log, info: (event, details) => log("info", event, details), warn: (event, details) => log("warn", event, details), error: (event, details) => log("error", event, details), flush: (ms) => base.flush?.(ms) ?? Promise.resolve(true) };
}
