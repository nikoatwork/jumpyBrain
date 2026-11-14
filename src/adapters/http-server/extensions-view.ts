import { browserChevronIcon, browserIcons } from "./browser-icons.js";

export const extensionStyles = String.raw`
  .extension-slot { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .extension-slot:empty { display: none; }
  #extension-settings { margin-top: var(--space-8); }
  #extension-status:empty { display: none; }
  .extension-palette { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: var(--space-3); margin-block: var(--space-3); font-size: var(--text-ui); color: var(--ink-soft); }
  .extension-palette .dropdown { width: 100%; max-width: 320px; justify-self: end; }
  .extension-item { border-bottom: 1px solid var(--line); padding-block: var(--space-3); }
  .extension-item summary { max-width: 100%; overflow-wrap: anywhere; }
  .extension-item > p { margin-block: var(--space-2) 0; }
  .extension-command { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-block: var(--space-2); }
  .extension-command input { width: 150px; min-width: 0; }
  #extension-panel-content { overflow-wrap: anywhere; }
  #extension-panel-content form { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: end; }
  #extension-panel-content label { display: grid; gap: var(--space-1); flex: 1; min-width: 0; }
  #extension-panel-content input { width: 100%; }
  #extension-panel-content ul { padding: 0; list-style: none; }
  #extension-panel-content li { margin-block: var(--space-3); }
  #extension-panel-content li button { text-align: left; height: auto; white-space: normal; }
  #extension-panel-content li p { font-size: var(--text-ui); color: var(--ink-soft); margin-block: var(--space-1); }
`;
export const extensionSettingsMarkup = String.raw`
<section id="extension-settings" aria-labelledby="extension-heading">
  <header class="settings-heading">
    <h2 id="extension-heading">Extensions</h2>
    <button id="extension-reload" class="icon-button" type="button" aria-label="Reload extensions" title="Reload extensions" disabled>${browserIcons.refresh}</button>
  </header>
  <p id="extension-status" class="status-text status-text--caption" role="status" aria-live="polite"></p>
  <label class="extension-palette" hidden>Palette <select id="extension-theme" class="dropdown" aria-label="Extension palette"><option value="">Built-in appearance</option></select></label>
  <div id="extension-list"></div>
  <template id="extension-disclosure-glyph">${browserChevronIcon}</template>
</section>`;
export const extensionPanelMarkup = String.raw`
<dialog id="extension-panel" aria-labelledby="extension-panel-title">
  <header class="dialog-heading"><h2 id="extension-panel-title"></h2><button id="extension-panel-close" class="icon-button dialog-close" type="button" aria-label="Close extension panel" title="Close extension panel">${browserIcons.close}</button></header>
  <div id="extension-panel-content"></div>
</dialog>`;
