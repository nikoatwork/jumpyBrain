import { boardsStyles, boardsMarkup, boardsScript } from './boards-view.js';
import { extensionSettingsMarkup } from "./extensions-view.js";
import { browserIcons } from "./browser-icons.js";
import { appearanceMarkup } from "./browser-appearance.js";
import { settingsStyles, settingsScript } from "./browser-settings.js";

// Companion-only loopback control UI. No target credential is ever read into this shell.
export const companionStyles = String.raw`
  #companion-settings { width: 100%; overflow: auto; padding: var(--space-8) var(--space-6) var(--space-16); }
  .companion-column { max-width: 760px; margin: auto; }
  #companion-settings h2 { font-size: var(--text-section); margin: 0; }
  .settings-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .companion-header { margin-bottom: var(--space-8); }
  .companion-header h1 { margin: 0; }
  #companion-profiles { list-style: none; padding: 0; margin: var(--space-5) 0 0; display: grid; gap: var(--space-3); }
  .companion-profile { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-4); align-items: center; border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); padding: var(--space-5); }
  .companion-profile p { grid-column: 1; margin: var(--space-1) 0 0; font-size: var(--text-caption); color: var(--ink-soft); display: flex; gap: var(--space-2); }
  .companion-path { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .companion-profile-status { flex-shrink: 0; max-width: 50%; overflow-wrap: anywhere; }
  .companion-profile > .companion-actions { grid-column: 2; grid-row: 1 / 3; gap: var(--space-1); }
  .companion-profile strong { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; font-size: var(--text-body); overflow-wrap: anywhere; }
  .companion-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  #companion-fields { border: 0; padding: 0; margin: 0; }
  #companion-form label { display: block; margin: var(--space-4) 0; }
  #companion-form input:not([type=checkbox]), #companion-form select { width: 100%; margin-top: var(--space-1); }
  #companion-form input:not([type=checkbox]) { display: block; }
  #companion-form input[type=checkbox] { height: auto; }
  #companion-form-error { color: var(--error-ink); }
  #companion-active { display: grid; flex: 0 0 100%; min-width: 0; grid-template-columns: 6px minmax(0, 1fr); align-items: center; column-gap: var(--space-2); padding: var(--space-1) var(--space-3); color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
  #companion-active > .connection-dot { grid-column: 1; grid-row: 1; }
  #companion-active > :not(.connection-dot) { grid-column: 2; }
  @media (max-width: 680px) { #companion-active { padding-inline: 0; font-size: var(--text-caption); } }
  #settings-panel-brains { position: relative; }
  .connections-intro { padding-right: var(--space-12); }
  .connections-intro p { margin: var(--space-2) 0 0; color: var(--ink-soft); font-size: var(--text-ui); }
  .companion-profile[aria-current="true"] { border-color: var(--ink-faint); }
  .companion-profile-badge { font-size: var(--text-caption); font-weight: var(--weight-regular); color: var(--ink-soft); border-radius: var(--radius-sm); background: var(--surface-hover); padding: 2px var(--space-2); white-space: nowrap; }
  .companion-add > summary { position: absolute; top: 0; right: 0; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--surface); cursor: pointer; font-size: 0; list-style: none; }
  .companion-add > summary::-webkit-details-marker { display: none; }
  .companion-add > summary::after { content: "+"; font-size: 22px; font-weight: var(--weight-regular); color: var(--ink-soft); }
  .companion-add > summary:hover { background: var(--surface-hover); }
  #companion-form { margin-top: var(--space-4); padding: var(--space-5); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
  #companion-form h3 { margin: 0; font-size: var(--text-body); }
  #companion-form label { font-size: var(--text-ui); }
  #companion-form .companion-actions { margin-top: var(--space-5); }
  #companion-form p { color: var(--ink-soft); font-size: var(--text-caption); }
  @media (max-width: 680px) { #companion-settings .note-icon { width: var(--control-touch); height: var(--control-touch); min-height: var(--control-touch); } }
  @media (max-width: 480px) { .companion-profile { grid-template-columns: minmax(0, 1fr); } .companion-profile > .companion-actions { grid-column: 1; grid-row: 3; margin-top: var(--space-2); } }
${settingsStyles}
${boardsStyles}
`;

export const companionMarkup = String.raw`
${boardsMarkup}
<section id="companion-settings" aria-labelledby="companion-heading" hidden>
  <div class="companion-column">
    <header class="settings-heading companion-header">
      <h1 id="companion-heading" class="settings-breadcrumb" tabindex="-1"><span>Settings</span><span aria-hidden="true">/</span><span id="settings-section-title">Brains</span></h1>
      <button id="companion-refresh-index" class="quiet-button note-icon" type="button" aria-label="Refresh search index" title="Refresh search index" disabled>${browserIcons.refresh}</button>
    </header>
    <button id="companion-reconnect" class="quiet-button" type="button" hidden>Retry companion session</button>
    <section class="settings-panel settings-card" data-settings-panel="boards" hidden><div class="settings-row"><h2>Boards</h2><button id="settings-new-board" class="quiet-button">+ New board</button></div><div id="settings-boards-list"></div></section>
    <section id="settings-panel-brains" class="settings-panel" data-settings-panel="brains" aria-label="Brain connections">
    <div class="connections-intro"><h2>Connections</h2><p>Choose the brain you want to work with, or connect another folder or server.</p></div>
    <ul id="companion-profiles" aria-label="Saved brains"></ul>
    <details id="companion-add" class="companion-add">
    <summary id="companion-form-heading" title="Add connection">Add connection</summary>
    <form id="companion-form">
      <fieldset id="companion-fields">
        <h3 id="companion-editor-heading">Add connection</h3>
        <label>Type<select id="companion-kind" class="dropdown"><option value="local">Local folder</option><option value="remote">Remote server</option></select></label>
        <div id="companion-local-fields">
          <label>Existing memory folder<input id="companion-root" required autocomplete="off" placeholder="/path/to/brain" /></label>
          <button id="companion-folder" class="quiet-button" type="button">Choose folder…</button>
        </div>
        <div id="companion-remote-fields" hidden>
          <label>Memory server URL<input id="companion-url" type="url" disabled placeholder="https://memory.example.com" autocomplete="off" /></label>
          <label>Access key<input id="companion-key" type="password" disabled autocomplete="new-password" /></label>
          <p>Saved in Keychain. Blank keeps the current key.</p>
          <label><input id="companion-writes" type="checkbox" /> I authorize note changes and search refresh on this brain.</label>
        </div>
        <label>Name <span class="muted">(optional)</span><input id="companion-name" maxlength="120" autocomplete="off" placeholder="Use the folder or server name" /></label>
        <p id="companion-form-error" role="alert" hidden></p>
        <div class="companion-actions">
          <button class="button button-primary" type="submit">Save connection</button>
          <button id="companion-cancel" class="quiet-button" type="button">Cancel</button>
        </div>
      </fieldset>
    </form>
    </details>
    </section>
    <section id="settings-panel-appearance" class="settings-panel" data-settings-panel="appearance" aria-label="Appearance" hidden>
      ${appearanceMarkup}
    </section>
    <section id="settings-panel-extensions" class="settings-panel settings-card" data-settings-panel="extensions" aria-label="Extensions" hidden>${extensionSettingsMarkup}</section>
    <p class="app-version" data-app-version></p>
  </div>
</section>
`;

export const companionPrelude = String.raw`
let companionState = null;
let companionRegistered = false;
let companionFrozen = true;
let companionSessionFailed = false;
let companionNoteLoading = 0;
const companionTabId = crypto.randomUUID(); // Deliberately not persisted or shared with other tabs.
let companionResolveReady;
const companionReady = new Promise((resolve) => { companionResolveReady = resolve; });
let companionToken = new URLSearchParams(location.hash.replace(/^#/, "")).get("companion");
if (location.hash) history.replaceState(history.state, "", location.pathname + location.search);
try { localStorage.removeItem("jumpybrain.graph.apiKey"); } catch { /* Forget legacy local-server browser credentials; never persist the control token. */ }
let companionPollTimer = null;
let companionPolling = false;
let companionStopped = false;
let companionStarting = false;
let companionRendered = false;
let companionEditId = null;
let companionEditRevision = null;
let companionRemoteDestination = "";
let companionActionBusy = false;
let companionIndexRefreshing = false;
const companionHealth = new Map();
const companionAcknowledged = new Set();
`;

export const companionScript = String.raw`
${settingsScript}
JumpyBrainBrowser.prepareDropdown($("companion-kind"));
const companionRecovery = document.createElement("div");
companionRecovery.id = "companion-recovery";
companionRecovery.className = "companion-actions";
companionRecovery.hidden = true;
const sessionRetry = document.createElement("button");
sessionRetry.className = "quiet-button"; sessionRetry.textContent = "Retry companion session";
sessionRetry.title = "Retry if the app is still connected; otherwise reopen the editor from the app menu.";
sessionRetry.addEventListener("click", () => startCompanion());
const sessionCopy = document.createElement("button");
sessionCopy.className = "quiet-button"; sessionCopy.textContent = "Recover draft";
sessionCopy.addEventListener("click", () => documentActions.openRecovery());
companionRecovery.append(sessionRetry, sessionCopy);
document.querySelector(".app-workspace").prepend(companionRecovery);
const companionActiveLabel = document.createElement("div");
companionActiveLabel.id = "companion-active";
companionActiveLabel.setAttribute("role", "group");
const companionActiveDot = document.createElement("span"); companionActiveDot.className = "connection-dot"; companionActiveDot.setAttribute("aria-hidden", "true");
const companionActiveName = document.createElement("span");
const companionBrainSelect = document.createElement("select");
companionBrainSelect.id = "companion-brain-switch"; companionBrainSelect.className = "dropdown dropdown--quiet";
companionBrainSelect.setAttribute("aria-label", "Switch brain"); companionBrainSelect.title = "Switch brain"; companionBrainSelect.hidden = true;
const companionActiveHealth = document.createElement("span");
companionActiveLabel.append(companionActiveDot, companionActiveName, companionBrainSelect, companionActiveHealth);
companionBrainSelect.addEventListener("change", () => {
  const id = companionBrainSelect.value;
  companionBrainSelect.value = companionState?.activeId || "";
  companionSwitchBrain(id);
});
document.querySelector(".nav-preferences").prepend(companionActiveLabel);
$("open-connection").removeAttribute("aria-haspopup");
$("open-connection").querySelector(".connection-dot")?.remove();
$("connection").hidden = true;

function companionMessage(text, error = false) {
  if (text) systemMessages.dispatch({ source: "companion", text, severity: error ? "error" : "info", duration: companionSessionFailed ? 0 : undefined });
  else systemMessages.clear("companion");
  companionRecovery.hidden = !companionSessionFailed;
  sessionCopy.hidden = !state.editor?.state.loaded;
  sessionRetry.disabled = companionStarting;
}
function companionDreamTarget() {
  if (companionState?.active?.kind !== "remote") throw new Error("Dream handoff is unavailable for local companion folders. Use the CLI with an explicitly chosen local memory root; the companion gateway is not an agent endpoint.");
  if (companionState.active.allowWrites !== true) throw new Error("This remote brain is read only. Dream handoff requires explicit target-specific write approval in Settings.");
  return companionState.active.url;
}
function companionReadOnly() {
  const active = companionState?.active;
  return companionFrozen || companionSessionFailed || !companionRegistered || !active
    || active.allowWrites !== true;
}
function companionScopeUrl(value) {
  const url = new URL(value, location.origin);
  if (url.origin !== location.origin) throw new Error("Invalid companion navigation.");
  const brain = url.searchParams.get("brain");
  if ((url.searchParams.has("note") || url.searchParams.has("board")) && brain && brain !== companionState?.activeId) {
    throw new Error("This note belongs to another brain.");
  }
  if (companionState?.activeId) url.searchParams.set("brain", companionState.activeId);
  return url.pathname + url.search;
}
function companionHealthText(health) {
  if (!health) return "Not tested";
  if (typeof health === "string") return health;
  return String(health.status || health.phase || (health.ok === true ? "connected" : health.ok === false ? "offline" : "unknown"));
}
function renderCompanionConnection() {
  $("open-connection").title = "Settings";
  $("open-connection").setAttribute("aria-label", "Settings");
  const active = companionState?.active;
  const health = companionSessionFailed ? "session unavailable"
    : ["disconnected", "unavailable"].includes(connectionStatus) ? connectionStatus : companionHealthText(companionState?.health);
  const displayState = health === "connected" ? "connected"
    : ["Not tested", "unknown", "checking", "starting"].includes(health) ? "checking" : "unavailable";
  if ($("companion-active")) {
    const status = $("companion-active");
    const label = (active?.name || "Companion session") + " · " + health
      + (active?.kind === "remote" && active.allowWrites !== true ? " · read only" : "");
    const profiles = companionState?.profiles || [];
    const signature = JSON.stringify(profiles.map(profile => [profile.id, profile.name]));
    if (companionBrainSelect.dataset.signature !== signature) {
      companionBrainSelect.dataset.signature = signature;
      companionBrainSelect.replaceChildren(...profiles.map(profile => {
        const option = document.createElement("option"); option.value = profile.id; option.textContent = profile.name; return option;
      }));
      JumpyBrainBrowser.prepareDropdown(companionBrainSelect);
    }
    companionBrainSelect.value = companionState?.activeId || "";
    companionBrainSelect.hidden = profiles.length < 2;
    companionBrainSelect.disabled = companionActionBusy || companionFrozen || companionSessionFailed || !companionRegistered;
    companionActiveName.textContent = active?.name || "Companion session";
    companionActiveName.hidden = profiles.length > 1;
    companionActiveHealth.textContent = (health === "connected" ? "" : health)
      + (active?.kind === "remote" && active.allowWrites !== true ? (health === "connected" ? "" : " · ") + "read only" : "");
    companionActiveHealth.hidden = !companionActiveHealth.textContent;
    status.dataset.state = displayState;
    status.setAttribute("aria-label", label);
    status.title = label;
  }
}
function companionLock(value) {
  const enteringFrozen = value && !companionFrozen;
  companionFrozen = value;
  navigation.sync();
  syncCompanionExtensions();
  if (!value && state.editor?.state.navigationPending && !navigation.isBusy() && !documentActions.isBusy()) state.editor.setNavigationPending(false);
  // Healthy polls still sync permissions, but must not dismiss live interactions.
  if (enteringFrozen) {
    $("board-dialog")?.close();
    $("note-board-dialog")?.close();
    feedback.close(false);
    documentActions.close();
    cancelReferenceInteraction();
    if (searchDialog.open) closeSearch(false);
    if (dreamDialog.open) closeDreamHandoff(false);
  }
  const preparing = companionState?.phase === "preparing" && !companionSessionFailed;
  document.querySelector("main").inert = preparing;
  document.querySelector(".app-nav").inert = preparing;
  $("graph-header").inert = preparing;
  for (const id of ["new-note", "home-new"]) $(id).disabled = creatingNote || companionReadOnly();
  $("companion-fields").disabled = companionActionBusy || companionFrozen;
  if (state.editor) syncEditorUi(state.editor.state);
  else richEditor.setReadOnly(companionReadOnly());
  sidebarPages.sync();
  noteAttention.sync();
  for (const [id, path] of [["home-link", "/"], ["notes-link", "/"], ["graph-link", "/graph"]]) $(id).href = companionScopeUrl(path);
}
async function companionControl(route, body, options = {}) {
  const url = "/companion/" + route, method = body === undefined ? "GET" : "POST";
  const probe = feedbackDiagnostics.begin();
  let response;
  try {
    response = await fetch(url, {
      method, credentials: "same-origin", cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...options,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...options.headers, "X-JumpyBrain-Request": probe.id },
    });
    feedbackDiagnostics.finish(url, method, probe, response);
  } catch (error) {
    feedbackDiagnostics.finish(url, method, probe, undefined, error.name === "AbortError");
    throw error;
  }
  const packet = await response.json().catch(() => null);
  feedbackDiagnostics.result(url, method, response, packet);
  if (!response.ok) {
    const error = new Error(packet?.error?.message || "Companion request failed (HTTP " + response.status + ").");
    error.status = response.status;
    error.code = packet?.error?.code;
    throw error;
  }
  if (!packet && ["state", "register", "poll", "test", "select-folder"].includes(route)) throw new Error("Invalid companion response.");
  return packet || {};
}
function companionFence() {
  companionSessionFailed = true;
  companionLock(true);
  companionMessage("Your session ended; use Recover draft to copy your work before reopening the editor from the app menu.", true);
  $("companion-reconnect").hidden = false;
  renderCompanionConnection();
  renderCompanionSettings();
}
function companionApplyState(next) {
  if (!next || !Array.isArray(next.profiles) || !Number.isSafeInteger(next.generation)
      || !["idle", "preparing"].includes(next.phase)) throw new Error("Invalid companion state.");
  if (companionState && next.generation !== companionState.generation) {
    companionLock(true);
    companionStopped = true;
    // Never apply new credentials/generation to the old editor, retry, or cache.
    const path = state.view === "settings" ? "/settings" : "/";
    location.replace(path + "?brain=" + encodeURIComponent(next.activeId || ""));
    return;
  }
  const wasPreparing = companionState?.phase === "preparing";
  companionState = next;
  renderCompanionConnection();
  if (next.phase === "preparing") {
    companionLock(true);
    companionMessage("Preparing brain switch. Saving all tabs against the current brain…");
    if (next.switchId && !companionAcknowledged.has(next.switchId)) {
      companionAcknowledged.add(next.switchId);
      companionBarrier(next.switchId).catch(() => companionFence());
    }
  } else {
    companionLock(companionSessionFailed);
    if (wasPreparing) companionMessage("Brain switch did not complete. The current brain and your draft are retained.", true);
  }
  renderCompanionSettings();
  if (!companionRendered && next.phase === "idle" && companionRegistered && !companionSessionFailed) companionInitialRoute();
}
function companionInitialRoute() {
  companionRendered = true;
  const requested = new URL(location.href);
  const mismatch = (requested.searchParams.has("note") || requested.searchParams.has("board")) && requested.searchParams.get("brain") !== companionState.activeId;
  const url = mismatch ? companionScopeUrl("/") : companionScopeUrl(shellUrl());
  history.replaceState({ jumpyBrainIndex: 0 }, "", url);
  navigation.reset({ url, index: 0 });
  showPage(url);
  if (mismatch) companionMessage("This note link is not scoped to the active brain. Choose a note from this brain instead.", true);
}
async function companionBarrier(switchId) {
  // An already-started create/navigation/load must settle first. Never abandon
  // its result or acknowledge a lost-response idempotent capture.
  const deadline = Date.now() + 10000;
  while ((typeof boardsUI !== "undefined" && boardsUI.pending()) || documentActions.isBusy() || creatingNote || navigation.isBusy() || companionNoteLoading || noteCapture.isInFlight()) {
    if (companionState?.switchId !== switchId || companionState.phase !== "preparing") return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  let ok = !(typeof boardsUI !== "undefined" && boardsUI.pending()) && !documentActions.isBusy() && !creatingNote && !navigation.isBusy() && !companionNoteLoading && !noteCapture.hasPending();
  if (ok && state.editor) {
    const editor = state.editor;
    editor.setNavigationPending(true);
    try { ok = await editor.flush(); } catch { ok = false; }
    ok = ok && state.editor === editor && !editor.hasPending();
    if (ok) ok = await referenceCreation.saved(editor.state.savedBody, editor.state.draft);
  }
  if (companionState?.switchId !== switchId || companionState.phase !== "preparing") return;
  if (!ok) companionMessage("Switch blocked: this tab has a failed save, pending navigation, or unconfirmed note creation. Your draft is retained.", true);
  await companionControl("ack", { tabId: companionTabId, switchId, ok });
  // Keep frozen after either acknowledgement until authoritative idle state.
}
async function companionPoll() {
  if (companionStopped || companionPolling || !companionRegistered) return;
  companionPolling = true;
  try {
    const next = await companionControl("poll", { tabId: companionTabId, generation: companionState.generation });
    companionApplyState(next);
  } catch {
    companionFence(); // No optimistic unfreeze on a lost coordinator response.
  } finally {
    companionPolling = false;
    if (!companionStopped) companionPollTimer = setTimeout(companionPoll, 750);
  }
}
async function startCompanion() {
  if (companionStarting) return;
  companionStarting = true;
  $("companion-reconnect").disabled = true;
  companionMessage("Connecting to the companion session…");
  if (!companionRegistered && /^\/settings\/?$/.test(location.pathname)) {
    state.view = "settings";
    document.body.dataset.view = "settings";
    $("home").hidden = true;
    $("companion-settings").hidden = false;
    syncSettingsNavigation(shellUrl());
    $("companion-fields").disabled = true;
  }
  try {
    if (companionToken) {
      const token = companionToken;
      companionToken = null;
      await companionControl("session", { token });
    }
    const snapshot = await companionControl("state");
    if (companionState && snapshot.generation !== companionState.generation) {
      if (state.editor?.hasPending() || noteCapture.hasPending() || referenceCreation.hasPending()) {
        throw new Error("The companion restarted while this tab held an unsaved draft. Copy your draft before reopening; it cannot be moved to the newly selected brain.");
      }
      // Reload a clean old page BEFORE registering in the new generation.
      // Otherwise pagehide would unregister its old generation and leave a
      // ghost registration that could block every subsequent switch.
      companionStopped = true;
      const path = state.view === "settings" ? "/settings" : "/";
      location.replace(path + "?brain=" + encodeURIComponent(snapshot.activeId || ""));
      return;
    }
    const registered = await companionControl("register", { tabId: companionTabId, generation: snapshot.generation });
    companionRegistered = true;
    companionSessionFailed = false;
    companionMessage("");
    companionApplyState(registered);
    companionResolveReady();
    $("companion-reconnect").hidden = true;
    if (!companionStopped && !companionPolling) {
      clearTimeout(companionPollTimer);
      companionPoll();
    }
  } catch {
    companionSessionFailed = true;
    companionLock(true);
    renderCompanionConnection();
    renderCompanionSettings();
    companionMessage("Your session ended; use Recover draft to copy your work before reopening the editor from the app menu.", true);
    $("companion-reconnect").hidden = false;
    // Settings remain available even without a target/session; no initial memory request.
    if (!state.editor) {
      state.view = "settings";
      document.body.dataset.view = "settings";
      $("home").hidden = true;
      $("note-panel").hidden = true;
      $("companion-settings").hidden = false;
      syncSettingsNavigation(shellUrl());
      document.title = "Settings · jumpyBrain";
    }
  } finally {
    companionStarting = false;
    $("companion-reconnect").disabled = false;
    sessionRetry.disabled = false;
  }
}
function companionFormKind() {
  const remote = $("companion-kind").value === "remote";
  $("companion-local-fields").hidden = remote;
  $("companion-remote-fields").hidden = !remote;
  $("companion-root").disabled = remote; $("companion-root").required = !remote;
  $("companion-url").disabled = !remote; $("companion-url").required = remote;
  $("companion-key").disabled = !remote; $("companion-key").required = remote && !companionEditId;
  companionFormError("");
}
function companionFormError(message) {
  $("companion-form-error").textContent = message;
  $("companion-form-error").hidden = !message;
}
function companionProfileName(kind) {
  const name = $("companion-name").value.trim();
  if (name) return name;
  if (kind === "local") return $("companion-root").value.trim().replace(/\/+$/, "").split("/").pop()?.slice(0, 120) || "Local brain";
  try { return new URL($("companion-url").value.trim()).hostname.slice(0, 120) || "Remote brain"; }
  catch { return "Remote brain"; }
}
function companionClearForm() {
  $("companion-key").value = "";
  $("companion-form").reset();
  companionEditId = null;
  companionEditRevision = null;
  companionRemoteDestination = "";
  $("companion-kind").disabled = false;
  $("companion-editor-heading").textContent = "Add connection";
  $("companion-add").open = false;
  companionFormKind();
  $("companion-form-heading").focus();
}
async function companionAction(work) {
  if (companionActionBusy || companionFrozen || !companionRegistered || companionSessionFailed) return;
  companionActionBusy = true;
  $("companion-fields").disabled = true;
  renderCompanionSettings();
  try { await work(); }
  catch (error) { companionMessage(error.message + " The active brain and draft are retained.", true); }
  finally {
    companionActionBusy = false;
    $("companion-fields").disabled = companionFrozen;
    if (state.editor && !companionFrozen) state.editor.setNavigationPending(false);
    renderCompanionSettings();
  }
}
function companionCanRefreshIndex() {
  return !companionReadOnly() && !companionActionBusy && companionState?.phase === "idle"
    && companionHealthText(companionState.health) === "connected";
}
function renderCompanionIndex() {
  const active = companionState?.active;
  $("companion-refresh-index").disabled = !companionCanRefreshIndex();
  $("companion-refresh-index").setAttribute("aria-label", companionIndexRefreshing ? "Refreshing search index…" : "Refresh search index");
  $("companion-refresh-index").setAttribute("aria-busy", String(companionIndexRefreshing));
  const label = companionIndexRefreshing ? "Refreshing search index…" : "Refresh search index";
  const reason = !active ? "Connect to a brain first."
    : active.allowWrites !== true ? "This brain is read only."
    : companionSessionFailed ? "Reconnect the companion session first."
    : companionHealthText(companionState.health) !== "connected" ? "Connect to this brain first." : "";
  $("companion-refresh-index").setAttribute("aria-description", (active?.name || "") + (reason ? " · " + reason : ""));
  $("companion-refresh-index").title = label + (active ? " · " + active.name : "") + (reason ? " · " + reason : "");
}
async function companionRefreshIndex() {
  if (!companionCanRefreshIndex()) return;
  await companionAction(async () => {
    companionIndexRefreshing = true;
    renderCompanionIndex();
    systemMessages.dispatch({ source: "search-index", text: "Refreshing the selected brain’s search index…", duration: 0 });
    try {
      await graphJson("/memories/all/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      systemMessages.dispatch({ source: "search-index", text: "Search index refreshed. Edits made during the refresh may need another refresh.", severity: "success" });
    } catch {
      systemMessages.dispatch({ source: "search-index", text: "Search refresh could not be confirmed. Check this brain’s connection and editing permission before trying again.", severity: "error" });
    } finally {
      companionIndexRefreshing = false;
    }
  });
}
function renderCompanionSettings() {
  renderCompanionIndex();
  renderCompanionConnection();
  if (!companionState) return;
  const list = $("companion-profiles");
  // Avoid destroying focused profile buttons on every background poll.
  const signature = JSON.stringify([companionState.profiles, companionState.activeId, companionState.health,
    companionState.phase, companionActionBusy, companionSessionFailed, [...companionHealth]]);
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.replaceChildren();
  for (const profile of companionState.profiles) {
    const row = document.createElement("li"); row.className = "companion-profile"; row.dataset.profileId = profile.id;
    const name = document.createElement("strong");
    name.textContent = profile.name;
    const isActive = profile.id === companionState.activeId;
    if (isActive) row.setAttribute("aria-current", "true");
    const health = isActive ? companionSessionFailed ? "session unavailable" : companionHealthText(companionState.health)
      : companionHealthText(companionHealth.get(profile.id));
    const status = document.createElement("span"); status.className = "connection-dot";
    status.setAttribute("role", "img");
    status.setAttribute("aria-label", (isActive ? "Active brain · " : "") + health);
    status.title = status.getAttribute("aria-label");
    name.dataset.state = health === "connected" ? "connected"
      : ["Not tested", "unknown", "checking", "starting"].includes(health) ? "checking" : "unavailable";
    name.prepend(status);
    const badge = document.createElement("span"); badge.className = "companion-profile-badge";
    badge.textContent = (profile.kind === "local" ? "Local" : "Remote") + (isActive ? " · Active" : "");
    name.append(badge);
    const detail = document.createElement("p");
    const destination = document.createElement("span"); destination.className = "companion-path";
    destination.textContent = profile.kind === "local" ? profile.root : profile.url;
    destination.title = destination.textContent;
    detail.append(destination);
    const statusText = [!["connected", "Not tested"].includes(health) ? health : "",
      profile.kind === "remote" && profile.allowWrites !== true ? "Read only" : ""].filter(Boolean).join(" · ");
    if (statusText) {
      const caption = document.createElement("span"); caption.className = "companion-profile-status";
      caption.textContent = statusText; detail.append(caption);
    }
    const actions = document.createElement("div"); actions.className = "companion-actions";
    const button = (label, glyph, action, disabled = false) => {
      const control = document.createElement("button"); control.type = "button";
      control.className = "quiet-button note-icon"; control.innerHTML = glyph;
      control.setAttribute("aria-label", label); control.title = label;
      control.disabled = disabled || companionActionBusy || companionFrozen || companionSessionFailed;
      control.addEventListener("click", action); actions.append(control);
    };
    button("Use this brain", '${browserIcons.check}', () => companionSwitchBrain(profile.id), isActive);
    button("Edit", '${browserIcons.edit}', () => {
      companionClearForm(); companionEditId = profile.id; companionEditRevision = companionState.revision;
      $("companion-name").value = profile.name;
      $("companion-kind").value = profile.kind; $("companion-kind").disabled = true;
      $("companion-root").value = profile.root || ""; $("companion-url").value = profile.url || "";
      companionRemoteDestination = profile.url || "";
      $("companion-writes").checked = profile.allowWrites === true;
      $("companion-editor-heading").textContent = "Edit connection"; $("companion-add").open = true; companionFormKind(); $("companion-name").focus();
    });
    button("Test connection", '${browserIcons.connect}', () => companionAction(async () => {
      companionMessage("Checking " + profile.name + "…");
      const result = await companionControl("test", { id: profile.id });
      companionHealth.set(profile.id, result.health);
      companionMessage(profile.name + ": " + companionHealthText(result.health));
    }));
    button("Remove", '${browserIcons.remove}', () => companionAction(async () => {
      if (!confirm("Remove connection “" + profile.name + "”? Memory files and server authorization are not deleted.")) return;
      companionApplyState(await companionControl("remove", { id: profile.id, revision: companionState.revision }));
      companionClearForm(); companionMessage("Connection removed. Memory was not deleted.");
    }), isActive);
    if (isActive) actions.lastElementChild.title = "Switch to another brain before removing this connection.";
    row.append(name, detail, actions); list.append(row);
  }
}
async function companionSwitchBrain(id) {
  if (id === companionState?.activeId || !companionState?.profiles.some(profile => profile.id === id)) return;
  await companionAction(async () => {
    companionMessage("Switching brain…");
    companionApplyState(await companionControl("switch", { id }));
  });
}
function companionRemoteDestinationChanged() {
  const value = $("companion-url").value.trim();
  let destination = value;
  try { destination = new URL(value).origin; } catch { /* Invalid input will be rejected by the host. */ }
  if (destination !== companionRemoteDestination) $("companion-writes").checked = false;
  companionRemoteDestination = destination;
}
$("companion-url").addEventListener("input", companionRemoteDestinationChanged);
$("companion-kind").addEventListener("change", companionFormKind);
$("companion-cancel").addEventListener("click", companionClearForm);
$("companion-folder").addEventListener("click", () => companionAction(async () => {
  const result = await companionControl("select-folder", {});
  if (typeof result.path === "string") $("companion-root").value = result.path;
}));
$("companion-form").addEventListener("submit", (event) => {
  event.preventDefault();
  companionAction(async () => {
    const kind = $("companion-kind").value;
    companionFormError("");
    const profile = { name: companionProfileName(kind), kind };
    if (companionEditId) profile.id = companionEditId;
    if (kind === "local") profile.root = $("companion-root").value.trim();
    else {
      profile.url = $("companion-url").value.trim();
      profile.allowWrites = $("companion-writes").checked === true;
      const key = $("companion-key").value;
      if (key) profile.key = key; // Blank edits preserve Keychain, never echo a key back.
    }
    const previousIds = new Set(companionState.profiles.map(item => item.id));
    try {
      const next = await companionControl("profiles", { profile, revision: companionEditRevision ?? companionState.revision });
      companionApplyState(next);
      const saved = next.profiles.find(item => !previousIds.has(item.id)) || next.profiles.find(item => item.id === profile.id);
      companionClearForm();
      systemMessages.dispatch({ source: "companion", text: "Connection saved.", severity: "success", revision: String(next.revision),
        ...(saved && saved.id !== companionState.activeId ? { action: { label: "Switch", run: () => companionSwitchBrain(saved.id) } } : {}) });
    } catch (error) {
      companionFormError(error.message);
    }
  });
});
$("companion-refresh-index").addEventListener("click", companionRefreshIndex);
$("companion-reconnect").addEventListener("click", startCompanion);
window.addEventListener("pagehide", () => {
  $("companion-key").value = "";
  companionToken = null;
  companionStopped = true;
  clearTimeout(companionPollTimer);
  if (companionRegistered) companionControl("unregister", {
    tabId: companionTabId, generation: companionState.generation,
  }, { keepalive: true }).catch(() => {});
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) { companionStopped = false; companionLock(true); startCompanion(); }
});
${boardsScript}
startCompanion();
`;
