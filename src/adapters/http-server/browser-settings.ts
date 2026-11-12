import { appearanceStyles, appearanceScript } from "./browser-appearance.js";
import { browserIcons } from "./browser-icons.js";

// Companion-only presentation. Settings opens as a near-full-screen card over
// the app; section links still pass through the shell save guard.
export const settingsNavigationMarkup = String.raw`
<aside class="settings-aside">
  <p class="settings-nav-label">Settings</p>
  <div class="settings-search" role="search">
    ${browserIcons.search}
    <input id="settings-search" type="search" placeholder="Search settings" aria-label="Search settings" aria-keyshortcuts="Meta+F" autocomplete="off" spellcheck="false" />
    <kbd id="settings-search-hint" aria-hidden="true">⌘F</kbd>
  </div>
  <nav id="settings-navigation" aria-label="Settings sections">
    <a class="quiet-button settings-nav-item" href="/settings" data-settings-section="brains">${browserIcons.connect}<span>Brains</span></a>
    <a class="quiet-button settings-nav-item" href="/settings?section=access" data-settings-section="access">${browserIcons.key}<span>Access keys</span></a>
    <a class="quiet-button settings-nav-item" href="/settings?section=identity" data-settings-section="identity">${browserIcons.connect}<span>Your name</span></a>
    <a class="quiet-button settings-nav-item" href="/settings?section=boards" data-settings-section="boards">${browserIcons.board}<span>Boards</span></a>
    <a class="quiet-button settings-nav-item" href="/settings?section=appearance" data-settings-section="appearance">${browserIcons.appearance}<span>Appearance</span></a>
    <a class="quiet-button settings-nav-item" href="/settings?section=extensions" data-settings-section="extensions">${browserIcons.extensions}<span>Extensions</span></a>
  </nav>
  <p class="app-version settings-version" data-app-version></p>
</aside>`;

export const settingsStyles = String.raw`
  ${appearanceStyles}
  #companion-settings { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: var(--space-6); -webkit-app-region: no-drag; }
  #companion-settings[hidden] { display: none; }
  .settings-backdrop { position: absolute; inset: 0; background: var(--backdrop); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .settings-window { position: relative; display: grid; grid-template-columns: 240px minmax(0, 1fr); width: min(1180px, 100%); height: min(860px, 100%); min-height: 0; overflow: hidden; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); }
  :root[data-native-mac="true"] #companion-settings { padding-top: var(--space-10); }
  :root[data-native-mac="true"] .settings-backdrop { -webkit-app-region: drag; }
  :root[data-native-mac="true"] .settings-window { -webkit-app-region: no-drag; }
  .settings-aside { display: flex; flex-direction: column; gap: var(--space-1); min-height: 0; overflow: auto; padding: var(--space-5) var(--space-3) var(--space-4); border-right: 1px solid var(--line); background: var(--surface-hover); }
  .settings-nav-label { margin: 0 var(--space-3) var(--space-3); font-size: var(--text-caption); color: var(--ink-faint); }
  .settings-search { position: relative; display: flex; align-items: center; margin-bottom: var(--space-3); }
  .settings-search > svg { position: absolute; left: var(--space-3); width: 15px; height: 15px; color: var(--ink-faint); pointer-events: none; }
  #settings-search { width: 100%; padding-left: calc(var(--space-3) + 15px + var(--space-2)); padding-right: var(--space-10); }
  #settings-search::-webkit-search-cancel-button { display: none; }
  #settings-search-hint { position: absolute; right: var(--space-2); padding: 1px var(--space-1); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--ink-faint); font: var(--text-caption)/1.4 var(--font-ui); pointer-events: none; }
  #settings-search:focus + #settings-search-hint, #settings-search:not(:placeholder-shown) + #settings-search-hint { visibility: hidden; }
  #settings-navigation { display: flex; flex-direction: column; gap: var(--space-1); }
  .settings-nav-item { display: flex; align-items: center; gap: var(--space-2); min-height: var(--space-10); padding: var(--space-1) var(--space-3); color: var(--ink-soft); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); text-align: left; text-decoration: none; background: transparent; }
  .settings-nav-item svg { width: var(--icon-size); height: var(--icon-size); flex-shrink: 0; }
  .settings-nav-item:not([aria-current="page"]):hover { background: var(--hover-fill); color: var(--ink); }
  .settings-nav-item[aria-current="page"] { background: var(--control-fill); color: var(--ink); }
  .settings-nav-item[data-settings-match="false"] { opacity: .45; }
  .settings-version { margin-top: auto; padding-inline: var(--space-3); border-top: 0; }
  .settings-content { min-width: 0; min-height: 0; overflow: auto; padding: var(--space-8) var(--space-8) var(--space-12); overscroll-behavior: contain; }
  #companion-heading:focus { outline: none; }
  .settings-header-actions { display: flex; align-items: center; gap: var(--space-1); }
  .settings-breadcrumb { display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-heading); }
  .settings-breadcrumb > span:first-child, .settings-breadcrumb > span[aria-hidden] { color: var(--ink-faint); font-weight: var(--weight-regular); }
  .settings-card { border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-5); }
  .settings-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
  .settings-row label { font-size: var(--text-body); }
  .settings-row .dropdown { width: 160px; max-width: 55%; }
  .settings-result-label { margin: var(--space-8) 0 var(--space-3); font-size: var(--text-caption); color: var(--ink-faint); }
  .settings-result-label:first-of-type { margin-top: 0; }
  .settings-result-label[hidden], [data-settings-item][hidden] { display: none; }
  .settings-search-empty { margin: 0; color: var(--ink-soft); }
  #settings-panel-extensions #extension-settings { margin-top: 0; }
  #settings-panel-extensions .extension-palette { margin-bottom: var(--space-5); }
  @media (prefers-reduced-motion: no-preference) {
    #companion-settings:not([hidden]) .settings-backdrop { animation: settings-fade 160ms var(--ease); }
    #companion-settings:not([hidden]) .settings-window { animation: settings-rise 180ms var(--ease); }
    .settings-panel:not([hidden]) { animation: settings-enter 160ms var(--ease); }
    @keyframes settings-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes settings-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @keyframes settings-enter { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  }
  @media (max-width: 680px) {
    #companion-settings, :root[data-native-mac="true"] #companion-settings { padding: 0; }
    .settings-window { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); width: 100%; height: 100%; border: 0; border-radius: 0; }
    .settings-aside { overflow: visible; padding: var(--space-3) var(--space-4); border-right: 0; border-bottom: 1px solid var(--line); }
    .settings-nav-label, .settings-version, #settings-search-hint { display: none; }
    .settings-search { margin-bottom: var(--space-2); }
    #settings-navigation { flex-direction: row; flex-wrap: wrap; }
    .settings-nav-item { flex: 1 1 auto; justify-content: center; min-height: var(--control-touch); padding-inline: var(--space-2); }
    .settings-nav-item svg { display: none; }
    .settings-content { padding: var(--space-5) var(--space-4) var(--space-12); }
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
const settingsTitles = { brains: "Brains", access: "Access keys", identity: "Your name", boards: "Boards", appearance: "Appearance", extensions: "Extensions" };
const settingsSearch = $("settings-search");
const settingsMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
$("settings-search-hint").textContent = settingsMac ? "⌘F" : "Ctrl F";
settingsSearch.setAttribute("aria-keyshortcuts", settingsMac ? "Meta+F" : "Control+F");
const settingsPanels = [...document.querySelectorAll("[data-settings-panel]")].map(panel => {
  const label = document.createElement("p");
  label.className = "settings-result-label";
  label.textContent = settingsTitles[panel.dataset.settingsPanel];
  label.hidden = true;
  panel.before(label);
  return { panel, label, key: panel.dataset.settingsPanel };
});
const settingsNormalize = (text) => String(text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
function settingsTerms() { return settingsNormalize(settingsSearch.value).split(" ").filter(Boolean); }
function settingsCurrentSection() { return document.body.dataset.settingsPage || "brains"; }
// Search filters whole sections, or labelled groups inside a section, without changing the URL.
function applySettingsSearch() {
  const terms = settingsTerms();
  const searching = state.view === "settings" && terms.length > 0;
  const current = settingsCurrentSection();
  const hit = (text) => { const haystack = settingsNormalize(text); return terms.every(term => haystack.includes(term)); };
  const visible = new Set();
  for (const { panel, label, key } of settingsPanels) {
    const items = [...panel.querySelectorAll("[data-settings-item]")];
    let show = key === current;
    if (!searching) for (const item of items) item.hidden = false;
    else if (hit(settingsTitles[key] + " " + (panel.dataset.settingsKeywords || ""))) { show = true; for (const item of items) item.hidden = false; }
    else if (items.length) {
      show = false;
      for (const item of items) { item.hidden = !hit(item.textContent + " " + (item.dataset.settingsKeywords || "")); show ||= !item.hidden; }
    } else show = hit(panel.textContent);
    panel.hidden = !show;
    label.hidden = !(searching && show);
    if (show) visible.add(key);
  }
  for (const link of document.querySelectorAll("[data-settings-section]")) {
    const section = link.dataset.settingsSection;
    if (!searching && state.view === "settings" && section === current) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    if (searching) link.dataset.settingsMatch = String(visible.has(section)); else delete link.dataset.settingsMatch;
  }
  document.body.dataset.settingsSearching = String(searching);
  $("settings-section-title").textContent = searching ? "Search" : settingsTitles[current];
  $("companion-refresh-index").hidden = !visible.has("brains");
  const empty = $("settings-search-empty");
  empty.hidden = !searching || visible.size > 0;
  empty.textContent = empty.hidden ? "" : "No settings match “" + settingsSearch.value.trim() + "”.";
  return [...visible];
}
function syncSettingsNavigation(url) {
  const target = new URL(url, location.origin);
  const settings = state.view === "settings";
  const requested = target.searchParams.get("section");
  const section = ["appearance", "extensions", "boards", "identity", "access"].includes(requested) ? requested : "brains";
  const previousSection = document.body.dataset.settingsPage;
  if (settings && document.body.dataset.settingsPage === "brains" && section !== "brains") companionClearForm();
  if (settings && !document.body.dataset.settingsPage) settingsReturnUrl = settingsLastAppUrl;
  if (!settings) { settingsLastAppUrl = target.pathname + target.search; settingsSearch.value = ""; }
  document.body.dataset.settingsPage = settings ? section : "";
  // The card is modal: the app behind it stays visible but is not interactive.
  $("app-sidebar").inert = settings;
  for (const element of document.querySelectorAll(".workspace-toolbar")) element.inert = settings;
  $("settings-back").href = settingsReturnUrl || companionScopeUrl("/");
  applySettingsSearch();
  sidebarPreference.sync();
  // Opening the section loads a fresh list; leaving it drops any newly shown secret.
  if (settings && section === "access") { if (previousSection !== "access") void accessKeys.refresh(true); }
  else if (previousSection === "access") accessKeys.reset();
}
function closeSettings() { return navigation.navigate($("settings-back").getAttribute("href")); }
function focusSettingsSearch() { settingsSearch.focus(); settingsSearch.select(); }
settingsSearch.addEventListener("input", (event) => { if (!event.isComposing) applySettingsSearch(); });
settingsSearch.addEventListener("compositionend", () => applySettingsSearch());
settingsSearch.addEventListener("keydown", (event) => {
  if (event.isComposing || event.key !== "Enter") return;
  const [first] = applySettingsSearch();
  if (!first || !settingsTerms().length) return;
  event.preventDefault();
  settingsSearch.value = "";
  const link = document.querySelector('[data-settings-section="' + first + '"]');
  if (first === settingsCurrentSection()) applySettingsSearch(); else navigation.navigate(link.getAttribute("href"));
});
// Window capture runs before note find, which only applies to an open note.
window.addEventListener("keydown", (event) => {
  if (state.view !== "settings" || event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
  if (document.querySelector("dialog[open]")) return;
  event.preventDefault();
  event.stopPropagation();
  focusSettingsSearch();
}, true);
document.addEventListener("jumpybrain:find", () => { if (state.view === "settings" && !document.querySelector("dialog[open]")) focusSettingsSearch(); });
// Bubble phase: inline editors (board rename, dropdowns, find) cancel their own Escape first.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || state.view !== "settings") return;
  if (document.querySelector("dialog[open]")) return;
  try { if (document.querySelector("select:open, :popover-open")) return; } catch { /* Older engines without :open. */ }
  event.preventDefault();
  if (event.target === settingsSearch && settingsSearch.value) { settingsSearch.value = ""; applySettingsSearch(); return; }
  if ($("companion-add").open && $("companion-add").contains(event.target)) { $("companion-cancel").click(); return; }
  closeSettings();
});
document.querySelector("[data-settings-dismiss]").addEventListener("click", () => { if (state.view === "settings") closeSettings(); });
for (const link of document.querySelectorAll("[data-settings-section], #settings-back")) {
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.dataset.settingsSection && settingsSearch.value) { settingsSearch.value = ""; applySettingsSearch(); }
    navigation.navigate(link.getAttribute("href"));
  });
}
${appearanceScript}
$("open-connection").removeAttribute("aria-haspopup");
$("open-connection").setAttribute("aria-controls", "companion-settings");
`;
