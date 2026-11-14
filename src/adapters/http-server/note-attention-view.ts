import { media } from "./browser-design-system.js";
import { browserIcons } from "./browser-icons.js";

// Server-rendered presentation only; keep duplicate markup/styles out of the browser bundle.
// The snooze surface is a positioned .popover--menu; note-attention.ts fills #snooze-options.
export const noteAttentionMarkup = String.raw`
<dialog id="note-snooze" class="popover popover--menu" aria-labelledby="snooze-title">
  <div class="snooze-heading"><h2 id="snooze-title">Snooze note</h2><button id="snooze-close" class="icon-button" type="button" aria-label="Close snooze" title="Close snooze">${browserIcons.close}</button></div>
  <div id="snooze-options" role="menu" aria-label="Snooze until"></div>
  <form id="snooze-custom" hidden>
    <div class="field"><label class="field-label" for="snooze-datetime">Return at</label><input id="snooze-datetime" type="datetime-local" required /></div>
    <p id="snooze-error" class="status-text" data-error="true" role="status"></p>
    <div class="dialog-actions"><button id="snooze-back" class="quiet-button" type="button">Back</button><button class="button button-primary" type="submit">Snooze</button></div>
  </form>
</dialog>`;
export const noteAttentionStyles = String.raw`
    .sidebar-page-action svg { width: var(--icon-size); height: var(--icon-size); }
    .sidebar-page-actions { display: flex; align-items: center; flex: 0 0 auto; }
    .sidebar-page-action { display: none; place-items: center; width: var(--control-compact); height: var(--control-compact); padding: var(--space-1); color: var(--ink-soft); background: transparent; border: 0; border-radius: var(--radius-sm); }
    .sidebar-page:hover .sidebar-page-action, .sidebar-page:focus-within .sidebar-page-action { display: grid; }
    .sidebar-page-action:hover:not(:disabled) { color: var(--ink); }
    .sidebar-page-action:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-offset-inset); }
    @media ${media.touch} { .sidebar-page-action { display: grid; } }
    #note-snooze { width: min(var(--width-popover), calc(100vw - var(--space-6))); }
    #note-snooze::backdrop { background: transparent; }
    .snooze-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); padding-left: var(--space-2); }
    #snooze-title { margin: 0; font-size: var(--text-ui); font-weight: var(--weight-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #snooze-options > button { justify-content: space-between; gap: var(--space-3); width: 100%; text-align: left; }
    #snooze-options time { color: var(--ink-soft); white-space: nowrap; }
    #snooze-custom { padding: 0 var(--space-2) var(--space-2); }
    #snooze-custom .field { margin-block: var(--space-2) 0; }
    #snooze-custom .dialog-actions { margin-top: var(--space-3); }
    #snooze-error:empty { display: none; }
`;
