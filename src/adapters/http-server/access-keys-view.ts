import { browserChevronIcon, browserIcons } from "./browser-icons.js";
import { media } from "./browser-design-system.js";

// Server-rendered access presentation: markup and styles for the access-key view, and the
// inline role guard at the end of this file. Kept apart from the controller in
// access-keys.ts so the editor bundle does not carry any of it.
// The three capability rows are static; the controller only marks each allowed or not.
const panel = String.raw`
<div id="access-keys" class="access-keys">
  <h2 id="access-keys-title">Access keys</h2>
  <section id="access-effective" class="access-effective card card--roomy" aria-labelledby="access-effective-title" hidden>
    <strong id="access-effective-title">Your access</strong>
    <p id="access-effective-summary"></p>
    <ul id="access-effective-list" aria-label="What your access allows">
      <li data-capability="read"><span class="badge access-key-badge"></span><span>Search and read notes, boards and drawings</span></li>
      <li data-capability="write"><span class="badge access-key-badge"></span><span>Create, edit and delete notes, boards and drawings, and refresh search</span></li>
      <li data-capability="manage_access"><span class="badge access-key-badge"></span><span>Create and revoke access keys</span></li>
    </ul>
  </section>
  <p id="access-keys-intro" class="access-keys-intro"></p>
  <div id="access-keys-new" class="access-keys-new card card--roomy" hidden>
    <strong id="access-keys-new-title"></strong>
    <p>Copy it now and pass it on privately. It is not shown again.</p>
    <input id="access-keys-secret" class="input--mono" type="text" readonly aria-label="New access key" autocomplete="off" spellcheck="false" />
    <div class="access-keys-actions">
      <button id="access-keys-copy" class="button button-primary" type="button">Copy key</button>
      <button id="access-keys-copy-invite" class="quiet-button" type="button" title="Copies the address, the key and how to connect">Copy invite</button>
      <button id="access-keys-done" class="quiet-button" type="button">Done</button>
    </div>
  </div>
  <form id="access-keys-form" hidden>
    <label class="field-label" for="access-keys-name">Who is it for?</label>
    <div class="access-keys-fields">
      <input id="access-keys-name" type="text" maxlength="100" placeholder="Alice, or Research agent" autocomplete="off" />
      <select id="access-keys-role" class="dropdown" aria-label="Role">
        <option value="reader">Reader</option>
        <option value="writer" selected>Writer</option>
        <option value="admin">Admin</option>
      </select>
      <button id="access-keys-create" class="button button-primary" type="submit" disabled>Create key</button>
    </div>
    <p id="access-keys-role-hint" class="field-help"></p>
  </form>
  <p id="access-keys-message" class="status-text" role="status" aria-live="polite" hidden></p>
  <ul id="access-keys-list" aria-label="Active access keys" hidden></ul>
  <details id="access-keys-revoked" hidden>
    <summary id="access-keys-revoked-summary" class="disclosure-trigger disclosure-trigger--inline"><span id="access-keys-revoked-label">Revoked keys</span>${browserChevronIcon}</summary>
    <ul id="access-keys-revoked-list" aria-label="Revoked access keys"></ul>
  </details>
</div>`;

/** Settings panel content for the Mac app. */
export const accessKeysMarkup = panel;
/** Hosted browser: the same view in a dialog opened from Connection settings. */
export const accessKeysDialogMarkup = String.raw`
<dialog id="access-keys-dialog" class="dialog--md" aria-labelledby="access-keys-title">
  <button id="access-keys-close" class="icon-button dialog-close" type="button" aria-label="Close access keys" title="Close access keys">${browserIcons.close}</button>
  ${panel}
</dialog>`;

// Layout only. Rows compose .card, role tags .badge, Revoke .quiet-button.button--danger (access-keys.ts).
export const accessKeysStyles = String.raw`
  .access-keys h2 { margin: 0; font-size: var(--text-section); }
  .access-keys p { margin: var(--space-2) 0 0; color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
  .access-keys .access-keys-intro { font-size: var(--text-ui); max-width: 62ch; }
  .access-keys-intro:empty { display: none; }
  .access-effective { margin-top: var(--space-4); }
  .access-effective[hidden] { display: none; }
  .access-effective strong { font-size: var(--text-body); }
  #access-effective-list { list-style: none; margin: var(--space-3) 0 0; padding: 0; display: grid; gap: var(--space-1); font-size: var(--text-ui); }
  #access-effective-list li { display: flex; gap: var(--space-2); align-items: baseline; }
  #access-effective-list li[data-allowed="false"] { color: var(--ink-soft); }
  #access-effective-list .badge { flex: none; }
  .access-effective + .access-keys-intro { margin-top: var(--space-5); }
  #access-keys-form { margin-top: var(--space-5); }
  #access-keys-form[hidden], #access-keys-list[hidden], .access-keys-new[hidden] { display: none; }
  #access-keys-form .field-label { display: block; margin-bottom: var(--space-1); }
  .access-keys-fields { display: flex; gap: var(--space-2); align-items: center; }
  .access-keys-fields input { flex: 1 1 auto; min-width: 0; }
  .access-keys-fields .dropdown { flex: 0 0 120px; width: 120px; }
  .access-keys-fields button { flex: none; }
  .access-keys-new { margin-top: var(--space-5); border-color: var(--accent); }
  .access-keys-new strong { font-size: var(--text-body); overflow-wrap: anywhere; }
  #access-keys-secret { display: block; width: 100%; margin-top: var(--space-3); }
  .access-keys-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .access-keys #access-keys-message { margin-top: var(--space-4); font-size: var(--text-ui); }
  #access-keys-list, #access-keys-revoked-list { list-style: none; margin: var(--space-5) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  .access-key { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding-block: var(--space-3); }
  .access-key > div { min-width: 0; }
  .access-key strong { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-body); overflow-wrap: anywhere; }
  .access-key p { margin-top: var(--space-1); }
  .access-key-empty { color: var(--ink-soft); font-size: var(--text-ui); }
  #access-keys-revoked { margin-top: var(--space-5); color: var(--ink-soft); font-size: var(--text-ui); }
  #access-keys-revoked-list { margin-top: var(--space-3); }
  #access-keys-revoked-list .access-key strong { color: var(--ink-soft); font-weight: var(--weight-regular); }
  #access-keys-dialog { position: relative; }
  #access-keys-dialog h2 { margin-right: var(--space-10); }
  #access-keys-close { position: absolute; top: var(--space-4); right: var(--space-4); margin: 0; }
  #open-access-keys[hidden] { display: none; }
  @media ${media.compact} { .access-keys-fields { flex-wrap: wrap; } .access-keys-fields input { flex-basis: 100%; } .access-keys-fields .dropdown { flex: 1 1 auto; } }
`;

// One guard for changes a key's role does not allow, shared by the app (companion) and the
// hosted browser. It is part of the inline page script, not the editor bundle.
//
// Presentation only: the server authorizes every request again. A control for a change
// stays available (`accessOffered`) while the role is the only obstacle, and the code that
// starts the change calls `accessDenied(action)`, which explains and offers Settings.
// Busy, frozen, disconnected and nothing-selected states are not role restrictions: they
// keep their own disabled state and are never explained here.
//
// The explanation is one system message (toast) with the Settings action. Inside a modal
// dialog, where the toast cannot be reached, `accessDeniedIn` also writes it into the dialog.
export const accessGuardScript = String.raw`
// Hosted only: what /capabilities last said about this browser session's key. null means
// not known yet, which neither grants nor blocks anything here; the server decides.
let hostedAccess = null;
let accessNoticeCount = 0, accessRecheckedAt = 0;
function accessState() { return companionMode ? companionState?.access : hostedAccess; }
function accessCan(capability = "write") {
  return companionMode ? companionCan(capability) : Boolean(hostedAccess?.capabilities.includes(capability));
}
// True when the session itself is usable and only the key's role withholds the capability.
function accessBlocked(capability = "write") {
  return companionMode ? companionAccessBlocked(capability) : connectionStatus === "connected" && Boolean(hostedAccess) && !accessCan(capability);
}
// False while a change cannot be made from here.
function accessWritable() { return companionMode ? !companionReadOnly() : !accessBlocked(); }
// Whether to offer a control for a change: when it works, or when using it explains why not.
function accessOffered() { return accessWritable() || accessBlocked(); }
function accessExplanation(action, capability = "write") {
  const access = accessState(), brain = companionMode ? "“" + (companionState?.active?.name || "This brain") + "”" : "";
  if (!access?.role) return action + " is paused: the app could not confirm what your access key may do" + (brain ? " on " + brain : "") + ".";
  const needs = action + " needs " + (capability === "manage_access" ? "an admin key" : "a writer or admin key") + ". ";
  // Refused although the role last reported here allows it: claim nothing about the role.
  if (accessCan(capability)) return needs + "The server refused it for your current key.";
  return needs + "Your key" + (brain ? " for " + brain : "") + " has " + access.role + " access.";
}
// The one place access detail lives: Settings → Access keys in the app, the Access keys dialog when hosted.
function accessOpenSettings() {
  systemMessages.clear("access");
  return companionMode ? navigation.navigate("/settings?section=access") : openAccessKeys();
}
function accessExplain(action, capability = "write") {
  systemMessages.dispatch({ source: "access", text: accessExplanation(action, capability), severity: "warning",
    revision: String(++accessNoticeCount), duration: 12000, action: { label: "Open Settings", run: accessOpenSettings } });
}
// Call when the user starts a change. True means stop; a role restriction is explained.
function accessDenied(action, capability = "write") {
  const blocked = accessBlocked(capability);
  // Hosted with no known role: nothing is refused here, the server answers.
  if (companionMode ? (capability === "write" ? !companionReadOnly() : companionCan(capability)) : !blocked) return false;
  if (blocked) accessExplain(action, capability);
  return true;
}
// The toast sits in the workspace, behind any modal dialog. A change started inside one is
// also explained in that dialog's own status line, naming the way to Settings in words.
function accessExplanationInline(action, capability = "write") {
  return accessExplanation(action, capability) + (companionMode ? " See Settings → Access keys." : " See Connection settings → Access keys.");
}
function accessDeniedIn(status, action, capability = "write") {
  if (!accessDenied(action, capability)) return false;
  if (accessBlocked(capability)) status.textContent = accessExplanationInline(action, capability);
  return true;
}
function accessObserved(packet) {
  const role = packet?.principal?.role;
  hostedAccess = typeof role === "string" && Array.isArray(packet.capabilities) ? { role, capabilities: packet.capabilities } : null;
}
// Ask again what this key may do, without leaving the page or touching an open note.
// Hosted: /capabilities. App: the gateway re-checks the server with its health check.
async function accessRefresh() {
  try {
    if (!companionMode) { if (activeApiKey) await graphJson("/capabilities"); return; }
    if (!companionRegistered || companionSessionFailed) return;
    const snapshot = await companionControl("state");
    // A new generation is the poll's to handle; this only brings health and role up to date.
    if (snapshot.generation === companionState?.generation && companionRegistered && !companionSessionFailed) companionApplyState(snapshot);
  } catch { /* Unreachable: the connection state reports it. */ }
}
// After a refused request. At most one re-check every few seconds: a view that reloads when
// state arrives must not turn one refusal into a stream of requests.
function accessRecheck() {
  if (Date.now() - accessRecheckedAt < 5000) return Promise.resolve();
  accessRecheckedAt = Date.now();
  return accessRefresh();
}
// The server or the app refused a request over this key's role, so the role shown here
// was missing or out of date. Bring it up to date, then explain with what is now known.
function accessRefused(code) {
  const capability = code === "admin_required" ? "manage_access" : "write";
  void accessRecheck().then(() => accessExplain(capability === "write" ? "This change" : "Managing access keys", capability));
}
`;
