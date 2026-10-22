// Server-rendered presentation only; keep duplicate markup/styles out of the browser bundle.
const clock = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.6"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const check = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const noteAttentionToolbarMarkup = String.raw`
  <span id="note-attention-controls" role="group" aria-label="Note attention" hidden>
    <span id="note-attention-state"></span>
    <button id="snooze-current-page" class="quiet-button attention-icon" type="button" aria-label="Snooze note" title="Snooze note">${clock}</button>
    <button id="settle-current-page" class="quiet-button attention-icon" type="button" aria-label="Settle note" title="Settle note">${check}</button>
    <button id="reactivate-current-page" class="quiet-button" type="button" hidden>Bring back</button>
  </span>`;
export const noteAttentionMarkup = String.raw`
<div id="attention-feedback" hidden><span id="attention-message" role="status" aria-live="polite"></span><button id="attention-undo" class="quiet-button" type="button" hidden>Undo</button></div>
<dialog id="note-snooze" aria-labelledby="snooze-title">
  <div class="snooze-heading"><h2 id="snooze-title">Snooze note</h2><button id="snooze-close" class="quiet-button attention-icon" type="button" aria-label="Close snooze">×</button></div>
  <div id="snooze-options" role="menu" aria-label="Snooze until"></div>
  <form id="snooze-custom" hidden>
    <label for="snooze-datetime">Return at</label><input id="snooze-datetime" type="datetime-local" required />
    <p id="snooze-error" role="status"></p>
    <div class="snooze-custom-actions"><button id="snooze-back" class="quiet-button" type="button">Back</button><button class="quiet-button" type="submit">Snooze</button></div>
  </form>
</dialog>`;
export const noteAttentionStyles = String.raw`
    #note-attention-controls { display: inline-flex; align-items: center; gap: var(--space-0-5); }
    #note-attention-controls[hidden], #attention-feedback[hidden] { display: none; }
    .attention-icon { display: inline-grid; place-items: center; width: var(--control-compact); height: var(--control-compact); min-height: var(--control-compact); padding: var(--space-1); }
    .attention-icon svg, .sidebar-page-action svg { width: var(--icon-size); height: var(--icon-size); }
    #note-attention-state { color: var(--ink-soft); font-size: var(--text-caption); }
    #attention-feedback { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-4); font-size: var(--text-ui); color: var(--ink-soft); }
    #attention-feedback[data-error="true"] { color: var(--error-ink); }
    .sidebar-page-actions { display: flex; align-items: center; flex: 0 0 auto; }
    .sidebar-page-action { display: none; place-items: center; width: var(--control-compact); height: var(--control-compact); padding: var(--space-1); color: var(--ink-soft); background: transparent; border: 0; border-radius: var(--radius-sm); }
    .sidebar-page:hover .sidebar-page-action, .sidebar-page:focus-within .sidebar-page-action { display: grid; }
    .sidebar-page-action:hover { color: var(--ink); background: var(--control-fill); }
    .sidebar-page-action:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    #note-snooze { position: fixed; margin: 0; width: min(340px, calc(100vw - 24px)); padding: var(--space-3); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); font: var(--text-ui)/var(--leading-ui) var(--font-ui); }
    #note-snooze::backdrop { background: transparent; }
    .snooze-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
    #snooze-title { margin: 0; font-size: var(--text-ui); font-weight: var(--weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #snooze-options button { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; text-align: left; }
    #snooze-options time { color: var(--ink-soft); white-space: nowrap; }
    #snooze-options button:last-child { margin-top: var(--space-2); border-top: 1px solid var(--line); border-radius: 0; }
    #snooze-custom label { display: block; margin-bottom: var(--space-2); }
    #snooze-datetime { box-sizing: border-box; width: 100%; padding: var(--space-2); font: inherit; color: var(--ink); background: var(--control-fill); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); }
    .snooze-custom-actions { display: flex; justify-content: flex-end; gap: var(--space-2); }
    #snooze-error { color: var(--error-ink); }
    @media (hover: none) { .sidebar-page-action { display: grid; } }
    @media (max-width: 680px) { #note-attention-state { display: none; } #note-attention-controls { margin-left: auto; } }
`;
