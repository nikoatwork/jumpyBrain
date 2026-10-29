// Presentation preference only: independent of document, credentials and brain selection.
export const sidebarBootstrap = String.raw`
const sidebarPreference = (() => {
  const key = "jumpybrain.sidebarCollapsed";
  const root = document.documentElement;
  let collapsed = false;
  try { collapsed = localStorage.getItem(key) === "true"; } catch { /* Tab-only preference. */ }
  function apply() {
    const active = document.activeElement;
    const expanded = !collapsed || document.body?.dataset.view === "settings";
    root.dataset.sidebarCollapsed = String(!expanded);
    const button = document.getElementById("toggle-sidebar");
    if (!button) return;
    const sidebar = document.getElementById("app-sidebar");
    const focusToggle = active === button || (!expanded && sidebar?.contains(active));
    const home = document.querySelector(".nav-brand");
    const toolbar = document.querySelector(".workspace-toolbar");
    const parent = expanded ? home : toolbar;
    if (parent && button.parentElement !== parent) parent.prepend(button);
    const label = expanded ? "Collapse sidebar" : "Expand sidebar";
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", label);
    button.title = label;
    if (focusToggle) button.focus();
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    collapsed = event.newValue === "true";
    apply();
  });
  apply();
  return {
    sync: apply,
    toggle() {
      collapsed = !collapsed;
      try { localStorage.setItem(key, String(collapsed)); } catch { /* Tab-only preference. */ }
      apply();
    }
  };
})();
`;

export const sidebarScript = String.raw`
sidebarPreference.sync();
document.getElementById("toggle-sidebar").addEventListener("click", () => sidebarPreference.toggle());

(() => {
  const handle = document.getElementById("sidebar-resize");
  if (!handle?.addEventListener) return;
  const root = document.documentElement;
  const key = "jumpybrain.sidebarWidth";
  let width = 280;
  try { const saved = Number(localStorage.getItem(key)); if (saved >= 224) width = saved; } catch {}
  const maximum = () => Math.max(224, Math.min(480, window.innerWidth * .4));
  function apply(persist = false) {
    width = Math.max(224, Math.min(maximum(), width));
    root.style.setProperty("--sidebar-width", width + "px");
    handle.setAttribute("aria-valuenow", String(Math.round(width)));
    handle.setAttribute("aria-valuemax", String(Math.round(maximum())));
    if (persist) try { localStorage.setItem(key, String(width)); } catch {}
  }
  let dragging = false;
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault(); dragging = true; handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", event => {
    if (!dragging) return;
    width = event.clientX - document.getElementById("app-sidebar").getBoundingClientRect().left; apply();
  });
  handle.addEventListener("pointerup", () => { dragging = false; apply(true); });
  handle.addEventListener("lostpointercapture", () => { dragging = false; });
  handle.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); width = event.key === "Home" ? 224 : event.key === "End" ? maximum() : width + (event.key === "ArrowRight" ? 16 : -16); apply(true);
  });
  handle.addEventListener("dblclick", () => { width = 280; apply(true); });
  window.addEventListener("resize", () => apply());
  apply();
})();
`;
