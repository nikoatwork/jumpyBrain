import { browserIcons } from "./browser-icons.js";

export const folderExplorerIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3V6Z"/><path d="M3 6V4h7l2 2"/></svg>';
export const folderExplorerToggle = `<button id="toggle-folders" class="quiet-button icon-button" type="button" aria-label="Folders" title="Folders" aria-expanded="false" aria-controls="folder-explorer">${folderExplorerIcon}</button>`;
export const folderExplorerMarkup = `
<aside id="folder-explorer" aria-label="Folders" hidden>
  <div class="folder-explorer-head"><h2>Folders</h2>
    <button id="folder-explorer-new" class="quiet-button icon-button" type="button" aria-label="New folder" title="New folder">+</button>
    <button id="folder-explorer-refresh" class="quiet-button icon-button" type="button" aria-label="Refresh folders" title="Refresh folders">${browserIcons.refresh}</button>
    <button id="folder-explorer-close" class="quiet-button icon-button" type="button" aria-label="Close folders" title="Close folders (Esc)">${browserIcons.close}</button>
  </div>
  <div class="folder-explorer-search"><input id="folder-explorer-search" type="search" aria-label="Find notes or folders" placeholder="Find notes or folders…" autocomplete="off" spellcheck="false" /></div>
  <p id="folder-explorer-message" role="status" aria-live="polite"></p>
  <div id="folder-explorer-tree" role="tree" aria-label="Memory folders and notes"></div>
  <div id="folder-explorer-menu" role="menu" aria-label="File actions" hidden></div>
  <dialog id="folder-explorer-edit" aria-labelledby="folder-explorer-edit-title">
    <form><h2 id="folder-explorer-edit-title"></h2>
      <label id="folder-explorer-name-label" for="folder-explorer-name">File name</label>
      <input id="folder-explorer-name" type="text" autocomplete="off" spellcheck="false" required />
      <select id="folder-explorer-destination" aria-label="Destination folder" hidden></select>
      <p id="folder-explorer-edit-error" role="alert"></p>
      <div class="folder-explorer-edit-buttons"><button id="folder-explorer-cancel" type="button" class="quiet-button">Cancel</button><button id="folder-explorer-save" class="quiet-button" type="submit">Save</button></div>
    </form>
  </dialog>
</aside>`;
export const folderExplorerStyles = String.raw`
  #folder-explorer-menu { position: fixed; z-index: 45; min-width: 180px; padding: var(--space-1); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }
  #folder-explorer-menu button { display: block; width: 100%; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink); text-align: left; padding: var(--space-2) var(--space-3); font: inherit; }
  #folder-explorer-menu button:hover, #folder-explorer-menu button:focus-visible { background: var(--hover-fill); }
  #folder-explorer-menu button:disabled { color: var(--ink-faint); }
  #folder-explorer-edit { width: min(400px, calc(100vw - var(--space-8))); padding: var(--space-5); }
  #folder-explorer-edit h2 { font-size: var(--text-section); margin-top: 0; }
  #folder-explorer-name, #folder-explorer-destination { width: 100%; margin-top: var(--space-2); }
  #folder-explorer-edit-error { color: var(--ink-soft); font-size: var(--text-caption); }
  .folder-explorer-edit-buttons { display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-4); }
  .folder-explorer-row[data-drop-target] { background: var(--hover-fill); color: var(--accent); outline: 1px solid var(--accent); outline-offset: -1px; }
  #toggle-folders { margin: var(--space-2) var(--space-3) var(--space-2) auto; flex-shrink: 0; background: transparent; }
  #toggle-folders[aria-expanded="true"] { color: var(--accent); }
  #folder-explorer { flex: 0 0 320px; width: 320px; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--line); background: var(--surface); overflow: hidden; font: var(--text-ui)/var(--leading-ui) var(--font-ui); }
  .folder-explorer-head { display: flex; align-items: center; gap: var(--space-1); min-height: var(--space-12); padding: var(--space-2) var(--space-3); }
  .folder-explorer-head h2 { flex: 1; margin: 0; font: var(--weight-semibold) var(--text-ui)/var(--leading-ui) var(--font-ui); }
  .folder-explorer-head .icon-button { background: transparent; }
  .folder-explorer-search { padding: 0 var(--space-3) var(--space-3); }
  #folder-explorer-search { width: 100%; min-width: 0; font-size: var(--text-ui); }
  #folder-explorer-message { margin: 0; padding: 0 var(--space-3) var(--space-3); color: var(--ink-soft); font-size: var(--text-caption); }
  #folder-explorer-message:empty { display: none; }
  #folder-explorer-tree { flex: 1; min-height: 0; overflow: auto; padding: var(--space-1) 0 var(--space-3); }
  .folder-explorer-row { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: var(--control-compact); border: 0; border-radius: 0; padding: var(--space-1) var(--space-3) var(--space-1) calc(var(--space-3) + var(--folder-depth) * var(--space-3)); background: transparent; text-align: left; color: var(--ink-soft); font: inherit; }
  .folder-explorer-row:hover { color: var(--ink); background: var(--hover-fill); }
  .folder-explorer-row[aria-current="page"] { color: var(--ink); background: var(--hover-fill); font-weight: var(--weight-semibold); }
  .folder-explorer-row:focus-visible { outline-offset: -2px; }
  .folder-explorer-row[aria-disabled="true"] { color: var(--ink-faint); cursor: default; }
  .folder-explorer-row { --folder-depth: 0; }
  .folder-explorer-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .folder-explorer-glyph { flex: 0 0 var(--space-3); width: var(--space-3); height: var(--space-3); position: relative; }
  [data-folder-path] .folder-explorer-glyph::before { content: ""; position: absolute; left: 2px; top: 3px; width: 5px; height: 5px; border-right: 1px solid currentColor; border-bottom: 1px solid currentColor; transform: rotate(-45deg); }
  [data-folder-path][aria-expanded="true"] .folder-explorer-glyph::before { transform: rotate(45deg); top: 2px; }
  [data-file-path] .folder-explorer-glyph::before { content: ""; position: absolute; inset: 1px 2px; border: 1px solid currentColor; border-radius: 1px; opacity: .6; }
  @media (max-width: 1500px) and (min-width: 681px) {
    body[data-folder-explorer-open="true"] #note-layout { display: flex; flex-direction: column; padding-right: 0; }
    body[data-folder-explorer-open="true"] #page-details { order: -1; position: static; align-self: flex-end; width: min(224px, calc(100% - var(--space-8))); max-height: none; margin: var(--space-4) var(--space-4) 0; }
  }
  @media (max-width: 1000px) and (min-width: 681px) {
    #folder-explorer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 30; box-shadow: var(--shadow-lg); }
  }
  @media (max-width: 680px) {
    #folder-explorer { position: fixed; inset: 0; z-index: 30; width: 100%; border: 0; }
    .folder-explorer-head { min-height: var(--space-12); }
    :root[data-native-mac="true"] .folder-explorer-head { padding-left: calc(var(--space-16) + var(--space-3)); }
    #folder-explorer-search { font-size: var(--text-section); }
    .folder-explorer-row, .folder-explorer-head .icon-button { min-height: var(--control-touch); }
    .folder-explorer-head .icon-button { width: var(--control-touch); height: var(--control-touch); }
  }
`;
