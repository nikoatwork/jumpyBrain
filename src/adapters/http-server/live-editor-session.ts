import { createCollaborationEditor, type CollaborationEditorState, type SourceIntent } from "./collaboration-editor.js";
import { collaborationFeedback } from "./collaboration-feedback.js";
import { splitEditableDocument, type DocumentPayload } from "./document-controller.js";
import type { CollaborationSnapshot } from "./collaboration-client.js";
import type { CollaborationDraft } from "./collaboration-drafts.js";
import type { EditorSession, EditorSessionState } from "./editor-session.js";

type CollaborationOptions = Parameters<typeof createCollaborationEditor>[0];
type Connection = Pick<CollaborationOptions, "url" | "token" | "scope" | "expectedBrainId" | "connectionContext">;
interface Options {
  generation: number; documentId: string;
  editor: CollaborationOptions["editor"];
  actor?: CollaborationOptions["actor"];
  drafts?: CollaborationOptions["drafts"];
  clientId?: string;
  isCurrent(): boolean;
  scope(): string;
  connection(): Promise<Connection>;
  reopen(): Promise<boolean>;
  onChange(state: EditorSessionState): void;
  onSnapshot?: CollaborationOptions["onSnapshot"];
  onState?(state: CollaborationEditorState, firstOpen: boolean): void;
  onRecovery?: CollaborationOptions["onRecovery"];
  onStream?: CollaborationOptions["onStream"];
  onDispose?(): void;
}

export interface LiveEditorSession extends EditorSession {
  readonly kind: "live";
  readonly collaboration?: ReturnType<typeof createCollaborationEditor>;
  hydrate(payload: DocumentPayload): void;
  connect(): Promise<void>;
  block(message: string, uncertain?: boolean): void;
}

/** One live publication owner, with a read-through consumer view. No HTTP save
 * controller, persistence timer, mutable baseline copy or replaced methods.
 */
export function createLiveEditorSession(options: Options): LiveEditorSession {
  const sessionScope = options.scope();
  let initial: DocumentPayload = {}, initialParts = splitEditableDocument("");
  let collaboration: ReturnType<typeof createCollaborationEditor> | undefined;
  let loaded = false, cancelled = false, navigationPending = false, hasOpened = false;
  let draftRevision = 0, observedHash = "", externalStatus: "" | "updated" = "";
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  let opening: Promise<void> | undefined, disposed = false;
  let blocked: { message: string; uncertain: boolean } | undefined;
  const active = () => !cancelled && options.isCurrent();
  const current = () => active() && options.scope() === sessionScope && !blocked;
  const emit = () => { if (active()) options.onChange(state); };
  const snapshot = () => collaboration?.snapshot;
  const parts = () => snapshot() ? splitEditableDocument(snapshot()!.prefix ?? "") : initialParts;
  const state: EditorSessionState = {
    generation: options.generation, documentId: options.documentId,
    get contentHash() { return snapshot()?.contentHash ?? String(initial.contentHash || ""); },
    get frontmatterPrefix() { return parts().frontmatterPrefix; },
    get newline() { return parts().newline; },
    get savedBody() { return snapshot()?.body ?? initialParts.body; },
    get savedTitle() { return snapshot()?.title ?? String(initial.title || ""); },
    get title() { return collaboration?.title ?? state.savedTitle; },
    get draft() { return collaboration?.body ?? initialParts.body; },
    get dirty() { return Boolean(blocked?.uncertain || collaboration?.state.dirty || state.title !== state.savedTitle); },
    get draftRevision() { return draftRevision; },
    get saveStatus() {
      if (blocked) return state.dirty ? "failed" : "saved";
      if (!collaboration) return "idle";
      const status = collaboration.state.status;
      return status === "saved" && !state.dirty ? "saved" : status === "conflict" || status === "blocked" ? "failed" : "saving";
    },
    get saveError() { return blocked?.message ?? (collaboration ? collaborationFeedback(collaboration.state) : ""); },
    get saveErrorCode() { return blocked?.uncertain || collaboration?.state.status === "conflict" ? "precondition_failed" : ""; },
    get unconfirmedSave() { return state.dirty && ["offline", "conflict", "blocked"].includes(state.liveStatus!); },
    get loaded() { return loaded; }, get cancelled() { return cancelled; },
    get navigationPending() { return navigationPending; },
    get externalStatus() { return externalStatus; },
    get file() { return snapshot()?.file ?? String(initial.file || ""); },
    get recognition() { return snapshot() ? snapshot()!.recognition as DocumentPayload["recognition"] : initial.recognition; },
    get liveStatus() { return blocked ? "blocked" : collaboration?.state.status ?? "connecting"; },
    get liveCanWrite() { return !blocked && Boolean(collaboration?.state.canWrite); },
    get liveHasOpened() { return hasOpened; },
    get durableDraft() { return collaboration?.state.durableDraft ?? true; },
    get recoveryDrafts() { return collaboration?.state.recoveryDrafts ?? []; },
  };
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(noticeTimer); collaboration?.dispose(); options.onDispose?.();
  }
  function block(message: string, uncertain = false) {
    if (!active()) return;
    // Disposal retains the old principal's private draft. This session cannot
    // reconnect with credentials from a later brain/principal/tab lifetime.
    blocked = { message, uncertain };
    dispose();
    emit();
  }
  async function connect() {
    if (!current()) { session.cancel(); return; }
    if (collaboration) return;
    if (opening) return opening;
    opening = (async () => {
      let connection: Connection;
      try { connection = await options.connection(); }
      catch (error) { if (current()) throw error; session.cancel(); return; }
      if (!current()) { session.cancel(); return; }
      collaboration = createCollaborationEditor({
        ...connection, documentId: options.documentId,
        editor: { ...options.editor,
          applyCollaborativeMarkdown(value, presentation) {
            if (!current()) { session.cancel(); return { status: "deferred" }; }
            return options.editor.applyCollaborativeMarkdown(value, presentation);
          },
        },
        actor: options.actor, drafts: options.drafts, clientId: options.clientId,
        onRecovery: code => { if (current()) options.onRecovery?.(code); },
        onStream: stream => { if (current()) options.onStream?.(stream); },
        onSnapshot: (value, view) => {
          if (!current()) { session.cancel(); return; }
          if (observedHash !== value.contentHash) { observedHash = value.contentHash; draftRevision++; }
          if (view.remote) {
            externalStatus = "updated"; clearTimeout(noticeTimer);
            noticeTimer = setTimeout(() => { if (current()) { externalStatus = ""; emit(); } }, 4000);
          }
          initial = {}; initialParts = splitEditableDocument("");
          options.onSnapshot?.(value, view);
        },
        onState: live => {
          if (!current()) { session.cancel(); return; }
          const firstOpen = !hasOpened && live.canWrite;
          hasOpened ||= live.canWrite || live.status === "readonly" || live.status === "saved";
          emit();
          if (current()) options.onState?.(live, firstOpen);
        },
      });
      collaboration.connect();
    })();
    try { await opening; } finally { opening = undefined; }
  }
  const session = {
    kind: "live" as const, state,
    // Retained for diagnostics/proofs; consumers use the session agreement.
    get collaboration() { return collaboration; },
    hydrate(payload: DocumentPayload) {
      if (!current()) { session.cancel(); return; }
      if (collaboration) return;
      initial = payload; initialParts = splitEditableDocument(String(payload.content || ""));
      observedHash = String(payload.contentHash || ""); loaded = true; emit();
    },
    connect, block,
    input(body: string, intent?: SourceIntent) { if (current() && collaboration) { draftRevision++; collaboration.input(body, intent); } },
    inputTitle(title: string) { if (current()) collaboration?.inputTitle(title); },
    setNavigationPending(value: boolean) { if (active()) { navigationPending = value; emit(); } },
    async flush() {
      if (!active()) return false;
      if (blocked) return !state.dirty;
      if (!current()) return false;
      const saved = collaboration ? await collaboration.flush() : loaded && !state.dirty;
      return current() && saved;
    },
    async retry() { return current() && Boolean(await collaboration?.resolveConflict("draft")); },
    async publishReviewedDraft(hash: string) { return current() && Boolean(await collaboration?.resolveConflict("draft", hash)); },
    getRetainedRecovery: () => snapshot()?.recovery,
    getRetainedDiscovery: () => snapshot()?.recoveryDiscovery,
    async readRetainedVersion(recovery: NonNullable<CollaborationSnapshot["recovery"]>, copy?: "base" | "external") {
      if (!current() || !collaboration) throw new Error("Reconnect before reading retained versions.");
      return collaboration.readRetainedVersion(recovery, copy);
    },
    async restoreRetainedVersion(version: { title: string; body: string }, hash: string) { return current() && Boolean(await collaboration?.restoreRetainedVersion(version, hash)); },
    getRecoveryDrafts: () => state.recoveryDrafts!,
    recoverDraft(record: CollaborationDraft) { return current() && Boolean(collaboration?.recoverDraft(record)); },
    hasPending: () => state.dirty,
    async reloadSaved(allowed: () => boolean = () => true) {
      if (!active() || !allowed()) return false;
      if (state.liveStatus === "blocked") return options.reopen();
      return current() && Boolean(await collaboration?.resolveConflict("saved"));
    },
    // HTTP metadata receipts do not carry the live epoch/revision. As in the
    // previous live binding, do not advance live source from an HTTP receipt.
    acceptMetadata: (_payload: DocumentPayload, _expectedHash: string) => false,
    cancel() {
      if (cancelled) return;
      cancelled = true; dispose();
    },
  } satisfies EditorSession & Record<string, unknown>;
  return session;
}
