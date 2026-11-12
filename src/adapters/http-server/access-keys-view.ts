// Server-rendered markup and styles for the access-key view. Kept apart from the
// controller in access-keys.ts so the editor bundle does not carry them twice.
const panel = String.raw`
<div id="access-keys" class="access-keys">
  <h2 id="access-keys-title">Access keys</h2>
  <p id="access-keys-intro" class="access-keys-intro"></p>
  <div id="access-keys-new" class="access-keys-new" hidden>
    <strong id="access-keys-new-title"></strong>
    <p>Copy it now and pass it on privately. It is not shown again.</p>
    <input id="access-keys-secret" type="text" readonly aria-label="New access key" autocomplete="off" spellcheck="false" />
    <div class="access-keys-actions">
      <button id="access-keys-copy" class="button button-primary" type="button">Copy key</button>
      <button id="access-keys-copy-invite" class="quiet-button" type="button" title="Copies the address, the key and how to connect">Copy invite</button>
      <button id="access-keys-done" class="quiet-button" type="button">Done</button>
    </div>
  </div>
  <form id="access-keys-form" hidden>
    <label for="access-keys-name">Who is it for?</label>
    <div class="access-keys-fields">
      <input id="access-keys-name" type="text" maxlength="100" placeholder="Alice, or Research agent" autocomplete="off" />
      <select id="access-keys-role" class="dropdown" aria-label="Role">
        <option value="reader">Reader</option>
        <option value="writer" selected>Writer</option>
        <option value="admin">Admin</option>
      </select>
      <button id="access-keys-create" class="button button-primary" type="submit" disabled>Create key</button>
    </div>
    <p id="access-keys-role-hint"></p>
  </form>
  <p id="access-keys-message" role="status" aria-live="polite" hidden></p>
  <ul id="access-keys-list" aria-label="Active access keys" hidden></ul>
  <details id="access-keys-revoked" hidden>
    <summary id="access-keys-revoked-summary">Revoked keys</summary>
    <ul id="access-keys-revoked-list" aria-label="Revoked access keys"></ul>
  </details>
</div>`;

/** Settings panel content for the Mac app. */
export const accessKeysMarkup = panel;
/** Hosted browser: the same view in a dialog opened from Connection settings. */
export const accessKeysDialogMarkup = String.raw`
<dialog id="access-keys-dialog" class="document-dialog" aria-labelledby="access-keys-title">
  <button id="access-keys-close" class="icon-button" type="button" aria-label="Close access keys"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
  ${panel}
</dialog>`;

export const accessKeysStyles = String.raw`
  .access-keys h2 { margin: 0; font-size: var(--text-section); }
  .access-keys p { margin: var(--space-2) 0 0; color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
  .access-keys .access-keys-intro { font-size: var(--text-ui); max-width: 62ch; }
  .access-keys-intro:empty { display: none; }
  #access-keys-form { margin-top: var(--space-5); }
  #access-keys-form[hidden], #access-keys-list[hidden], .access-keys-new[hidden] { display: none; }
  #access-keys-form label { display: block; margin-bottom: var(--space-1); font-size: var(--text-ui); }
  .access-keys-fields { display: flex; gap: var(--space-2); align-items: center; }
  .access-keys-fields input { flex: 1 1 auto; min-width: 0; }
  .access-keys-fields .dropdown { flex: 0 0 120px; width: 120px; }
  .access-keys-fields button { flex: none; }
  .access-keys-new { margin-top: var(--space-5); padding: var(--space-5); border: 1px solid var(--accent); border-radius: var(--radius-md); background: var(--surface); }
  .access-keys-new strong { font-size: var(--text-body); overflow-wrap: anywhere; }
  #access-keys-secret { display: block; width: 100%; margin-top: var(--space-3); font-family: var(--font-mono); font-size: var(--text-caption); }
  .access-keys-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .access-keys #access-keys-message { margin-top: var(--space-4); font-size: var(--text-ui); }
  #access-keys-message[data-error="true"] { color: var(--error-ink); }
  #access-keys-list, #access-keys-revoked-list { list-style: none; margin: var(--space-5) 0 0; padding: 0; display: grid; gap: var(--space-2); }
  .access-key { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
  .access-key > div { min-width: 0; }
  .access-key strong { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); font-size: var(--text-body); overflow-wrap: anywhere; }
  .access-key p { margin-top: var(--space-1); }
  .access-key-badge { font-size: var(--text-caption); font-weight: var(--weight-regular); color: var(--ink-soft); border-radius: var(--radius-sm); background: var(--surface-hover); padding: 2px var(--space-2); white-space: nowrap; }
  .access-key-empty { color: var(--ink-soft); font-size: var(--text-ui); }
  #access-keys-revoked { margin-top: var(--space-5); color: var(--ink-soft); font-size: var(--text-ui); }
  #access-keys-revoked summary { cursor: pointer; }
  #access-keys-revoked-list { margin-top: var(--space-3); }
  #access-keys-revoked-list .access-key strong { color: var(--ink-soft); font-weight: var(--weight-regular); }
  #access-keys-dialog { position: relative; width: min(620px, calc(100vw - var(--space-8))); max-height: calc(100vh - var(--space-8)); overflow: auto; }
  #access-keys-dialog h2 { margin-right: var(--space-10); }
  #access-keys-close { position: absolute; top: var(--space-4); right: var(--space-4); border-color: transparent; background: transparent; }
  #open-access-keys[hidden] { display: none; }
  @media (max-width: 560px) { .access-keys-fields { flex-wrap: wrap; } .access-keys-fields input { flex-basis: 100%; } .access-keys-fields .dropdown { flex: 1 1 auto; } }
`;
