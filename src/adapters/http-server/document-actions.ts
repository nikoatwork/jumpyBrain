import type { createDocumentEditor } from "./document-controller.js";
import { splitEditableDocument } from "./document-controller.js";
import { memoryDocumentPath } from "../http-protocol.js";
import type { MemoryDocumentDeletePreview, MemoryDocumentDeleteResult, MemoryDocumentReadResult } from "../../types.js";
import type { Toast } from "./browser-toast.js";
type Editor = ReturnType<typeof createDocumentEditor>;
export function installDocumentActions(options: {
  document: Document; editor(): Editor | null; writable(): boolean; scope(): string;
  json(url: string, options?: RequestInit): Promise<unknown>;
  toast: Toast;
  onDeleted(id: string, message: string): Promise<void>;
}) {
  const doc = options.document;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const recovery = $<HTMLDialogElement>("document-recovery");
  const removal = $<HTMLDialogElement>("document-delete");
  let busy = false, sequence = 0;
  let preview: MemoryDocumentDeletePreview | null = null;
  let bound: Editor | null = null, boundScope = "";
  const valid = (editor: Editor, scope: string) => options.editor() === editor && !editor.state.cancelled && options.scope() === scope;
  const draftText = (editor: Editor) => editor.state.title + "\n\n" + editor.state.draft;
  function close() {
    if (busy) return;
    sequence++; preview = null; bound = null;
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
        $<HTMLTextAreaElement>("recovery-draft").select();
      }
    }
  }
  async function openRecovery() {
    const editor = options.editor();
    if (!editor?.state.loaded || busy) return;
    close(); bound = editor; boundScope = options.scope();
    const token = ++sequence;
    $<HTMLTextAreaElement>("recovery-draft").value = draftText(editor);
    $<HTMLTextAreaElement>("recovery-saved").value = "";
    $("recovery-message").textContent = "Loading the current saved note for comparison…";
    $<HTMLButtonElement>("recovery-reload").disabled = !options.writable();
    recovery.showModal();
    try {
      const saved = await options.json(memoryDocumentPath(editor.state.documentId)) as MemoryDocumentReadResult;
      if (token !== sequence || !recovery.open || !valid(editor, boundScope)) return;
      if (typeof saved.content !== "string" || typeof saved.contentHash !== "string") throw new Error("Invalid note");
      $<HTMLTextAreaElement>("recovery-saved").value = saved.title + "\n\n" + splitEditableDocument(saved.content).body;
      $("recovery-message").textContent = "Compare the versions. Loading the saved note discards only this tab’s draft and never overwrites the saved version.";
    } catch {
      if (token === sequence && recovery.open) $("recovery-message").textContent = "Could not read the saved note. Copy your draft and reconnect before reloading.";
    }
  }
  async function reload() {
    const editor = bound, scope = boundScope;
    if (!editor || busy || !options.writable() || !valid(editor, scope)) return;
    busy = true;
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
    }
  }
  async function openDelete() {
    const editor = options.editor();
    if (!editor?.state.loaded || busy || !options.writable()) return;
    close(); bound = editor; boundScope = options.scope();
    const scope = boundScope, token = ++sequence;
    removal.showModal();
    $("delete-note-title").textContent = editor.state.title;
    $("delete-message").textContent = "Preparing deletion…";
    $<HTMLButtonElement>("delete-confirm").disabled = true;
    busy = true; editor.setNavigationPending(true);
    try {
      if (!await editor.flush()) throw new Error("Resolve the failed save before deleting this note.");
      if (!valid(editor, scope) || !options.writable()) return;
      const packet = await options.json(memoryDocumentPath(editor.state.documentId) + "?deletePreview=1") as MemoryDocumentDeletePreview;
      if (token !== sequence || !valid(editor, scope) || !options.writable()) return;
      if (packet.id !== editor.state.documentId || packet.contentHash !== editor.state.contentHash || packet.permanent !== true) throw new Error("The note changed. Cancel and review the saved version before deleting.");
      preview = packet;
      $("delete-note-title").textContent = packet.title || packet.file;
      $("delete-message").textContent = "";
      $<HTMLButtonElement>("delete-confirm").disabled = false;
    } catch (error) {
      if (token === sequence) $("delete-message").textContent = error instanceof Error ? error.message : "Could not prepare deletion.";
    } finally {
      busy = false;
      if (valid(editor, scope)) editor.setNavigationPending(false);
    }
  }
  async function applyDelete() {
    const editor = bound, packet = preview, scope = boundScope;
    if (!editor || !packet || busy || !options.writable() || !valid(editor, scope)) return;
    preview = null; // One attempt per reviewed preview; never auto-retry an uncertain deletion.
    busy = true; editor.setNavigationPending(true);
    $<HTMLButtonElement>("delete-confirm").disabled = true;
    $("delete-message").textContent = "Deleting note…";
    try {
      const result = await options.json(memoryDocumentPath(packet.id), { method: "DELETE", headers: { "Content-Type": "application/json", "If-Match": packet.contentHash }, body: JSON.stringify({ apply: true }) }) as MemoryDocumentDeleteResult;
      if (!valid(editor, scope)) return;
      if (result.removed !== true || result.id !== packet.id) throw new Error("Unconfirmed deletion");
      busy = false; close();
      await options.onDeleted(packet.id, result.indexing?.status === "failed" ? "Note deleted. Index refresh needs attention." : "Note deleted. Search index refresh is pending.");
    } catch (error) {
      $("delete-message").textContent = (error as { status?: number })?.status === 412
        ? "This note changed. Cancel and review the current saved version before deleting."
        : "Deletion could not be confirmed. Cancel and check whether the note still exists before trying again.";
    } finally {
      busy = false;
      if (valid(editor, scope)) editor.setNavigationPending(false);
    }
  }
  $("note-recover").addEventListener("click", openRecovery);
  $("copy-note-draft").addEventListener("click", () => copy());
  $("recovery-copy").addEventListener("click", () => copy(bound));
  $("recovery-close").addEventListener("click", close);
  $("recovery-reload").addEventListener("click", reload);
  $("delete-note").addEventListener("click", openDelete);
  $("delete-cancel").addEventListener("click", close);
  $("delete-confirm").addEventListener("click", applyDelete);
  for (const dialog of [recovery, removal]) dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  return { close, openRecovery, copy, isOpen: () => recovery.open || removal.open, isBusy: () => busy };
}
