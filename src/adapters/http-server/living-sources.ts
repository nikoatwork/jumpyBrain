import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import type { SourceCheckResult } from "../../core/dream/source-references.js";
import type { createDocumentEditor } from "./document-controller.js";
import { HTTP_MEMORY_ROUTES } from "../http-protocol.js";

/** Reader-owned transient check state, fenced to the current document, draft and credential scope. */
export function installLivingSources(options: {
  document: Document; editor(): ReturnType<typeof createDocumentEditor> | null;
  scope(): string; enabled(): boolean; json(url: string, init?: RequestInit): Promise<unknown>;
  navigate(id: string): void;
}) {
  const doc = options.document;
  const panel = doc.getElementById("living-sources") as HTMLDetailsElement;
  const button = doc.getElementById("check-living-sources") as HTMLButtonElement;
  const status = doc.getElementById("living-sources-status")!;
  const list = doc.getElementById("living-sources-list")!;
  let key = "", sequence = 0, busy = false;
  function sync() {
    const editor = options.editor(), state = editor?.state;
    const next = state?.loaded && !state.cancelled && options.enabled()
      ? JSON.stringify([options.scope(), state.documentId, state.contentHash, state.draftRevision]) : "";
    if (next !== key) {
      key = next; sequence++; busy = false; list.replaceChildren();
      status.textContent = "Source versions have not been checked in this view. Save pending edits before checking.";
    }
    panel.hidden = !next || !/^dream:\s*true\s*$/m.test(state?.frontmatterPrefix || "");
    button.disabled = busy || !next || Boolean(state?.dirty || state?.saveInFlight || state?.unconfirmedSave);
  }
  async function check() {
    sync();
    const editor = options.editor();
    if (panel.hidden || button.disabled || !editor) return;
    const token = ++sequence, baseline = key;
    busy = true; button.disabled = true; status.textContent = "Checking current source versions…"; list.replaceChildren();
    try {
      const result = await options.json(HTTP_MEMORY_ROUTES.dreamSources, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editor.state.documentId }),
      }) as SourceCheckResult;
      sync();
      if (token !== sequence || baseline !== key) return;
      if (result.page.contentHash !== editor.state.contentHash) throw new Error("Page changed");
      status.textContent = `Checked at ${result.checkedAt} · ${result.coverage} reference coverage. ${result.omittedReferences} references omitted; ${result.unreadFiles} files unread. Current versions only: this does not verify claims or provide a snapshot. Sources may change after checking.`;
      if (!result.sources.length) status.textContent += " No canonical source references found.";
      for (const source of result.sources) {
        const row = doc.createElement("li");
        const label = source.status === "not_checked" ? "not checked" : source.status;
        row.textContent = `${source.title || source.target}: ${label}${source.reason ? " · " + source.reason.replaceAll("_", " ") : ""}`;
        if (source.expectedHash) row.title = `Cited version: ${source.expectedHash}${source.currentHash ? "\nCurrent version: " + source.currentHash : ""}`;
        if (isValidMemoryDocumentId(source.id)) {
          const link = doc.createElement("button"); link.className = "quiet-button";
          link.type = "button"; link.textContent = "Open current source";
          link.addEventListener("click", () => { sync(); if (baseline === key && options.enabled()) options.navigate(source.id!); });
          row.append(" ", link);
        } else if (source.file) row.append(" · " + source.file + " (no openable ID)");
        list.append(row);
      }
    } catch {
      if (token === sequence && baseline === key) status.textContent = "Could not check this saved page. It may have changed or the server may need upgrading. Reread the page and retry; no source verification was recorded.";
    } finally { if (token === sequence) { busy = false; sync(); } }
  }
  button.addEventListener("click", check);
  return { sync, check };
}
