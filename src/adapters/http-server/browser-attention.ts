import { MEMORY_DOCUMENT_ID_PATTERN } from "../../core/document-id-format.js";

export interface AttentionPage { id: string; title: string; file?: string; attentionAt?: string; preview?: string; updatedAt?: string }
export interface AttentionPacket { notes: AttentionPage[]; nextWakeAt?: string }
export interface AttentionListState { status: "idle" | "loading" | "ready" | "error"; notes: AttentionPage[]; message: string }

/** Scoped, read-only list with one wake timer; no visit history or canonical writes. */
export function createAttentionList(options: {
  scope(): string | null; enabled(): boolean; now(): number;
  fetch(signal: AbortSignal): Promise<unknown>;
  setTimer(callback: () => void, delay: number): number; clearTimer(timer: number): void;
  onChange(state: AttentionListState): void;
}) {
  const state: AttentionListState = { status: "idle", notes: [], message: "" };
  let scope: string | null = null, sequence = 0, request: AbortController | null = null, timer: number | null = null;
  function cancel() {
    sequence++; request?.abort(); request = null;
    if (timer !== null) options.clearTimer(timer);
    timer = null;
  }
  async function load() {
    cancel();
    const nextScope = options.scope();
    if (scope !== nextScope) { scope = nextScope; state.notes = []; }
    if (!scope) { state.status = "idle"; state.notes = []; state.message = ""; options.onChange(state); return; }
    if (!options.enabled()) { options.onChange(state); return; }
    const token = sequence, boundScope = scope;
    request = new AbortController();
    state.status = "loading"; state.message = ""; options.onChange(state);
    try {
      const packet = await options.fetch(request.signal) as AttentionPacket;
      if (token !== sequence || boundScope !== options.scope()) return;
      if (!Array.isArray(packet?.notes)) throw new Error("Invalid attention response");
      const seen = new Set<string>();
      state.notes = packet.notes.filter(page => {
        if (!page || typeof page.id !== "string" || !MEMORY_DOCUMENT_ID_PATTERN.test(page.id) || typeof page.title !== "string" || seen.has(page.id)) return false;
        seen.add(page.id); return true;
      }).slice(0, 8);
      state.status = "ready"; state.message = "";
      const wake = typeof packet.nextWakeAt === "string" ? Date.parse(packet.nextWakeAt) : NaN;
      if (Number.isFinite(wake)) timer = options.setTimer(() => { timer = null; void load(); }, Math.min(2_147_483_647, Math.max(100, wake - options.now() + 25)));
      options.onChange(state);
    } catch (error) {
      if (token !== sequence || boundScope !== options.scope()) return;
      state.status = "error";
      state.notes = [];
      state.message = [401, 403].includes(Number((error as { status?: number })?.status))
        ? "Connect to see your notes." : "Could not load notes. Retry.";
      options.onChange(state);
    } finally { if (token === sequence) request = null; }
  }
  return { state, load, cancel };
}
