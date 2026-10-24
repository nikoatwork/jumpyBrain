import { extensionSettingsMarkup } from "./extensions-view.js";
import { browserIcons } from "./browser-icons.js";

// Companion-only loopback control UI. No target credential is ever read into this shell.
export const companionStyles = String.raw`
  #companion-settings { width: 100%; overflow: auto; padding: var(--space-8) var(--space-6) var(--space-16); }
  .companion-column { max-width: 760px; margin: auto; }
  #companion-settings h2 { font-size: var(--text-section); margin-top: var(--space-8); }
  .companion-profile { display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: var(--space-4); align-items: center; border-bottom: 1px solid var(--line); padding: var(--space-4) 0; }
  .companion-profile p { grid-column: 1; margin: var(--space-1) 0 0; font-size: var(--text-caption); color: var(--ink-soft); overflow-wrap: anywhere; }
  .companion-profile > .companion-actions { grid-column: 2; grid-row: 1 / 3; gap: var(--space-1); }
  .companion-profile strong { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-body); }
  .companion-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  #companion-fields { border: 0; padding: 0; margin: 0; }
  #companion-form label { display: block; margin: var(--space-4) 0; }
  #companion-form input:not([type=checkbox]), #companion-form select { display: block; width: 100%; margin-top: var(--space-1); }
  #companion-form select { min-height: var(--control-height); font-size: var(--text-ui); padding: var(--space-2); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
  #companion-form input[type=checkbox] { height: auto; }
  #companion-banner { padding: var(--space-2) var(--space-6); margin: 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  #companion-banner[data-error=true], #companion-feedback[data-error=true] { color: var(--error-ink); }
  #companion-active { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-3) 0; color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
  @media (max-width: 680px) { #companion-active { padding-inline: 0; font-size: var(--text-caption); } }
  .companion-search { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding-bottom: var(--space-4); border-bottom: 1px solid var(--line); }
  #companion-settings .companion-search h2 { margin: 0; margin-right: auto; }
  #companion-index-target { flex-basis: 100%; margin: 0; font-size: var(--text-caption); }
  #companion-index-feedback:empty, #companion-feedback:empty { display: none; }
  .companion-add { margin-top: var(--space-6); }
  .companion-add > summary { width: fit-content; cursor: pointer; font-size: var(--text-ui); color: var(--ink-soft); padding-block: var(--space-2); }
  #companion-settings > .companion-column > h1 { margin-bottom: var(--space-6); }
  #companion-form { max-width: 520px; }
  #companion-form p { color: var(--ink-soft); font-size: var(--text-caption); }
  @media (max-width: 680px) { .companion-actions .note-icon, #companion-refresh-index { width: var(--control-touch); height: var(--control-touch); min-height: var(--control-touch); } }
  @media (max-width: 480px) { .companion-profile { grid-template-columns: minmax(0, 1fr); } .companion-profile > .companion-actions { grid-column: 1; grid-row: 3; margin-top: var(--space-2); } }
  #companion-index-target, #companion-index-feedback { color: var(--ink-soft); overflow-wrap: anywhere; }
  #companion-index-feedback[data-error=true] { color: var(--error-ink); }
`;

export const companionMarkup = String.raw`
<section id="companion-settings" aria-labelledby="companion-heading" hidden>
  <div class="companion-column">
    <h1 id="companion-heading" tabindex="-1">Settings</h1>
    <section class="companion-search" aria-labelledby="companion-search-heading">
      <h2 id="companion-search-heading">Search index</h2>
      <button id="companion-refresh-index" class="quiet-button note-icon" type="button" aria-label="Refresh search index" title="Refresh search index" disabled>${browserIcons.refresh}</button>
      <p id="companion-index-target">Connect to a brain to refresh search.</p>
      <p id="companion-index-feedback" role="status" aria-live="polite"></p>
    </section>
    ${extensionSettingsMarkup}
    <h2>Brain connections</h2>
    <p id="companion-feedback" role="status" aria-live="polite"></p>
    <button id="companion-reconnect" class="quiet-button" type="button" hidden>Retry companion session</button>
    <div id="companion-profiles" aria-label="Saved brains"></div>
    <details id="companion-add" class="companion-add">
    <summary id="companion-form-heading">Add connection</summary>
    <form id="companion-form">
      <fieldset id="companion-fields">
        <label>Name<input id="companion-name" required maxlength="120" autocomplete="off" /></label>
        <label>Type<select id="companion-kind"><option value="local">Local folder</option><option value="remote">Remote server</option></select></label>
        <div id="companion-local-fields">
          <label>Existing memory folder<input id="companion-root" autocomplete="off" /></label>
          <button id="companion-folder" class="quiet-button" type="button">Choose folder…</button>
        </div>
        <div id="companion-remote-fields" hidden>
          <label>Memory server URL<input id="companion-url" type="url" placeholder="https://memory.example.com" autocomplete="off" /></label>
          <label>Access key<input id="companion-key" type="password" autocomplete="new-password" /></label>
          <p>Stored in Keychain. Leave blank to keep the saved key.</p>
          <label><input id="companion-writes" type="checkbox" /> I explicitly authorize editing, creating and deleting notes, and refreshing the search index on this remote brain.</label>
          <p>Saving, testing, or selecting a connection does not authorize global/team memory writes.</p>
        </div>
        <div class="companion-actions">
          <button class="button button-primary" type="submit">Save connection</button>
          <button id="companion-cancel" class="quiet-button" type="button">Cancel</button>
        </div>
      </fieldset>
    </form>
    </details>
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
const companionBanner = document.createElement("p");
companionBanner.id = "companion-banner";
companionBanner.setAttribute("role", "status");
companionBanner.setAttribute("aria-live", "polite");
companionBanner.hidden = true;
document.querySelector(".app-workspace").prepend(companionBanner);
const companionRecovery = document.createElement("div");
companionRecovery.id = "companion-recovery";
companionRecovery.className = "companion-actions";
companionRecovery.hidden = true;
const sessionRetry = document.createElement("button");
sessionRetry.className = "quiet-button"; sessionRetry.textContent = "Retry companion session";
sessionRetry.addEventListener("click", () => startCompanion());
const sessionCopy = document.createElement("button");
sessionCopy.className = "quiet-button"; sessionCopy.textContent = "Recover draft";
sessionCopy.addEventListener("click", () => documentActions.openRecovery());
companionRecovery.append(sessionRetry, sessionCopy);
companionBanner.after(companionRecovery);
const companionActiveLabel = document.createElement("span");
companionActiveLabel.id = "companion-active";
companionActiveLabel.setAttribute("role", "img");
$("home-link").after(companionActiveLabel);
$("open-connection").removeAttribute("aria-haspopup");
$("connection").hidden = true;

function companionMessage(text, error = false) {
  companionBanner.textContent = text;
  companionBanner.hidden = !text;
  companionBanner.dataset.error = String(error);
  companionRecovery.hidden = !companionSessionFailed;
  sessionCopy.hidden = !state.editor?.state.loaded;
  sessionRetry.disabled = companionStarting;
  $("companion-feedback").textContent = text;
  $("companion-feedback").dataset.error = String(error);
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
  if (url.searchParams.has("note") && brain && brain !== companionState?.activeId) {
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
  $("open-connection").dataset.state = displayState;
  if ($("companion-active")) {
    const status = $("companion-active");
    const label = (active?.name || "Companion session") + " · " + health
      + (active?.kind === "remote" && active.allowWrites !== true ? " · read only" : "");
    status.textContent = (active?.name || "Companion session")
      + (health === "connected" ? "" : " · " + health)
      + (active?.kind === "remote" && active.allowWrites !== true ? " · read only" : "");
    status.dataset.state = displayState;
    status.setAttribute("aria-label", label);
    status.title = label;
    const dot = document.createElement("span"); dot.className = "connection-dot"; dot.setAttribute("aria-hidden", "true");
    status.prepend(dot);
  }
}
function companionLock(value) {
  const enteringFrozen = value && !companionFrozen;
  companionFrozen = value;
  syncCompanionExtensions();
  if (!value && state.editor?.state.navigationPending && !navigation.isBusy() && !documentActions.isBusy()) state.editor.setNavigationPending(false);
  // Healthy polls still sync permissions, but must not dismiss live interactions.
  if (enteringFrozen) {
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
  companionMessage("This tab is fenced from memory requests. Your draft is retained. Use Recover draft to copy it, then reopen the editor from the companion menu for a fresh session. Retry in Settings only works while the session cookie is valid. Do not reload an unsaved draft.", true);
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
  const mismatch = requested.searchParams.has("note") && requested.searchParams.get("brain") !== companionState.activeId;
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
  while (documentActions.isBusy() || creatingNote || navigation.isBusy() || companionNoteLoading || noteCapture.isInFlight()) {
    if (companionState?.switchId !== switchId || companionState.phase !== "preparing") return;
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  let ok = !documentActions.isBusy() && !creatingNote && !navigation.isBusy() && !companionNoteLoading && !noteCapture.hasPending();
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
    companionMessage("Companion session unavailable. Reopen the editor from the companion menu for a fresh session. Retry only works if the existing session cookie is still valid. Copy any draft before reloading; your draft is retained in this tab.", true);
    $("companion-reconnect").hidden = false;
    // Settings remain available even without a target/session; no initial memory request.
    if (!state.editor) {
      state.view = "settings";
      document.body.dataset.view = "settings";
      $("home").hidden = true;
      $("note-panel").hidden = true;
      $("companion-settings").hidden = false;
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
}
function companionClearForm() {
  $("companion-key").value = "";
  $("companion-form").reset();
  companionEditId = null;
  companionEditRevision = null;
  companionRemoteDestination = "";
  $("companion-kind").disabled = false;
  $("companion-form-heading").textContent = "Add connection";
  $("companion-add").open = false;
  companionFormKind();
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
  $("companion-index-target").textContent = active
    ? "Missing recent edits? Refresh search for “" + active.name + "”."
      + (active.allowWrites !== true ? " This brain is read only; editing permission required." : "")
      + (companionHealthText(companionState.health) !== "connected" ? " Connect to this brain before refreshing." : "")
    : "Connect to a brain to refresh its search index.";
}
async function companionRefreshIndex() {
  if (!companionCanRefreshIndex()) return;
  await companionAction(async () => {
    companionIndexRefreshing = true;
    renderCompanionIndex();
    const feedback = $("companion-index-feedback");
    feedback.dataset.error = "false";
    feedback.textContent = "Refreshing the selected brain’s search index…";
    try {
      await graphJson("/memories/all/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      feedback.textContent = "Search index refreshed. Edits made during the refresh may need another refresh.";
    } catch {
      feedback.dataset.error = "true";
      feedback.textContent = "Search refresh could not be confirmed. Check this brain’s connection and editing permission before trying again.";
    } finally {
      companionIndexRefreshing = false;
    }
  });
}
function renderCompanionSettings() {
  renderCompanionIndex();
  if (!companionState) return;
  const list = $("companion-profiles");
  // Avoid destroying focused profile buttons on every background poll.
  const signature = JSON.stringify([companionState.profiles, companionState.activeId, companionState.health,
    companionState.phase, companionActionBusy, companionSessionFailed, [...companionHealth]]);
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.replaceChildren();
  for (const profile of companionState.profiles) {
    const row = document.createElement("section"); row.className = "companion-profile";
    const name = document.createElement("strong");
    name.textContent = profile.name;
    if (profile.id === companionState.activeId) {
      const active = document.createElement("span"); active.className = "connection-dot";
      active.style.background = "var(--ink-soft)"; active.setAttribute("role", "img"); active.setAttribute("aria-label", "Active brain"); active.title = "Active brain";
      name.append(active);
    }
    const detail = document.createElement("p");
    detail.textContent = (profile.kind === "local" ? profile.root : profile.url)
      + (companionHealth.has(profile.id) ? " · " + companionHealthText(companionHealth.get(profile.id))
        : profile.id === companionState.activeId && companionHealthText(companionState.health) !== "connected" ? " · " + companionHealthText(companionState.health) : "")
      + (profile.kind === "remote" ? profile.allowWrites === true ? " · Can edit" : " · Read only" : "");
    const actions = document.createElement("div"); actions.className = "companion-actions";
    const button = (label, glyph, action, disabled = false) => {
      const control = document.createElement("button"); control.type = "button";
      control.className = "quiet-button note-icon"; control.innerHTML = glyph;
      control.setAttribute("aria-label", label); control.title = label;
      control.disabled = disabled || companionActionBusy || companionFrozen || companionSessionFailed;
      control.addEventListener("click", action); actions.append(control);
    };
    button("Use this brain", '${browserIcons.check}', () => companionAction(async () => {
      companionMessage("Requesting a loss-safe switch across all tabs…");
      companionApplyState(await companionControl("switch", { id: profile.id }));
    }), profile.id === companionState.activeId);
    button("Edit", '${browserIcons.edit}', () => {
      companionClearForm(); companionEditId = profile.id; companionEditRevision = companionState.revision;
      $("companion-name").value = profile.name;
      $("companion-kind").value = profile.kind; $("companion-kind").disabled = true;
      $("companion-root").value = profile.root || ""; $("companion-url").value = profile.url || "";
      companionRemoteDestination = profile.url || "";
      $("companion-writes").checked = profile.allowWrites === true;
      $("companion-form-heading").textContent = "Edit connection"; $("companion-add").open = true; companionFormKind(); $("companion-name").focus();
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
    }));
    row.append(name, detail, actions); list.append(row);
  }
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
    const profile = { name: $("companion-name").value.trim(), kind };
    if (companionEditId) profile.id = companionEditId;
    if (kind === "local") profile.root = $("companion-root").value;
    else {
      profile.url = $("companion-url").value.trim();
      profile.allowWrites = $("companion-writes").checked === true;
      const key = $("companion-key").value;
      if (key) profile.key = key; // Blank edits preserve Keychain, never echo a key back.
    }
    $("companion-key").value = "";
    companionApplyState(await companionControl("profiles", { profile, revision: companionEditRevision ?? companionState.revision }));
    companionClearForm(); companionMessage("Connection saved. Selection and write approval remain explicit.");
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
startCompanion();
`;
