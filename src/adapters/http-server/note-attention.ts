import { parseFrontmatter } from "../../core/frontmatter.js";
import { attentionTimestamp } from "../../core/attention.js";
import { memoryDocumentPath } from "../http-protocol.js";
import { splitEditableDocument, type createDocumentEditor } from "./document-controller.js";
import type { Toast } from "./browser-toast.js";
import type { AttentionPage } from "./browser-attention.js";

type Editor = ReturnType<typeof createDocumentEditor>;
type Action = { action: "settle" | "reactivate" } | { action: "snooze"; until: string };
type SavedNote = { id: string; title: string; content: string; contentHash: string };
export function snoozeChoices(now = new Date()) {
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now); monday.setDate(monday.getDate() + (8 - (monday.getDay() || 7))); monday.setHours(9, 0, 0, 0);
  return [
    { label: "In 1 hour", at: new Date(now.getTime() + 3_600_000) },
    { label: "In 3 hours", at: new Date(now.getTime() + 10_800_000) },
    { label: "Tomorrow", at: tomorrow }, { label: "Next week", at: monday },
  ];
}

/** Date input is local calendar time; reject gaps/overlaps rather than guessing an instant. */
export function customSnooze(value: string, now = Date.now()) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error("Choose a valid date and time.");
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const date = new Date(year!, month! - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month! - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) throw new Error("That local time does not exist. Choose another time.");
  // A repeated local minute can have two UTC offsets around a clock change.
  for (const hours of [-24, 24]) {
    const nearby = new Date(date.getTime() + hours * 3_600_000);
    const alternative = new Date(date.getTime() + (nearby.getTimezoneOffset() - date.getTimezoneOffset()) * 60_000);
    if (alternative.getTime() !== date.getTime() && alternative.getFullYear() === year && alternative.getMonth() === month! - 1 && alternative.getDate() === day && alternative.getHours() === hour && alternative.getMinutes() === minute) throw new Error("That local time occurs twice. Choose an unambiguous time.");
  }
  if (date.getTime() <= now) throw new Error("Choose a time in the future.");
  return date.toISOString();
}

function attentionValue(prefix: string): "settled" | string | undefined {
  const metadata = parseFrontmatter(prefix).frontmatter;
  if (!Object.hasOwn(metadata, "attention_at")) return undefined;
  if (metadata.attention_at === null) return "settled";
  return attentionTimestamp(metadata.attention_at);
}

export function installNoteAttention(options: {
  document: Document; editor(): Editor | null; writable(): boolean; scope(): string;
  blocked(): boolean; json(url: string, options?: RequestInit): Promise<unknown>;
  settleStarter?(id: string): boolean;
  changed(): void; onBusy(): void; toast: Toast;
}) {
  const doc = options.document, win = doc.defaultView!;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const dialog = $<HTMLDialogElement>("note-snooze");
  let busy = false, bound: { page: AttentionPage; scope: string; anchor: HTMLElement } | null = null;
  let waitingForSave = false;
  function message(text: string, error = false, undo?: () => void) {
    options.toast.show("attention", text, { error, action: undo ? { label: "Undo", run: undo } : undefined });
  }
  function close() {
    options.toast.sync();
    const anchor = bound?.anchor;
    bound = null; dialog.close(); $("snooze-options").replaceChildren();
    $<HTMLInputElement>("snooze-datetime").value = "";
    if (anchor?.isConnected && !busy) anchor.focus({ preventScroll: true });
  }
  function sync() {
    const editor = options.editor();
    options.toast.sync();
    options.toast.disableAction(busy || !options.writable() || Boolean(editor?.state.navigationPending));
    if (waitingForSave && !busy && editor?.state.saveStatus === "saved" && !editor.state.dirty) { waitingForSave = false; options.toast.clear("attention"); }
    if (bound && (bound.scope !== options.scope() || !options.writable())) close();
  }

  async function apply(id: string, action: Action, isUndo = false) {
    if (busy || !options.writable() || options.blocked()) return;
    const editor = options.editor(), scope = options.scope();
    if (editor?.state.navigationPending) return;
    busy = true; waitingForSave = false; message("Saving…");
    const valid = () => options.scope() === scope && options.editor() === editor && !editor?.state.cancelled && options.writable();
    editor?.setNavigationPending(true); sync(); options.onBusy();
    try {
      if (editor && !await editor.flush()) { waitingForSave = true; throw new Error("Save your pending changes before changing note attention."); }
      if (!valid()) return;
      const saved = await options.json(memoryDocumentPath(id)) as SavedNote;
      if (!valid()) return;
      if (saved.id !== id || typeof saved.content !== "string" || typeof saved.contentHash !== "string") throw new Error("Could not read the current note.");
      if (editor?.state.documentId === id && !editor.acceptMetadata(saved, editor.state.contentHash)) throw new Error("This note changed elsewhere. Review its latest changes first.");
      const prior = attentionValue(splitEditableDocument(saved.content).frontmatterPrefix);
      const result = await options.json(memoryDocumentPath(id), {
        method: "PATCH", headers: { "Content-Type": "application/json", "If-Match": saved.contentHash }, body: JSON.stringify(action),
      }) as SavedNote;
      if (!valid()) return;
      if (result.id !== id || typeof result.contentHash !== "string" || typeof result.content !== "string") throw new Error("The attention change could not be confirmed. Reopen the note to check its state.");
      if (editor?.state.documentId === id && !editor.acceptMetadata(result, saved.contentHash)) throw new Error("The note changed while saving. Reopen it to check its attention state.");
      const previous: Action = prior === "settled" ? { action: "settle" } : prior && Date.parse(prior) > Date.now() ? { action: "snooze", until: prior } : { action: "reactivate" };
      const starterDismissed = !isUndo && action.action === "settle" && options.settleStarter?.(id);
      message(isUndo ? "Attention change undone." : action.action === "settle" ? (starterDismissed ? "Settled and unpinned." : "Settled. Pinned pages stay visible.")
        : action.action === "snooze" ? "Snoozed until " + new Date(action.until).toLocaleString() + ". Pinned pages stay visible." : "Note brought back.", false,
        isUndo || starterDismissed ? undefined : () => { if (options.scope() === scope) void apply(id, previous, true); });
      options.changed();
    } catch (error) {
      if (!valid()) return;
      message(Number((error as { status?: number })?.status) === 412 ? "The note changed. Review the latest version before trying again."
        : error instanceof Error && !(error as { status?: number }).status ? error.message : "Could not confirm the attention change. Check the connection, then reopen the note before retrying.", true);
    } finally {
      busy = false;
      if (options.editor() === editor && !editor?.state.cancelled) editor?.setNavigationPending(false);
      sync(); options.onBusy();
    }
  }
  function open(page: AttentionPage, anchor: HTMLElement) {
    if (busy || options.blocked() || !options.writable()) return;
    close(); bound = { page, scope: options.scope(), anchor };
    $("snooze-title").textContent = "Snooze “" + page.title + "”";
    $("snooze-options").hidden = false; $("snooze-custom").hidden = true;
    const list = $("snooze-options");
    for (const choice of [...snoozeChoices(), { label: "Custom…", at: null }]) {
      const button = doc.createElement("button"); button.type = "button"; button.className = "quiet-button"; button.setAttribute("role", "menuitem");
      const label = doc.createElement("span"); label.textContent = choice.label; button.append(label);
      if (choice.at) { const time = doc.createElement("time"); time.dateTime = choice.at.toISOString(); time.textContent = choice.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (choice.label === "Next week" ? " · Mon" : ""); button.append(time); }
      button.addEventListener("click", () => {
        const selected = bound;
        if (!selected || selected.scope !== options.scope()) { close(); return; }
        if (choice.at) { close(); void apply(selected.page.id, { action: "snooze", until: choice.at.toISOString() }); }
        else { $("snooze-options").hidden = true; $("snooze-custom").hidden = false; $("snooze-error").textContent = ""; $<HTMLInputElement>("snooze-datetime").focus(); }
      }); list.append(button);
    }
    dialog.showModal();
    const rect = anchor.getBoundingClientRect(), width = dialog.offsetWidth, height = dialog.offsetHeight;
    dialog.style.left = Math.max(12, Math.min(rect.left, win.innerWidth - width - 12)) + "px";
    dialog.style.top = Math.max(12, Math.min(rect.bottom + 6, win.innerHeight - height - 12)) + "px";
    list.querySelector<HTMLButtonElement>("button")?.focus();
  }
  $("snooze-options").addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [...$("snooze-options").querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
    event.preventDefault(); buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  });
  $("snooze-custom").addEventListener("submit", event => {
    event.preventDefault(); const selected = bound; if (!selected || selected.scope !== options.scope()) { close(); return; }
    try { const until = customSnooze($<HTMLInputElement>("snooze-datetime").value); close(); void apply(selected.page.id, { action: "snooze", until }); }
    catch (error) { $("snooze-error").textContent = (error as Error).message; }
  });
  $("snooze-back").addEventListener("click", () => { $("snooze-custom").hidden = true; $("snooze-options").hidden = false; $("snooze-options").querySelector<HTMLButtonElement>("button")?.focus(); });
  $("snooze-close").addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
  return { sync, close, isBusy: () => busy, isOpen: () => dialog.open,
    act(action: "settle" | "snooze", page: AttentionPage, anchor: HTMLElement) { if (action === "snooze") open(page, anchor); else void apply(page.id, { action: "settle" }); },
  };
}
