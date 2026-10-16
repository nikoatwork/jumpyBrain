import { DIAGNOSTIC_COMPONENTS, normalizeDiagnosticSnapshot, unavailableDiagnosticSnapshot, type DiagnosticComponent, type DiagnosticSnapshot } from "../../adapters/diagnostics/events.js";
export type DiagnosticSource = { component: DiagnosticComponent; snapshot: () => Promise<DiagnosticSnapshot> };
export async function collectSupportDiagnostics(sources: DiagnosticSource[], timeoutMs = 1500): Promise<DiagnosticSnapshot[]> {
  return Promise.all(sources.slice(0, 4).map(async (source) => {
    const unavailable = unavailableDiagnosticSnapshot(source.component);
    if (!DIAGNOSTIC_COMPONENTS.includes(source.component)) return unavailable;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([Promise.resolve().then(source.snapshot), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), Math.max(1, Math.min(timeoutMs, 2000))); })]);
      if (!snapshot || snapshot.component !== source.component || !Array.isArray(snapshot.events)) return unavailable;
      return normalizeDiagnosticSnapshot(snapshot, 80);
    } catch { return unavailable; } finally { clearTimeout(timer); }
  }));
}
