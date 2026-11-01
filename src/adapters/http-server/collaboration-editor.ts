import { createCollaborationClient, CollaborationError, validSnapshot, type CollaborationPrincipal, type CollaborationSnapshot } from "./collaboration-client.js";
import { collaborationClientId, createCollaborationDraftStore, type CollaborationDraft, type CollaborationDraftStore } from "./collaboration-drafts.js";
export interface SourceEdit { start: number; deleteCount: number; insert: string }
export function sourceDifference(before: string, after: string): SourceEdit {
  let start = 0, oldEnd = before.length, newEnd = after.length;
  while (start < oldEnd && start < newEnd && before[start] === after[start]) start++;
  // UTF-16 offsets are the protocol convention. Never split a surrogate pair.
  if (start && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  if (oldEnd < before.length && oldEnd && /[\uD800-\uDBFF]/.test(before[oldEnd - 1])) { oldEnd++; newEnd++; }
  return { start, deleteCount: oldEnd - start, insert: after.slice(start, newEnd) };
}
export function reconcileSource(base: string, local: string, remote: string): { body: string; conflict: boolean } {
  if (local === base) return { body: remote, conflict: false };
  if (remote === base) return { body: local, conflict: false };
  const a = sourceDifference(base, local), b = sourceDifference(base, remote);
  const aEnd = a.start + a.deleteCount, bEnd = b.start + b.deleteCount;
  let start = a.start;
  if (!a.deleteCount && !b.deleteCount && a.start === b.start) start += b.insert.length;
  else if (aEnd <= b.start) { /* local precedes remote */ }
  else if (bEnd <= a.start) start += b.insert.length - b.deleteCount;
  else return { body: local, conflict: true };
  return { body: remote.slice(0, start) + a.insert + remote.slice(start + a.deleteCount), conflict: false };
}
interface EditorBinding {
  getMarkdown(): string;
  isComposing?(): boolean;
  applyCollaborativeMarkdown(value: string, presentation?: { highlight?: boolean }): { status: "applied" | "unchanged" | "deferred" | "recovery"; reason?: string };
  setCollaborativeNewline?(value: "\n" | "\r\n" | null): void;
  collaborativeSelection?(): { anchor: number; focus: number } | null;
  setCollaborativePresence?(peers: NonNullable<CollaborationSnapshot["presence"]>): void;
  subscribeSelection?(listener: () => void): () => void;
  subscribeCompositionEnd?(listener: () => void): () => void;
  setCollaborativeHistory?(value: { undo: () => void; redo?: () => void } | null): void;
}
export interface CollaborationEditorState {
  status: "connecting" | "saved" | "saving" | "offline" | "conflict" | "readonly" | "blocked";
  dirty: boolean; canWrite: boolean; durableDraft: boolean; message?: string;
  recoveryDrafts: CollaborationDraft[];
}
function confirmation() {
  let confirm!: () => void;
  const confirmed = new Promise<void>((resolve) => { confirm = resolve; });
  return { confirmed, confirm };
}
interface Options {
  url: string; token?: string; scope: string; expectedBrainId?: string; documentId: string; editor: EditorBinding; clientId?: string;
  connectionContext?: () => { tabId?: string; generation?: number };
  drafts?: CollaborationDraftStore;
  onState?: (state: CollaborationEditorState) => void;
  onSnapshot?: (snapshot: CollaborationSnapshot, view: { body: string; pending: boolean; remote: boolean }) => void;
}
export function createCollaborationEditor(options: Options) {
  const clientId = options.clientId ?? collaborationClientId(options.scope), store = options.drafts ?? createCollaborationDraftStore();
  const openingBase = options.editor.getMarkdown();
  let body = openingBase, baseline: CollaborationSnapshot | undefined, principal: CollaborationPrincipal | undefined;
  let opened = false, disposed = false, generation = 0, loadedDraft = false, conflict = false, uncertain = false, durable = true, message: string | undefined;
  let dirtyBeforeOpen = false, openFailure: string | undefined;
  let historyFlight: { id: string; acknowledged: boolean; promise?: Promise<void>; confirmed: Promise<void>; confirm(): void } | undefined;
  let draftTitle: string | undefined, titlePromise: Promise<void> | undefined, titleSubmitted: string | undefined;
  let presenceTimer: ReturnType<typeof setTimeout> | undefined, lastPresence: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, queued: CollaborationSnapshot | undefined;
  let flight: { id: string; submitted: string; before: CollaborationSnapshot; promise?: Promise<void>; confirmed: Promise<void>; confirm(): void } | undefined;
  let deferredConfirmation: { flight: NonNullable<typeof flight>; epoch: string; revision: number } | undefined;
  const undoBodies: string[] = [], redoBodies: string[] = [];
  let recoveryDrafts: CollaborationDraft[] = [];
  let state: CollaborationEditorState = { status: "connecting", dirty: false, canWrite: false, durableDraft: true, recoveryDrafts: [] };
  const bodyDirty = () => !baseline ? dirtyBeforeOpen : body !== baseline.body;
  const titleDirty = () => draftTitle !== undefined && draftTitle !== baseline?.title;
  const dirty = () => bodyDirty() || titleDirty();
  const canWrite = () => principal?.role === "writer" || principal?.role === "owner" || principal?.role === "admin";
  function scope() { return { scope: options.scope, principalId: principal!.id, documentId: options.documentId, clientId }; }
  function notify() {
    const actor = principal ? JSON.stringify([principal.id, clientId]) : "";
    options.editor.setCollaborativePresence?.(bodyDirty() ? [] : (baseline?.presence ?? []).filter((peer) => peer.actor !== actor));
    state = {
      status: conflict ? "conflict" : openFailure ? "blocked" : client.state === "blocked" ? "blocked" : client.state === "connecting" || client.state === "ready" && !opened ? "connecting" : client.state !== "ready" ? "offline" : !canWrite() ? "readonly" : dirty() || flight || titlePromise || historyFlight ? "saving" : "saved",
      dirty: dirty() || Boolean(flight || titlePromise || historyFlight), canWrite: Boolean(opened && canWrite() && !conflict), durableDraft: durable, message, recoveryDrafts,
    };
    options.onState?.(state);
    schedulePresence();
  }
  function persist() {
    if (!principal || !baseline) return;
    if (!dirty() && !flight && !titlePromise && !historyFlight && !uncertain && !conflict) {
      const result = store.remove(scope()); if (result.error) { durable = false; message = result.error; }
      return;
    }
    const record: CollaborationDraft = { version: 2, ...scope(), epoch: baseline.epoch, baseRevision: baseline.revision, baseBody: baseline.body, body, ...(draftTitle !== undefined ? { title: draftTitle, baseTitle: baseline.title } : {}), updatedAt: Date.now(), ...(flight ? { unconfirmed: { operationId: flight.id, submittedBody: flight.submitted } } : historyFlight ? { unconfirmed: { operationId: historyFlight.id, submittedBody: body } } : titlePromise ? { unconfirmed: { operationId: "title-unconfirmed", submittedBody: body } } : uncertain ? { unconfirmed: { operationId: "unconfirmed", submittedBody: body } } : {}) };
    const saved = store.save(record); durable = saved.value; if (saved.error) message = saved.error;
  }
  function paint(value: string, highlight = false): boolean {
    const applied = options.editor.applyCollaborativeMarkdown(value, { highlight });
    if (applied.status === "deferred") return false;
    if (applied.status === "recovery") { conflict = true; message = applied.reason ?? "The editor needs explicit recovery. Both versions are retained."; return false; }
    return true;
  }
  function publishSnapshot(snapshot: CollaborationSnapshot, remote = false) { options.onSnapshot?.(snapshot, { body, pending: dirty() || Boolean(flight || titlePromise || historyFlight), remote }); }
  function accept(snapshot: CollaborationSnapshot, own?: typeof flight) {
    if (disposed || snapshot.documentId !== options.documentId) return;
    if (!own && deferredConfirmation && snapshot.epoch === deferredConfirmation.epoch && snapshot.revision >= deferredConfirmation.revision) own = deferredConfirmation.flight;
    if (baseline && snapshot.epoch === baseline.epoch && snapshot.revision < baseline.revision) return;
    if (!snapshot.saved || snapshot.conflict) { conflict = true; message = snapshot.conflict?.message ?? "The saved file changed unsafely. The local draft is retained."; persist(); notify(); return; }
    if (baseline && snapshot.epoch === baseline.epoch && snapshot.revision === baseline.revision && snapshot.body === baseline.body && !own) { baseline = snapshot; publishSnapshot(snapshot); notify(); return; }
    const remote = Boolean(baseline) && !own && (snapshot.body !== baseline?.body || snapshot.title !== baseline?.title);
    const base = own?.submitted ?? baseline?.body ?? body;
    const merged = reconcileSource(base, body, snapshot.body);
    if (!merged.conflict && !conflict && !paint(merged.body, remote)) {
      if (!conflict) { queued = snapshot; if (own) deferredConfirmation = { flight: own, epoch: snapshot.epoch, revision: snapshot.revision }; return; }
    }
    if (!snapshot.body.includes("\n")) options.editor.setCollaborativeNewline?.(snapshot.prefix?.includes("\r\n") ? "\r\n" : "\n");
    const historyBase = own?.submitted ?? baseline?.body;
    if (own) {
      const pendingFrom = undoBodies.lastIndexOf(own.submitted);
      if (pendingFrom < 0) undoBodies.length = 0; else undoBodies.splice(0, pendingFrom);
    }
    if (historyBase !== undefined && historyBase !== snapshot.body) {
      const rebaseHistory = (history: string[]) => {
        const rebased = history.map((value) => reconcileSource(historyBase, value, snapshot.body));
        if (rebased.some((value) => value.conflict)) history.length = 0;
        else history.splice(0, history.length, ...rebased.map((value) => value.body));
      };
      rebaseHistory(undoBodies); rebaseHistory(redoBodies);
    }
    const previousTitle = baseline?.title;
    if (draftTitle !== undefined && previousTitle !== undefined && draftTitle !== previousTitle && snapshot.title !== previousTitle && snapshot.title !== draftTitle && snapshot.title !== titleSubmitted) {
      conflict = true; message = "Concurrent title edits need review. The local title and saved version are retained.";
    }
    if (draftTitle === undefined || draftTitle === previousTitle) draftTitle = snapshot.title;
    baseline = snapshot;
    if (own) deferredConfirmation = undefined;
    if (merged.conflict) { conflict = true; message = "Concurrent edits overlap. Your draft and the saved version are retained for review."; }
    else if (!conflict) body = merged.body;
    persist(); publishSnapshot(snapshot, remote); notify();
  }
  function finish(snapshot: CollaborationSnapshot, current: NonNullable<typeof flight>) {
    if (flight !== current) return;
    flight = undefined; uncertain = false;
    accept(snapshot, current);
    const next = queued; queued = undefined;
    if (next && (!baseline || next.epoch !== baseline.epoch || next.revision > baseline.revision)) accept(next);
    current.confirm(); schedule();
  }
  async function send() {
    clearTimeout(timer); timer = undefined;
    if (disposed || options.editor.isComposing?.() || flight || titlePromise || historyFlight || conflict || uncertain || !opened || !baseline || client.state !== "ready" || !canWrite() || !dirty()) { notify(); return; }
    if (!bodyDirty() && titleDirty()) {
      titleSubmitted = draftTitle!;
      const before = baseline;
      titlePromise = client.request("title", { documentId: options.documentId, clientId, epoch: before.epoch, baseRevision: before.revision, title: titleSubmitted }).then((snapshot: unknown) => {
        if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
        accept(snapshot);
      }).catch((error: unknown) => {
        if (disposed) return;
        conflict = true; uncertain = error instanceof CollaborationError && ["unconfirmed", "offline", "closed"].includes(error.code);
        message = error instanceof Error ? error.message : "The title was not confirmed. Its draft is retained.";
      }).finally(() => { titlePromise = undefined; titleSubmitted = undefined; persist(); notify(); schedule(); });
      persist(); notify(); await titlePromise; return;
    }
    const current = { ...confirmation(), id: crypto.randomUUID(), submitted: body, before: baseline, promise: undefined as Promise<void> | undefined };
    flight = current; persist(); notify();
    const operation = sourceDifference(current.before.body, current.submitted);
    current.promise = client.request("edit", { documentId: options.documentId, clientId, epoch: current.before.epoch, baseRevision: current.before.revision, operationId: current.id, ...operation }).then((snapshot: unknown) => {
      if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
      finish(snapshot, current);
    }).catch(async (error: unknown) => {
      if (disposed || flight !== current) { current.confirm(); return; }
      flight = undefined;
      const code = error instanceof CollaborationError ? error.code : "unconfirmed";
      if (["epoch_changed", "history_expired", "precondition_failed"].includes(code) && client.state === "ready") {
        try {
          const currentSnapshot: unknown = await client.request("resync", { documentId: options.documentId, clientId }); queued = undefined;
          if (validSnapshot(currentSnapshot)) { accept(currentSnapshot); current.confirm(); schedule(); return; }
        } catch { /* Rejected operations are safe to rebase only with a confirmed snapshot. */ }
      }
      uncertain = ["unconfirmed", "offline", "closed"].includes(code);
      conflict = true; message = error instanceof Error ? error.message : "The edit was not confirmed. The local draft is retained.";
      persist(); notify(); current.confirm();
    });
    await current.confirmed;
  }
  function schedule() { if (disposed || timer || !dirty() || conflict || uncertain || flight || titlePromise || historyFlight || !opened || client.state !== "ready" || !canWrite()) return; timer = setTimeout(() => { void send(); }, 35); }
  async function open() {
    const session = ++generation; opened = false; openFailure = undefined; notify();
    try {
      const snapshot: unknown = await client.request("open", { documentId: options.documentId, clientId });
      if (disposed || session !== generation) return;
      if (!validSnapshot(snapshot)) throw new CollaborationError("protocol", "The backend returned an invalid document snapshot.");
      if (!loadedDraft && principal) {
        loadedDraft = true;
        const saved = store.read(scope()), others = store.list(scope());
        recoveryDrafts = others.value.filter((draft) => draft.clientId !== clientId);
        if (saved.error || others.error) { durable = false; message = saved.error ?? others.error; }
        if (saved.value) {
          const draft = saved.value;
          if (draft.title !== undefined && draft.title !== snapshot.title) {
            draftTitle = draft.title;
            if (draft.baseTitle !== undefined && snapshot.title !== draft.baseTitle) { conflict = true; message = "A recovered title draft conflicts with the saved title."; }
          }
          if (draft.body !== snapshot.body) {
            body = draft.body;
            const merged = reconcileSource(draft.baseBody, draft.body, snapshot.body);
            if (draft.unconfirmed || merged.conflict || draft.epoch !== snapshot.epoch) { conflict = true; uncertain = Boolean(draft.unconfirmed); message = "A recoverable local draft needs review before it can be published."; }
            // accept() performs this rebase once against the persisted base.
          } else { body = snapshot.body; uncertain = false; }
          if (draft.unconfirmed && (draft.body !== snapshot.body || draft.title !== undefined && draft.title !== snapshot.title)) { conflict = true; uncertain = true; message = "An unpublished operation was not confirmed. Review its retained draft before publishing."; }
          // The saved record is the rebase base, not whatever was rendered while opening.
          baseline = { ...snapshot, body: draft.baseBody, epoch: draft.epoch, revision: draft.baseRevision };
        }
      }
      opened = true; lastPresence = undefined;
      if (baseline && snapshot.epoch !== baseline.epoch && bodyDirty()) { conflict = true; message = "The backend document restarted or was replaced. Review the retained draft before publishing."; }
      if (uncertain && body !== snapshot.body) { conflict = true; message = "The last edit was not confirmed. Review the draft against the saved version."; }
      // A freshly opened editor may contain a previous document placeholder;
      // without a persisted draft, the authoritative open snapshot hydrates it.
      if (!baseline) {
        if (!dirtyBeforeOpen) body = snapshot.body;
        baseline = { ...snapshot, body: dirtyBeforeOpen ? openingBase : snapshot.body, revision: -1 };
      }
      accept(snapshot);
      if (conflict) paint(body);
      schedule(); notify();
    } catch (error) { if (!disposed && session === generation) { opened = false; openFailure = error instanceof CollaborationError ? error.code : "open_failed"; message = error instanceof Error ? error.message : "The document could not be opened."; notify(); } }
  }
  const client = createCollaborationClient({ ...options,
    onState(connection, authenticated, error) {
      if (disposed) return;
      if (authenticated) principal = authenticated;
      if (error) message = error.message;
      if (connection === "ready") void open();
      else { opened = false; generation++; persist(); notify(); }
    },
    onSnapshot(snapshot) {
      if (disposed || !opened || snapshot.documentId !== options.documentId) return;
      if (!snapshot.saved || snapshot.conflict) { accept(snapshot); return; }
      if (historyFlight && snapshot.saved && !snapshot.conflict && snapshot.operation?.operationId === historyFlight.id) {
        const completed = historyFlight; completed.acknowledged = true; historyFlight = undefined;
        accept(snapshot); persist(); notify(); completed.confirm(); schedule(); return;
      }
      if (flight) {
        if (snapshot.operation?.operationId === flight.id) finish(snapshot, flight);
        else if (!queued || snapshot.epoch !== queued.epoch || snapshot.revision > queued.revision) queued = snapshot;
      } else accept(snapshot);
    },
  });
  async function historyMutation(method: "undo" | "redo") {
    if (!baseline || !opened || !canWrite() || flight || titlePromise || historyFlight || conflict || bodyDirty()) return;
    const current = { ...confirmation(), id: crypto.randomUUID(), acknowledged: false, promise: undefined as Promise<void> | undefined };
    historyFlight = current; persist(); notify();
    current.promise = client.request(method, { documentId: options.documentId, clientId, epoch: baseline.epoch, operationId: current.id }).then((snapshot: unknown) => { if (!disposed && historyFlight === current && validSnapshot(snapshot)) { current.acknowledged = true; historyFlight = undefined; accept(snapshot); } }).catch((error: unknown) => {
      if (disposed || current.acknowledged) return;
      if (error instanceof CollaborationError && ["unconfirmed", "offline", "closed"].includes(error.code)) { uncertain = true; conflict = true; }
      message = error instanceof Error ? error.message : "History operation failed.";
    }).finally(() => { if (historyFlight === current) historyFlight = undefined; current.confirm(); if (!disposed) { persist(); notify(); schedule(); } });
    await current.confirmed;
  }
  async function undo() {
    if (disposed) return;
    // Once a source operation was sent, Undo must undo that actor operation.
    // Publishing its inverse as an ordinary edit would itself become undoable
    // and a later Undo would unexpectedly resurrect the canceled text.
    if (flight && body === flight.submitted) {
      const pending = flight.confirmed; if (pending) await pending;
      if (!disposed && !conflict && !uncertain) await historyMutation("undo");
      return;
    }
    if (bodyDirty() && undoBodies.length) {
      const previous = undoBodies.at(-1)!;
      if (paint(previous)) { undoBodies.pop(); redoBodies.push(body); body = previous; persist(); notify(); schedule(); } return;
    }
    await historyMutation("undo");
  }
  async function redo() {
    const value = redoBodies.at(-1);
    if (value !== undefined) { if (paint(value)) { redoBodies.pop(); undoBodies.push(body); body = value; persist(); notify(); schedule(); } return; }
    await historyMutation("redo");
  }
  options.editor.setCollaborativeHistory?.({ undo: () => { void undo(); }, redo: () => { void redo(); } });
  function schedulePresence() {
    if (disposed || presenceTimer || !opened || client.state !== "ready" || !baseline) return;
    presenceTimer = setTimeout(() => {
      presenceTimer = undefined;
      if (disposed || !opened || client.state !== "ready" || !baseline) return;
      const selection = !bodyDirty() && options.editor.getMarkdown() === baseline.body ? options.editor.collaborativeSelection?.() : null;
      const signature = JSON.stringify(selection ?? null);
      if (lastPresence === signature) return;
      lastPresence = signature;
      void client.request("presence", { documentId: options.documentId, clientId, actorKind: "human", ...(selection ? { selection } : {}) }).then((snapshot: unknown) => { if (!disposed && validSnapshot(snapshot)) accept(snapshot); }).catch(() => { lastPresence = undefined; });
    }, 80);
  }
  const stopSelection = options.editor.subscribeSelection?.(schedulePresence);
  const stopComposition = options.editor.subscribeCompositionEnd?.(() => { api.input(options.editor.getMarkdown()); });
  const api = {
    connect() { if (!disposed) client.connect(); },
    input(value: string) {
      if (disposed) return;
      if (value === body) { if (queued && !flight) { const pending = queued; queued = undefined; accept(pending); } schedule(); return; }
      if (!opened && !baseline) dirtyBeforeOpen = true;
      undoBodies.push(body); if (undoBodies.length > 100) undoBodies.shift(); redoBodies.length = 0;
      body = value; persist();
      const pendingSnapshot = queued;
      if (pendingSnapshot && !flight) { queued = undefined; accept(pendingSnapshot); }
      notify(); schedule();
    },
    inputTitle(title: string) {
      if (disposed || title === draftTitle) return;
      draftTitle = title; persist(); notify(); schedule();
    },
    async flush(): Promise<boolean> {
      clearTimeout(timer); timer = undefined;
      if (disposed) return false;
      if (!dirty() && !flight && !titlePromise && !historyFlight && !conflict && !uncertain) return true;
      if (!opened || client.state !== "ready" || conflict || uncertain) return false;
      for (let count = 0; count < 64 && (dirty() || flight || titlePromise || historyFlight); count++) {
        if (!canWrite() || conflict || uncertain || client.state !== "ready") return false;
        if (flight) await flight.confirmed; else if (titlePromise) await titlePromise; else if (historyFlight) await historyFlight.confirmed; else await send();
      }
      return !disposed && !dirty() && !flight && !titlePromise && !historyFlight && !conflict && !uncertain;
    },
    async setTitle(title: string): Promise<boolean> { api.inputTitle(title); return api.flush(); },
    undo, redo,
    async resolveConflict(choice: "saved" | "draft", expectedHash?: string): Promise<boolean> {
      if (!baseline || flight || titlePromise || historyFlight || disposed) return false;
      if (client.state !== "ready" || !opened) {
        client.connect();
        const deadline = Date.now() + 5_000;
        while (!disposed && client.state !== "blocked" && (client.state !== "ready" || !opened) && Date.now() < deadline) await new Promise<void>((resolve) => setTimeout(resolve, 40));
        if (disposed || client.state !== "ready" || !opened) { message = "Reconnect to the intended brain before accepting the saved version or publishing this draft."; notify(); return false; }
      }
      try {
        const current: unknown = await client.request("resync", { documentId: options.documentId, clientId });
        if (!validSnapshot(current)) return false;
        baseline = current;
        if (expectedHash && expectedHash !== current.contentHash) {
          conflict = true; message = "The saved note changed after review. Compare the latest saved version before publishing.";
          persist(); publishSnapshot(current); notify(); return false;
        }
        queued = undefined; deferredConfirmation = undefined; undoBodies.length = 0; redoBodies.length = 0; titleSubmitted = undefined;
        if (choice === "saved") { if (!paint(current.body)) return false; body = current.body; draftTitle = current.title; }
        else if (!paint(body)) return false;
        conflict = false; uncertain = false; message = undefined;
        persist(); publishSnapshot(current); notify();
        if (choice === "draft") return api.flush();
        return true;
      } catch (error) { message = error instanceof Error ? error.message : "Recovery could not reconnect to the backend."; persist(); notify(); return false; }
    },
    recoverDraft(record: CollaborationDraft) {
      if (!principal || record.scope !== options.scope || record.principalId !== principal.id || record.documentId !== options.documentId || flight) return false;
      body = record.body; draftTitle = record.title ?? baseline?.title; conflict = true; uncertain = Boolean(record.unconfirmed); message = "Review this recovered draft against the saved version before publishing.";
      paint(body); persist(); notify(); return true;
    },
    get body() { return body; }, get title() { return draftTitle ?? baseline?.title; }, get state() { return state; }, get snapshot() { return baseline; }, get clientId() { return clientId; },
    dispose() { if (disposed) return; persist(); disposed = true; flight?.confirm(); historyFlight?.confirm(); generation++; clearTimeout(timer); clearTimeout(presenceTimer); stopSelection?.(); options.editor.setCollaborativePresence?.([]); stopComposition?.(); options.editor.setCollaborativeHistory?.(null); client.dispose(); },
  };
  return api;
}
