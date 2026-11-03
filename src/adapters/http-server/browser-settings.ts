import { appearanceStyles, appearanceScript } from "./browser-appearance.js";
import { browserIcons } from "./browser-icons.js";

// Companion-only presentation. Navigation still passes through the shell save guard.
export const settingsNavigationMarkup = String.raw`
<div id="settings-navigation" aria-label="Settings sections" hidden>
  <p class="settings-nav-label">Settings</p>
  <a class="quiet-button nav-item" href="/settings" data-settings-section="brains">${browserIcons.connect}<span>Brains</span></a>
  <a class="quiet-button nav-item" href="/settings?section=identity" data-settings-section="identity">${browserIcons.connect}<span>Your name</span></a>
  <a class="quiet-button nav-item" href="/settings?section=boards" data-settings-section="boards">${browserIcons.board}<span>Boards</span></a>
  <a class="quiet-button nav-item" href="/settings?section=appearance" data-settings-section="appearance">${browserIcons.appearance}<span>Appearance</span></a>
  <a class="quiet-button nav-item" href="/settings?section=extensions" data-settings-section="extensions">${browserIcons.extensions}<span>Extensions</span></a>
</div>
<a id="settings-back" class="quiet-button nav-item" href="/" hidden>${browserIcons.back}<span>Back to app</span></a>`;

export const settingsStyles = String.raw`
  ${appearanceStyles}
  body[data-view="settings"] .app-nav > :is(.nav-tools, .nav-library, .extension-slot),
  body[data-view="settings"] :is(#companion-active, #toggle-sidebar),
  body[data-view="settings"] .nav-preferences > :not(.nav-utilities) { display: none; }
  #settings-navigation { display: flex; flex-direction: column; gap: var(--space-1); }
  #settings-navigation[hidden], #settings-back[hidden] { display: none; }
  .settings-nav-label { margin: 0 var(--space-3) var(--space-2); font-size: var(--text-caption); color: var(--ink-faint); }
  #settings-navigation .nav-item { min-height: var(--space-10); }
  #companion-heading:focus { outline: none; }
  #settings-back { margin-top: auto; }
  body[data-view="settings"] .nav-preferences { grid-template-columns: minmax(0, 1fr); margin-top: 0; }
  body[data-view="settings"] .workspace-toolbar { display: none; }
  .settings-breadcrumb { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-heading); }
  .settings-breadcrumb > span:first-child, .settings-breadcrumb > span[aria-hidden] { color: var(--ink-faint); font-weight: var(--weight-regular); }
  .settings-card { border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-5); }
  .settings-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .settings-row label { font-size: var(--text-body); }
  .settings-row .dropdown { width: 160px; max-width: 55%; }
  #settings-panel-extensions #extension-settings { margin-top: 0; }
  #settings-panel-extensions .extension-palette { margin-bottom: var(--space-5); }
  @media (prefers-reduced-motion: no-preference) {
    .settings-panel:not([hidden]) { animation: settings-enter 160ms var(--ease); }
    @keyframes settings-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  }
  @media (max-width: 680px) {
    body[data-view="settings"] .app-nav { display: flex; flex-direction: column; gap: var(--space-2); }
    body[data-view="settings"] .nav-brand { min-height: var(--space-12); }
    #settings-navigation { flex-direction: row; flex-wrap: wrap; gap: var(--space-1); }
    .settings-nav-label { display: none; }
    #settings-navigation .nav-item { flex: 1; justify-content: center; }
    #settings-navigation .nav-item svg { display: none; }
    #settings-back { align-self: flex-start; margin-top: 0; }
    body[data-view="settings"] .nav-preferences { position: absolute; right: var(--space-3); top: var(--space-1); margin-inline: 0; padding: 0; border: 0; }
    #companion-settings { padding: var(--space-6) var(--space-4) var(--space-12); }
    .settings-card { padding: var(--space-4); }
  }
`;

export const settingsScript = String.raw`
let identityNameDirty = false;
$("identity-name").addEventListener("input", () => { identityNameDirty = true; });
$("identity-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!$("identity-form").reportValidity()) return;
  const button = $("identity-form").querySelector("button");
  button.disabled = true;
  try {
    const identity = await companionControl("identity", { name: $("identity-name").value });
    identityNameDirty = false;
    browserActor = { kind: "human", ...(browserActor.id ? { id: browserActor.id } : {}), ...(identity.name ? { name: identity.name } : {}) };
    $("identity-name").value = identity.name;
    $("identity-message").textContent = "Name saved. Future edits will use this name.";
  } catch { $("identity-message").textContent = "Could not save your name. Try again."; }
  finally { button.disabled = false; }
});
let settingsLastAppUrl = null;
let settingsReturnUrl = null;
function syncSettingsNavigation(url) {
  const target = new URL(url, location.origin);
  const settings = state.view === "settings";
  const requested = target.searchParams.get("section");
  const section = ["appearance", "extensions", "boards", "identity"].includes(requested) ? requested : "brains";
  if (settings && document.body.dataset.settingsPage === "brains" && section !== "brains") companionClearForm();
  if (settings && !document.body.dataset.settingsPage) settingsReturnUrl = settingsLastAppUrl;
  if (!settings) settingsLastAppUrl = target.pathname + target.search;
  document.body.dataset.settingsPage = settings ? section : "";
  $("app-sidebar").setAttribute("aria-label", settings ? "Settings navigation" : "Main navigation");
  $("settings-navigation").hidden = !settings;
  $("settings-back").hidden = !settings;
  $("settings-back").href = settingsReturnUrl || companionScopeUrl("/");
  for (const link of document.querySelectorAll("[data-settings-section]")) {
    const current = settings && link.dataset.settingsSection === section;
    if (current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  for (const panel of document.querySelectorAll("[data-settings-panel]")) panel.hidden = panel.dataset.settingsPanel !== section;
  $("settings-section-title").textContent = section === "identity" ? "Your name" : section === "boards" ? "Boards" : section === "brains" ? "Brains" : section === "appearance" ? "Appearance" : "Extensions";
  $("companion-refresh-index").hidden = section !== "brains";
  sidebarPreference.sync();
}
for (const link of document.querySelectorAll("[data-settings-section], #settings-back")) {
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigation.navigate(link.getAttribute("href"));
  });
}
${appearanceScript}
$("open-connection").removeAttribute("aria-haspopup");
$("open-connection").setAttribute("aria-controls", "companion-settings");
`;
