import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id-format.js";

export interface AttentionPage { id: string; title: string; file?: string; attentionAt?: string; preview?: string; updatedAt?: string }
export interface AttentionPacket { notes: AttentionPage[]; settled?: AttentionPage[]; total?: number; settledTotal?: number; nextWakeAt?: string }
export interface AttentionListState { status: "idle" | "loading" | "ready" | "error"; notes: AttentionPage[]; settled: AttentionPage[]; total: number; settledTotal: number; message: string }

/** Scoped, read-only list with one refresh/wake timer; no canonical writes. */
export function createAttentionList(options: {
  scope(): string | null; enabled(): boolean; now(): number;
  fetch(signal: AbortSignal): Promise<unknown>;
  setTimer(callback: () => void, delay: number): number; clearTimer(timer: number): void;
  onChange(state: AttentionListState): void;
}) {
  const state: AttentionListState = { status: "idle", notes: [], settled: [], total: 0, settledTotal: 0, message: "" };
  let scope: string | null = null, sequence = 0, request: AbortController | null = null, timer: number | null = null;
  function cancel() {
    sequence++; request?.abort(); request = null;
    if (timer !== null) options.clearTimer(timer);
    timer = null;
  }
  async function load() {
    cancel();
    const nextScope = options.scope();
    if (scope !== nextScope) { scope = nextScope; state.notes = []; state.settled = []; state.total = state.settledTotal = 0; }
    if (!scope) { state.status = "idle"; state.message = ""; options.onChange(state); return; }
    if (!options.enabled()) { options.onChange(state); return; }
    const token = sequence, boundScope = scope;
    request = new AbortController();
    state.status = "loading"; state.message = ""; options.onChange(state);
    try {
      const packet = await options.fetch(request.signal) as AttentionPacket;
      if (token !== sequence || boundScope !== options.scope()) return;
      if (!Array.isArray(packet?.notes)) throw new Error("Invalid attention response");
      const seen = new Set<string>();
      const pages = (rows: AttentionPage[]) => rows.filter(page => {
        if (!page || typeof page.id !== "string" || !MEMORY_DOCUMENT_ID_PATTERN.test(page.id) || typeof page.title !== "string" || seen.has(page.id)) return false;
        seen.add(page.id); return true;
      }).slice(0, 100);
      state.notes = pages(packet.notes);
      state.settled = pages(Array.isArray(packet.settled) ? packet.settled : []);
      state.total = Number.isSafeInteger(packet.total) ? Math.max(state.notes.length, packet.total!) : state.notes.length;
      state.settledTotal = Number.isSafeInteger(packet.settledTotal) ? Math.max(state.settled.length, packet.settledTotal!) : state.settled.length;
      state.status = "ready"; state.message = "";
      const wake = typeof packet.nextWakeAt === "string" ? Date.parse(packet.nextWakeAt) : NaN;
      timer = options.setTimer(() => { timer = null; void load(); }, Number.isFinite(wake) ? Math.min(15_000, Math.max(100, wake - options.now() + 25)) : 15_000);
      options.onChange(state);
    } catch (error) {
      if (token !== sequence || boundScope !== options.scope()) return;
      state.status = "error";
      state.notes = [];
      state.settled = []; state.total = state.settledTotal = 0;
      state.message = [401, 403].includes(Number((error as { status?: number })?.status))
        ? "Connect to see your notes." : "Could not load notes. Retry.";
      options.onChange(state);
      timer = options.setTimer(() => { timer = null; void load(); }, 30_000);
    } finally { if (token === sequence) request = null; }
  }
  return { state, load, cancel };
}
