// Desktop capability is supplied only by Electron's isolated update preload.
export const updateStyles = String.raw`
    .desktop-update { position: relative; align-self: flex-end; margin: 2px 4px 0; }
    .desktop-update[hidden], .update-panel[hidden] { display: none; }
    #desktop-update-toggle { position: relative; display: grid; place-items: center; width: 36px; height: 36px; padding: 8px; border-radius: 50%; background: transparent; }
    #desktop-update-toggle:hover, #desktop-update-toggle[aria-expanded="true"] { background: var(--control-fill); }
    #desktop-update-toggle svg { width: 21px; height: 21px; }
    .update-dot { position: absolute; right: 5px; top: 4px; width: 7px; height: 7px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 3px var(--surface); }
    .update-panel { position: absolute; z-index: 40; right: 0; bottom: 44px; width: 200px; padding: 14px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 32px #0002; font-size: 12px; line-height: 1.5; }
    .update-panel h2 { margin: 0 0 6px; font-size: 13px; font-weight: 600; }
    .update-panel p { margin: 0 0 12px; color: var(--ink-soft); overflow-wrap: anywhere; }
    .update-panel .quiet-button { width: 100%; font-size: 12px; min-height: 32px; }
    .update-panel small { display: block; color: var(--ink-faint); margin-top: 10px; }
    .desktop-update[data-busy="true"] #desktop-update-toggle svg { animation: update-pulse 1.4s ease-in-out infinite; }
    @keyframes update-pulse { 50% { opacity: .35; } }
    @media (prefers-reduced-motion: reduce) { .desktop-update[data-busy="true"] #desktop-update-toggle svg { animation: none; } }
    @media (max-width: 680px) { .desktop-update { grid-row: 6; grid-column: 2; justify-self: end; } }
`;
export const updateMarkup = String.raw`
<div id="desktop-update" class="desktop-update" hidden>
  <button id="desktop-update-toggle" class="quiet-button" type="button" aria-label="Software updates" title="Software updates" aria-expanded="false" aria-controls="desktop-update-panel">
    <svg id="update-download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 14v6h16v-6"/></svg>
    <svg id="update-restart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 7v5"/></svg>
    <span id="desktop-update-dot" class="update-dot" hidden></span>
  </button>
  <section id="desktop-update-panel" class="update-panel" aria-labelledby="desktop-update-heading" hidden>
    <h2 id="desktop-update-heading">Software updates</h2>
    <p id="desktop-update-message" role="status" aria-live="polite"></p>
    <button id="desktop-update-action" class="quiet-button" type="button">Check for updates</button>
    <small id="desktop-update-version"></small>
  </section>
</div>
`;
export const updateScript = String.raw`
(() => {
  const bridge = window.jumpyBrainUpdates;
  if (!bridge) return;
  const root = document.getElementById("desktop-update");
  const toggle = document.getElementById("desktop-update-toggle");
  const panel = document.getElementById("desktop-update-panel");
  const action = document.getElementById("desktop-update-action");
  const message = document.getElementById("desktop-update-message");
  let current, busy = false, revision = 0;
  function render(state) {
    if (!state || typeof state.status !== "string") return;
    current = state;
    root.hidden = false;
    root.dataset.state = state.status;
    const ready = state.status === "ready" || state.status === "restarting";
    const working = ["checking", "installing", "restarting"].includes(state.status);
    root.dataset.busy = String(working);
    document.getElementById("desktop-update-dot").hidden = !["available", "ready", "error"].includes(state.status);
    document.getElementById("update-download-icon").toggleAttribute("hidden", ready);
    document.getElementById("update-restart-icon").toggleAttribute("hidden", !ready);
    const label = ready ? "Restart to update to " + state.version
      : state.status === "available" ? "Update " + state.version + " available to install"
      : state.status === "installing" ? "Installing update " + state.version : "Software updates";
    toggle.title = label; toggle.setAttribute("aria-label", label);
    message.textContent = state.message || "Check for a new version of jumpyBrain.";
    action.textContent = ready ? (working ? "Restarting…" : "Restart to update")
      : state.status === "installing" ? "Installing…" : state.status === "checking" ? "Checking…"
      : state.status === "available" ? "Install update" : state.status === "error" ? "Try again" : "Check for updates";
    action.disabled = working || busy || state.status === "unavailable";
    document.getElementById("desktop-update-version").textContent = "Current version " + state.currentVersion;
  }
  function open(value, focus = false) {
    panel.hidden = !value; toggle.setAttribute("aria-expanded", String(value));
    if (focus) (value ? action : toggle).focus();
  }
  toggle.addEventListener("click", () => open(panel.hidden));
  document.addEventListener("pointerdown", (event) => { if (!root.contains(event.target)) open(false); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) { open(false, true); event.preventDefault(); }
  });
  root.addEventListener("focusout", () => { queueMicrotask(() => { if (!root.contains(document.activeElement)) open(false); }); });
  action.addEventListener("click", async () => {
    if (!current || busy || action.disabled) return;
    busy = true; action.disabled = true;
    try {
      const method = current.status === "ready" ? "restart"
        : current.status === "available" || current.status === "error" && current.retry === "install" ? "install" : "check";
      const next = await bridge[method]();
      revision++; render(next);
    } catch { message.textContent = "Update control is unavailable. Close and reopen the app, then try again."; }
    finally { busy = false; if (current) { action.disabled = ["checking", "installing", "restarting", "unavailable"].includes(current.status); } }
  });
  const unsubscribe = bridge.subscribe((state) => { revision++; render(state); });
  const requested = revision;
  bridge.state().then((state) => { if (revision === requested) render(state); }).catch(() => {});
  window.addEventListener("pagehide", () => unsubscribe(), { once: true });
})();
`;
