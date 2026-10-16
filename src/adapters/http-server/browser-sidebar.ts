// Presentation preference only: independent of document, credentials and brain selection.
export const sidebarBootstrap = String.raw`
const sidebarPreference = (() => {
  const key = "jumpybrain.sidebarCollapsed";
  const root = document.documentElement;
  const narrow = window.matchMedia("(max-width: 680px)");
  let collapsed = false;
  try { collapsed = localStorage.getItem(key) === "true"; } catch { /* Tab-only preference. */ }
  function apply() {
    root.dataset.sidebarCollapsed = String(collapsed);
    const button = document.getElementById("toggle-sidebar");
    if (!button) return;
    const expanded = narrow.matches || !collapsed;
    const label = expanded ? "Collapse sidebar" : "Expand sidebar";
    button.setAttribute("aria-expanded", String(expanded));
    button.setAttribute("aria-label", label);
    button.title = label;
    const sidebar = document.getElementById("app-sidebar");
    if (!expanded && sidebar?.contains(document.activeElement)) button.focus();
  }
  narrow.addEventListener("change", apply);
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
