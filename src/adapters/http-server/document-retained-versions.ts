import type { CollaborationSnapshot } from "./collaboration-client.js";

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
/** Retained file versions are reviewable even when the current note is Saved. */
export function installRetainedVersions(options: Options) {
  const doc = options.document;
  const banner = doc.createElement("div"); banner.id = "note-retained-version"; banner.hidden = true; banner.setAttribute("role", "status"); banner.setAttribute("aria-live", "polite"); banner.style.cssText = "padding:8px 16px;gap:8px;align-items:center;flex-wrap:wrap";
  const notice = doc.createElement("span"), review = doc.createElement("button");
  review.id = "review-retained-version"; review.type = "button"; review.className = "quiet-button"; review.textContent = "Review retained version"; review.setAttribute("aria-haspopup", "dialog");
  banner.append(notice, review);
  const toolbar = doc.querySelector(".workspace-toolbar");
  if (toolbar) toolbar.after(banner); else doc.body.append(banner);
  const dialog = doc.createElement("dialog"); dialog.id = "retained-version-review"; dialog.className = "document-dialog"; dialog.setAttribute("aria-labelledby", "retained-version-title");
  dialog.innerHTML = `<h2 id="retained-version-title">Review retained version</h2><p>The external file remains saved. Compare before choosing whether to restore an earlier version.</p><label>Retained version<select id="retained-version-choice"><option value="base">Before the external edit</option><option value="external">External edit when observed</option></select></label><label>Retained text<textarea id="retained-version-text" readonly></textarea></label><label>Current saved note<textarea id="retained-current-text" readonly></textarea></label><p id="retained-version-message" role="status" aria-live="polite"></p><div class="dialog-actions"><button id="retained-copy" class="quiet-button" type="button">Copy retained text</button><button id="retained-copy-current" class="quiet-button" type="button">Copy current saved text</button><button id="retained-refresh" class="quiet-button" type="button">Refresh comparison</button><button id="retained-restore" class="quiet-button" type="button" disabled>Restore reviewed version</button><button id="retained-close" class="quiet-button" type="button">Keep current note</button></div>`;
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
    retainedText.value = currentText.value = message.textContent = "";
    if (dialog.open) dialog.close();
  }
  function refresh() {
    const editor = options.editor(), recovery = editor?.getRetainedRecovery?.(), incomplete = editor?.getRetainedDiscovery?.() === "incomplete";
    banner.hidden = !editor?.state.loaded || editor.state.cancelled || (!recovery && !incomplete);
    banner.style.display = banner.hidden ? "none" : "flex";
    notice.textContent = incomplete ? "Some retained versions could not be verified. Retained copies remain available to the brain operator." : "External file replaced saved text — review retained version.";
    review.hidden = !recovery; review.disabled = Boolean(editor?.state.navigationPending) || !editor?.readRetainedVersion;
    if (dialog.open && !valid()) close(true);
    restore.hidden = !writable(); restore.disabled = loading || mutating || !comparisonHash || !copies || !writable();
  }
  function showSelected() { retainedText.value = copies ? text(copies[selected.value === "external" ? "external" : "base"]) : ""; }
  async function open() {
    if (mutating) return;
    const editor = options.editor(), recovery = editor?.getRetainedRecovery?.();
    if (!editor?.state.loaded || editor.state.cancelled || !recovery || !editor.readRetainedVersion) return;
    close(); bound = editor; boundScope = options.scope(); const scope = boundScope, token = ++sequence;
    loading = true; selected.value = "base"; message.textContent = "Loading retained text and the current saved note…";
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
      copies = { base, external }; showSelected(); currentText.value = text(current);
      const stable = first.currentContentHash === current.contentHash && second.currentContentHash === current.contentHash;
      comparisonHash = stable ? current.contentHash : "";
      message.textContent = !stable ? "The saved note changed while opening. Refresh this comparison before restoring." : writable() ? "Compare the text. Restoring is an explicit save; your previous draft is preserved first." : "You can compare and copy these versions. Restoring requires write access.";
    } catch {
      if (token === sequence && valid(editor, scope)) message.textContent = "Could not verify retained text. Reconnect or ask the brain operator to inspect the retained versions. Your saved note is unchanged.";
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
    comparisonHash = ""; mutating = true; refresh(); message.textContent = "Preserving your draft and restoring the reviewed version…";
    try {
      if (!await editor.restoreRetainedVersion(candidate, expected)) throw new Error("Unconfirmed restore");
      if (valid(editor, scope)) message.textContent = "Reviewed text restored. Earlier retained versions remain available.";
    } catch {
      if (valid(editor, scope)) message.textContent = "Could not preserve or confirm this restore. Keep this window open and copy your draft. Check storage access or reconnect, then refresh the comparison before trying again.";
    } finally { mutating = false; if (!valid(editor, scope)) close(); refresh(); }
  }
  review.addEventListener("click", open); selected.addEventListener("change", showSelected);
  element("retained-copy").addEventListener("click", () => copy(false)); element("retained-copy-current").addEventListener("click", () => copy(true));
  refreshButton.addEventListener("click", open); restore.addEventListener("click", restoreReviewed); element("retained-close").addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  return { close, open, refresh, isOpen: () => dialog.open, isBusy: () => loading || mutating };
}
