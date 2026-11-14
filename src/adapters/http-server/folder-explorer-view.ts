import { media } from "./browser-design-system.js";
import { browserIcons } from "./browser-icons.js";

export const folderExplorerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3V6Z"/><path d="M3 6V4h7l2 2"/></svg>';
export const folderExplorerToggle = `<button id="toggle-folders" class="icon-button button--toggle" type="button" aria-label="Folders" title="Folders" aria-expanded="false" aria-controls="folder-explorer">${folderExplorerIcon}</button>`;
export const folderExplorerMarkup = `
<aside id="folder-explorer" aria-label="Folders" hidden>
  <div class="folder-explorer-head"><h2>Folders</h2>
    <button id="folder-explorer-new" class="icon-button" type="button" aria-label="New folder" title="New folder">${browserIcons.plus}</button>
    <button id="folder-explorer-refresh" class="icon-button" type="button" aria-label="Refresh folders" title="Refresh folders">${browserIcons.refresh}</button>
    <button id="folder-explorer-close" class="icon-button" type="button" aria-label="Close folders" title="Close folders (Esc)">${browserIcons.close}</button>
  </div>
  <div class="folder-explorer-search"><input id="folder-explorer-search" type="search" aria-label="Find notes or folders" placeholder="Find notes or folders…" autocomplete="off" spellcheck="false" />
    <select id="folder-explorer-sort" class="dropdown dropdown--quiet" aria-label="Sort notes" title="Sort notes within each folder">
      <option value="name">Name</option><option value="edited">Last edited</option><option value="created">Created</option>
    </select></div>
  <p id="folder-explorer-message" class="list-status" role="status" aria-live="polite"></p>
  <div id="folder-explorer-tree" role="tree" aria-label="Memory folders and notes"></div>
  <div id="folder-explorer-menu" class="popover popover--menu" role="menu" aria-label="File actions" hidden></div>
  <dialog id="folder-explorer-edit" class="dialog--sm" aria-labelledby="folder-explorer-edit-title">
    <form><h2 id="folder-explorer-edit-title" class="dialog-title"></h2>
      <div class="field"><label id="folder-explorer-name-label" class="field-label" for="folder-explorer-name">File name</label>
      <input id="folder-explorer-name" type="text" autocomplete="off" spellcheck="false" required />
      <select id="folder-explorer-destination" class="dropdown" aria-label="Destination folder" hidden></select></div>
      <p id="folder-explorer-edit-error" class="status-text status-text--caption" role="alert"></p>
      <div class="dialog-actions"><button id="folder-explorer-cancel" type="button" class="quiet-button">Cancel</button><button id="folder-explorer-save" class="button button-primary" type="submit">Save</button></div>
    </form>
  </dialog>
</aside>`;
export const folderExplorerStyles = String.raw`
  #folder-explorer-menu { min-width: 180px; }
  #folder-explorer-edit-error:empty { display: none; }
  .folder-explorer-row[data-drop-target] { --row-fill: var(--hover-fill); color: var(--accent); box-shadow: var(--ring-selected); }
  #toggle-folders { margin: var(--space-2) var(--space-3) var(--space-2) auto; }
  #folder-explorer { flex: 0 0 var(--panel-width); width: var(--panel-width); min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--line); background: var(--surface); overflow: hidden; font: var(--text-ui)/var(--leading-ui) var(--font-ui); }
  .folder-explorer-head { display: flex; align-items: center; gap: var(--space-1); min-height: var(--header-height); padding: var(--space-2) var(--space-3); }
  .folder-explorer-head h2 { flex: 1; margin: 0; font: var(--weight-semibold) var(--text-ui)/var(--leading-ui) var(--font-ui); }
  .folder-explorer-search { display: flex; gap: var(--space-2); align-items: center; padding: 0 var(--space-3) var(--space-3); }
  #folder-explorer-search { flex: 1; width: 100%; min-width: 0; }
  #folder-explorer-sort { flex: 0 0 auto; width: auto; max-width: 9.5rem; }
  .folder-explorer-age:empty, #folder-explorer-message:empty { display: none; }
  #folder-explorer-tree { flex: 1; min-height: 0; overflow: auto; padding: var(--space-1) 0 var(--space-3); }
  @media ${media.explorerBeside} {
    body[data-folder-explorer-open="true"] #note-layout { display: flex; flex-direction: column; padding-right: 0; }
    body[data-folder-explorer-open="true"] #page-details { order: -1; position: static; align-self: flex-end; width: min(var(--card-width), calc(100% - var(--space-8))); max-height: none; margin: var(--space-4) var(--space-4) 0; }
  }
  @media ${media.explorerOverlay} {
    #folder-explorer { position: fixed; top: 0; right: 0; bottom: 0; z-index: var(--z-panel); box-shadow: var(--shadow-lg); }
  }
  @media ${media.narrow} {
    #folder-explorer { position: fixed; inset: 0; z-index: var(--z-panel); width: 100%; border: 0; }
    :root[data-native-mac="true"] .folder-explorer-head { padding-left: calc(var(--space-16) + var(--space-3)); }
    #folder-explorer-search { font-size: var(--text-section); }
  }
`;
