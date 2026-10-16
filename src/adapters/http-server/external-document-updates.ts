import type { createDocumentEditor, DocumentPayload } from "./document-controller.js";

// Match equal source lines in order, including repeated paragraphs. Linear space
// and time; this is a presentation hint, not an edit script or a merge algorithm.
export function externalLineChanges(before: string, after: string) {
  const oldLines = before.split("\n"), lines = after.split("\n");
  const positions = new Map<string, { indices: number[]; next: number }>();
  oldLines.forEach((line, index) => {
    if (!positions.has(line)) positions.set(line, { indices: [], next: 0 });
    positions.get(line)!.indices.push(index);
  });
  let last = -1;
  const matches = lines.map((line) => {
    const entry = positions.get(line);
    if (!entry) return -1;
    while (entry.next < entry.indices.length && entry.indices[entry.next]! <= last) entry.next++;
    if (entry.next === entry.indices.length) return -1;
    return last = entry.indices[entry.next++]!;
  });
  return { matches, changed: matches.map((match, index) => match < 0 && Boolean(lines[index]?.trim())) };
}

export function installExternalDocumentUpdates(options: {
  document: Document;
  editor(): ReturnType<typeof createDocumentEditor> | null;
  scope(): string;
  enabled(): boolean;
  read(id: string, options: { signal: AbortSignal }): Promise<DocumentPayload>;
  onUpdated(): void;
}) {
  const doc = options.document, win = doc.defaultView!;
  const visible = () => doc.visibilityState !== "hidden";
  let timer: number | undefined, noticeTimer: number | undefined, request: AbortController | null = null;
  let sequence = 0, failures = 0, composing = false, pointer = false, lastInteraction = 0, suspended = false;
  const field = (target: EventTarget | null) => target instanceof win.HTMLElement
    && Boolean(target.closest("#note-editor, #note-name"));
  const touch = (event: Event) => { if (field(event.target)) lastInteraction = Date.now(); };
  const compositionStart = (event: Event) => { if (field(event.target)) { composing = true; touch(event); } };
  const compositionEnd = (event: Event) => { if (field(event.target)) { composing = false; touch(event); } };
  const pointerDown = (event: Event) => { if (field(event.target)) { pointer = true; touch(event); } };
  const pointerUp = () => { if (pointer) lastInteraction = Date.now(); pointer = false; };
  function safeToApply() {
    const selection = win.getSelection();
    return !composing && !pointer && Date.now() - lastInteraction >= 1500
      && doc.activeElement?.id !== "note-name" && !doc.querySelector("dialog[open]")
      && !(selection && !selection.isCollapsed && (field(selection.anchorNode?.parentElement ?? null) || field(selection.focusNode?.parentElement ?? null)));
  }
  function queue(delay = 2000) {
    win.clearTimeout(timer);
    if (!suspended && visible()) timer = win.setTimeout(check, delay);
  }
  async function check() {
    if (request || suspended || !visible()) return;
    const editor = options.editor();
    if (!options.enabled() || !editor?.state.loaded || editor.state.cancelled || editor.state.navigationPending || editor.state.saveInFlight) { queue(); return; }
    const current = editor.state;
    const baseline = { hash: current.contentHash, revision: current.draftRevision, token: current.reconcileToken };
    const scope = options.scope(), token = ++sequence;
    const controller = new AbortController(); request = controller;
    const deadline = win.setTimeout(() => controller.abort(), 10000);
    try {
      const payload = await options.read(current.documentId, { signal: controller.signal });
      if (controller.signal.aborted || token !== sequence || options.editor() !== editor || scope !== options.scope()
        || !options.enabled() || suspended || !visible()) return;
      if (editor.acceptExternal(payload, baseline, safeToApply)) {
        options.onUpdated();
        win.clearTimeout(noticeTimer);
        noticeTimer = win.setTimeout(() => editor.clearExternalNotice(), 4000);
      }
      failures = 0;
    } catch {
      // Reads are observational. Offline/auth/deletion errors never hydrate an
      // empty note, clear a draft, or change the confirmed save outcome.
      failures = Math.min(failures + 1, 4);
    } finally {
      win.clearTimeout(deadline);
      if (request === controller) request = null;
      queue(Math.min(2000 * 2 ** failures, 30000));
    }
  }
  function pause() { sequence++; request?.abort(); win.clearTimeout(timer); }
  function visibility() { pause(); if (visible()) queue(0); }
  const pagehide = () => { suspended = true; pause(); };
  const pageshow = () => { suspended = false; queue(0); };
  const focus = () => { if (!request) queue(0); };
  const events: [string, EventListener][] = [["beforeinput", touch], ["input", touch], ["keydown", touch],
    ["compositionstart", compositionStart], ["compositionend", compositionEnd], ["pointerdown", pointerDown],
    ["pointerup", pointerUp], ["pointercancel", pointerUp], ["visibilitychange", visibility]];
  events.forEach(([name, listener]) => doc.addEventListener(name, listener, true));
  win.addEventListener("pagehide", pagehide); win.addEventListener("pageshow", pageshow); win.addEventListener("focus", focus);
  queue();
  const dispose = () => {
    suspended = true; pause();
    win.clearTimeout(noticeTimer);
    events.forEach(([name, listener]) => doc.removeEventListener(name, listener, true));
    win.removeEventListener("pagehide", pagehide); win.removeEventListener("pageshow", pageshow); win.removeEventListener("focus", focus);
  };
  return Object.assign(dispose, { canApply: () => options.enabled() && !suspended && visible() && safeToApply() });
}
