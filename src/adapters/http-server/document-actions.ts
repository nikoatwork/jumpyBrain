import type { EditorSession } from "./editor-session.js";
import { splitEditableDocument } from "./document-controller.js";
import { memoryDocumentPath } from "../http-protocol.js";
import type { MemoryDocumentDeletePreview, MemoryDocumentDeleteResult, MemoryDocumentReadResult } from "../../types.js";
import type { Toast } from "./browser-toast.js";
import { installRetainedVersions } from "./document-retained-versions.js";
import { renderVersionChanges } from "./document-version-diff.js";
type Editor = EditorSession;
export function installDocumentActions(options: {
  document: Document; editor(): Editor | null; writable(): boolean; canPublish(editor: Editor): boolean; scope(): string;
  filePath(editor: Editor): string | null;
  json(url: string, options?: RequestInit): Promise<unknown>;
  toast: Toast;
  onDeleted(id: string, message: string): Promise<void>;
}) {
  const doc = options.document;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const recovery = $<HTMLDialogElement>("document-recovery");
  const removal = $<HTMLDialogElement>("document-delete");
  const retained = installRetainedVersions({
    document: doc, editor: options.editor, writable: options.writable, scope: options.scope,
    readCurrent: async (editor) => {
      const saved = await options.json(memoryDocumentPath((editor as Editor).state.documentId)) as MemoryDocumentReadResult;
      if (typeof saved.content !== "string" || typeof saved.contentHash !== "string" || typeof saved.title !== "string") throw new Error("Invalid saved note");
      return { title: saved.title, body: splitEditableDocument(saved.content).body, contentHash: saved.contentHash };
    },
  });
  let busy = false, sequence = 0;
  let preview: MemoryDocumentDeletePreview | null = null;
  let bound: Editor | null = null, boundScope = "", comparisonHash = "", selectedRecovery = "";
  let loadingRecovery = false, comparedSaved = "", comparedDraft = "";
  const valid = (editor: Editor, scope: string) => options.editor() === editor && !editor.state.cancelled && options.scope() === scope;
  const draftText = (editor: Editor) => editor.state.title + "\n\n" + editor.state.draft;
  function refreshRecovery() {
    const publish = $<HTMLButtonElement>("recovery-publish"), editor = bound;
    if (!publish) return;
    const available = Boolean(editor && valid(editor, boundScope) && options.writable() && options.canPublish(editor));
    publish.hidden = !editor?.publishReviewedDraft || !options.canPublish(editor);
    publish.disabled = busy || loadingRecovery || !comparisonHash || !available;
    $<HTMLButtonElement>("recovery-reload").disabled = busy || loadingRecovery || !comparisonHash || !editor || !valid(editor, boundScope) || !options.writable() || editor.state.liveStatus === "readonly";
    $<HTMLButtonElement>("recovery-close").disabled = busy;
    $<HTMLButtonElement>("recovery-copy").disabled = busy;
    $<HTMLSelectElement>("recovery-versions").disabled = busy || loadingRecovery;
    recovery.setAttribute("aria-busy", String(busy || loadingRecovery));
    if (recovery.open && editor && valid(editor, boundScope)) {
      const currentDraft = draftText(editor);
      $<HTMLTextAreaElement>("recovery-draft").value = currentDraft;
      if (comparisonHash && currentDraft !== comparedDraft) {
        comparedDraft = currentDraft;
        renderVersionChanges(doc, $("recovery-changes"), comparedSaved, comparedDraft);
      }
    }
  }
  function close() {
    if (busy) return;
    retained.close();
    sequence++; preview = null; bound = null; comparisonHash = ""; selectedRecovery = "";
    loadingRecovery = false; comparedSaved = comparedDraft = "";
    $("recovery-changes").replaceChildren();
    $<HTMLDetailsElement>("recovery-options").open = false;
    recovery.close(); removal.close();
    // Do not retain an old brain's note bodies in hidden dialogs.
    $("recovery-draft").textContent = "";
    $<HTMLTextAreaElement>("recovery-draft").value = "";
    $<HTMLTextAreaElement>("recovery-saved").value = "";
  }
  async function copy(editor = options.editor()) {
    if (!editor?.state.loaded) return;
    const scope = options.scope();
    const text = draftText(editor);
    try {
      await doc.defaultView!.navigator.clipboard.writeText(text);
      if (!valid(editor, scope)) return;
      options.toast.show("draft", "Draft copied.");
      if (recovery.open && bound === editor) $("recovery-message").textContent = "Draft copied.";
    } catch {
      if (!valid(editor, scope)) return;
      // Browser clipboard may be blocked. Keep a selectable manual fallback.
      if (!recovery.open) await openRecovery();
      if (recovery.open && bound === editor) {
        $("recovery-message").textContent = "Select and copy your draft below; clipboard access is unavailable.";
        $<HTMLDetailsElement>("recovery-options").open = true;
        $<HTMLTextAreaElement>("recovery-draft").select();
      }
    }
  }
  async function copyFilePath() {
    const editor = options.editor();
    if (!editor?.state.loaded || editor.state.cancelled || editor.state.navigationPending) return;
    const path = options.filePath(editor), scope = options.scope();
    if (!path) return;
    try {
      await doc.defaultView!.navigator.clipboard.writeText(path);
      if (valid(editor, scope)) options.toast.show("file-path", "File path copied.");
    } catch {
      if (valid(editor, scope)) options.toast.show("file-path", "Could not copy the file path. Check clipboard access.", { error: true });
    }
  }
  async function openRecovery() {
    const editor = options.editor();
    if (!editor?.state.loaded || busy) return;
    close(); bound = editor; boundScope = options.scope();
    const token = ++sequence;
    loadingRecovery = true;
    $<HTMLTextAreaElement>("recovery-draft").value = draftText(editor);
    $<HTMLTextAreaElement>("recovery-saved").value = "";
    $("recovery-message").textContent = "Loading saved changes…";
    const drafts = editor.getRecoveryDrafts?.() ?? [];
    const versions = $<HTMLSelectElement>("recovery-versions");
    if (versions && editor.getRecoveryDrafts) {versions.replaceChildren(); const current = doc.createElement("option"); current.value = ""; current.textContent = "Current draft"; versions.append(current); for (const [index,draft] of drafts.entries()) {const option = doc.createElement("option"); option.value = String(index); option.textContent = new Date(draft.updatedAt).toLocaleString(); versions.append(option);} $("recovery-versions-label").hidden = !drafts.length;}
    refreshRecovery();
    recovery.showModal();
    try {
      const saved = await options.json(memoryDocumentPath(editor.state.documentId)) as MemoryDocumentReadResult;
      if (token !== sequence || !recovery.open || !valid(editor, boundScope)) return;
      if (typeof saved.content !== "string" || typeof saved.contentHash !== "string" || typeof saved.title !== "string") throw new Error("Invalid note");
      comparedSaved = saved.title + "\n\n" + splitEditableDocument(saved.content).body;
      $<HTMLTextAreaElement>("recovery-saved").value = comparedSaved;
      comparisonHash = saved.contentHash;
      comparedDraft = draftText(editor);
      renderVersionChanges(doc, $("recovery-changes"), comparedSaved, comparedDraft);
      $("recovery-message").textContent = options.writable() && options.canPublish(editor)
        ? ""
        : "You can compare and copy these changes. Choosing a version requires write access.";
    } catch {
      if (token === sequence && recovery.open) $("recovery-message").textContent = "Could not load saved changes. Your draft is kept. More options lets you copy it before reconnecting.";
    } finally {
      if (token === sequence) { loadingRecovery = false; refreshRecovery(); }
    }
  }
  async function publishReviewed() {
    const editor = bound, scope = boundScope;
    if (!editor?.publishReviewedDraft || !comparisonHash || busy || loadingRecovery || !options.writable() || !options.canPublish(editor) || !valid(editor,scope)) return;
    busy = true; refreshRecovery(); editor.setNavigationPending(true);
    $("recovery-message").textContent = "Saving your changes…";
    try {
      if (!await editor.publishReviewedDraft(comparisonHash) || !await editor.flush()) throw new Error("Review again");
      busy = false; close();
    } catch {
      comparisonHash = "";
      $("recovery-message").textContent = "The saved version changed or saving could not be confirmed. Your draft is kept. Close and reopen to compare the latest changes.";
    }
    finally {busy = false; if (valid(editor, scope)) editor.setNavigationPending(false); refreshRecovery();}
  }
  async function reload() {
    const editor = bound, scope = boundScope;
    if (!editor || busy || loadingRecovery || !comparisonHash || !options.writable() || editor.state.liveStatus === "readonly" || !valid(editor, scope)) return;
    busy = true; refreshRecovery();
    editor.setNavigationPending(true);
    $("recovery-message").textContent = "Loading the saved note…";
    try {
      // Re-read at explicit acceptance, rather than applying a stale comparison.
      if (!await editor.reloadSaved(() => options.writable() && valid(editor, scope))) throw new Error("Draft changed");
      busy = false; close();
    } catch {
      $("recovery-message").textContent = "Could not reload. Your draft is retained; copy it before reconnecting.";
    } finally {
      busy = false;
      if (valid(editor, scope)) editor.setNavigationPending(false);
      refreshRecovery();
    }
  }
  const validDeletion = (editor: Editor | null, scope: string) => options.editor() === editor && (!editor || !editor.state.cancelled) && options.scope() === scope;
  async function openDelete(id = options.editor()?.state.documentId) {
    const editor = options.editor();
    if (!id || (editor && !editor.state.loaded) || busy || !options.writable()) return;
    close(); bound = editor; boundScope = options.scope();
    const scope = boundScope, token = ++sequence;
    removal.showModal();
    $("delete-note-title").textContent = editor?.state.documentId === id ? editor.state.title : "Selected file";
    $("delete-message").textContent = "Preparing deletion…";
    $<HTMLButtonElement>("delete-confirm").disabled = true;
    busy = true; editor?.setNavigationPending(true);
    try {
      if (editor && !await editor.flush()) throw new Error("Resolve the failed save before deleting this note.");
      if (!validDeletion(editor, scope) || !options.writable()) return;
      const packet = await options.json(memoryDocumentPath(id) + "?deletePreview=1") as MemoryDocumentDeletePreview;
      if (token !== sequence || !validDeletion(editor, scope) || !options.writable()) return;
      if (packet.id !== id || !/^sha256:[0-9a-f]{64}$/.test(packet.contentHash) || (editor?.state.documentId === id && packet.contentHash !== editor.state.contentHash) || packet.permanent !== true) throw new Error("The note changed. Cancel and review the saved version before deleting.");
      preview = packet;
      $("delete-note-title").textContent = packet.title || packet.file;
      $("delete-message").textContent = "";
      $<HTMLButtonElement>("delete-confirm").disabled = false;
    } catch (error) {
      if (token === sequence) $("delete-message").textContent = error instanceof Error ? error.message : "Could not prepare deletion.";
    } finally {
      busy = false;
      if (validDeletion(editor, scope)) editor?.setNavigationPending(false);
    }
  }
  async function applyDelete() {
    const editor = bound, packet = preview, scope = boundScope;
    if (!packet || busy || !options.writable() || !validDeletion(editor, scope)) return;
    preview = null; // One attempt per reviewed preview; never auto-retry an uncertain deletion.
    busy = true; editor?.setNavigationPending(true);
    $<HTMLButtonElement>("delete-confirm").disabled = true;
    $("delete-message").textContent = "Deleting note…";
    try {
      const result = await options.json(memoryDocumentPath(packet.id), { method: "DELETE", headers: { "Content-Type": "application/json", "If-Match": packet.contentHash }, body: JSON.stringify({ apply: true }) }) as MemoryDocumentDeleteResult;
      if (!validDeletion(editor, scope)) return;
      if (result.removed !== true || result.id !== packet.id) throw new Error("Unconfirmed deletion");
      busy = false; close();
      await options.onDeleted(packet.id, result.indexing?.status === "failed" ? "Note deleted. Index refresh needs attention." : "Note deleted. Search index refresh is pending.");
    } catch (error) {
      $("delete-message").textContent = (error as { status?: number })?.status === 412
        ? "This note changed. Cancel and review the current saved version before deleting."
        : "Deletion could not be confirmed. Cancel and check whether the note still exists before trying again.";
    } finally {
      busy = false;
      if (validDeletion(editor, scope)) editor?.setNavigationPending(false);
    }
  }
  $("note-recover").addEventListener("click", openRecovery);
  $("copy-note-draft").addEventListener("click", () => copy());
  $("copy-note-file-path").addEventListener("click", copyFilePath);
  $("recovery-copy").addEventListener("click", () => copy(bound));
  $("recovery-close").addEventListener("click", close);
  $("recovery-reload").addEventListener("click", reload);
  $("recovery-publish")?.addEventListener("click", publishReviewed);
  $("recovery-versions")?.addEventListener("change", () => {
    const editor = bound; if (!editor?.recoverDraft || busy || !valid(editor,boundScope)) return;
    const versions = $<HTMLSelectElement>("recovery-versions"), value = versions.value;
    if (value === "") { selectedRecovery = ""; return; }
    const draft = editor.getRecoveryDrafts?.()[Number(value)];
    if (draft && editor.recoverDraft?.(draft)) {
      selectedRecovery = value;
      $<HTMLTextAreaElement>("recovery-draft").value = draftText(editor);
      $("recovery-message").textContent = "Your previous draft is kept. Choose whether to keep this version’s changes.";
      refreshRecovery();
    } else {
      versions.value = selectedRecovery;
      $("recovery-message").textContent = editor.state.saveError || "The current draft is retained. Copy it before selecting another version.";
    }
  });
  $("delete-note").addEventListener("click", () => openDelete());
  $("delete-cancel").addEventListener("click", close);
  $("delete-confirm").addEventListener("click", applyDelete);
  for (const dialog of [recovery, removal]) dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { close, openRecovery, openDelete, copy, refresh() { retained.refresh(); refreshRecovery(); }, isOpen: () => recovery.open || removal.open || retained.isOpen(), isBusy: () => busy || retained.isBusy() };
}
