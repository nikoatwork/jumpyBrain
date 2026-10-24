import { browserIcons } from "./browser-icons.js";
import { brainOutlineSvg } from "./favicon.js";
import { themeMarkup } from "./browser-theme.js";
import { noteAttentionMarkup, noteAttentionStyles } from "./note-attention-view.js";

// Adapter-owned browser presentation, composed into the nonce-protected shell.
// String.raw keeps shell JavaScript readable; the Lexical surface is bundled separately.
export const notesStyles = String.raw`
${noteAttentionStyles}
    body { display: flex; height: 100dvh; }
    .app-workspace { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
    .app-nav { width: 224px; flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4) var(--space-3) var(--space-3); border-right: 1px solid var(--line); overflow: auto; }
    :root[data-sidebar-collapsed="true"] .app-nav { display: none; }
    .workspace-toolbar { display: flex; align-items: center; flex: 0 0 auto; min-height: 48px; }
    #toggle-sidebar { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: var(--control-compact); height: var(--control-compact); min-height: var(--control-compact); margin: var(--space-2) var(--space-3); padding: var(--space-1); }
    #toggle-sidebar svg { width: 20px; height: 20px; }
    .workspace-brand { display: flex; align-items: center; flex: 0 0 auto; margin: var(--space-3) var(--space-6) var(--space-3) auto; color: var(--ink-soft); }
    .workspace-brand svg { display: block; width: 24px; height: 24px; }
    .nav-brand { min-width: 0; }
    .app-nav .home-link { display: block; font-size: var(--text-body); padding: var(--space-1) var(--space-3); font-weight: var(--weight-semibold); background: transparent; color: var(--ink); }
    .home-link small { font-size: var(--text-caption); font-weight: var(--weight-regular); }
    .nav-tools, .nav-preferences { display: flex; flex-direction: column; gap: var(--space-1); }
    .nav-tools { flex-direction: row; align-items: center; gap: var(--space-2); }
    .nav-utilities { display: flex; align-items: center; gap: var(--space-1); margin-left: auto; }
    .nav-preferences { flex-direction: row; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-top: auto; padding-top: var(--space-3); border-top: 1px solid var(--line); flex-shrink: 0; }
    .app-nav .nav-item { display: flex; align-items: center; gap: var(--space-2); min-height: var(--control-height); padding: var(--space-1) var(--space-3); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); text-align: left; background: transparent; }
    .nav-item svg { width: var(--icon-size); height: var(--icon-size); flex-shrink: 0; }
    .app-nav .nav-item:hover, .app-nav [aria-current="page"] { background: var(--control-fill); color: var(--ink); }
    .app-nav #new-note { background: var(--control-fill); border: 1px solid var(--line); color: var(--ink); }
    .app-nav #new-note:hover { background: var(--surface-hover); }
    .app-nav .sidebar-icon { justify-content: center; width: var(--control-height); min-width: var(--control-height); height: var(--control-height); padding: var(--space-2); }
    .nav-appearance { display: flex; }
    .nav-library { flex: 1; min-height: 80px; overflow: auto; scrollbar-width: thin; }
    .nav-library ul { list-style: none; margin: 0; padding: 0; }
    .nav-library ul:not(:empty) + ul, .sidebar-page + .sidebar-page { margin-top: var(--space-1); }
    .sidebar-empty { margin: var(--space-1) var(--space-3); font-size: var(--text-caption); line-height: 1.5; color: var(--ink-faint); }
    .sidebar-page { display: flex; align-items: center; min-width: 0; border-radius: var(--radius-sm); }
    .sidebar-page:hover, .sidebar-page:focus-within { background: var(--surface-hover); }
    .sidebar-page:has([aria-current="page"]) { background: var(--control-fill); }
    .sidebar-page-link { display: flex; align-items: center; flex: 1; min-width: 0; min-height: var(--control-height); padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3); color: var(--ink-soft); text-decoration: none; font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); border-radius: var(--radius-sm); }
    .sidebar-page-link span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sidebar-page-link[aria-current="page"] { color: var(--ink); }
    .sidebar-page-pin { display: grid; place-items: center; flex: 0 0 var(--control-compact); width: var(--control-compact); height: var(--control-compact); padding: var(--space-1); margin-right: var(--space-0-5); border: 0; border-radius: var(--radius-sm); color: var(--ink-soft); background: transparent; opacity: 0; }
    .sidebar-page-pin svg { width: 16px; height: 16px; }
    .sidebar-page:hover .sidebar-page-pin, .sidebar-page:focus-within .sidebar-page-pin, .sidebar-page-pin[aria-pressed="true"] { opacity: 1; }
    .sidebar-page-pin:hover { background: var(--control-fill); color: var(--ink); }
    @media (hover: none) { .sidebar-page-pin { opacity: 1; } }
    .document-status { display: flex; flex: 1; align-items: center; justify-content: flex-end; gap: var(--space-2); min-height: 48px; padding: var(--space-2) var(--space-6); }
    body:not([data-view="note"]) .document-status { display: none; }
    #graph-header { flex: 0 0 auto; }
    .quiet-button { border: 0; border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3); background: var(--control-fill); color: var(--ink-soft); text-decoration: none; font: inherit; font-size: var(--text-ui); line-height: var(--leading-ui); min-height: var(--control-height); cursor: pointer; }
    .quiet-button:hover { background: var(--surface-hover); color: var(--ink); }
    .home { width: 100%; overflow: auto; padding: clamp(var(--space-8), 8vh, 80px) var(--space-6) var(--space-12); text-align: center; }
    .home-actions { width: min(100%, 560px); margin: 0 auto; text-align: left; }
    .home-actions h1 { margin: 0 0 var(--space-6); font-size: var(--text-display); line-height: var(--leading-heading); font-weight: var(--weight-semibold); letter-spacing: -.035em; }
    .home-action { display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 56px; padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); text-align: left; font-size: var(--text-body); }
    .home-action-label { flex: 1; }
    .home-action-icon { width: 20px; height: 20px; flex: 0 0 auto; }
    #home-new { background: var(--control-fill); color: var(--ink); font-weight: var(--weight-semibold); }
    #home-new:hover { background: var(--surface-hover); border-color: var(--line-strong); }
    #home-search { margin-top: var(--space-3); background: transparent; color: var(--ink-soft); }
    #home-search:hover { background: var(--surface-hover); color: var(--ink); }
    .recent-notes { width: min(100%, 560px); margin: var(--space-10) auto 0; text-align: left; }
    .recent-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-1); }
    .recent-heading h2 { margin: 0; font-size: var(--text-ui); font-weight: var(--weight-semibold); }
    .recent-description, #recent-message { color: var(--ink-soft); font-size: var(--text-caption); }
    .recent-description { margin: 0 0 var(--space-1); }
    #recent-list { list-style: none; margin: 0; padding: 0; }
    .recent-link { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-3); margin-inline: calc(-1 * var(--space-3)); border-radius: var(--radius-sm); color: var(--ink); text-decoration: none; }
    .recent-link:hover { background: var(--surface-hover); }
    .recent-link span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .recent-link .recent-date { flex-shrink: 0; color: var(--ink-soft); font-size: var(--text-caption); }
    kbd { font: inherit; color: var(--ink); }
    .home-action kbd { flex-shrink: 0; padding: var(--space-1) var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: var(--text-caption); font-weight: var(--weight-regular); color: inherit; }
    body:not([data-view="graph"]) #graph-header, body:not([data-view="graph"]) #graph-wrap { display: none; }
    main, body[data-view="graph"] main { flex: 1; height: auto; min-height: 0; }
    #note-panel { --writing-font: var(--font-writing); width: 100%; min-width: 0; overflow: auto; scrollbar-gutter: stable; scrollbar-color: var(--line-strong) transparent; scroll-padding-block: var(--space-8); }
    .note-column { width: min(100%, 760px); margin: 0 auto; padding: clamp(var(--space-10), 7vh, 80px) var(--space-10) max(160px, 30vh); }
    #note-title { margin: 0 0 var(--space-6); color: var(--ink); font: 500 clamp(30px, 4vw, 40px)/1.25 var(--writing-font); letter-spacing: -.025em; overflow-wrap: anywhere; }
    #note-name { display: block; width: 100%; height: auto; min-height: 1.25em; resize: none; overflow: hidden; margin: 0 0 var(--space-6); padding: 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: 500 clamp(30px, 4vw, 40px)/1.25 var(--writing-font); letter-spacing: -.025em; overflow-wrap: anywhere; }
    #note-editor { display: block; width: 100%; min-height: 55vh; resize: none; overflow: hidden; padding: var(--space-2) 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: 19px/1.8 var(--writing-font); caret-color: var(--accent); tab-size: 2; white-space: pre-wrap; overflow-wrap: anywhere; }
    /* Each block is a source line; intentional blank lines supply paragraph spacing. */
    #note-editor p { margin: 0; min-height: 1.8em; }
    #note-editor > * { scroll-margin-block: var(--space-8); }
    #note-editor h1, #note-editor h2, #note-editor h3, #note-editor h4, #note-editor h5, #note-editor h6 { margin: .6em 0 .25em; line-height: 1.35; font-weight: var(--weight-semibold); letter-spacing: -.02em; }
    #note-editor > :first-child { margin-top: 0; }
    #living-sources { overflow-wrap: anywhere; font-size: var(--text-ui); margin-top: var(--space-5); }
    #living-sources li { margin-block: var(--space-2); }
    #note-editor h1 { font-size: 32px; }
    #note-editor h2 { font-size: 27px; }
    #note-editor h3 { font-size: 23px; }
    #note-editor h4, #note-editor h5, #note-editor h6 { font-size: 20px; }
    .editor-bold, #note-editor strong, #note-editor b { font-weight: var(--weight-writing-bold); }
    .editor-italic { font-style: italic; }
    #note-editor > .external-change { border-radius: 3px; animation: external-change-fade 4s ease-out forwards; }
    @keyframes external-change-fade {
      0%, 25% { background-color: color-mix(in srgb, var(--accent) 12%, transparent); }
      100% { background-color: transparent; }
    }
    @media (prefers-reduced-motion: reduce) {
      #note-editor > .external-change { animation: none; background-color: color-mix(in srgb, var(--accent) 12%, transparent); }
    }
    #note-external-state { color: var(--ink-soft); font-size: var(--text-caption); }
    .markdown-literal code, .markdown-reference { font: inherit; background: transparent; }
    .markdown-reference[data-page-reference="true"]:hover { background: var(--surface-hover); }
    ::highlight(jumpybrain-reference-markers) { color: color-mix(in srgb, var(--ink) 24%, var(--surface)); }
    .markdown-reference:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
    #reference-creation-status { color: var(--error-ink); font-size: var(--text-ui); }
    .markdown-literal::selection { background: var(--surface-hover); }
    #format-controls { display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; margin: 0 0 var(--space-6) calc(-1 * var(--space-2)); }
    #format-controls button { min-height: var(--control-height); padding: var(--space-2); background: transparent; font-size: var(--text-ui); }
    #format-controls button:hover, #format-controls button:focus-visible { background: var(--control-fill); color: var(--ink); }
    #format-controls [data-format="h3"] { margin-right: var(--space-2); }
    #format-controls #insert-reference { margin: 0 0 0 auto; }
    #note-editor:focus, #note-editor:focus-visible, #note-name:focus, #note-name:focus-visible { outline: none; border: 0; box-shadow: none; }
    .note-icon { display: inline-grid; place-items: center; flex: 0 0 auto; width: var(--control-compact); height: var(--control-compact); min-height: var(--control-compact); padding: var(--space-1); }
    .note-icon svg { width: var(--icon-size); height: var(--icon-size); }
    #app-toast { position: fixed; z-index: 100; left: var(--space-4); bottom: var(--space-4); display: flex; align-items: center; gap: var(--space-2); width: max-content; max-width: min(360px, calc(100vw - 32px)); padding: var(--space-2) var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); font: var(--text-ui)/var(--leading-ui) var(--font-ui); }
    #app-toast[hidden], .note-icon[hidden] { display: none; }
    #toast-message { min-width: 0; overflow-wrap: anywhere; }
    #app-toast[data-error="true"] #toast-message { color: var(--error-ink); }
    #toast-action, #toast-close { flex-shrink: 0; }
    .app-version { margin: var(--space-6) 0 0; padding-top: var(--space-4); border-top: 1px solid var(--line); color: var(--ink-soft); font-size: var(--text-caption); }
    .note-actions { font-size: var(--text-caption); align-items: center; color: var(--ink-soft); display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    .document-dialog { padding: var(--space-6); }
    .document-dialog h2 { margin-top: 0; }
    .document-dialog textarea { width: 100%; min-height: 120px; resize: vertical; background: var(--surface); color: var(--ink); border: 1px solid var(--line); padding: var(--space-2); }
    .document-dialog label { display: block; margin-block: var(--space-3); }
    .document-dialog .dialog-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
    #delete-confirm { color: var(--error-ink); }
    #note-save-error { color: var(--error-ink); font-size: var(--text-ui); }
    #note-save-error[data-review="true"] { color: var(--ink-soft); }
    .capture-feedback { margin: 0; padding: 0 var(--space-6); font-size: var(--text-caption); color: var(--ink-soft); }
    .capture-feedback[data-error="true"] { color: var(--error-ink); }
    #insert-reference { margin: 0 0 var(--space-3) calc(-1 * var(--space-3)); font-size: var(--text-ui); }
    button:disabled { cursor: wait; opacity: .65; }
    .save-state { color: var(--ink-soft); font-size: var(--text-caption); white-space: nowrap; }
    .save-state[data-state="failed"], #note-message[data-error="true"] { color: var(--error-ink); }
    #note-message { color: var(--ink-soft); white-space: pre-wrap; }
    #note-file { margin: var(--space-8) 0 var(--space-2); color: var(--ink-soft); overflow-wrap: anywhere; font-size: var(--text-caption); }
    .note-frontmatter { margin-top: var(--space-6); color: var(--ink-soft); font-size: var(--text-caption); }
    .note-frontmatter summary { cursor: pointer; width: fit-content; }
    .note-frontmatter pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    dialog { width: min(600px, calc(100vw - 32px)); max-height: min(650px, calc(100dvh - 64px)); padding: 0; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: var(--backdrop); }
    #note-search { margin-top: min(15vh, 100px); }
    .dialog-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4); border-bottom: 1px solid var(--line); }
    #note-search-input { width: 100%; min-width: 0; border: 0; box-shadow: none; background: transparent; font-size: var(--text-section); }
    #note-search-input:focus-visible { outline: 2px solid var(--focus-ring); }
    #search-results { list-style: none; padding: var(--space-1); margin: 0; max-height: 45dvh; overflow: auto; }
    .search-result { padding: var(--space-3); border-radius: var(--radius-sm); cursor: pointer; }
    .search-result[aria-selected="true"] { background: var(--surface-hover); }
    .search-result[aria-disabled="true"] { cursor: default; color: var(--ink-soft); }
    .search-result strong, .search-result span, .search-result small { display: block; overflow-wrap: anywhere; }
    .search-result strong { font-size: var(--text-body); font-weight: var(--weight-semibold); }
    .search-result span { font-size: var(--text-ui); color: var(--ink-soft); margin-top: var(--space-1); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .search-result small { margin-top: var(--space-1); color: var(--ink-soft); font-size: var(--text-caption); }
    .search-footer { padding: var(--space-3) var(--space-4); font-size: var(--text-caption); color: var(--ink-soft); }
    .search-footer p { margin: 0; }
    #search-freshness { margin-top: var(--space-1); }
    #connection { padding: var(--space-6); }
    #connection h2 { margin: 0 0 var(--space-2); font-size: var(--text-heading); }
    #connection p { color: var(--ink-soft); }
    #connection label { display: block; margin: var(--space-5) 0 var(--space-2); }
    #open-connection { position: relative; }
    .connection-dot { display: inline-block; width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--ink-faint); }
    #open-connection .connection-dot { position: absolute; top: 5px; right: 5px; }
    [data-state="connected"] > .connection-dot { background: var(--status-connected); }
    [data-state="checking"] > .connection-dot { background: var(--ink-faint); }
    [data-state="disconnected"] > .connection-dot, [data-state="unavailable"] > .connection-dot { background: var(--error-ink); }
    .connection-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-5); }
    #api-key { width: 100%; display: block; margin-top: var(--space-2); font-size: var(--text-section); }
    @media (max-width: 680px) {
      body { flex-direction: column; }
      .app-nav { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: var(--space-3) var(--space-4); padding: var(--space-3); border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; }
      :root[data-sidebar-collapsed="true"] .app-nav { display: grid; }
      #toggle-sidebar { display: none; }
      .workspace-toolbar { min-height: 40px; }
      .workspace-brand { margin: var(--space-2) var(--space-4) var(--space-2) auto; }
      .app-nav .home-link { padding-inline: 0; }
      .nav-tools { flex-direction: row; align-items: center; gap: var(--space-1); }
      .nav-library { grid-row: 2; grid-column: 1 / -1; min-height: 0; max-height: 108px; }
      .nav-library ul { display: flex; gap: var(--space-1); min-width: 0; overflow-x: auto; }
      .sidebar-page { flex: 0 0 auto; max-width: 190px; }
      .sidebar-page + .sidebar-page { margin-top: 0; }
      .sidebar-page-link { min-height: var(--control-height); }
      .sidebar-empty { margin: var(--space-1); }
      .nav-preferences { grid-row: 3; grid-column: 1 / -1; margin-top: 0; padding-top: var(--space-2); }
      .nav-utilities { margin-left: auto; }
      .app-nav .nav-item { padding: var(--space-2); min-height: var(--control-touch); gap: var(--space-2); }
      .app-nav .sidebar-icon, #color-theme { width: var(--control-touch); min-width: var(--control-touch); height: var(--control-touch); min-height: var(--control-touch); }
      .nav-item svg { width: 16px; height: 16px; }
      #open-search kbd { display: none; }
      .document-status { padding-inline: var(--space-4); flex-wrap: wrap; }
      .note-column { padding: var(--space-8) var(--space-6) max(120px, 25vh); }
      #note-editor { font-size: 18px; }
      #format-controls { gap: var(--space-0-5); margin-bottom: var(--space-5); }
      #format-controls #insert-reference { margin-left: 0; }
      .save-state { font-size: var(--text-caption); }
      #note-search { margin-top: var(--space-4); max-height: calc(100dvh - 32px); }
    }
`;

export const notesMarkup = String.raw`
<nav id="app-sidebar" class="app-nav" aria-label="Main navigation">
  <div class="nav-brand"><a id="home-link" class="quiet-button home-link" href="/" aria-label="Home">jumpyBrain <small>(beta)</small></a></div>
  <div class="nav-tools" role="group" aria-label="Note actions">
    <a id="notes-link" class="quiet-button nav-item sidebar-icon" href="/" aria-label="Home" title="Home">${browserIcons.home}</a>
    <button id="new-note" type="button" class="quiet-button nav-item sidebar-icon" aria-label="New note" title="New note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9M10 14l1-4 8-8 3 3-8 8-4 1Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="open-search" type="button" class="quiet-button nav-item sidebar-icon" aria-label="Search notes" title="Search notes"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
  </div>
  <div class="nav-library" aria-label="Your pages">
    <ul id="sidebar-pinned" aria-label="Pinned pages"></ul>
    <ul id="sidebar-recent" aria-label="Notes needing attention"></ul>
    <p id="sidebar-recent-empty" class="sidebar-empty" role="status"></p>
  </div>
  <div class="nav-preferences">
    <a id="graph-link" class="quiet-button nav-item sidebar-icon" href="/graph" aria-label="Graph" title="Graph">${browserIcons.graph}</a>
    <button id="open-connection" class="quiet-button nav-item sidebar-icon" aria-label="Connect · Connection settings" title="Connection settings" aria-haspopup="dialog">${browserIcons.settings}<span class="connection-dot" aria-hidden="true"></span></button>
    <button id="open-feedback" class="quiet-button nav-item sidebar-icon" aria-label="Feedback" title="Feedback" aria-haspopup="dialog" aria-controls="feedback-dialog">${browserIcons.feedback}</button>
    <div class="nav-utilities" role="group" aria-label="App utilities"><div class="nav-appearance">${themeMarkup}</div></div>
  </div>
</nav>
<div class="app-workspace">
<div class="workspace-toolbar">
<button id="toggle-sidebar" class="quiet-button" type="button" aria-controls="app-sidebar" aria-expanded="true" aria-label="Collapse sidebar" title="Collapse sidebar"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.6"/></svg></button>
<div class="document-status" role="group" aria-label="Save status">
  <span id="note-save-state" data-testid="graph-note-save-state" class="save-state" role="status" aria-live="polite" hidden></span>
  <span id="note-external-state" role="status" aria-live="polite" hidden></span>
  <button id="note-retry" data-testid="graph-note-retry" class="quiet-button" hidden>Retry save</button>
  <button id="note-recover" class="quiet-button" hidden>Recover draft</button>
</div>
<span class="workspace-brand" role="img" aria-label="jumpyBrain" title="jumpyBrain">${brainOutlineSvg}</span>
</div>
${noteAttentionMarkup}
<div id="app-toast" hidden><span id="toast-message" role="status" aria-live="polite" aria-atomic="true"></span><button id="toast-action" class="quiet-button" type="button" hidden></button><button id="toast-close" class="quiet-button note-icon" type="button" aria-label="Dismiss notification" title="Dismiss notification"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
<p id="capture-message" class="capture-feedback" role="status" aria-live="polite" hidden></p>
<dialog id="note-search" aria-label="Search notes">
  <div class="dialog-head">
    <input id="note-search-input" aria-label="Search titles and contents" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" autocomplete="off" placeholder="Search your memory…" />
    <button id="close-search" class="quiet-button note-icon" aria-label="Close search" title="Close search (Esc)">${browserIcons.close}</button>
  </div>
  <ul id="search-results" role="listbox" aria-label="Matching notes"></ul>
  <div class="search-footer">
    <p id="search-message" role="status" aria-live="polite">Search titles and contents.</p>
    <p id="reference-help" hidden>Insert a literal [[Page Title]] reference, not a unique-ID link. Duplicate titles are ambiguous. Exact page titles are shared with the map; legacy paths remain supported there.</p>
    <p id="search-freshness" hidden>Recent saves from this tab are included. Other edits may need an index refresh.</p>
    <button id="search-refresh-index" class="quiet-button" hidden>Refresh search index</button>
    <button id="search-retry" class="quiet-button" hidden>Retry search</button>
    <button id="search-connect" class="quiet-button" hidden>Connect</button>
  </div>
</dialog>
<dialog id="connection" aria-labelledby="connection-title">
  <form id="connection-form">
    <h2 id="connection-title">Connect to your memory</h2>
    <p>Use the access key for this server. It stays in this browser; only enter it on a server you trust.</p>
    <label>Access key<input id="api-key" data-testid="api-key" type="password" autocomplete="off" /></label>
    <button id="toggle-api-key" class="quiet-button" type="button" aria-controls="api-key" aria-pressed="false">Show key</button>
    <p id="connection-message" role="status" aria-live="polite"></p>
    <div class="connection-actions">
      <button id="connection-submit" class="button button-primary" type="submit">Connect</button>
      <button id="disconnect" class="quiet-button" type="button" hidden>Disconnect</button>
      <button id="close-connection" class="quiet-button" type="button">Cancel</button>
    </div>
    <p class="app-version" data-app-version></p>
  </form>
</dialog>
`;

export const documentActionsMarkup = String.raw`
<dialog id="document-recovery" class="document-dialog" aria-labelledby="recovery-title">
  <h2 id="recovery-title">Recover your draft</h2>
  <p>Your draft is safe in this tab. Copy it before discarding. A stale save cannot be fixed by retrying the same version.</p>
  <label>Your draft<textarea id="recovery-draft" readonly></textarea></label>
  <label>Current saved note<textarea id="recovery-saved" readonly></textarea></label>
  <p id="recovery-message" role="status" aria-live="polite"></p>
  <div class="dialog-actions"><button id="recovery-copy" class="quiet-button">Copy draft</button><button id="recovery-reload" class="quiet-button">Discard draft and load saved note</button><button id="recovery-close" class="quiet-button">Keep editing</button></div>
</dialog>
<dialog id="document-delete" class="document-dialog" aria-labelledby="delete-title">
  <h2 id="delete-title">Permanently delete note?</h2>
  <p id="delete-note-title"></p>
  <p>This permanently removes the note. There is no Trash or Undo; recovery requires your own backup or Git history. Other notes and their links will stay unchanged.</p>
  <p id="delete-references"></p>
  <p id="delete-message" role="status" aria-live="polite"></p>
  <div class="dialog-actions"><button id="delete-cancel" class="quiet-button">Cancel</button><button id="delete-confirm" class="quiet-button" disabled>Permanently delete note</button></div>
</dialog>
`;

export const notesViews = String.raw`
  <section id="home" class="home" aria-label="Your jumpyBrain">
    <div class="home-actions">
      <h1>What's on your mind?</h1>
      <button id="home-new" class="home-action" aria-label="New note">
        <svg class="home-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span class="home-action-label">New note</span><kbd class="new-shortcut" aria-hidden="true"></kbd>
      </button>
      <button id="home-search" class="home-action" aria-label="Search notes">
        <svg class="home-action-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
        <span class="home-action-label">Search your memory</span><kbd class="shortcut" aria-hidden="true"></kbd>
      </button>
    </div>
    <section class="recent-notes" aria-labelledby="recent-title">
      <div class="recent-heading"><h2 id="recent-title">Recent activity</h2><button id="recent-refresh" class="quiet-button note-icon" aria-label="Refresh recent activity" title="Refresh recent activity">${browserIcons.refresh}</button></div>
      <ul id="recent-list" aria-label="Recent activity"></ul>
      <p id="recent-message" role="status" aria-live="polite"></p>
      <button id="recent-retry" class="quiet-button" hidden>Retry</button>
      <button id="recent-connect" class="quiet-button" hidden>Connect</button>
    </section>
  </section>
  <section id="note-panel" data-testid="graph-note-panel" aria-label="Note editor" hidden>
    <div class="note-column">
      <h1 id="note-title" data-testid="graph-note-title" tabindex="-1"></h1>
      <textarea id="note-name" aria-label="Page name" aria-describedby="note-save-error" aria-multiline="false" rows="1" autocomplete="off" hidden></textarea>
      <p id="note-save-error" role="status" aria-live="polite" hidden></p>
      <div class="note-actions"><button id="copy-note-draft" class="quiet-button note-icon" type="button" aria-label="Copy draft" title="Copy draft" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.6"/></svg></button><button id="delete-note" class="quiet-button note-icon" type="button" aria-label="Delete note" title="Delete note…" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
      <div id="reference-creation-status" hidden>
        <p role="status" aria-live="polite">A linked page could not be created. Your source note is retained. Retry page creation before leaving this note.</p>
        <button id="reference-creation-retry" class="quiet-button">Retry page creation</button>
      </div>
      <p id="note-message" role="status" hidden></p>
      <button id="note-load-retry" class="quiet-button" hidden>Retry loading</button>
      <div id="format-controls" role="group" aria-label="Text formatting" hidden>
        <button class="quiet-button" data-format="paragraph" aria-label="Normal text">Text</button>
        <button class="quiet-button" data-format="h1" aria-label="Heading">H1</button>
        <button class="quiet-button" data-format="h2" aria-label="Subheading">H2</button>
        <button class="quiet-button" data-format="h3" aria-label="Small heading">H3</button>
        <button class="quiet-button" data-format="bold" aria-label="Bold"><strong>B</strong></button>
        <button class="quiet-button" data-format="italic" aria-label="Italic"><em>I</em></button>
        <button id="insert-reference" class="quiet-button note-icon" type="button" aria-label="Insert page reference" title="Insert page reference" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      </div>
      <div id="note-editor" data-testid="graph-note-editor" role="textbox" aria-multiline="true" aria-label="Markdown note body" spellcheck="true" hidden></div>
      <details id="living-sources" class="note-frontmatter" hidden>
        <summary>Sources · version checks</summary>
        <p>Follow evidence beside each claim. Latest substantive change and open questions remain in the page above.</p>
        <button id="check-living-sources" class="quiet-button" type="button">Check source versions</button>
        <p id="living-sources-status" role="status" aria-live="polite"></p>
        <ul id="living-sources-list"></ul>
      </details>
      <details id="note-metadata" class="note-frontmatter" hidden>
        <summary>Metadata · read only</summary>
        <p id="note-file"></p>
        <pre id="note-frontmatter"></pre>
      </details>
    </div>
  </section>
`;

export const notesScript = String.raw`
// Recent notes come from fresh Markdown metadata, not the search index.
function createRecentNotes(options) {
  let generation = 0;
  let request = null;
  function cancel() {
    generation++;
    if (request) request.abort();
    request = null;
  }
  async function load() {
    cancel();
    const token = generation;
    request = options.abortController();
    options.onChange({ status: "loading", notes: [] });
    try {
      const packet = await options.fetch(request.signal);
      if (token !== generation) return;
      if (!Array.isArray(packet?.notes)) throw new Error("Invalid recent notes response");
      options.onChange({ status: "ready", notes: packet.notes.filter((note) => isValidMemoryDocumentId(note?.id)).slice(0, 8) });
    } catch (error) {
      if (token !== generation) return;
      options.onChange({ status: error.status === 401 ? "auth" : "error", notes: [] });
    } finally {
      if (token === generation) request = null;
    }
  }
  return { load, cancel };
}

function renderRecentNotes(recent) {
  const list = $("recent-list");
  list.replaceChildren();
  list.setAttribute("aria-busy", String(recent.status === "loading"));
  for (const note of recent.notes) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.className = "recent-link";
    link.href = typeof companionMode !== "undefined" && companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(note.id)) : "/?note=" + encodeURIComponent(note.id);
    const title = document.createElement("span");
    title.textContent = note.title || note.file || "Untitled";
    link.title = title.textContent + (note.file ? " · " + note.file : "");
    link.append(title);
    const date = note.updatedAt || note.createdAt;
    const dated = date && Number.isFinite(Date.parse(date));
    const time = document.createElement(dated ? "time" : "span");
    time.className = "recent-date";
    if (dated) {
      time.dateTime = date;
      // Date-only metadata must not shift a day in the browser's timezone.
      const value = new Date(date.length === 10 ? date + "T12:00:00" : date);
      const label = note.updatedAt ? "Updated " : "Created ";
      time.textContent = label + value.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(value.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
      time.title = label + (date.length === 10 ? value.toLocaleDateString() : value.toLocaleString());
    } else time.textContent = "Date unknown";
    link.append(time);
    link.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigation.navigate("/?note=" + encodeURIComponent(note.id));
    });
    item.append(link);
    list.append(item);
  }
  $("recent-message").textContent = recent.status === "loading" ? "Loading recent activity…"
    : recent.status === "auth" ? "Connect to see recent activity."
    : recent.status === "error" ? "Could not load recent activity."
    : recent.notes.length ? "" : "No notes yet. Create your first note above.";
  $("recent-message").hidden = recent.status === "ready" && recent.notes.length > 0;
  $("recent-retry").hidden = recent.status !== "error";
  $("recent-connect").hidden = recent.status !== "auth";
  $("recent-refresh").hidden = recent.status === "auth";
  $("recent-refresh").disabled = recent.status === "loading";
}

// Search and navigation controllers have injected effects for deterministic tests.
function normalizeNoteResults(results, limit = 12) {
  const seen = new Set();
  const normalized = (Array.isArray(results) ? results : []).flatMap((hit) => {
    const metadata = hit.provenance?.metadata || {};
    const documentId = isValidMemoryDocumentId(metadata.id) ? metadata.id : null;
    const file = String(hit.provenance?.file || "");
    const key = documentId || file || String(hit.id);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ documentId, file, title: String(metadata.title || file.split("/").pop() || "Untitled"), referenceTitle: typeof metadata.title === "string" ? metadata.title : null, snippet: String(hit.snippet || "") }];
  });
  // Prefer usable notes without hiding unavailable legacy documents altogether.
  return [...normalized.filter((result) => result.documentId), ...normalized.filter((result) => !result.documentId)].slice(0, limit);
}

function createNoteSearch(options) {
  const search = { query: "", status: "idle", results: [], selected: -1, stale: false, message: "Search titles and contents." };
  let generation = 0;
  let timer = null;
  let request = null;
  let localStale = false;
  let writeRevision = 0;
  function markStale() {
    writeRevision++;
    localStale = true;
    search.stale = true;
    options.onChange(search);
  }
  function cancel() {
    generation++;
    if (timer !== null) options.clearTimer(timer);
    timer = null;
    if (request) request.abort();
    request = null;
  }
  function query(value, immediate) {
    cancel();
    const token = generation;
    search.query = value.trim();
    search.feedback = "";
    const selectedId = search.results[search.selected]?.documentId;
    search.results = options.retainResultsWhileLoading && search.query
      ? search.results.filter((result) => result.title.toLocaleLowerCase().includes(search.query.toLocaleLowerCase())) : [];
    search.selected = search.results.findIndex((result) => result.documentId === selectedId);
    if (search.selected < 0) search.selected = search.results.findIndex((result) => result.documentId);
    search.stale = localStale;
    search.status = search.query ? "loading" : "idle";
    search.message = search.query ? "Searching…" : "Search titles and contents.";
    options.onChange(search);
    if (!search.query) return;
    const run = async () => {
      timer = null;
      request = options.abortController();
      const requestedWriteRevision = writeRevision;
      try {
        const payload = await options.fetch(search.query, request.signal);
        if (token !== generation) return;
        search.results = normalizeNoteResults(payload?.results);
        search.selected = search.results.findIndex((result) => result.documentId);
        if (requestedWriteRevision === writeRevision && typeof payload?.index?.stale === "boolean") localStale = payload.index.stale;
        search.stale = Boolean(payload?.index?.stale) || localStale;
        search.status = "ready";
        search.message = search.selected >= 0 ? "↑ ↓ to choose · Enter to open"
          : search.results.length ? "These notes need memory IDs before they can be opened. Ask the server operator."
          : search.stale ? "No indexed matches yet. Refresh the index to include recent edits." : "No notes found. Try another word.";
        if (payload?.localOnly) search.message = "Showing matching saves from this tab. Server search is unavailable.";
      } catch (error) {
        if (token !== generation) return;
        search.status = Number(error.status) === 401 || Number(error.status) === 403 ? "auth" : "error";
        search.message = search.status === "auth" ? "Connect with an access key to search your memory."
          : Number(error.status) === 500 ? "Search is unavailable. The server may need its index built. Retry or ask the server operator."
          : "Search failed. Check your connection and retry.";
      }
      if (token === generation) { request = null; options.onChange(search); }
    };
    if (immediate) run();
    else timer = options.setTimer(run, 180);
  }
  function move(delta) {
    const available = search.results.map((result, index) => result.documentId ? index : -1).filter((index) => index >= 0);
    if (!available.length) return;
    const position = available.indexOf(search.selected);
    search.selected = available[(position + delta + available.length) % available.length];
    search.feedback = "";
    options.onChange(search);
  }
  return { state: search, query, cancel, move, markStale };
}

// Undo a history traversal before flushing a draft, then replay it only on success.
// This preserves both history entries on failed saves instead of replacing the target URL.
function createPageNavigation(options) {
  let current = options.initial;
  let position = current.index;
  let busy = false;
  let restoring = null;
  let committing = null;
  function restore() {
    if (position === current.index && !restoring) return Promise.resolve();
    if (!restoring) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      restoring = { resolve, promise };
      options.go(current.index - position);
    }
    return restoring.promise;
  }
  async function navigate(destination) {
    if (busy || options.blocked?.()) return false;
    if (typeof destination !== "function" && (options.scope ? options.scope(destination) : destination) === current.url) return false;
    busy = true;
    let applied = false;
    try {
      const allowed = await options.beforeLeave();
      await restore();
      if (!allowed) return false;
      // Creation runs only after saving the current draft, under the same history lock.
      const destinationUrl = typeof destination === "function" ? await destination() : destination;
      const url = options.scope ? options.scope(destinationUrl) : destinationUrl;
      await restore();
      // A resolved self-reference still applies its validated payload, without a new entry.
      if (url === current.url) { options.show(url); applied = true; return true; }
      current = { url, index: current.index + 1 };
      position = current.index;
      options.push(current);
      options.show(url);
      applied = true;
      return true;
    } finally {
      // A rejected create may race Back/Forward too: restore before unlocking editing.
      await restore();
      busy = false;
      if (!applied && options.resume) options.resume();
    }
  }
  async function pop(entry) {
    position = entry.index;
    if (restoring) {
      if (position === current.index) {
        const done = restoring.resolve;
        restoring = null;
        done();
      } else options.go(current.index - position);
      return;
    }
    if (committing) {
      // If another traversal races the replay, honor the actual entry, after the same save guard.
      current = entry;
      committing = null;
      busy = false;
      options.show(entry.url);
      return;
    }
    if (busy) { await restore(); return; }
    busy = true;
    await restore();
    const allowed = await options.beforeLeave();
    await restore();
    if (!allowed) { busy = false; return; }
    committing = entry;
    options.go(entry.index - current.index);
  }
  return { navigate, pop, back() { if (!busy && !options.blocked?.()) options.go(-1); },
    isBusy: () => busy, reset(entry) { current = entry; position = entry.index; } };
}

function datedNoteDraft(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const day = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  return { type: "note", dailyDate: day, body: "" };
}

// Keep the exact request/key after a lost response; retry must not create another note.
function createNoteCapture(options) {
  let attempt = null;
  let pending = null;
  function create() {
    if (pending) return pending;
    if (!attempt) attempt = { key: options.key(), draft: datedNoteDraft(options.now()), result: null };
    if (attempt.result) return Promise.resolve(attempt.result);
    pending = (async () => {
      const result = await options.write(attempt.draft, attempt.key);
      if (!isValidMemoryDocumentId(result?.id)) throw new Error("Invalid note creation response.");
      attempt.result = result;
      return result;
    })().finally(() => { pending = null; });
    return pending;
  }
  return { create, complete() { attempt = null; }, hasPending: () => Boolean(attempt), isInFlight: () => Boolean(pending) };
}

function pageReferenceError(result, results) {
  const reason = referenceEligibility(result, results);
  if (reason === "unsafe_title" || reason === "missing_id") {
    return "This note has no safe exact page title for [[references]]. Choose another note.";
  }
  if (reason === "visible_duplicate") {
    return "Several results share this title. A title-only reference cannot distinguish them; choose another title.";
  }
  return "";
}

const searchDialog = $("note-search");
const connectionDialog = $("connection");
function wrapDialogFocus(event) {
  if (event.key !== "Tab") return;
  const dialog = event.currentTarget;
  const controls = [...dialog.querySelectorAll("button, input, textarea, a[href], [tabindex]")]
    .filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
  const first = controls[0], last = controls[controls.length - 1];
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
for (const dialog of [searchDialog, connectionDialog, dreamDialog, $("feedback-dialog")]) dialog.addEventListener("keydown", wrapDialogFocus);
let searchOrigin = null;
let searchSelection = null;
let searchDocument = null;
let referenceSelection = null;
let searchMode = "navigate";
let selectingResult = false;
let reopenSearch = false;
const appleKeyboard = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const shortcut = appleKeyboard ? "⌘K" : "Ctrl+K";
const newShortcut = appleKeyboard ? "⌘Enter" : "Ctrl+Enter";
for (const element of document.querySelectorAll(".shortcut")) element.textContent = shortcut;
for (const element of document.querySelectorAll(".new-shortcut")) element.textContent = newShortcut;
for (const id of ["home-new", "new-note"]) {
  $(id).setAttribute("aria-keyshortcuts", appleKeyboard ? "Meta+Enter" : "Control+Enter");
  $(id).title = "New note · " + newShortcut;
}
for (const id of ["home-search", "open-search"]) {
  $(id).setAttribute("aria-keyshortcuts", appleKeyboard ? "Meta+K" : "Control+K");
  $(id).title = "Search notes · " + shortcut;
}
const noteSearch = createNoteSearch({
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timer) => window.clearTimeout(timer),
  abortController: () => new AbortController(),
  fetch: searchMemoryNotes,
  onChange: renderNoteSearch,
});

const referenceAutocomplete = window.installReferenceAutocomplete($("note-editor"), richEditor, {
  createSearch: createNoteSearch,
  fetch: searchMemoryNotes,
  getSession: () => state.noteToken + ":" + credentialRevision,
  isEnabled: () => !(typeof companionMode !== "undefined" && companionMode && companionReadOnly()) && state.view === "note" && state.editor?.state.loaded && !state.editor.state.navigationPending
    && !searchDialog.open && !connectionDialog.open && !dreamDialog.open && !feedback.isOpen() && !documentActions.isOpen(),
  onError: () => referenceMessage("Could not insert this reference. Keep editing or use Insert page reference.", true),
});
let referenceRequest = null;
let stagedReferenceNote = null;
const referenceCreation = JumpyBrainBrowser.createReferenceCreation({
  getSession: () => String(state.noteToken) + ":" + credentialRevision + ":" + (companionMode ? String(companionState?.generation) : ""),
  // A preparing switch may drain already saved work against its old target.
  isEnabled: () => companionMode && companionRegistered && !companionSessionFailed
    && companionState?.active?.allowWrites === true && Boolean(state.editor?.state.loaded),
  ensure: (title, signal) => graphJson("/memories/all/ensure-title", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }), signal,
  }),
  onCreated: () => referenceTargetCreated(),
  onChange: (creation) => {
    $("reference-creation-status").hidden = creation.errors.length === 0;
    if (creation.errors.length) $("reference-creation-status").querySelector("p").textContent = creation.errors[0].message + " Your source note is retained. Retry page creation or edit the reference before leaving this note.";
    $("reference-creation-retry").disabled = creation.busy || (companionMode && companionReadOnly());
  },
});
$("reference-creation-retry").addEventListener("click", () => {
  if (companionMode && !companionReadOnly()) referenceCreation.retry();
});
function referenceTargetCreated() {
  state.graph = null;
  noteSearch.markStale(); referenceAutocomplete.markStale();
  sidebarPages.reloadAttention();
}
function referenceMessage(text, error = false) {
  if (text) toast.show("reference", text, { error });
  else toast.clear("reference");
}

function cancelReferenceInteraction() {
  referenceAutocomplete.dismiss();
  if (referenceRequest) referenceRequest.abort();
  referenceRequest = null;
  stagedReferenceNote = null;
  referenceMessage("");
}
async function activatePageReference(title) {
  if (typeof companionMode !== "undefined" && companionMode && companionFrozen) return;
  const origin = state.editor, revision = credentialRevision;
  if (referenceRequest || !origin?.state.loaded || origin.state.navigationPending
      || searchDialog.open || connectionDialog.open || dreamDialog.open) return;
  referenceAutocomplete.dismiss();
  const request = new AbortController();
  referenceRequest = request;
  const current = () => referenceRequest === request && !request.signal.aborted
    && state.editor === origin && credentialRevision === revision;
  referenceMessage("Opening page reference…");
  try {
    const opened = await navigation.navigate(async () => {
      // Save first, then resolve freshly (including an unindexed rename of this note).
      if (!current()) throw new Error("cancelled");
      let result = await graphJson("/memories/all/resolve-title", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }), signal: request.signal,
      });
      if (!current()) throw new Error("cancelled");
      if (result?.status === "missing" && typeof companionMode !== "undefined" && companionMode && !companionReadOnly()) {
        result = await graphJson("/memories/all/ensure-title", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }), signal: request.signal,
        });
        if (!current()) throw new Error("cancelled");
        if (result?.created) referenceTargetCreated();
      }
      if (result?.status !== "found" || !isValidMemoryDocumentId(result.id)) {
        const error = new Error("reference_unavailable");
        error.outcome = result?.status;
        throw error;
      }
      // A missing/deleted/unreadable target must not replace the current editor.
      // Reuse this confirmed payload on route apply: no second vulnerable GET.
      const payload = await readGraphDocument(result.id, { signal: request.signal });
      if (!current()) throw new Error("cancelled");
      if (typeof payload?.content !== "string" || typeof payload?.contentHash !== "string"
          || payload.frontmatter?.id !== result.id || typeof payload.title !== "string"
          || payload.title.normalize("NFKC").trim().toLowerCase().normalize("NFC") !== title.normalize("NFKC").trim().toLowerCase().normalize("NFC")) {
        throw new Error("reference_changed");
      }
      stagedReferenceNote = { id: result.id, payload, revision };
      return "/?note=" + encodeURIComponent(result.id);
    });
    if (!opened && current()) referenceMessage("Save failed or navigation is busy. Retry saving your current note, then open the reference again.", true);
  } catch (error) {
    if (!current()) return;
    referenceMessage(Number(error.status) === 401 || Number(error.status) === 403
      ? "Connect with an access key to open this reference. Your draft is retained."
      : error.outcome === "missing" ? (typeof companionMode !== "undefined" && companionMode && companionReadOnly()
        ? "No page has this title. This brain is read only; creating a page requires editing permission. Your draft is retained."
        : "No page has this title. Your draft is retained.")
      : error.outcome === "ambiguous" ? "Several pages share this title. Your draft is retained."
      : "This reference could not be opened. It may have changed or be unavailable. Your draft is retained.", true);
  } finally {
    if (referenceRequest === request) referenceRequest = null;
  }
}

const recentNotes = createRecentNotes({
  abortController: () => new AbortController(),
  fetch: (signal) => graphJson("/memories/all/recent", { signal }),
  onChange: renderRecentNotes,
});
$("recent-retry").addEventListener("click", () => recentNotes.load());
$("recent-refresh").addEventListener("click", () => recentNotes.load());
$("recent-connect").addEventListener("click", () => openConnection(false));

function openSearch(mode = "navigate", range = null) {
  if (typeof companionMode !== "undefined" && companionMode && companionFrozen) return;
  if (searchDialog.open || connectionDialog.open || dreamDialog.open || feedback.isOpen()) return;
  cancelReferenceInteraction();
  searchMode = mode === "insert" ? "insert" : "navigate";
  referenceSelection = range;
  $("reference-help").hidden = searchMode !== "insert";
  searchDialog.setAttribute("aria-label", searchMode === "insert" ? "Insert page reference" : "Search notes");
  searchOrigin = document.activeElement;
  searchDocument = state.editor;
  const editor = $("note-editor");
  searchSelection = { selection: richEditor.captureSelection(), scroll: $("note-panel").scrollTop };
  if (searchMode === "insert") {
    searchOrigin = editor;
    $("note-search-input").value = range.query;
  }
  searchDialog.showModal();
  if (typeof searchMaintenance !== "undefined") searchMaintenance?.check();
  $("note-search-input").focus();
  $("note-search-input").select();
  noteSearch.query($("note-search-input").value);
}

function closeSearch(restoreFocus = true) {
  noteSearch.cancel();
  searchDialog.close();
  if (typeof searchMaintenance !== "undefined") searchMaintenance?.check();
  if (!restoreFocus) return;
  if (searchOrigin?.isConnected && !searchOrigin.closest("[hidden]")) searchOrigin.focus({ preventScroll: true });
  if (searchOrigin === $("note-editor") && searchDocument === state.editor && searchSelection) {
    richEditor.restoreSelection(searchSelection.selection);
    $("note-panel").scrollTop = searchSelection.scroll;
  }
}

function renderNoteSearch(search) {
  const list = $("search-results");
  // A save can update freshness between pointerdown and pointerup. Keep the
  // actual click targets mounted unless the result collection changes.
  if (list.noteResults !== search.results) {
    list.noteResults = search.results;
    list.noteSelected = null;
    list.replaceChildren();
    search.results.forEach((result, index) => {
      const item = document.createElement("li");
      item.id = "search-result-" + index;
      item.className = "search-result";
      item.setAttribute("role", "option");
      item.setAttribute("aria-disabled", String(!result.documentId));
      const title = document.createElement("strong"); title.textContent = result.title;
      const snippet = document.createElement("span"); snippet.textContent = result.snippet;
      const context = document.createElement("small"); context.textContent = result.file + (result.documentId ? "" : " · Unavailable: missing memory ID");
      item.append(title, snippet, context);
      item.addEventListener("click", () => chooseSearchResult(result));
      list.append(item);
    });
  }
  [...list.children].forEach((item, index) => item.setAttribute("aria-selected", String(index === search.selected)));
  $("note-search-input").removeAttribute("aria-activedescendant");
  if (search.selected >= 0) {
    const id = "search-result-" + search.selected;
    $("note-search-input").setAttribute("aria-activedescendant", id);
    if (list.noteSelected !== search.selected) $(id).scrollIntoView({ block: "nearest" });
  }
  list.noteSelected = search.selected;
  $("search-message").textContent = search.feedback || (searchMode === "insert" && search.status === "ready" && search.selected >= 0
    ? "↑ ↓ to choose · Enter to insert reference" : search.message);
  $("search-results").setAttribute("aria-busy", String(search.status === "loading"));
  $("search-freshness").hidden = !search.stale;
  $("search-refresh-index").hidden = !search.stale;
  $("search-refresh-index").disabled = searchIndexRefreshing || (typeof companionMode !== "undefined" && companionMode && companionReadOnly());
  $("search-retry").hidden = search.status !== "error";
  $("search-connect").hidden = search.status !== "auth";
}

async function chooseSearchResult(result) {
  if (!result?.documentId || selectingResult) return;
  if (searchMode === "insert") { insertPageReference(result); return; }
  const destination = "/?note=" + encodeURIComponent(result.documentId);
  const url = typeof companionMode !== "undefined" && companionMode ? companionScopeUrl(destination) : destination;
  if (url === shellUrl()) { closeSearch(); return; }
  selectingResult = true;
  noteSearch.cancel();
  $("search-message").textContent = "Opening note…";
  try {
    // showPage closes the dialog only after the save guard approves navigation.
    // A rejected navigation must explain why instead of swallowing the click.
    if (!await navigation.navigate(url)) {
      $("search-message").textContent = state.editor?.state.saveStatus === "failed"
        ? "Save failed. Close search and retry saving your current note before opening another."
        : "Navigation is busy. Try opening the note again.";
    }
  } catch {
    $("search-message").textContent = "Could not open this note. Please try again.";
  } finally { selectingResult = false; }
}

$("open-search").addEventListener("click", openSearch);
$("home-search").addEventListener("click", openSearch);
$("close-search").addEventListener("click", () => closeSearch());
searchDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSearch(); });
searchDialog.addEventListener("click", (event) => { if (event.target === searchDialog) closeSearch(); });
$("note-search-input").addEventListener("input", (event) => { if (!event.isComposing) noteSearch.query(event.target.value); });
$("note-search-input").addEventListener("compositionend", (event) => noteSearch.query(event.target.value));
$("note-search-input").addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); noteSearch.move(event.key === "ArrowDown" ? 1 : -1); }
  if (event.key === "Enter") { event.preventDefault(); chooseSearchResult(noteSearch.state.results[noteSearch.state.selected]); }
});
$("search-retry").addEventListener("click", () => noteSearch.query($("note-search-input").value, true));
function handleNoteShortcut(event) {
  if (feedback.isOpen()) return;
  if (documentActions.isOpen() || documentActions.isBusy()) return;
  if (typeof companionMode !== "undefined" && companionMode && (companionFrozen || state.view === "settings")) return;
  if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === "k") {
    if (connectionDialog.open || dreamDialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) { if (searchDialog.open) closeSearch(); else openSearch(); }
  } else if (event.key === "Enter") {
    if (searchDialog.open || connectionDialog.open || dreamDialog.open || feedback.isOpen()) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) newNote();
  }
}
// Capture before Lexical consumes Enter: creating a note must not insert a paragraph.
document.addEventListener("keydown", handleNoteShortcut, true);

function renderConnection() {
  if (typeof companionMode !== "undefined" && companionMode) { renderCompanionConnection(); return; }
  const connected = connectionStatus === "connected";
  const label = connected ? "Connected" : connectionStatus === "checking" ? "Connecting…" : "Connect";
  const button = $("open-connection");
  button.title = label + " · Connection settings";
  button.dataset.state = connectionStatus;
  button.setAttribute("aria-label", label + " · Connection settings");
  $("connection-title").textContent = connected ? "Connection settings" : "Connect to your memory";
  $("connection-submit").textContent = connected ? "Update key" : "Connect";
  $("disconnect").hidden = !activeApiKey;
  $("connection-message").textContent = connected ? "Connected to this server."
    : connectionStatus === "checking" ? "Checking your connection…"
    : connectionStatus === "unavailable" ? "Could not reach the server. Retry connecting."
    : activeApiKey ? "The access key was not accepted. Update it to reconnect." : "Not connected.";
}
function maskApiKey() {
  apiKeyInput.type = "password";
  $("toggle-api-key").textContent = "Show key";
  $("toggle-api-key").setAttribute("aria-pressed", "false");
}
function openConnection(fromSearch) {
  if (typeof companionMode !== "undefined" && companionMode) {
    if (companionSessionFailed && state.editor?.hasPending()) {
      companionMessage("Copy your draft with Recover draft, then reopen the editor from the companion menu. Retry only works with a valid session cookie; do not reload this draft.", true);
      documentActions.openRecovery();
    } else navigation.navigate(companionScopeUrl("/settings"));
    return;
  }
  if (dreamDialog.open || feedback.isOpen()) return;
  cancelReferenceInteraction();
  apiKeyInput.value = activeApiKey;
  maskApiKey();
  renderConnection();
  reopenSearch = fromSearch;
  if (searchDialog.open) closeSearch();
  connectionDialog.showModal();
  apiKeyInput.focus();
}
$("open-connection").addEventListener("click", () => openConnection(false));
$("search-connect").addEventListener("click", () => openConnection(true));
function closeConnection() {
  apiKeyInput.value = activeApiKey;
  maskApiKey();
  connectionDialog.close();
}
$("close-connection").addEventListener("click", closeConnection);
connectionDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeConnection(); });
$("toggle-api-key").addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  $("toggle-api-key").textContent = reveal ? "Hide key" : "Show key";
  $("toggle-api-key").setAttribute("aria-pressed", String(reveal));
});
function setConnectionKey(key) {
  if (typeof companionMode !== "undefined" && companionMode) return;
  referenceCreation.reset();
  cancelReferenceInteraction();
  key = key.trim();
  activeApiKey = key;
  credentialRevision++;
  livingSources.sync();
  recentWrites.reset();
  map.reset();
  sidebarPages.refresh();
  documentActions.close();
  connectionStatus = activeApiKey ? "checking" : "disconnected";
  try {
    if (activeApiKey) localStorage.setItem("jumpybrain.graph.apiKey", activeApiKey);
    else localStorage.removeItem("jumpybrain.graph.apiKey");
  } catch { /* Session-only access still works. */ }
  closeConnection();
  renderConnection();
}
$("connection-form").addEventListener("submit", (event) => {
  event.preventDefault();
  setConnectionKey(apiKeyInput.value);
  if (state.view === "home") recentNotes.load();
  if (reopenSearch) openSearch(searchMode, referenceSelection);
  if (state.view === "note") {
    if (!state.editor?.state.loaded) showNote(new URL(location.href).searchParams.get("note"));
    else graphJson("/memories/all/recent").catch(() => {}); // Verify without replacing an open draft.
  } else if (state.view === "graph") loadGraph();
});
$("disconnect").addEventListener("click", async () => {
  $("disconnect").disabled = true;
  try {
    // Save with the current key before clearing credentials or rendered memory.
    const disconnected = await navigation.navigate(() => {
      setConnectionKey("");
      noteSearch.query("");
      $("note-search-input").value = "";
      state.graphToken++;
      state.graph = null;
      $("viewport").replaceChildren();
      return "/";
    });
    if (!disconnected) $("connection-message").textContent = "Could not disconnect. Save your pending note and try again.";
  } finally { $("disconnect").disabled = false; }
});
renderConnection();

function shellUrl() { return location.pathname + location.search; }
const initialEntry = { url: shellUrl(), index: Number.isSafeInteger(history.state?.jumpyBrainIndex) ? history.state.jumpyBrainIndex : 0 };
history.replaceState({ jumpyBrainIndex: initialEntry.index }, "", initialEntry.url);
const navigation = createPageNavigation({
  initial: initialEntry,
  beforeLeave: () => requestEditorNavigation(() => {}),
  blocked: () => typeof companionMode !== "undefined" && companionMode && companionFrozen,
  scope: (url) => companionMode ? companionScopeUrl(url) : url,
  resume: () => state.editor?.setNavigationPending(false),
  go: (delta) => history.go(delta),
  push: (entry) => history.pushState({ jumpyBrainIndex: entry.index }, "", entry.url),
  show: showPage,
});
let documentActions;
const livingSources = JumpyBrainBrowser.installLivingSources({
  document, editor: () => state.editor,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  enabled: () => Boolean(activeApiKey) && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  json: (url, options) => graphJson(url, options),
  navigate: (id) => navigation.navigate("/?note=" + encodeURIComponent(id)),
});
const sidebarPages = JumpyBrainBrowser.installPageNavigation({
  document, window,
  scope: () => {
    if (!companionMode) return activeApiKey ? "hosted" : null;
    const active = companionState?.active;
    return companionRegistered && active && companionState.activeId
      ? "brain:" + JSON.stringify([companionState.activeId, active.kind, active.root || active.url]) : null;
  },
  href: (id) => companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(id)) : "/?note=" + encodeURIComponent(id),
  navigate: (url) => { navigation.navigate(url); },
  attentionScope: () => activeApiKey ? String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted") : null,
  enabled: () => state.view !== "settings" && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  writable: () => Boolean(activeApiKey) && !(companionMode && companionReadOnly()) && !documentActions?.isBusy(),
  fetchAttention: (signal) => graphJson("/memories/all/attention", { signal }),
  onAttentionUpdated: () => noteAttention.sync(),
  onAction: (action, page, anchor) => noteAttention.act(action, page, anchor),
});
window.addEventListener("popstate", (event) => {
  feedback.close(false);
  cancelReferenceInteraction();
  if (dreamDialog.open) closeDreamHandoff(false);
  if (searchDialog.open) closeSearch();
  if (connectionDialog.open) closeConnection();
  navigation.pop({ url: shellUrl(), index: Number.isSafeInteger(event.state?.jumpyBrainIndex) ? event.state.jumpyBrainIndex : 0 });
});
for (const [id, url] of [["home-link", "/"], ["notes-link", "/"], ["graph-link", "/graph"]]) {
  $(id).addEventListener("click", (event) => {
    // Native new-tab navigation does not abandon the current draft.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigation.navigate(url);
  });
}

function showPage(url) {
  feedback.close(false);
  if (typeof companionMode !== "undefined" && companionMode && !companionRegistered) return;
  if (typeof companionMode !== "undefined" && companionMode) {
    const requested = new URL(url, location.origin);
    if (requested.searchParams.has("note") && requested.searchParams.get("brain") !== companionState.activeId) {
      companionMessage("This note link belongs to another brain. Open a note from this brain instead.", true);
      url = companionScopeUrl("/");
      history.replaceState({ jumpyBrainIndex: initialEntry.index }, "", url);
      navigation.reset({ url, index: initialEntry.index });
    }
  }
  referenceAutocomplete.dismiss();
  referenceMessage("");
  if (dreamDialog.open) closeDreamHandoff(false);
  documentActions.close();
  recentNotes.cancel();
  $("graph-filters").open = false;
  if (searchDialog.open) closeSearch(false);
  if (connectionDialog.open) closeConnection();
  const target = new URL(url, location.origin);
  const documentId = target.searchParams.get("note");
  if (typeof companionMode !== "undefined" && companionMode && state.view === "settings" && !/^\/settings\/?$/.test(target.pathname)) companionClearForm();
  state.view = typeof companionMode !== "undefined" && companionMode && /^\/settings\/?$/.test(target.pathname) ? "settings" : documentId !== null ? "note" : /^\/graph\/?$/.test(target.pathname) ? "graph" : "home";
  sidebarPages.select(documentId);
  document.body.dataset.view = state.view;
  if (typeof searchMaintenance !== "undefined") searchMaintenance?.check();
  if (state.view !== "graph") map.suspend();
  if (typeof companionMode !== "undefined" && companionMode) $("companion-settings").hidden = state.view !== "settings";
  $("home").hidden = state.view !== "home";
  $("note-panel").hidden = state.view !== "note";
  $("note-save-state").hidden = state.view !== "note";
  $("note-external-state").hidden = state.view !== "note";
  for (const [id, current] of [["notes-link", state.view === "home"], ["graph-link", state.view === "graph"], ["open-connection", state.view === "settings"]]) {
    if (current) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  }
  $("error").hidden = true;
  if (state.view === "note") { showNote(documentId, documentId === newNoteId); newNoteId = null; return; }
  referenceCreation.reset();
  state.noteToken++;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  $("note-retry").hidden = true;
  $("note-recover").hidden = true;
  document.title = state.view === "graph" ? "Memory map · jumpyBrain" : "Notes · jumpyBrain";
  if (state.view === "settings") {
    document.title = "Settings · jumpyBrain";
    renderCompanionSettings();
    $("companion-heading").focus();
  } else if (state.view === "graph") {
    if (!map.hasCurrentGraph()) loadGraph(); else queueGraphLayout(0, true);
    $("query").focus({ preventScroll: true });
  } else {
    $("home-new").focus();
    recentNotes.load();
  }
}

async function showNote(documentId, focusEnd = false) {
  if (typeof companionMode !== "undefined" && companionMode && !companionRegistered) return;
  if (typeof companionMode !== "undefined" && companionMode) companionNoteLoading++;
  try {
    referenceCreation.reset();
    const staged = stagedReferenceNote;
    cancelReferenceInteraction();
    const token = ++state.noteToken;
    if (state.editor) state.editor.cancel();
    state.editor = null;
    $("note-title").textContent = "";
    toast.clear("draft");
    $("note-title").hidden = false;
    $("note-name").hidden = true;
    $("note-save-error").hidden = true;
    $("note-editor").hidden = true;
    richEditor.setMarkdown("", true);
    $("format-controls").hidden = true;
    $("living-sources").hidden = true;
    $("living-sources-list").textContent = "";
    $("living-sources-status").textContent = "";
    $("note-metadata").hidden = true;
    $("note-metadata").open = false;
    $("note-retry").hidden = true;
    $("note-recover").hidden = true;
    $("copy-note-draft").hidden = true;
    $("delete-note").hidden = true;
    $("insert-reference").hidden = true;
    $("note-save-state").textContent = "";
    $("note-external-state").textContent = "";
    $("note-load-retry").hidden = true;
    $("note-message").hidden = false;
    $("note-message").dataset.error = "false";
    $("note-message").textContent = "Loading note…";
    $("note-panel").scrollTop = 0;
    document.title = "Note · jumpyBrain";
    if (!isValidMemoryDocumentId(documentId)) { noteLoadError("This note link has an invalid memory ID. Use Search to find a note."); return; }
    const editor = createDocumentEditor({
      generation: token, documentId, debounceMs: 750, persistentEditing: true,
      setTimer: (callback, delay) => window.setTimeout(callback, delay),
      clearTimer: (timer) => window.clearTimeout(timer),
      splitDocument: splitEditableDocument, composeDocument: composeEditableDocument,
      readDocument: readGraphDocument, writeDocument: writeGraphDocument,
      canApplyExternal: () => externalUpdates.canApply(),
      scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
      onExternalUpdate: (body) => {
        // Rebase may retain locally entered links. Keep only that existing
        // intent; never enqueue references supplied by an external snapshot.
        referenceCreation.rebase(editor.state.savedBody, body);
        referenceAutocomplete.dismiss();
        richEditor.setExternalMarkdown(body);
      },
      onSaved: (payload) => {
        sidebarPages.rename({ id: documentId, title: editor.state.savedTitle });
        sidebarPages.reloadAttention();
        recentWrites.remember({ id: documentId, title: editor.state.savedTitle, body: editor.state.savedBody, file: String(payload.file || $("note-file").textContent || "") });
        state.graph = null;
        noteSearch.markStale(); referenceAutocomplete.markStale();
        referenceCreation.saved(editor.state.savedBody, editor.state.draft);
      },
      isCurrent: (generation, id) => state.noteToken === generation && state.editor === editor && editor.state.documentId === id,
      onChange: syncEditorUi,
    });
    state.editor = editor;
    try {
      const payload = staged?.id === documentId && staged.revision === credentialRevision
        ? staged.payload : await readGraphDocument(documentId);
      if (token !== state.noteToken || state.editor !== editor) return;
      if (typeof payload?.content !== "string" || typeof payload?.contentHash !== "string") throw new Error("Invalid document response.");
      $("note-title").textContent = payload.title || payload.file || "Untitled";
      document.title = $("note-title").textContent + " · jumpyBrain";
      $("note-file").textContent = payload.file || "";
      $("note-message").hidden = true;
      editor.hydrate(payload);
      sidebarPages.visit({ id: documentId, title: payload.title || payload.file || "Untitled" });
      if (focusEnd) recentWrites.remember({ id: documentId, title: payload.title || "", body: editor.state.savedBody, file: payload.file || "" });
      editor.setEditing(true);
      if (!searchDialog.open && !connectionDialog.open) richEditor.focus(focusEnd);
    } catch (error) {
      if (token !== state.noteToken || state.editor !== editor) return;
      if (Number(error.status) === 404) sidebarPages.remove(documentId);
      noteLoadError(Number(error.status) === 404 ? "This note is no longer available. Use Search to find another note."
        : Number(error.status) === 401 || Number(error.status) === 403 ? "Connect with an access key to open this note."
        : "Could not load this note. Check your connection and retry.");
      $("note-load-retry").hidden = false;
    }
  } finally { if (typeof companionMode !== "undefined" && companionMode) companionNoteLoading--; }
}
function noteLoadError(message) {
  $("note-message").textContent = message;
  $("note-message").dataset.error = "true";
  $("note-message").hidden = false;
  $("note-title").textContent = "Note unavailable";
}
$("note-load-retry").addEventListener("click", () => showNote(new URL(location.href).searchParams.get("note")));
function sizeNoteName() {
  const field = $("note-name");
  if (field.hidden) return;
  field.style.height = "auto";
  field.style.height = field.scrollHeight + "px";
}
$("note-name").addEventListener("input", () => {
  // Soft wrapping is visual only; keep the previous single-line title contract.
  const field = $("note-name");
  const singleLine = field.value.replace(/[\r\n]/g, "");
  if (field.value !== singleLine) field.value = singleLine;
  sizeNoteName();
  if (!(typeof companionMode !== "undefined" && companionMode && companionReadOnly())) state.editor?.inputTitle(field.value);
});
$("note-name").addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== "Enter") return;
  event.preventDefault();
  if (!$("note-name").readOnly) richEditor.focus();
});
window.addEventListener("resize", sizeNoteName);
$("note-name").addEventListener("blur", () => state.editor?.flush());

function syncEditorUi(editorState) {
  const companionLocked = typeof companionMode !== "undefined" && companionMode && companionReadOnly();
  const needsReview = editorState.saveStatus === "failed" && editorState.saveErrorCode === "precondition_failed";
  if (!state.editor || state.editor.state !== editorState) return;
  noteAttention.sync();
  sidebarPages.sync();
  livingSources.sync();
  if (typeof feedbackDiagnostics !== "undefined") {
    const marker = editorState.saveStatus + ":" + editorState.unconfirmedSave + ":" + editorState.saveErrorCode;
    if (state.lastDiagnosticSave !== marker) {
      state.lastDiagnosticSave = marker;
      if (["saved", "failed"].includes(editorState.saveStatus)) feedbackDiagnostics.event("save", {
        severity: editorState.saveStatus === "failed" ? "warn" : "info",
        outcome: editorState.saveStatus === "saved" ? "ok" : editorState.unconfirmedSave ? "unconfirmed" : "failed",
        code: editorState.saveStatus === "saved" ? "saved" : editorState.saveErrorCode === "precondition_failed" ? "conflict" : editorState.unconfirmedSave ? "unconfirmed" : "error",
      });
    }
  }

  $("note-retry").hidden = editorState.saveStatus !== "failed" || editorState.saveErrorCode === "precondition_failed";
  $("note-recover").hidden = editorState.saveStatus !== "failed" && !(typeof companionMode !== "undefined" && companionMode && companionSessionFailed);
  $("note-recover").disabled = editorState.navigationPending;
  $("note-recover").textContent = editorState.saveErrorCode === "precondition_failed" ? "Review changes" : "Recover draft";
  $("copy-note-draft").hidden = !editorState.loaded;
  $("delete-note").hidden = !editorState.loaded;
  $("delete-note").disabled = editorState.navigationPending || companionLocked;
  $("recovery-reload").disabled = companionLocked || editorState.navigationPending;
  $("note-retry").disabled = editorState.navigationPending;
  $("note-editor").hidden = !editorState.loaded;
  $("note-name").hidden = !editorState.loaded;
  $("note-title").hidden = editorState.loaded;
  $("note-name").readOnly = editorState.navigationPending || companionLocked;
  $("note-name").setAttribute("aria-invalid", String(["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode)));
  $("note-save-error").hidden = editorState.saveStatus !== "failed";
  $("note-save-error").textContent = editorState.saveError || "";
  $("note-save-error").dataset.review = String(needsReview);
  if (editorState.navigationPending || !editorState.loaded) referenceAutocomplete.dismiss();
  richEditor.setReadOnly(editorState.navigationPending || companionLocked);
  $("format-controls").hidden = !editorState.loaded;
  for (const button of $("format-controls").querySelectorAll("button")) button.disabled = editorState.navigationPending || companionLocked;
  $("insert-reference").hidden = !editorState.loaded;
  $("insert-reference").disabled = editorState.navigationPending || companionLocked;
  if (editorState.loaded) {
    if ($("note-name").value !== editorState.title) $("note-name").value = editorState.title;
    sizeNoteName();
    $("note-title").textContent = editorState.title || "Untitled";
    document.title = (editorState.title || "Untitled") + " · jumpyBrain";
    if (richEditor.getMarkdown() !== editorState.draft) {
      referenceCreation.reset();
      richEditor.setMarkdown(editorState.draft);
    }
    $("note-frontmatter").textContent = editorState.frontmatterPrefix;
    $("note-metadata").hidden = false;
  }
  const feedback = editorState.saveStatus === "saving" ? "Saving…"
    : editorState.saveStatus === "failed" ? needsReview ? "Changes need review" : "Save failed"
    : editorState.saveStatus === "saved" ? "Saved" : editorState.dirty ? "Editing…" : "";
  $("note-save-state").textContent = feedback;
  $("note-external-state").textContent = editorState.externalStatus === "pending" ? "Changes available"
    : editorState.externalStatus === "updated" ? "Updated elsewhere" : "";
  $("note-save-state").dataset.state = needsReview ? "review" : editorState.saveStatus;
  $("note-save-state").title = editorState.saveError || "";
  $("note-save-state").setAttribute("aria-label", feedback + (editorState.saveError ? ": " + editorState.saveError : ""));
}

const noteCapture = createNoteCapture({
  now: () => new Date(),
  key: () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  write: (draft, key) => graphJson("/memories/all/notes", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(draft),
  }),
});
let creatingNote = false;
let newNoteId = null;
async function newNote() {
  if (typeof companionMode !== "undefined" && companionMode && companionReadOnly()) return;
  if (creatingNote || documentActions.isOpen() || documentActions.isBusy() || searchDialog.open || connectionDialog.open || dreamDialog.open) return;
  creatingNote = true;
  for (const id of ["new-note", "home-new"]) $(id).disabled = true;
  const message = $("capture-message");
  message.hidden = false;
  message.dataset.error = "false";
  message.textContent = "Creating today's note…";
  try {
    const opened = await navigation.navigate(async () => {
      const result = await noteCapture.create();
      noteSearch.markStale();
      referenceAutocomplete.markStale();
      newNoteId = result.id;
      return "/?note=" + encodeURIComponent(result.id);
    });
    if (!opened) throw new Error("navigation_blocked");
    noteCapture.complete();
    message.hidden = true;
    $("new-note").setAttribute("aria-label", "New note");
    $("new-note").title = "New note · " + newShortcut;
  } catch (error) {
    message.dataset.error = "true";
    message.textContent = Number(error.status) === 401 || Number(error.status) === 403
      ? "Connect with an access key, then retry New note."
      : error.message === "navigation_blocked"
        ? "Could not leave the current note. Retry any failed save, then try New note again."
        : "Could not confirm note creation. Check your connection and retry New note; the same request will be reused.";
    $("new-note").setAttribute("aria-label", "Retry new note");
    $("new-note").title = "Retry new note · " + newShortcut;
  } finally {
    creatingNote = false;
    for (const id of ["new-note", "home-new"]) $(id).disabled = typeof companionMode !== "undefined" && companionMode && companionReadOnly();
  }
}
for (const id of ["new-note", "home-new"]) $(id).addEventListener("click", (event) => { if (event.detail < 2) newNote(); });

function openReferenceSearch() {
  if (typeof companionMode !== "undefined" && companionMode && companionReadOnly()) return;
  if (!state.editor?.state.loaded || state.editor.state.navigationPending) return;
  const range = richEditor.referenceRange();
  if (range) openSearch("insert", range);
}
$("insert-reference").addEventListener("click", openReferenceSearch);
$("format-controls").addEventListener("mousedown", (event) => { if (event.target.closest("button")) event.preventDefault(); });
for (const button of document.querySelectorAll("[data-format]")) button.addEventListener("click", () => richEditor.format(button.dataset.format));
function insertPageReference(result) {
  if (typeof companionMode !== "undefined" && companionMode && companionReadOnly()) return;
  const editor = $("note-editor");
  const range = referenceSelection;
  if (!range || state.editor !== searchDocument || !state.editor?.state.loaded || state.editor.state.navigationPending || richEditor.getMarkdown() !== range.value) {
    noteSearch.state.feedback = "The draft changed. Close this picker and insert the reference again.";
    renderNoteSearch(noteSearch.state);
    return;
  }
  const problem = pageReferenceError(result, noteSearch.state.results);
  if (problem) { noteSearch.state.feedback = problem; renderNoteSearch(noteSearch.state); return; }
  closeSearch();
  editor.focus({ preventScroll: true });
  const text = "[[" + result.referenceTitle + "]]";
  if (!richEditor.insertReference(range, text)) {
    richEditor.restoreSelection(searchSelection.selection);
    $("capture-message").hidden = false;
    $("capture-message").dataset.error = "true";
    $("capture-message").textContent = "Your browser could not insert a reference. Type " + text + " in the Markdown body.";
    return;
  }
  state.editor.input(richEditor.getMarkdown());
}


`;

export const documentActionsScript = String.raw`
let searchIndexRefreshing = false;
$("search-refresh-index").addEventListener("click", async () => {
  if (searchIndexRefreshing || (typeof companionMode !== "undefined" && companionMode && companionReadOnly())) return;
  searchIndexRefreshing = true;
  const revision = credentialRevision;
  $("search-refresh-index").disabled = true;
  $("search-message").textContent = "Refreshing search index…";
  try {
    await graphJson("/memories/all/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (revision === credentialRevision && searchDialog.open) noteSearch.query($("note-search-input").value, true);
  } catch {
    if (revision === credentialRevision && searchDialog.open) noteSearch.state.feedback = "Index refresh could not be confirmed. Check the connection before trying again.";
  } finally { searchIndexRefreshing = false; if (searchDialog.open) renderNoteSearch(noteSearch.state); }
});
const lifecycleActions = installDocumentActions({
  document, editor: () => state.editor,
  writable: () => !(typeof companionMode !== "undefined" && companionMode && companionReadOnly()),
  scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
  json: graphJson, toast,
  onDeleted: async (id, message) => {
    sidebarPages.remove(id);
    recentWrites.remove(id); noteSearch.markStale(); referenceAutocomplete.markStale();
    state.graph = null;
    if (state.editor?.state.documentId === id) { state.editor.cancel(); state.editor = null; }
    await navigation.navigate("/");
    toast.show("deletion", message);
  },
});
const noteAttention = JumpyBrainBrowser.installNoteAttention({
  document, editor: () => state.editor,
  writable: () => Boolean(activeApiKey) && !(companionMode && companionReadOnly()),
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  blocked: () => lifecycleActions.isBusy() || lifecycleActions.isOpen() || navigation.isBusy() || creatingNote || searchDialog.open || connectionDialog.open || dreamDialog.open || feedback.isOpen(),
  json: graphJson, toast,
  changed: () => sidebarPages.reloadAttention(),
  onBusy: () => sidebarPages.sync(),
});
documentActions = {
  ...lifecycleActions,
  close() { lifecycleActions.close(); noteAttention.close(); },
  isOpen: () => lifecycleActions.isOpen() || noteAttention.isOpen(),
  isBusy: () => lifecycleActions.isBusy() || noteAttention.isBusy(),
};
const externalUpdates = JumpyBrainBrowser.installExternalDocumentUpdates({
  onReadFailure: (details) => feedbackDiagnostics.event("external_refresh", { severity: "warn", outcome: "failed", code: details.timeout ? "timeout" : details.code || "network" }),
  document, editor: () => state.view === "note" ? state.editor : null,
  scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
  enabled: () => Boolean(activeApiKey) && !(typeof companionMode !== "undefined" && companionMode
    && (!companionRegistered || companionFrozen || companionSessionFailed)),
  read: readGraphDocument,
  onUpdated: () => {
    sidebarPages.rename({ id: state.editor.state.documentId, title: state.editor.state.savedTitle });
    sidebarPages.reloadAttention();
    state.graph = null;
    recentWrites.remove(state.editor.state.documentId);
    noteSearch.markStale(); referenceAutocomplete.markStale();
  },
});
`;
