export type MessageSeverity = "info" | "success" | "warning" | "error";
export interface SystemMessage {
  source: string;
  text: string;
  severity?: MessageSeverity;
  /** Distinguish separate operations that produce identical text. */
  revision?: string;
  /** Zero stays until dismissed/resolved; positive values expire while visible. */
  duration?: number;
  scope?: "brain" | "app";
  action?: { label: string; run(): void | Promise<void> };
}
export type SystemMessages = ReturnType<typeof installSystemMessages>;

export const systemMessageStyles = String.raw`
  .app-workspace { position: relative; }
  #app-toast { position: absolute; z-index: 100; left: var(--space-4); bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); width: max-content; max-width: min(360px, calc(100% - 32px)); max-height: calc(100% - 32px); overflow: auto; padding: var(--space-2) var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); font: var(--text-ui)/var(--leading-ui) var(--font-ui); }
  #app-toast[hidden] { display: none; }
  #toast-message { min-width: 0; overflow-wrap: anywhere; white-space: pre-line; }
  #app-toast[data-error="true"] #toast-message { color: var(--error-ink); }
  #app-toast[data-severity="warning"] { border-color: var(--accent); }
  #toast-action, #toast-close { flex-shrink: 0; }
`;
export const systemMessageMarkup = String.raw`<div id="app-toast" hidden><span id="toast-message" role="status" aria-live="polite" aria-atomic="true"></span><button id="toast-action" class="quiet-button" type="button" hidden></button><button id="toast-close" class="quiet-button note-icon" type="button" aria-label="Dismiss notification" title="Dismiss notification"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>`;

/** One tab-local owner. Producers never manipulate the notification DOM. */
export function installSystemMessages(document: Document, scope: () => string) {
  const win = document.defaultView!;
  const root = document.getElementById("app-toast")!;
  const message = document.getElementById("toast-message")!;
  const action = document.getElementById("toast-action") as HTMLButtonElement;
  const dismiss = document.getElementById("toast-close")!;
  type Entry = SystemMessage & { severity: MessageSeverity; boundScope: string; remaining: number; order: number; disabled: boolean; confirmation?: boolean };
  const pending = new Map<string, Entry>();
  // Also remember expired/dismissed messages so polling cannot replay them.
  const seen = new Map<string, { signature: string; scope: string }>();
  let current: Entry | undefined, timer: number | undefined, started = 0, sequence = 0, hovered = false, stopped = false;
  let returnFocus: HTMLElement | null = null;
  const priority = (entry: Entry) => entry.severity === "error" ? 2 : entry.severity === "warning" ? 1 : 0;
  function pause() {
    if (timer !== undefined) {
      win.clearTimeout(timer);
      if (current) current.remaining = Math.max(1, current.remaining - (Date.now() - started));
    }
    timer = undefined;
  }
  function hide() {
    if (root.contains(document.activeElement) && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    current = undefined;
    root.hidden = true; message.textContent = ""; action.hidden = true;
    delete root.dataset.source;
  }
  function arm() {
    if (!current || current.remaining <= 0 || hovered || root.contains(document.activeElement)) return;
    const entry = current;
    started = Date.now();
    timer = win.setTimeout(() => {
      timer = undefined;
      if (current !== entry) return;
      pending.delete(entry.source); render();
    }, entry.remaining);
  }
  function prune() {
    const activeScope = scope();
    for (const [key, entry] of pending) if (entry.scope !== "app" && entry.boundScope !== activeScope) pending.delete(key);
    for (const [key, entry] of seen) if (entry.scope !== "app" && entry.scope !== activeScope) seen.delete(key);
  }
  function render() {
    pause(); prune();
    const next = [...pending.values()].sort((a, b) => priority(b) - priority(a) || b.order - a.order)[0];
    if (next !== current) {
      hide();
      if (next) {
        if (document.activeElement && "focus" in document.activeElement && !root.contains(document.activeElement)) returnFocus = document.activeElement as HTMLElement;
        current = next;
        root.dataset.source = next.source; root.dataset.severity = next.severity;
        root.dataset.error = String(next.severity === "error");
        message.setAttribute("role", next.severity === "error" ? "alert" : "status");
        message.setAttribute("aria-live", next.severity === "error" ? "assertive" : "polite");
        message.textContent = next.text;
        action.textContent = next.action?.label || ""; action.hidden = !next.action; action.disabled = next.disabled;
        root.hidden = false;
      }
    }
    arm();
  }
  function clear(source?: string) {
    if (source) { pending.delete(source); seen.delete(source); }
    else { pending.clear(); seen.clear(); }
    render();
  }
  function dispatch(input: SystemMessage) {
    if (stopped) return;
    prune();
    if (!input.text) { clear(input.source); return; }
    const severity = input.severity ?? "info";
    const duration = input.duration ?? (severity === "warning" ? 0 : input.action || severity === "error" ? 8_000 : 4_000);
    const boundScope = input.scope === "app" ? "app" : scope();
    const signature = JSON.stringify([input.text, severity, duration, input.action?.label, input.revision]);
    const prior = seen.get(input.source);
    if (prior?.signature === signature && prior.scope === boundScope) {
      const entry = pending.get(input.source);
      if (entry) entry.action = input.action;
      render(); return;
    }
    seen.delete(input.source);
    seen.set(input.source, { signature, scope: boundScope });
    pending.set(input.source, { ...input, severity, boundScope, remaining: duration, order: ++sequence, disabled: false });
    // Bound tab-local state even if a faulty producer invents source IDs.
    while (seen.size > 32) seen.delete(seen.keys().next().value!);
    while (pending.size > 16) {
      const oldest = [...pending.values()].sort((a, b) => priority(a) - priority(b) || a.order - b.order)[0];
      pending.delete(oldest.source);
    }
    render();
  }
  const enter = () => { hovered = true; pause(); };
  const leave = () => { hovered = false; render(); };
  const focusout = (event: FocusEvent) => { if (!root.contains(event.relatedTarget as Node | null)) win.queueMicrotask(() => { if (!stopped) render(); }); };
  const run = () => {
    const entry = current;
    render();
    if (entry !== current) return;
    const failed = () => {
      if (!stopped && entry && (entry.scope === "app" || entry.boundScope === scope())) dispatch({ source: "message-action", text: "Action failed. Check the connection and try again.", severity: "error", scope: entry.scope });
    };
    if (entry?.action && !entry.disabled) {
      try { Promise.resolve(entry.action.run()).catch(failed); }
      catch { failed(); }
    }
  };
  const close = () => { if (current) { pending.delete(current.source); render(); } };
  const pagehide = () => { pending.clear(); seen.clear(); pause(); hide(); };
  // Data-only bridge for injected native controls. It grants no actions/capabilities.
  const receive = (event: Event) => {
    const value = (event as CustomEvent).detail;
    if (!value || typeof value.source !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(value.source)
      || typeof value.text !== "string" || value.text.length > 4096
      || (value.severity !== undefined && !["info", "success", "warning", "error"].includes(value.severity))
      || (value.revision !== undefined && (typeof value.revision !== "string" || value.revision.length > 512))
      || (value.scope !== undefined && !["app", "brain"].includes(value.scope))
      || (value.duration !== undefined && (!Number.isFinite(value.duration) || value.duration < 0 || value.duration > 60_000))) return;
    dispatch({ source: value.source, text: value.text, severity: value.severity, duration: value.duration, scope: value.scope, revision: value.revision });
  };
  root.addEventListener("mouseenter", enter); root.addEventListener("mouseleave", leave);
  root.addEventListener("focusin", pause); root.addEventListener("focusout", focusout);
  action.addEventListener("click", run); dismiss.addEventListener("click", close);
  document.addEventListener("jumpybrain-system-message", receive);
  win.addEventListener("pagehide", pagehide);
  return {
    dispatch, clear, sync: render,
    disableAction(disabled: boolean, source = "attention") {
      const entry = pending.get(source);
      if (entry) entry.disabled = disabled;
      if (current === entry) action.disabled = disabled;
    },
    /** Compatibility for note confirmations; only one transient confirmation remains pending. */
    show(source: string, text: string, options: { error?: boolean; duration?: number; action?: SystemMessage["action"] } = {}) {
      for (const [key, entry] of pending) if (entry.confirmation) pending.delete(key);
      seen.delete(source);
      dispatch({ source, text, severity: options.error ? "error" : "info", ...options });
      const entry = pending.get(source);
      if (entry) entry.confirmation = true;
    },
    stop() {
      stopped = true; pagehide();
      root.removeEventListener("mouseenter", enter); root.removeEventListener("mouseleave", leave);
      root.removeEventListener("focusin", pause); root.removeEventListener("focusout", focusout);
      action.removeEventListener("click", run); dismiss.removeEventListener("click", close);
      document.removeEventListener("jumpybrain-system-message", receive); win.removeEventListener("pagehide", pagehide);
    },
  };
}
