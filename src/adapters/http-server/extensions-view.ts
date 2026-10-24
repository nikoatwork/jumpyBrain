import { browserIcons } from "./browser-icons.js";

export const extensionStyles = String.raw`
  .extension-slot { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  .extension-slot:empty { display: none; }
  #extension-settings { margin-top: var(--space-8); }
  #extension-status:empty { display: none; }
  .extension-palette { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-block: var(--space-3); font-size: var(--text-ui); color: var(--ink-soft); }
  .extension-item { border-bottom: 1px solid var(--line); padding-block: var(--space-3); }
  .extension-item summary { cursor: pointer; overflow-wrap: anywhere; }
  .extension-item p, #extension-status { font-size: var(--text-caption); color: var(--ink-soft); overflow-wrap: anywhere; }
  .extension-command { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-block: var(--space-2); }
  .extension-command input { width: 150px; min-width: 0; }
  #extension-settings select { max-width: 100%; min-height: var(--control-height); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: var(--radius-sm); font-size: var(--text-ui); }
  #extension-panel { padding: var(--space-6); }
  #extension-panel header { display: flex; gap: var(--space-3); justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
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
    <button id="extension-reload" class="quiet-button note-icon" type="button" aria-label="Reload extensions" title="Reload extensions" disabled>${browserIcons.refresh}</button>
  </header>
  <p id="extension-status" role="status" aria-live="polite"></p>
  <label class="extension-palette" hidden>Palette <select id="extension-theme" aria-label="Extension palette"><option value="">Built-in appearance</option></select></label>
  <div id="extension-list"></div>
</section>`;
export const extensionPanelMarkup = String.raw`
<dialog id="extension-panel" aria-labelledby="extension-panel-title">
  <header><h2 id="extension-panel-title"></h2><button id="extension-panel-close" class="quiet-button" type="button" aria-label="Close extension panel">Close</button></header>
  <div id="extension-panel-content"></div>
</dialog>`;
