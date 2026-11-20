import { browserChevronIcon, browserIcons } from "./browser-icons.js";
import { media } from "./browser-design-system.js";

// Server-rendered markup and styles for the access-key view. Kept apart from the
// controller in access-keys.ts so the editor bundle does not carry them twice.
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
