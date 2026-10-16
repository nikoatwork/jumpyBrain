export const DIAGNOSTIC_COMPONENTS = ["browser", "server", "gateway", "native", "electron"] as const;
export type DiagnosticComponent = typeof DIAGNOSTIC_COMPONENTS[number];
const OPERATIONS = ["request", "document_read", "document_write", "document_delete", "create", "search", "index", "recent", "graph", "status", "resolve", "connection", "poll", "switch", "ack", "register", "credential", "bridge", "startup", "shutdown", "update", "renderer", "exception", "rejection", "editor", "external_refresh", "save", "export"] as const;
export type DiagnosticOperation = typeof OPERATIONS[number];
export const DIAGNOSTIC_CODES = ["none", "unknown", "network", "aborted", "timeout", "unauthorized", "forbidden", "conflict", "unconfirmed", "saved", "pending", "index_failed", "index_state_failed", "creation_replay_failed", "not_found", "validation_failed", "server_misconfigured", "stale_generation", "target_timeout", "offline", "credential_unavailable", "write_not_authorized", "switch_busy", "switch_timeout", "switch_rejected", "switch_closed", "tab_busy", "unsafe_redirect", "companion_failed", "backend_unavailable", "backend_timeout", "index_missing", "index_busy", "index_stale", "index_pending", "rate_limited", "unavailable", "type_error", "range_error", "syntax_error", "error", "crashed", "killed", "oom", "unresponsive", "load_failed", "bootstrap_failed", "bridge_lost", "child_terminated", "version_mismatch", "storage_failed", "native_start_failed", "native_update_failed", "normal", "clean-exit", "abnormal-exit", "launch-failed", "integrity-failure", "memory-eviction"] as const;
export type DiagnosticEvent = {
  schema: 1; at: string; component: DiagnosticComponent; operation: DiagnosticOperation;
  severity: "info" | "warn" | "error"; code: string; outcome: "ok" | "failed" | "aborted" | "pending" | "unconfirmed";
  session?: string; request?: string; status?: number; durationMs?: number; exitCode?: number;
  location?: "shell" | "browser_bundle"; line?: number; column?: number;
  version?: string; build?: string; runtimeVersion?: string;
};
export type DiagnosticSnapshot = {
  component: DiagnosticComponent; availability: "available" | "degraded" | "unavailable";
  events: DiagnosticEvent[]; dropped: number; failures: number; truncatedBytes: number;
  coalesced?: number;
};
const member = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T => typeof value === "string" && choices.includes(value as T) ? value as T : fallback;
const number = (value: unknown, max: number, min = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : undefined;
export function diagnosticId(value: unknown): string | undefined { return typeof value === "string" && /^d_[a-f0-9]{32}$/.test(value) ? value : undefined; }
export function diagnosticCode(value: unknown): string {
  const aliases: Record<string, string> = { precondition_failed: "conflict", auth_required: "unauthorized", invalid_api_key: "unauthorized", save_blocked: "switch_rejected", save_timeout: "switch_timeout", tab_left: "switch_rejected", execution_timeout: "backend_timeout", execution_failed: "backend_unavailable", missing_index: "index_missing", duplicate_title: "validation_failed", invalid_title: "validation_failed" };
  return typeof value === "string" && Object.hasOwn(aliases, value) ? aliases[value]! : member(value, DIAGNOSTIC_CODES, "unknown");
}
export function diagnosticOperation(url: unknown, method = "GET"): DiagnosticOperation {
  if (typeof url !== "string") return "request";
  if (/^\/memories\/all\/documents\//.test(url)) return method === "PUT" ? "document_write" : method === "DELETE" ? "document_delete" : "document_read";
  const route = /^\/(?:memories\/all|companion)\/([^?/.]+)/.exec(url)?.[1];
  return ({ notes: "create", search: "search", recall: "search", index: "index", recent: "recent", graph: "graph", status: "status", state: "status", "resolve-title": "resolve", poll: "poll", switch: "switch", ack: "ack", register: "register", session: "connection", profiles: "connection", test: "connection", diagnostics: "export" } as Record<string, DiagnosticOperation>)[route ?? ""] ?? "request";
}
export function statusCode(status: unknown): string {
  return status === 401 ? "unauthorized" : status === 403 ? "forbidden" : status === 412 || status === 409 ? "conflict" : status === 404 ? "not_found" : status === 429 ? "rate_limited" : status === 504 ? "timeout" : typeof status === "number" && status >= 500 ? "unavailable" : "none";
}
export function sanitizeDiagnosticEvent(input: unknown): DiagnosticEvent | null {
  try {
    if (!input || typeof input !== "object") return null;
    const e = input as Record<string, unknown>;
    if (!DIAGNOSTIC_COMPONENTS.includes(e.component as DiagnosticComponent) || typeof e.at !== "string" || e.at.length > 30 || !Number.isFinite(Date.parse(e.at))) return null;
    const event: DiagnosticEvent = { schema: 1, at: new Date(e.at).toISOString(), component: e.component as DiagnosticComponent,
      operation: member(e.operation, OPERATIONS, "request"), severity: member(e.severity, ["info", "warn", "error"], "info"),
      outcome: member(e.outcome, ["ok", "failed", "aborted", "pending", "unconfirmed"], "failed"), code: diagnosticCode(e.code) };
    for (const key of ["session", "request"] as const) { const id = diagnosticId(e[key]); if (id) event[key] = id; }
    for (const [key, max, min] of [["status", 599, 0], ["durationMs", 3600000, 0], ["exitCode", 65535, -65535], ["line", 1000000, 0], ["column", 1000000, 0]] as const) {
      const value = number(e[key], max, min); if (value !== undefined) event[key] = value;
    }
    if (e.location === "shell" || e.location === "browser_bundle") event.location = e.location;
    for (const key of ["version", "runtimeVersion"] as const) if (typeof e[key] === "string" && /^\d+(?:\.\d+){1,3}(?:-[A-Za-z0-9.-]+)?$/.test(e[key]) && e[key].length <= 50) event[key] = e[key];
    if (typeof e.build === "string" && /^[a-f0-9]{16}$/.test(e.build)) event.build = e.build;
    return event;
  } catch { return null; }
}
export function createDiagnosticBuffer(component: DiagnosticComponent, maximum = 120) {
  const events: DiagnosticEvent[] = []; let dropped = 0;
  return {
    record(input: unknown) {
      const event = sanitizeDiagnosticEvent(input); if (!event || event.component !== component) { dropped++; return; }
      if (events.length >= maximum) {
        const ordinary = events.findIndex((item) => item.severity === "info" && item.outcome === "ok");
        if (ordinary < 0 && event.severity === "info" && event.outcome === "ok") { dropped++; return; }
        events.splice(ordinary < 0 ? 0 : ordinary, 1); dropped++;
      }
      events.push(event);
    },
    snapshot(): DiagnosticSnapshot { return { component, availability: "available", events: events.map((e) => ({ ...e })), dropped, failures: 0, truncatedBytes: 0 }; },
  };
}
export function diagnosticErrorKind(error: unknown): string {
  try { return error instanceof TypeError ? "type_error" : error instanceof RangeError ? "range_error" : error instanceof SyntaxError ? "syntax_error" : "error"; } catch { return "error"; }
}

export function unavailableDiagnosticSnapshot(component: DiagnosticComponent, failures = 1): DiagnosticSnapshot {
  return { component, availability: "unavailable", events: [], dropped: 0, failures, truncatedBytes: 0 };
}

// Reuse schema rules at each trust boundary; callers retain source-specific policy.
export function normalizeDiagnosticSnapshot(source: DiagnosticSnapshot, eventLimit: number): DiagnosticSnapshot {
  return {
    component: source.component,
    availability: member(source.availability, ["available", "degraded", "unavailable"], "unavailable"),
    events: (Array.isArray(source.events) ? source.events.slice(-eventLimit) : [])
      .map(sanitizeDiagnosticEvent).filter((event): event is DiagnosticEvent => event !== null && event.component === source.component),
    dropped: number(source.dropped, 1000000000) ?? 0,
    failures: number(source.failures, 1000000000) ?? 0,
    truncatedBytes: number(source.truncatedBytes, 1000000000) ?? 0,
    coalesced: number(source.coalesced, 1000000000) ?? 0,
  };
}

// Merge only sanitized events; correlation identifiers never leave a support report raw.
export function supportReport(sources: DiagnosticSnapshot[], maximumBytes = 24000) {
  const normalized = sources.slice(0, 5).filter((source) => DIAGNOSTIC_COMPONENTS.includes(source.component))
    .map((source) => normalizeDiagnosticSnapshot(source, 120));
  const safeSources = normalized.map(({ events, ...metadata }) => metadata);
  const events = normalized.flatMap((source) => source.events);
  events.sort((a, b) => Number(a.severity === "info" && a.outcome === "ok") - Number(b.severity === "info" && b.outcome === "ok") || b.at.localeCompare(a.at));
  const references = new Map<string, string>();
  const ref = (value: string, prefix: string) => { const key = prefix + value; if (!references.has(key)) references.set(key, prefix + (references.size + 1)); return references.get(key)!; };
  const selected: Array<Omit<DiagnosticEvent, "session" | "request"> & { session?: string; request?: string }> = [];
  let omitted = events.length;
  const packet = () => ({ schema: 1, sources: safeSources, omitted, events: [...selected].sort((a, b) => a.at.localeCompare(b.at)) });
  for (const event of events) {
    const mapped = { ...event, ...(event.session ? { session: ref(event.session, "s") } : {}), ...(event.request ? { request: ref(event.request, "r") } : {}) };
    selected.push(mapped); omitted--;
    if (new TextEncoder().encode(JSON.stringify(packet())).length > maximumBytes) { selected.pop(); omitted++; break; }
  }
  return packet();
}
