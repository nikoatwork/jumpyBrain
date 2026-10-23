export type Toast = ReturnType<typeof installToast>;

/** One replaceable, tab-local confirmation. Never owns persistent save/recovery state. */
export function installToast(document: Document, scope: () => string) {
  const win = document.defaultView!;
  const root = document.getElementById("app-toast")!;
  const message = document.getElementById("toast-message")!;
  const action = document.getElementById("toast-action") as HTMLButtonElement;
  const dismiss = document.getElementById("toast-close")!;
  let timer: number | undefined, revision = 0, boundScope = "";
  let returnFocus: HTMLElement | null = null;
  let callback: (() => void) | undefined;
  let remaining = 0, started = 0, hovered = false;
  function stop() {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = undefined;
  }
  function clear(source?: string) {
    if (source && root.dataset.source !== source) return;
    if (root.contains(document.activeElement) && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    revision++; stop(); callback = undefined; remaining = 0;
    root.hidden = true; message.textContent = ""; action.hidden = true;
    delete root.dataset.source;
  }
  function sync() { if (!root.hidden && boundScope !== scope()) clear(); }
  function arm() {
    stop(); sync();
    if (root.hidden || remaining <= 0 || hovered || root.contains(document.activeElement)) return;
    started = Date.now();
    const token = revision;
    timer = win.setTimeout(() => { if (token === revision) clear(); }, remaining);
  }
  function pause() {
    if (timer !== undefined) remaining = Math.max(1, remaining - (Date.now() - started));
    stop();
  }
  root.addEventListener("mouseenter", () => { hovered = true; pause(); });
  root.addEventListener("mouseleave", () => { hovered = false; arm(); });
  root.addEventListener("focusin", pause);
  root.addEventListener("focusout", event => { if (!root.contains(event.relatedTarget as Node | null)) win.queueMicrotask(arm); });
  action.addEventListener("click", () => { sync(); if (!root.hidden && !action.disabled) callback?.(); });
  dismiss.addEventListener("click", () => clear());
  win.addEventListener("pagehide", () => clear());
  return {
    clear, sync,
    disableAction(disabled: boolean) { action.disabled = disabled; },
    show(source: string, text: string, options: { error?: boolean; duration?: number; action?: { label: string; run(): void } } = {}) {
      clear();
      if (!text) return;
      if (document.activeElement && "focus" in document.activeElement && !root.contains(document.activeElement)) returnFocus = document.activeElement as HTMLElement;
      boundScope = scope(); root.dataset.source = source;
      root.dataset.error = String(Boolean(options.error)); message.textContent = text;
      callback = options.action?.run; action.textContent = options.action?.label || "";
      action.hidden = !callback; action.disabled = false; root.hidden = false;
      remaining = options.duration ?? (options.action || options.error ? 8_000 : 4_000);
      arm();
    },
  };
}
