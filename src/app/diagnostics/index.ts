import { DIAGNOSTIC_COMPONENTS, sanitizeDiagnosticEvent, type DiagnosticComponent, type DiagnosticSnapshot, type DiagnosticEvent } from "../../adapters/diagnostics/events.js";
export type DiagnosticSource = { component: DiagnosticComponent; snapshot: () => Promise<DiagnosticSnapshot> };
export async function collectSupportDiagnostics(sources: DiagnosticSource[], timeoutMs = 1500): Promise<DiagnosticSnapshot[]> {
  return Promise.all(sources.slice(0, 4).map(async (source) => {
    const unavailable: DiagnosticSnapshot = { component: source.component, availability: "unavailable", events: [], dropped: 0, failures: 1, truncatedBytes: 0 };
    if (!DIAGNOSTIC_COMPONENTS.includes(source.component)) return unavailable;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([Promise.resolve().then(source.snapshot), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(1, Math.min(timeoutMs, 2000))); })]);
      if (!snapshot || snapshot.component !== source.component || !Array.isArray(snapshot.events)) return unavailable;
      return { component: source.component, availability: ["available", "degraded"].includes(snapshot.availability) ? snapshot.availability : "unavailable",
        events: snapshot.events.slice(-80).map(sanitizeDiagnosticEvent).filter((e): e is DiagnosticEvent => e !== null && e.component === source.component),
        dropped: safeCount(snapshot.dropped), failures: safeCount(snapshot.failures), truncatedBytes: safeCount(snapshot.truncatedBytes), coalesced: safeCount(snapshot.coalesced) };
    } catch { return unavailable; } finally { clearTimeout(timer); }
  }));
}
function safeCount(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1000000000, Math.trunc(value))) : 0; }
