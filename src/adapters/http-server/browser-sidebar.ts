// Presentation preference only: independent of document, credentials and brain selection.
export const sidebarBootstrap = String.raw`
const sidebarPreference = (() => {
  const key = "jumpybrain.sidebarCollapsed";
  const root = document.documentElement;
  let collapsed = false;
  try { collapsed = localStorage.getItem(key) === "true"; } catch { /* Tab-only preference. */ }
  function apply() {
    const active = document.activeElement;
    root.dataset.sidebarCollapsed = String(collapsed);
    const button = document.getElementById("toggle-sidebar");
    if (!button) return;
    const sidebar = document.getElementById("app-sidebar");
    const focusToggle = active === button || (collapsed && sidebar?.contains(active));
    const expanded = !collapsed;
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
`;
