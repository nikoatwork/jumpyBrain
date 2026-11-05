import type { CollaborationSnapshot } from "./collaboration-client.js";
import { renderVersionChanges } from "./document-version-diff.js";

type Recovery = NonNullable<CollaborationSnapshot["recovery"]>;
export interface RetainedVersion { title: string; body: string; contentHash: string; }
export interface RetainedVersionsEditor {
  state: { loaded: boolean; cancelled: boolean; navigationPending: boolean; liveCanWrite?: boolean; saveError?: string };
  getRetainedRecovery?(): Recovery | undefined;
  getRetainedDiscovery?(): "incomplete" | undefined;
  readRetainedVersion?(recovery: Recovery, copy?: "base" | "external"): Promise<unknown>;
  restoreRetainedVersion?(version: RetainedVersion, expectedCurrentHash: string): Promise<boolean>;
}
interface Options {
  document: Document;
  editor(): RetainedVersionsEditor | null;
  writable(): boolean;
  scope(): string;
  readCurrent(editor: RetainedVersionsEditor): Promise<RetainedVersion>;
}
const validHash = (value: unknown): value is string => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
function version(value: unknown, expected?: string): RetainedVersion {
  if (!value || typeof value !== "object") throw new Error("Invalid comparison");
  const copy = value as RetainedVersion;
  if (typeof copy.title !== "string" || typeof copy.body !== "string" || !validHash(copy.contentHash) || (expected && copy.contentHash !== expected)) throw new Error("Invalid comparison");
  return copy;
}
/** Retained canonical versions are optional history, independent of draft recovery. */
export function installRetainedVersions(options: Options) {
  const doc = options.document;
  const banner = doc.createElement("div"); banner.id = "note-retained-version"; banner.hidden = true; banner.setAttribute("role", "status"); banner.setAttribute("aria-live", "polite"); banner.style.cssText = "padding:8px 16px;gap:8px;align-items:center;flex-wrap:wrap";
  const notice = doc.createElement("span"), review = doc.createElement("button");
  review.id = "review-retained-version"; review.type = "button"; review.className = "quiet-button"; review.textContent = "Earlier versions"; review.hidden = true; review.setAttribute("aria-haspopup", "dialog");
  banner.append(notice);
  const toolbar = doc.querySelector(".workspace-toolbar");
  if (toolbar) toolbar.after(banner); else doc.body.append(banner);
  // A saved external edit needs no acknowledgement. Keep its durable copies
  // available in note details rather than presenting ordinary agent work as
  // unfinished recovery. Incomplete discovery still has a visible warning.
  (doc.getElementById("note-details-content") ?? doc.body).append(review);
  const dialog = doc.createElement("dialog"); dialog.id = "retained-version-review"; dialog.className = "document-dialog"; dialog.setAttribute("aria-labelledby", "retained-version-title");
  dialog.innerHTML = `<h2 id="retained-version-title">Earlier versions</h2><p>Here’s what changed in the saved note. Keep it as it is, or use the earlier version.</p><div id="retained-changes" class="version-changes" tabindex="0" aria-label="Changes in the saved note"></div><p id="retained-version-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button id="retained-close" class="quiet-button version-choice-primary" type="button">Keep current note</button><button id="retained-restore" class="quiet-button" type="button" disabled>Use earlier version</button></div><details id="retained-options" class="recovery-options"><summary>More options</summary><label>Earlier version<select id="retained-version-choice"><option value="base">Before the edit</option><option value="external">When the edit was first saved</option></select></label><label>Earlier text<textarea id="retained-version-text" readonly></textarea></label><label>Current saved note<textarea id="retained-current-text" readonly></textarea></label><div class="dialog-actions"><button id="retained-copy" class="quiet-button" type="button">Copy earlier text</button><button id="retained-copy-current" class="quiet-button" type="button">Copy saved text</button><button id="retained-refresh" class="quiet-button" type="button">Refresh changes</button></div></details>`;
  const comparisonText = dialog.querySelector<HTMLElement>("#retained-changes")!;
  const moreOptions = dialog.querySelector<HTMLDetailsElement>("#retained-options")!;
  doc.body.append(dialog);
  const element = <T extends HTMLElement>(id: string) => dialog.querySelector<T>("#" + id)!;
  const selected = element<HTMLSelectElement>("retained-version-choice"), retainedText = element<HTMLTextAreaElement>("retained-version-text"), currentText = element<HTMLTextAreaElement>("retained-current-text"), message = element<HTMLParagraphElement>("retained-version-message"), restore = element<HTMLButtonElement>("retained-restore"), refreshButton = element<HTMLButtonElement>("retained-refresh");
  let bound: RetainedVersionsEditor | null = null, boundScope = "", sequence = 0, loading = false, mutating = false, comparisonHash = "";
  let copies: { base: RetainedVersion; external: RetainedVersion } | undefined;
  const text = (copy: RetainedVersion) => copy.title + "\n\n" + copy.body;
  const valid = (editor = bound, scope = boundScope) => Boolean(editor && options.editor() === editor && editor.state.loaded && !editor.state.cancelled && options.scope() === scope);
  const writable = () => valid() && options.writable() && bound?.state.liveCanWrite !== false && Boolean(bound?.restoreRetainedVersion);
  function close(force = false) {
    if (mutating && !force) return;
    sequence++; loading = false; comparisonHash = ""; copies = undefined; bound = null; boundScope = "";
    retainedText.value = currentText.value = message.textContent = comparisonText.textContent = ""; moreOptions.open = false;
    if (dialog.open) dialog.close();
  }
  function refresh() {
    const editor = options.editor(), recovery = editor?.getRetainedRecovery?.(), incomplete = editor?.getRetainedDiscovery?.() === "incomplete";
    const available = Boolean(editor?.state.loaded && !editor.state.cancelled);
    banner.hidden = !available || !incomplete;
    banner.style.display = banner.hidden ? "none" : "flex";
    notice.textContent = incomplete ? "Some retained versions could not be verified. Retained copies remain available to the brain operator." : "";
    review.hidden = !available || !recovery; review.disabled = Boolean(editor?.state.navigationPending) || !editor?.readRetainedVersion;
    if (dialog.open && !valid()) close(true);
    restore.hidden = !writable(); restore.disabled = loading || mutating || !comparisonHash || !copies || !writable();
    selected.disabled = loading || mutating; refreshButton.disabled = mutating;
    element<HTMLButtonElement>("retained-close").disabled = mutating;
  }
  function showSelected() { retainedText.value = copies ? text(copies[selected.value === "external" ? "external" : "base"]) : ""; if (copies) renderVersionChanges(doc, comparisonText, retainedText.value, currentText.value); else comparisonText.replaceChildren(); }
  async function open() {
    if (mutating) return;
    const editor = options.editor(), recovery = editor?.getRetainedRecovery?.();
    if (!editor?.state.loaded || editor.state.cancelled || !recovery || !editor.readRetainedVersion) return;
    close(); bound = editor; boundScope = options.scope(); const scope = boundScope, token = ++sequence;
    loading = true; selected.value = "base"; message.textContent = "Loading changes…";
    dialog.showModal(); refresh();
    try {
      const parse = (value: unknown) => {
        const packet = value as { recoveryId?: string; currentContentHash?: string; base?: unknown; external?: unknown };
        if (!packet || packet.recoveryId !== recovery.recoveryId || !validHash(packet.currentContentHash)) throw new Error("Invalid comparison");
        return packet;
      };
      let first;
      try { first = parse(await editor.readRetainedVersion(recovery)); }
      catch (error) {
        if ((error as {code?: string}).code !== "recovery_limit") throw error;
        first = parse(await editor.readRetainedVersion(recovery, "base"));
      }
      let second = first;
      if (!first.external) second = parse(await editor.readRetainedVersion(recovery, "external"));
      const base = version(first.base, recovery.baseContentHash), external = version(second.external, recovery.externalContentHash);
      const current = version(await options.readCurrent(editor));
      if (token !== sequence || !dialog.open || !valid(editor, scope)) return;
      copies = { base, external }; currentText.value = text(current); showSelected();
      const stable = first.currentContentHash === current.contentHash && second.currentContentHash === current.contentHash;
      comparisonHash = stable ? current.contentHash : "";
      message.textContent = !stable ? "The note changed again. Open More options and refresh the changes before using an earlier version." : writable() ? "" : "You can see the changes. Using an earlier version requires write access.";
    } catch {
      if (token === sequence && valid(editor, scope)) message.textContent = "Could not load the earlier text. Your saved note is unchanged. Open More options to refresh, or try again after reconnecting.";
    } finally { if (token === sequence) { loading = false; refresh(); } }
  }
  async function copy(current: boolean) {
    const field = current ? currentText : retainedText;
    if (!field.value || !valid()) return;
    const editor = bound, scope = boundScope;
    try { await doc.defaultView!.navigator.clipboard.writeText(field.value); if (valid(editor, scope)) message.textContent = "Text copied."; }
    catch { if (valid(editor, scope)) { message.textContent = "Clipboard access is unavailable. Select and copy the text below."; field.focus(); field.select(); } }
  }
  async function restoreReviewed() {
    const editor = bound, scope = boundScope;
    if (!editor?.restoreRetainedVersion || !writable() || !comparisonHash || !copies || loading || mutating) return;
    const candidate = copies[selected.value === "external" ? "external" : "base"], expected = comparisonHash;
    comparisonHash = ""; mutating = true; refresh(); message.textContent = "Saving the earlier version…";
    try {
      if (!await editor.restoreRetainedVersion(candidate, expected)) throw new Error("Unconfirmed restore");
      if (valid(editor, scope)) { mutating = false; close(); refresh(); }
    } catch {
      if (valid(editor, scope)) message.textContent = "Could not confirm this change. Your draft is still here. Close this window to return to it, or refresh after reconnecting.";
    } finally { mutating = false; if (!valid(editor, scope)) close(); refresh(); }
  }
  review.addEventListener("click", open); selected.addEventListener("change", showSelected);
  element("retained-copy").addEventListener("click", () => copy(false)); element("retained-copy-current").addEventListener("click", () => copy(true));
  refreshButton.addEventListener("click", open); restore.addEventListener("click", restoreReviewed); element("retained-close").addEventListener("click", () => { close(); refresh(); });
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  return { close, open, refresh, isOpen: () => dialog.open, isBusy: () => loading || mutating };
}
