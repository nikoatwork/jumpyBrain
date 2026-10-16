// Browser-safe persistence and Markdown codec. Transport, clocks and selection belong to the host.
export interface DocumentPayload { content?: string; contentHash?: string; title?: string }
export interface DocumentWritePayload { newContentHash?: string; [key: string]: unknown }
export interface DocumentEditorState {
  generation: number; documentId: string; contentHash: string; frontmatterPrefix: string;
  newline: string; savedBody: string; savedTitle: string; title: string; draft: string;
  dirty: boolean; draftRevision: number; saveTimer: number | null;
  saveInFlight: Promise<boolean> | null; saveStatus: "idle" | "editing" | "saving" | "saved" | "failed";
  saveError: string; saveErrorCode: string; loaded: boolean; editing: boolean;
  navigationPending: boolean; autoSaveBlocked: boolean; unconfirmedSave: boolean;
  reconcileToken: number; cancelled: boolean;
}
export interface DocumentEditorOptions {
  generation: number; documentId: string; debounceMs: number;
  persistentEditing?: boolean;
  setTimer(callback: () => void, delay: number): number; clearTimer(timer: number): void;
  isCurrent(generation: number, documentId: string): boolean;
  splitDocument: typeof splitEditableDocument; composeDocument: typeof composeEditableDocument;
  readDocument(id: string): Promise<DocumentPayload>;
  writeDocument(id: string, content: string, hash: string): Promise<DocumentWritePayload>;
  onChange(state: DocumentEditorState): void; onSaved?(payload: DocumentWritePayload): void;
}

// Title metadata is separate from the raw Markdown body; renaming never rewrites links or headings.
export function withEditableTitle(prefix: string, title: string, newline: string) {
  if (!title.trim() || /[\x00-\x1f\x7f]/.test(title)) {
    const error = new Error("Enter a non-empty page name without control characters.");
    Object.assign(error, { code: "invalid_title" });
    throw error;
  }
  const lines = prefix.replace(/\r\n/g, "\n").split("\n");
  if (!prefix) return ["---", "title: " + JSON.stringify(title), "---", ""].join(newline);
  // Canonical frontmatter uses one value per line. Remove all title entries, then add one.
  const filtered = lines.filter((line) => !/^title\s*:/.test(line));
  filtered.splice(1, 0, "title: " + JSON.stringify(title));
  return filtered.join(newline);
}

export function createDocumentEditor(options: DocumentEditorOptions) {
  const editorState: DocumentEditorState = {
    generation: options.generation,
    documentId: options.documentId,
    contentHash: "",
    frontmatterPrefix: "",
    newline: "\n",
    savedBody: "",
    savedTitle: "",
    title: "",
    draft: "",
    dirty: false,
    draftRevision: 0,
    saveTimer: null,
    saveInFlight: null,
    saveStatus: "idle",
    saveError: "",
    saveErrorCode: "",
    loaded: false,
    editing: false,
    navigationPending: false,
    autoSaveBlocked: false,
    unconfirmedSave: false,
    reconcileToken: 0,
    cancelled: false,
  };

  const emit = () => { if (!editorState.cancelled) options.onChange(editorState); };
  const clearSaveTimer = () => {
    if (editorState.saveTimer !== null) options.clearTimer(editorState.saveTimer);
    editorState.saveTimer = null;
  };
  const isCurrent = () => !editorState.cancelled && options.isCurrent(editorState.generation, editorState.documentId);

  function hydrate(payload: DocumentPayload) {
    const parts = options.splitDocument(String(payload.content || ""));
    editorState.contentHash = String(payload.contentHash || "");
    editorState.frontmatterPrefix = parts.frontmatterPrefix;
    editorState.newline = parts.newline;
    editorState.savedBody = parts.body;
    editorState.savedTitle = String(payload.title || "");
    editorState.title = editorState.savedTitle;
    editorState.draft = parts.body;
    editorState.dirty = false;
    editorState.draftRevision = 0;
    editorState.saveStatus = "idle";
    editorState.saveError = "";
    editorState.saveErrorCode = "";
    editorState.loaded = true;
    editorState.autoSaveBlocked = false;
    editorState.unconfirmedSave = false;
    emit();
  }

  function scheduleSave() {
    clearSaveTimer();
    if (!editorState.dirty || editorState.autoSaveBlocked || editorState.saveInFlight || !isCurrent()) return;
    editorState.saveTimer = options.setTimer(() => {
      editorState.saveTimer = null;
      startSave();
    }, options.debounceMs);
  }

  function input(value: string) {
    if (!editorState.loaded || editorState.cancelled) return;
    editorState.draft = String(value).replace(/\r\n/g, "\n");
    editorState.draftRevision += 1;
    editorState.dirty = editorState.draft !== editorState.savedBody || editorState.title !== editorState.savedTitle || editorState.unconfirmedSave;
    if (editorState.autoSaveBlocked) {
      editorState.saveStatus = "failed";
    } else {
      editorState.saveStatus = editorState.saveInFlight ? "saving" : editorState.dirty ? "editing" : "saved";
      scheduleSave();
    }
    emit();
  }

  function inputTitle(value: string) {
    if (!editorState.loaded || editorState.cancelled) return;
    editorState.title = String(value);
    // A rejected duplicate did not write anything; a corrected name can autosave.
    if (["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode)) {
      editorState.autoSaveBlocked = false;
      editorState.saveError = "";
      editorState.saveErrorCode = "";
    }
    input(editorState.draft);
  }

  function composeDraft(body: string, title: string) {
    const prefix = title !== editorState.savedTitle
      ? withEditableTitle(editorState.frontmatterPrefix, title, editorState.newline)
      : editorState.frontmatterPrefix;
    return options.composeDocument(prefix, body, editorState.newline);
  }

  function setEditing(value: boolean) {
    const endedEditing = editorState.editing && !value;
    editorState.editing = Boolean(value);
    if (editorState.editing && editorState.saveStatus !== "saving" && editorState.saveStatus !== "failed" && editorState.saveStatus !== "saved") editorState.saveStatus = "editing";
    if (!editorState.editing && !editorState.dirty && editorState.saveStatus === "editing") editorState.saveStatus = "idle";
    emit();
    if (endedEditing && editorState.saveStatus === "saved" && !editorState.dirty && !editorState.saveInFlight && !editorState.navigationPending) reconcile();
  }

  function setNavigationPending(value: boolean) {
    editorState.navigationPending = Boolean(value);
    emit();
  }

  async function attemptSave() {
    const body = editorState.draft, title = editorState.title, revision = editorState.draftRevision;
    const content = composeDraft(body, title);
    const payload = await options.writeDocument(editorState.documentId, content, editorState.contentHash);
    return { payload, body, title, revision, content };
  }

  async function runSaveLoop() {
    while (editorState.dirty && isCurrent()) {
      editorState.saveStatus = "saving";
      editorState.saveError = "";
      emit();
      let result;
      try {
        result = await attemptSave();
      } catch (caught) {
      const error = caught as { status?: number; code?: string; message?: string } | null;
        if (!isCurrent()) return false;
        editorState.saveStatus = "failed";
        editorState.saveError = String(error && error.message ? error.message : error);
        editorState.saveErrorCode = Number(error?.status) === 412 ? "precondition_failed" : error?.code ?? "";
        editorState.autoSaveBlocked = true;
        // A failed response may hide a committed write. Even undoing to the previous
        // body needs an explicit retry before we can confirm persistence or leave.
        editorState.unconfirmedSave = editorState.unconfirmedSave || !["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode);
        editorState.dirty = true;
        emit();
        return false;
      }
      if (!isCurrent()) return false;
      if (!result.payload || typeof result.payload.newContentHash !== "string") {
        editorState.saveStatus = "failed";
        editorState.saveError = "Save response did not include a new content hash.";
        editorState.autoSaveBlocked = true;
        editorState.unconfirmedSave = true;
        editorState.dirty = true;
        emit();
        return false;
      }
      editorState.contentHash = result.payload.newContentHash;
      editorState.savedBody = result.body;
      editorState.savedTitle = result.title;
      editorState.frontmatterPrefix = options.splitDocument(result.content).frontmatterPrefix;
      editorState.unconfirmedSave = false;
      editorState.dirty = editorState.draft !== editorState.savedBody || editorState.title !== editorState.savedTitle;
      editorState.saveStatus = "saved";
      editorState.saveError = "";
      editorState.autoSaveBlocked = false;
      if (options.onSaved) options.onSaved(result.payload);
      emit();
    }
    return !editorState.dirty && isCurrent();
  }

  function startSave() {
    clearSaveTimer();
    if (!editorState.dirty || editorState.autoSaveBlocked || !isCurrent()) return editorState.saveInFlight || Promise.resolve(!editorState.dirty);
    if (editorState.saveInFlight) {
      emit();
      return editorState.saveInFlight;
    }
    const operation = runSaveLoop();
    editorState.saveInFlight = operation;
    operation.then((saved) => {
      if (editorState.saveInFlight !== operation) return;
      editorState.saveInFlight = null;
      emit();
      if (saved && (!editorState.editing || options.persistentEditing) && !editorState.navigationPending) reconcile();
    });
    return operation;
  }

  async function flush() {
    clearSaveTimer();
    if (editorState.autoSaveBlocked && editorState.dirty) return false;
    if (editorState.dirty && !editorState.saveInFlight) startSave();
    if (editorState.saveInFlight) await editorState.saveInFlight;
    return !editorState.dirty && editorState.saveStatus !== "failed";
  }

  function retry() {
    if (!editorState.dirty || !isCurrent()) return Promise.resolve(true);
    editorState.autoSaveBlocked = false;
    editorState.saveError = "";
    return startSave();
  }

  async function reconcile() {
    if (!isCurrent() || editorState.dirty || (editorState.editing && !options.persistentEditing) || editorState.saveInFlight || editorState.navigationPending) return;
    const token = ++editorState.reconcileToken;
    const revision = editorState.draftRevision;
    try {
      const latest = await options.readDocument(editorState.documentId);
      if (!isCurrent() || token !== editorState.reconcileToken || revision !== editorState.draftRevision || editorState.dirty || (editorState.editing && !options.persistentEditing) || editorState.saveInFlight || editorState.navigationPending) return;
      const parts = options.splitDocument(String(latest.content || ""));
      // A persistent editor must never replace its body/caret with another writer's version.
      // Leave its previous hash intact so the next write goes through the explicit conflict policy.
      if (options.persistentEditing && parts.body !== editorState.draft) return;
      editorState.contentHash = String(latest.contentHash || editorState.contentHash);
      editorState.frontmatterPrefix = parts.frontmatterPrefix;
      editorState.newline = parts.newline;
      editorState.savedBody = parts.body;
      if (typeof latest.title === "string") editorState.title = editorState.savedTitle = latest.title;
      editorState.draft = parts.body;
      editorState.saveStatus = "saved";
      emit();
    } catch {
      // The confirmed PUT remains saved; a later document GET can reconcile canonical frontmatter.
    }
  }

  /** Explicit user-authorized discard; never writes or advances a stale hash to retry. */
  async function reloadSaved(allowed: () => boolean = () => true) {
    if (!isCurrent() || editorState.saveInFlight) return false;
    clearSaveTimer();
    const revision = editorState.draftRevision;
    const latest = await options.readDocument(editorState.documentId);
    if (!isCurrent() || !allowed() || revision !== editorState.draftRevision) return false;
    if (typeof latest.content !== "string" || typeof latest.contentHash !== "string") throw new Error("Invalid saved note response.");
    clearSaveTimer();
    hydrate(latest);
    return true;
  }

  function hasPending() {
    return editorState.dirty || Boolean(editorState.saveInFlight);
  }

  function cancel() {
    clearSaveTimer();
    editorState.cancelled = true;
    editorState.reconcileToken += 1;
  }

  return { state: editorState, hydrate, input, inputTitle, setEditing, setNavigationPending, startSave, flush, retry, reconcile, hasPending, reloadSaved, cancel };
}

export function splitEditableDocument(content: string) {
  const exact = String(content || "");
  const newline = exact.includes("\r\n") ? "\r\n" : "\n";
  const frontmatter = exact.match(/^---(?:\r\n|\n)[\s\S]*?(?:\r\n|\n)---(?:(?:\r\n|\n)|$)/);
  const frontmatterPrefix = frontmatter ? frontmatter[0] : "";
  const rawBody = exact.slice(frontmatterPrefix.length);
  return {
    frontmatterPrefix,
    body: rawBody.replace(/\r\n/g, "\n"),
    newline,
    trailingNewline: /(?:\r\n|\n)$/.test(rawBody),
  };
}

export function composeEditableDocument(frontmatterPrefix: string, body: string, newline: string) {
  const normalizedBody = String(body || "").replace(/\r\n/g, "\n");
  return String(frontmatterPrefix || "") + (newline === "\r\n" ? normalizedBody.replace(/\n/g, "\r\n") : normalizedBody);
}
