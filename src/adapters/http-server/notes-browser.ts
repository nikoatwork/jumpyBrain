import { drawingsNavigationControl, drawingsSidebarMarkup } from "./drawings-view.js";
import { folderExplorerToggle } from "./folder-explorer-view.js";
import { browserChevronIcon, browserIcons } from "./browser-icons.js";
import { media } from "./browser-design-system.js";
import { noteAttentionMarkup, noteAttentionStyles } from "./note-attention-view.js";
import { referencePresentationStyles } from "./editor-reference-presentation.js";
import { taskCompletionStyles } from "./editor-task-presentation.js";
import { noteOutlineMarkup, noteOutlineStyles } from "./note-outline-view.js";

// Adapter-owned browser presentation, composed into the nonce-protected shell.
// String.raw keeps shell JavaScript readable; the Lexical surface is bundled separately.
// Looks come from the shared primitives (browser-button/-list/-components.ts); rules here own layout.
export const notesStyles = String.raw`
${noteAttentionStyles}
${noteOutlineStyles}
    #note-find { position: sticky; top: var(--space-2); z-index: 3; display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); }
    #note-find-input { min-width: 0; width: 100%; flex: 1; }
    #note-find-count { font: var(--text-caption)/var(--leading-ui) var(--font-ui); white-space: nowrap; }
    #note-find-previous svg { transform: rotate(180deg); }
    ::highlight(note-find) { background: var(--find-fill); color: inherit; }
    ::highlight(note-find-current) { background: var(--find-fill-current); color: inherit; }
    body { display: flex; height: 100dvh; }
    .app-workspace { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
    .app-nav { width: clamp(var(--sidebar-min-width), var(--sidebar-width, 320px), 40vw); position: relative; flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--space-4); padding: 0 var(--space-3) var(--space-3); border-right: 1px solid var(--line); overflow: auto; }
    .app-nav, .app-nav :is(.nav-library, .sidebar-attention-scroll, .sidebar-settled, ul) { scrollbar-width: none; }
    .app-nav::-webkit-scrollbar, .app-nav :is(.nav-library, .sidebar-attention-scroll, .sidebar-settled, ul)::-webkit-scrollbar { display: none; }
    :root[data-sidebar-collapsed="true"] .app-nav { display: none; }
    .workspace-history { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-1); margin: var(--space-2) var(--space-3); }
    .workspace-toolbar > #toggle-sidebar + .workspace-history { margin-left: 0; }
    .workspace-toolbar { display: flex; align-items: center; flex: 0 0 auto; min-height: var(--header-height); }
    #toggle-sidebar svg { width: var(--icon-size-lg); height: var(--icon-size-lg); }
    .workspace-toolbar > #toggle-sidebar { margin: var(--space-2) var(--space-3); }
    .nav-brand { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, max-content); grid-template-rows: var(--header-height); align-items: center; min-width: 0; min-height: var(--header-height); column-gap: var(--space-1); }
    .nav-brand > #toggle-sidebar { grid-column: 2; }
    .nav-brand > .home-link { grid-column: 3; }
    .app-nav .home-link { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--weight-regular) var(--text-body)/var(--leading-ui) var(--font-writing); letter-spacing: var(--tracking-brand); padding: var(--space-2) var(--space-1); color: var(--ink); }
    .home-link .brand-jumpy { font-style: italic; }
    .home-link strong { font-weight: var(--weight-semibold); }
    :root[data-native-mac="true"] .nav-brand { grid-template-columns: minmax(calc(var(--space-16) + var(--space-3)), 1fr) auto minmax(0, max-content); column-gap: 0; }
    :root[data-native-mac="true"][data-sidebar-collapsed="true"] .workspace-toolbar { padding-left: calc(var(--space-16) + var(--space-3)); }
    :root[data-native-mac="true"] :is(.nav-brand, .workspace-toolbar) { -webkit-app-region: drag; user-select: none; }
    :root[data-native-mac="true"] :is(a, button, input, select, textarea, [role="button"], [role="tooltip"], [popover], #companion-active) { -webkit-app-region: no-drag; }
    .nav-brand, .nav-tools { flex-shrink: 0; }
    .nav-tools { display: flex; align-items: center; gap: var(--space-1); }
    .nav-utilities { justify-self: end; display: flex; align-items: center; gap: var(--space-2); }
    .nav-footer { display: flex; flex-direction: column; gap: var(--space-2); flex-shrink: 0; }
    .nav-preferences { display: grid; grid-template-columns: repeat(3, auto) minmax(0, 1fr); align-items: center; gap: var(--space-2); margin-top: 0; flex-shrink: 0; }
    .nav-library { display: flex; flex-direction: column; flex: 1; min-height: 0; margin-inline: calc(-1 * var(--space-3)); overflow: hidden; }
    .nav-library > * { flex-shrink: 0; }
    .sidebar-attention-scroll { flex: 1 1 0; min-height: 0; overflow: auto; }
    .sidebar-settled { margin-top: auto; max-height: 40%; overflow: auto; padding-top: var(--space-1); }
    .nav-library ul { list-style: none; margin: 0; padding: 0; }
    .nav-library ul:not(:empty) + ul, .sidebar-page + .sidebar-page { margin-top: var(--space-2); }
    .sidebar-empty { padding-inline: var(--space-6); }
    .sidebar-empty:empty { display: none; }
    /* Sidebar page rows (browser-page-navigation.ts) compose .list-row.list-row--edge.list-row--page; only the pin glyph and settle layout live here. */
    .sidebar-page-pin[aria-pressed="true"] svg path:last-child, .sidebar-page-pin-mark svg path:last-child { fill: currentColor; }
    .sidebar-page-pin-mark { position: absolute; left: var(--space-1); top: calc(var(--space-3) + var(--space-1)); display: flex; color: var(--ink-faint); }
    .sidebar-page-pin-mark svg { width: var(--icon-size-sm); height: var(--icon-size-sm); }
    .sidebar-page[data-settling] { pointer-events: none; overflow: hidden; }
    #sidebar-resize { position: absolute; z-index: 1; right: 0; top: 0; bottom: 0; width: 5px; cursor: col-resize; touch-action: none; -webkit-app-region: no-drag; }
    #sidebar-resize:hover, #sidebar-resize:focus-visible { background: var(--line-strong); }
    @media ${media.narrow} { #sidebar-resize { display: none; } }
    .document-status { display: flex; flex-wrap: wrap; min-width: 0; flex: 1; align-items: center; justify-content: flex-end; gap: var(--space-2); min-height: var(--header-height); padding: var(--space-2) var(--space-4); }
    body:not([data-view="note"]) .document-status { display: none; }
    #graph-header { flex: 0 0 auto; }
    .home { width: 100%; overflow: auto; padding: clamp(var(--space-8), 8vh, calc(var(--space-16) + var(--space-4))) var(--space-6) var(--space-12); text-align: center; }
    .home-actions { width: min(100%, var(--measure-narrow)); margin: 0 auto; text-align: left; }
    .home-actions h1 { margin: 0 0 var(--space-6); font-size: var(--text-display); line-height: var(--leading-heading); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-brand); }
    /* Home actions: primary (#home-new) and plain (#home-search) buttons laid out as 56px cards. */
    .home-action { --btn-ring: var(--line); justify-content: flex-start; gap: var(--space-3); width: 100%; min-height: 56px; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); text-align: left; font-size: var(--text-body); }
    .home-action > svg { width: var(--icon-size-lg); height: var(--icon-size-lg); }
    .home-action-label { flex: 1; }
    .home-action > .kbd { flex-shrink: 0; }
    #home-search { margin-top: var(--space-3); }
    .recent-notes { width: min(100%, var(--measure-narrow)); margin: var(--space-10) auto 0; text-align: left; }
    .recent-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-1); }
    .recent-heading h2 { margin: 0; font-size: var(--text-ui); font-weight: var(--weight-semibold); }
    .recent-description, #recent-message { color: var(--ink-soft); font-size: var(--text-caption); }
    .recent-description { margin: 0 0 var(--space-1); }
    .recent-link { margin-inline: calc(-1 * var(--row-inset)); }
    kbd { font: inherit; color: var(--ink); }
    body:not([data-view="graph"]) #graph-header, body:not([data-view="graph"]) #graph-wrap { display: none; }
    main, body[data-view="graph"] main { flex: 1; height: auto; min-height: 0; }
    #note-panel { width: 100%; min-width: 0; overflow: auto; scrollbar-gutter: stable; scrollbar-color: var(--line-strong) transparent; scroll-padding-block: var(--space-8); }
    #note-layout { width: 100%; min-width: 0; }
    .note-column { width: min(100%, var(--measure)); margin: 0 auto; padding: clamp(var(--space-8), 5vh, var(--space-12)) var(--space-10) max(160px, 30vh); }
    /* Writing surface: content typography (--writing-* tokens), not the interface scale. */
    #note-title { margin: 0 0 var(--space-6); color: var(--ink); font: var(--weight-writing-title) var(--writing-title)/var(--leading-heading) var(--font-writing); letter-spacing: var(--tracking-tight); overflow-wrap: anywhere; }
    #note-name { display: block; width: 100%; height: auto; min-height: 1.25em; resize: none; overflow: hidden; margin: 0 0 var(--space-6); padding: 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: var(--weight-writing-title) var(--writing-title)/var(--leading-heading) var(--font-writing); letter-spacing: var(--tracking-tight); overflow-wrap: anywhere; }
    .note-writing { position: relative; }
    #note-editor-hint { position: absolute; top: var(--space-2); left: 0; right: 0; margin: 0; pointer-events: none; color: var(--ink-soft); font: var(--writing-text)/var(--writing-leading) var(--font-writing); }
    #note-editor { display: block; width: 100%; min-height: 55vh; resize: none; overflow: hidden; padding: var(--space-2) 0; border: 0; border-radius: 0; background: var(--surface); color: var(--ink); box-shadow: none; font: var(--writing-text)/var(--writing-leading) var(--font-writing); caret-color: var(--accent); tab-size: 2; white-space: pre-wrap; overflow-wrap: anywhere; }
    /* Each block is a source line; intentional blank lines supply paragraph spacing. */
    #note-editor p { margin: 0; min-height: 1.8em; }
    #note-editor > * { scroll-margin-block: var(--space-8); }
    #note-editor h1, #note-editor h2, #note-editor h3, #note-editor h4, #note-editor h5, #note-editor h6 { margin: .6em 0 .25em; line-height: var(--writing-heading-leading); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-tight); }
    #note-editor > :first-child { margin-top: 0; }
    #living-sources { overflow-wrap: anywhere; font-size: var(--text-ui); margin-top: var(--space-5); }
    #living-sources li { margin-block: var(--space-2); }
    #note-editor h1 { font-size: var(--writing-h1); }
    #note-editor h2 { font-size: var(--writing-h2); }
    #note-editor h3 { font-size: var(--writing-h3); }
    #note-editor h4, #note-editor h5, #note-editor h6 { font-size: var(--writing-h4); }
    .editor-bold, #note-editor strong, #note-editor b { font-weight: var(--weight-writing-bold); }
    .editor-italic { font-style: italic; }
    #note-editor > .external-change { border-radius: var(--radius-xs); animation: external-change-fade 4s ease-out forwards; }
    @keyframes external-change-fade {
      0%, 25% { background-color: var(--accent-wash); }
      100% { background-color: transparent; }
    }
    @media ${media.reducedMotion} {
      #note-editor > .external-change { animation: none; background-color: var(--accent-wash); }
    }
    #note-presence { display: flex; gap: var(--space-2); flex-wrap: wrap; max-width: 100%; }
    .note-participant { --participant-color: var(--ink-soft); border-left: var(--border-accent) solid var(--participant-color); padding-left: var(--space-2); overflow: hidden; text-overflow: ellipsis; max-width: 240px; white-space: nowrap; color: var(--ink-soft); font-size: var(--text-caption); }
    #note-external-state { color: var(--ink-soft); font-size: var(--text-caption); }
    #note-editor .editor-inline-code { font-family: var(--font-mono); font-size: .85em; background: var(--control-fill); border-radius: var(--radius-sm); padding: 0 var(--space-1); }
    #note-editor .markdown-literal code, #note-editor .markdown-literal .editor-inline-code, #note-editor .markdown-code-block .editor-inline-code, #note-editor .markdown-reference { font: inherit; background: transparent; padding: 0; border-radius: 0; }
    #note-editor .markdown-code-block { box-sizing: border-box; max-width: 100%; margin: var(--space-2) 0; padding: var(--space-3); overflow-x: auto; white-space: pre; overflow-wrap: normal; border-radius: var(--radius-sm); background: var(--control-fill); font: var(--text-body)/var(--leading-code) var(--font-mono); }
    #note-editor .markdown-code-block code { font: inherit; background: transparent; padding: 0; }
    #note-editor .markdown-bullet { list-style: disc; margin-block: 0; padding-inline-start: 1.25em; }
    #note-editor .markdown-task { --task-checkbox-size: calc(var(--space-6) * .7); display: flex; align-items: flex-start; gap: var(--space-2); }
    .markdown-task > span { min-width: 0; flex: 1; }
    .markdown-task > button { box-sizing: border-box; flex: 0 0 var(--task-checkbox-size); width: var(--task-checkbox-size); height: var(--task-checkbox-size); min-height: 0; display: inline-grid; place-items: center; font: inherit; margin-top: calc((1lh - var(--task-checkbox-size)) / 2); padding: 0; border: 1px solid var(--line-strong); border-radius: var(--radius-xs); background: var(--surface); color: var(--ink); }
    .markdown-task > button:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-offset); }
${taskCompletionStyles}
    .markdown-literal code, .markdown-reference { font: inherit; background: transparent; }
    .markdown-external-link:hover, .markdown-reference[data-page-reference="true"]:hover { background: var(--hover-fill); }
${referencePresentationStyles}
    .markdown-external-link, .markdown-reference[data-page-reference="true"] { color: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: .15em; }
    .markdown-table { margin: var(--space-3) 0; max-width: 100%; }
    .markdown-table-preview { overflow-x: auto; white-space: normal; }
    .markdown-table table { border-collapse: collapse; min-width: 100%; font-size: 1em; }
    .markdown-table th, .markdown-table td { padding: var(--space-2) var(--space-3); border: 1px solid var(--line-strong); min-width: 8ch; vertical-align: top; overflow-wrap: normal; word-break: normal; }
    .markdown-table th { background: var(--control-fill); font-weight: var(--weight-writing-bold); }
    .markdown-table summary { width: fit-content; cursor: pointer; color: var(--ink-soft); font: var(--text-caption)/var(--leading-ui) var(--font-ui); padding-block: var(--space-1); }
    /* Slash menu (built by editor-slash-commands.ts): .popover.popover--menu surface with .menu-item rows; this rule only places and sizes it. */
    .editor-slash-menu { user-select: none; touch-action: pan-y; z-index: var(--z-menu); width: 224px; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
    .editor-slash-glyph { display: grid; place-items: center; flex: 0 0 var(--space-6); height: var(--space-6); color: var(--ink-soft); font: var(--weight-regular) var(--text-ui)/1 var(--font-ui); }
    .editor-slash-menu [data-kind="bold"] { font-weight: var(--weight-writing-bold); }
    .editor-slash-menu [data-kind="italic"] { font-style: italic; }
    .editor-slash-menu [data-kind="bold"] .editor-slash-glyph { font-weight: var(--weight-writing-bold); }
    .editor-slash-menu [data-kind="italic"] .editor-slash-glyph { font-family: var(--font-writing); font-style: italic; }
    .editor-slash-menu [data-kind="h1"] .editor-slash-label, .editor-slash-menu [data-kind="h2"] .editor-slash-label, .editor-slash-menu [data-kind="h3"] .editor-slash-label { font-weight: var(--weight-semibold); }
    .editor-slash-menu [data-kind="code"], .editor-slash-menu [data-kind="code-block"] { font-family: var(--font-mono); }
    .editor-slash-menu [data-kind="code"] .editor-slash-glyph, .editor-slash-menu [data-kind="code-block"] .editor-slash-glyph { font-family: var(--font-mono); font-size: var(--text-caption); }
    .markdown-external-link:focus-visible, .markdown-reference:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-offset); }
    .markdown-literal::selection { background: var(--surface-hover); }
    .note-tool-row { display: flex; align-items: center; gap: var(--space-3); margin: 0 0 var(--space-6); }
    .note-tool-row:has(#toggle-note-format[aria-expanded="true"]) { margin-bottom: var(--space-2); }
    .note-tool-row:not(:has(button:not([hidden]))) { display: none; }
    #format-controls { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-3); align-items: center; margin: 0 0 var(--space-6); padding-block: var(--space-2); border-block: 1px solid var(--line); }
    .format-group { display: flex; flex: 0 0 auto; align-items: center; gap: var(--space-1); }
    .format-group > .button--sm { min-width: var(--btn-size); }
    #note-editor:focus, #note-editor:focus-visible, #note-name:focus, #note-name:focus-visible { outline: none; border: 0; box-shadow: none; }
    .app-version { margin: var(--space-6) 0 0; padding-top: var(--space-4); border-top: 1px solid var(--line); color: var(--ink-soft); font-size: var(--text-caption); }
    .note-actions:empty { display: none; }
    .note-actions { font-size: var(--text-caption); align-items: center; color: var(--ink-soft); display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-4); }
    /* Shared dialog layout hooks (dialog surface, heading and actions come from the dialog primitive). */
    .document-dialog label { display: block; margin-block: var(--space-3); }
    .document-dialog textarea { width: 100%; min-height: 120px; }
    .recovery-options { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--line); }
    .version-changes { display: grid; gap: var(--space-3); max-height: min(44vh, 440px); overflow: auto; }
    .version-change { min-width: 0; }
    .version-change-label { font-weight: var(--weight-semibold); font-size: var(--text-caption); }
    .version-changes pre { margin: var(--space-1) 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
    .version-change-removed, .version-change-added { display: block; text-decoration: none; border-left: var(--border-accent) solid currentColor; padding: var(--space-2) var(--space-3); }
    .version-change-removed { color: var(--error-ink); background: var(--error-fill); }
    .version-change-added { color: var(--ink); background: var(--control-fill); }

    .capture-feedback { margin: 0; padding: 0 var(--space-6); }
    .save-state { margin: 0; white-space: nowrap; }
    #note-message { white-space: pre-wrap; }
    #note-file { overflow-wrap: anywhere; }
    #related-pages, #page-backlinks { margin-top: var(--space-8); font-size: var(--text-ui); }
    #page-backlinks + #related-pages { margin-top: var(--space-6); }
    #page-backlinks-list { margin-inline: calc(-1 * var(--row-inset)); }
    .page-backlink { display: grid; align-items: start; gap: 0; padding-block: var(--space-2); }
    .page-backlink-title { color: var(--ink); overflow-wrap: anywhere; }
    .page-backlink-snippet { color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    #page-backlinks-more { margin-top: var(--space-1); }
    #related-page-preview { --popover-width: var(--width-popover); position: fixed; inset: auto; margin: 0; width: min(var(--popover-width), calc(100vw - var(--space-4))); pointer-events: none; }
    #related-page-preview span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; white-space: normal; }
    .note-frontmatter { margin-top: var(--space-6); color: var(--ink-soft); font-size: var(--text-caption); }
    .note-frontmatter pre { font-size: var(--text-caption); white-space: pre-wrap; overflow-wrap: anywhere; }

    #note-layout { display: flex; flex-direction: column; }
    #note-attribution { --popover-width: var(--width-tooltip); z-index: var(--z-panel); pointer-events: none; }
    #note-attribution > * { display: block; }
    #note-attribution strong { color: var(--ink); font-weight: var(--weight-semibold); }
    #page-details { order: -1; align-self: flex-end; width: min(var(--card-width), calc(100% - var(--space-8))); margin: var(--space-4) var(--space-4) 0; font: var(--text-ui)/var(--leading-ui) var(--font-ui); color: var(--ink-soft); }
    .page-card-heading, .page-card-actions { display: flex; align-items: center; gap: var(--space-2); }
    .page-card-heading { justify-content: space-between; padding-inline: var(--space-3); }
    .page-card-heading > h2 { margin: 0; }
    #note-add-to-board { width: fit-content; margin-top: var(--space-1); }
    #note-board-memberships { padding: var(--space-1) var(--space-3); }
    .page-card-facts { margin-top: var(--space-1); padding-top: var(--space-1); border-top: 1px solid var(--line); }
    #note-details-content { padding: 0 var(--space-3) var(--space-2); }
    @media ${media.wide} {
      #note-layout { display: grid; grid-template-columns: minmax(0, 1fr) var(--card-width); gap: var(--space-4); padding-right: var(--space-4); align-items: start; }
      #page-details { order: 0; position: sticky; top: var(--space-8); align-self: start; width: 100%; max-height: calc(100dvh - var(--space-16) - var(--space-12)); overflow: auto; margin: var(--space-8) 0 0; }
      #note-layout .note-column { min-width: 0; }
    }
    .saved-version dl { margin: 0; font-size: var(--text-caption); }
    .saved-version dt { margin-top: var(--space-3); color: var(--ink-soft); }
    .saved-version dd { margin: var(--space-1) 0 0; color: var(--ink); overflow-wrap: anywhere; }
    .context-caption { margin: var(--space-3) 0 0; font-size: var(--text-caption); }
    .search-result mark { color: inherit; background: var(--accent-wash-strong); }
    #note-search { max-height: min(740px, calc(100dvh - var(--space-16))); margin-top: min(12vh, calc(var(--space-16) + var(--space-8))); }
    #note-search > :is(.dialog-head, .search-footer) { flex: none; }
    .dialog-head { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4); }
    .search-input-icon { display: grid; flex: none; width: var(--icon-size-lg); height: var(--icon-size-lg); color: var(--ink-soft); }
    .search-input-icon svg { width: 100%; height: 100%; }
    #note-search-input { width: 100%; min-width: 0; }
    #search-results { list-style: none; padding: var(--space-1); margin: 0; max-height: 55dvh; min-height: 0; flex: 1 1 auto; overflow: auto; }
    #search-results:empty { display: none; }
    #search-results:not(:empty) { border-top: 1px solid var(--line); }
    /* Search results are .list-row options (hover wash, aria-selected keyboard fill) laid out as a grid. */
    .search-result { display: grid; grid-template-columns: var(--icon-size-lg) minmax(0, 1fr) auto; column-gap: var(--space-3); align-items: center; padding: var(--space-4) var(--space-3); }
    .search-result-icon { width: var(--icon-size-lg); height: var(--icon-size-lg); align-self: start; margin-top: var(--space-0-5); color: var(--ink-soft); }
    .search-result-content { min-width: 0; }
    .search-result strong { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-section); font-weight: var(--weight-regular); }
    .search-result:not([aria-disabled="true"]) strong { color: var(--ink); }
    .search-result-preview { display: block; margin-top: var(--space-1); font-size: var(--text-ui); color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .search-result :is(.search-result-path, .search-result-unavailable) { color: var(--ink-soft); font-size: var(--text-caption); }
    .search-result-age { grid-column: 3; padding-left: 0; }
    .search-result-path { display: block; margin-top: var(--space-1); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .search-result-unavailable { display: block; margin-top: var(--space-1); }
    .search-footer { border-top: 1px solid var(--line); background: var(--control-fill); padding: var(--space-3) var(--space-4); font-size: var(--text-caption); color: var(--ink-soft); }
    .search-footer:not(:has(p:not([hidden]):not(:empty), button:not([hidden]))) { display: none; }
    .search-footer p { margin: 0; }
    #open-connection { position: relative; }
    #open-connection .connection-dot { position: absolute; top: var(--space-1); right: var(--space-1); }
    @media ${media.narrow} {
      body { flex-direction: column; }
      .app-nav { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: var(--space-3) var(--space-4); padding: 0 var(--space-3) var(--space-3); border-right: 0; border-bottom: 1px solid var(--line); overflow: visible; }
      .nav-brand { grid-column: 1 / -1; }
      .workspace-toolbar { min-height: var(--control-touch); }
      .nav-tools { grid-row: 2; grid-column: 1 / -1; flex-direction: row; align-items: center; gap: var(--space-1); }
      .nav-library { grid-row: 3; grid-column: 1 / -1; min-height: 0; max-height: 320px; margin-inline: 0; }
      .sidebar-settled > summary { padding-inline: var(--space-3); }
      .sidebar-attention-scroll { flex-basis: auto; min-height: 120px; }
      .nav-library ul { display: flex; gap: var(--space-1); min-width: 0; overflow-x: auto; }
      .sidebar-page { --row-inset: 0px; flex: 0 0 auto; max-width: 190px; }
      .sidebar-page .sidebar-page-actions { right: var(--space-1); }
      .sidebar-page + .sidebar-page { margin-top: 0; }
      .sidebar-page > .sidebar-page-link { padding-inline: var(--space-2); }
      .sidebar-page.is-pinned > .sidebar-page-link { padding-left: calc(var(--space-2) + var(--icon-size-sm) + var(--space-1)); }
      .sidebar-empty { padding-inline: var(--space-1); }
      .nav-footer { grid-row: 4; grid-column: 1 / -1; }
      .document-status { padding-inline: var(--space-4); flex-wrap: wrap; }
      .note-column { padding: var(--space-8) var(--space-6) max(120px, 25vh); }
      .workspace-toolbar { flex-wrap: wrap; }
      .document-status { flex: 1 1 200px; }
      #format-controls { margin-bottom: var(--space-5); }
      #note-search { margin-top: var(--space-4); max-height: calc(100dvh - var(--space-8)); }
    }
`;

const copyIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="1.6"/></svg>';

export const notesMarkup = String.raw`
<aside id="note-attribution" class="popover popover--caption" aria-label="Saved note attribution" aria-live="polite" hidden>
  <strong>Saved note · last editor</strong><span id="note-attribution-facts"></span><span id="note-attribution-scope"></span>
</aside>
<nav id="app-sidebar" class="app-nav" aria-label="Main navigation">
  <div id="sidebar-resize" role="separator" tabindex="0" aria-label="Sidebar width" aria-orientation="vertical" aria-valuemin="224" aria-valuemax="480" aria-valuenow="320"></div>
  <div class="nav-brand"><button id="toggle-sidebar" class="icon-button" type="button" aria-controls="app-sidebar" aria-expanded="true" aria-label="Collapse sidebar" title="Collapse sidebar"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16" stroke="currentColor" stroke-width="1.6"/></svg></button><a id="home-link" class="quiet-button quiet-button--plain home-link" href="/" aria-label="Home" title="Home"><span class="brand-jumpy">jumpy</span><strong>Brain</strong></a></div>
  <div class="nav-tools" role="group" aria-label="Note actions">
    <a id="notes-link" class="icon-button sidebar-icon" href="/" aria-label="Home" title="Home">${browserIcons.home}</a>
    <button id="new-note" type="button" class="icon-button sidebar-icon" aria-label="New note" title="New note"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9M10 14l1-4 8-8 3 3-8 8-4 1Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button id="new-board" type="button" class="icon-button sidebar-icon" aria-label="New board" title="New board" hidden><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16M15 4v7M15 16h6M18 13v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
    ${drawingsNavigationControl}
    <button id="open-search" type="button" class="icon-button sidebar-icon" aria-label="Search notes" title="Search notes">${browserIcons.search}</button>
  </div>
  <div class="nav-library" aria-label="Your pages">
    <div class="sidebar-attention-scroll">
      <div id="board-navigation" hidden><ul id="sidebar-boards" aria-label="Boards"></ul></div>
      ${drawingsSidebarMarkup}
      <ul id="sidebar-recent" aria-label="Pages"></ul>
      <p id="sidebar-recent-empty" class="list-status sidebar-empty" role="status"></p>
      <button id="sidebar-recent-more" class="quiet-button quiet-button--plain list-more" hidden>Show more</button>
    </div>
    <details id="sidebar-settled-section" class="sidebar-settled">
      <summary class="list-row list-row--edge list-row--shelf disclosure-trigger"><span class="list-row-label">Settled</span> <span id="sidebar-settled-count" class="list-meta">0</span>${browserChevronIcon}</summary>
      <ul id="sidebar-settled" aria-label="Settled pages"></ul>
      <p id="sidebar-settled-empty" class="list-status sidebar-empty">No settled pages</p>
      <button id="sidebar-settled-more" class="quiet-button quiet-button--plain list-more" hidden>Show more</button>
    </details>
  </div>
  <div class="nav-footer">
  <div class="nav-preferences">
    <a id="graph-link" class="icon-button sidebar-icon" href="/graph" aria-label="Graph" title="Graph">${browserIcons.graph}</a>
    <button id="open-connection" class="icon-button sidebar-icon" aria-label="Connect · Connection settings" title="Connection settings" aria-haspopup="dialog">${browserIcons.settings}<span class="status-dot connection-dot" aria-hidden="true"></span></button>
    <button id="open-feedback" class="icon-button sidebar-icon" aria-label="Feedback" title="Feedback" aria-haspopup="dialog" aria-controls="feedback-dialog">${browserIcons.feedback}</button>
    <div class="nav-utilities" role="group" aria-label="App utilities"></div>
  </div>
  </div>
</nav>
<div class="app-workspace">
<div class="workspace-toolbar">
<div class="workspace-history" role="group" aria-label="Navigation history">
  <button id="navigate-back" class="icon-button" type="button" aria-label="Back" title="Back" disabled>${browserIcons.back}</button>
  <button id="navigate-forward" class="icon-button" type="button" aria-label="Forward" title="Forward" disabled>${browserIcons.forward}</button>
</div>
<div class="document-status" role="group" aria-label="Save status">
  <span id="note-save-state" data-testid="graph-note-save-state" class="status-text status-text--caption save-state" role="status" aria-live="polite" hidden></span>
  <span id="note-presence" aria-live="polite"></span>
  <span id="note-generation-state" class="status-text status-text--caption save-state" role="status" aria-live="polite" hidden></span>
  <span id="note-external-state" role="status" aria-live="polite" hidden></span>
  <button id="note-retry" data-testid="graph-note-retry" class="quiet-button" hidden>Retry save</button>
  <button id="note-recover" class="quiet-button" hidden>Recover draft</button>

</div>
${folderExplorerToggle}
</div>
${noteAttentionMarkup}
<p id="capture-message" class="status-text status-text--caption capture-feedback" role="status" aria-live="polite" hidden></p>
<dialog id="note-search" aria-label="Search notes" class="dialog--lg dialog--sections">
  <div class="dialog-head">
    <span class="search-input-icon" aria-hidden="true">${browserIcons.search}</span>
    <input id="note-search-input" class="input--bare input--entry" aria-label="Search titles and contents" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="search-results" autocomplete="off" placeholder="Search your memory…" />
    <button id="search-refresh-index" type="button" class="icon-button" aria-label="Reindex memory" title="Reindex memory" hidden>${browserIcons.refresh}</button>
    <button id="close-search" class="icon-button" aria-label="Close search" title="Close search (Esc)">${browserIcons.close}</button>
  </div>
  <ul id="search-results" role="listbox" aria-label="Matching notes"></ul>
  <div class="search-footer">
    <p id="search-semantic-state" hidden></p>
    <p id="search-message" role="status" aria-live="polite"></p>
    <p id="reference-help" hidden>Insert a literal [[Page Title]] reference, not a unique-ID link. Duplicate titles are ambiguous. Exact page titles are shared with the map; legacy paths remain supported there.</p>
    <button id="search-retry" class="quiet-button" hidden>Retry search</button>
    <button id="search-connect" class="quiet-button" hidden>Connect</button>
  </div>
</dialog>
<dialog id="connection" aria-labelledby="connection-title">
  <form id="connection-form">
    <div class="dialog-heading"><h2 id="connection-title">Connect to your memory</h2></div>
    <p class="field-help">Use the access key for this server. It stays in this browser; only enter it on a server you trust.</p>
    <label class="field"><span class="field-label">Access key</span><input id="api-key" class="input--entry" data-testid="api-key" type="password" autocomplete="off" /></label>
    <button id="toggle-api-key" class="quiet-button" type="button" aria-controls="api-key">Show key</button>
    <p id="connection-message" class="status-text" role="status" aria-live="polite"></p>
    <div class="dialog-actions">
      <button id="open-access-keys" class="quiet-button" type="button" aria-haspopup="dialog" hidden>Access keys</button>
      <button id="disconnect" class="quiet-button" type="button" hidden>Disconnect</button>
      <button id="close-connection" class="quiet-button" type="button">Cancel</button>
      <button id="connection-submit" class="button button-primary" type="submit">Connect</button>
    </div>
    <p class="app-version" data-app-version></p>
  </form>
</dialog>
`;

export const documentActionsMarkup = String.raw`
<dialog id="document-recovery" class="document-dialog" aria-labelledby="recovery-title">
  <div class="dialog-heading"><h2 id="recovery-title">Choose your changes</h2><button id="recovery-close" class="icon-button dialog-close" type="button" aria-label="Close" title="Close">${browserIcons.close}</button></div>
  <p>Choose which changes to keep.</p>
  <div id="recovery-changes" aria-label="Changes from the saved version to your draft"></div>
  <p id="recovery-message" class="status-text" role="status" aria-live="polite"></p>
  <div class="dialog-actions"><button id="recovery-reload" class="quiet-button" type="button">Use saved version</button><button id="recovery-publish" class="button button-primary" type="button" hidden>Keep my changes</button></div>
  <details id="recovery-options" class="recovery-options"><summary class="disclosure-trigger disclosure-trigger--inline"><span>More options</span>${browserChevronIcon}</summary>
    <label id="recovery-versions-label" hidden>Recoverable drafts<select id="recovery-versions" class="dropdown"></select></label>
    <label>Your draft<textarea id="recovery-draft" readonly></textarea></label>
    <label>Current saved note<textarea id="recovery-saved" readonly></textarea></label>
    <button id="recovery-copy" class="quiet-button" type="button">Copy draft</button>
  </details>
</dialog>
<dialog id="document-delete" class="document-dialog" aria-labelledby="delete-title">
  <h2 id="delete-title">Delete note?</h2>
  <p id="delete-note-title"></p>
  <p>Deleting this note cannot be undone.</p>
  <p id="delete-message" class="status-text" role="status" aria-live="polite"></p>
  <div class="dialog-actions"><button id="delete-cancel" class="quiet-button">Cancel</button><button id="delete-confirm" class="button button-primary button--danger" disabled>Delete</button></div>
</dialog>
`;

export const notesViews = String.raw`
  <section id="home" class="home" aria-label="Your jumpyBrain">
    <div class="home-actions">
      <h1>What's on your mind?</h1>
      <button id="home-new" class="button button-primary home-action" aria-label="New note">
        ${browserIcons.plus}
        <span class="home-action-label">New note</span><kbd class="kbd new-shortcut" aria-hidden="true"></kbd>
      </button>
      <button id="home-search" class="quiet-button quiet-button--plain home-action" aria-label="Search notes">
        ${browserIcons.search}
        <span class="home-action-label">Search your memory</span><kbd class="kbd shortcut" aria-hidden="true"></kbd>
      </button>
    </div>
    <section class="recent-notes" aria-labelledby="recent-title">
      <div class="recent-heading"><h2 id="recent-title">Recent activity</h2><button id="recent-refresh" class="icon-button" aria-label="Refresh recent activity" title="Refresh recent activity">${browserIcons.refresh}</button></div>
      <ul id="recent-list" class="list-reset" aria-label="Recent activity"></ul>
      <p id="recent-message" role="status" aria-live="polite"></p>
      <button id="recent-retry" class="quiet-button" hidden>Retry</button>
      <button id="recent-connect" class="quiet-button" hidden>Connect</button>
    </section>
  </section>
  <section id="note-panel" data-testid="graph-note-panel" aria-label="Note editor" hidden>
    ${noteOutlineMarkup}
    <div id="note-layout">
    <div class="note-column">
      <h1 id="note-title" data-testid="graph-note-title" tabindex="-1"></h1>
      <textarea id="note-name" aria-label="Page name" aria-describedby="note-save-error" aria-multiline="false" rows="1" autocomplete="off" hidden></textarea>
      <p id="note-save-error" class="status-text" role="status" aria-live="polite" hidden></p>
      <div class="note-actions"></div>
      <div id="note-find" class="card card--compact" role="search" aria-label="Find in note" hidden>
        <input id="note-find-input" type="search" aria-label="Find in note" placeholder="Find in note…" autocomplete="off" />
        <span id="note-find-count" role="status" aria-live="polite"></span>
        <button id="note-find-previous" type="button" class="icon-button" aria-label="Previous match" title="Previous match (Shift+Enter)">${browserIcons.chevronDown}</button>
        <button id="note-find-next" type="button" class="icon-button" aria-label="Next match" title="Next match (Enter)">${browserIcons.chevronDown}</button>
        <button id="note-find-close" type="button" class="icon-button" aria-label="Close find" title="Close find (Esc)">${browserIcons.close}</button>
      </div>
      <div id="reference-creation-status" class="callout callout--error" hidden>
        <p role="status" aria-live="polite">A linked page could not be created. Your source note is retained. Retry page creation before leaving this note.</p>
        <button id="reference-creation-retry" class="quiet-button">Retry page creation</button>
      </div>
      <p id="note-message" class="status-text" role="status" hidden></p>
      <button id="note-load-retry" class="quiet-button" hidden>Retry loading</button>
      <div class="note-tool-row" role="group" aria-label="Writing tools">
        <button id="toggle-note-format" class="quiet-button quiet-button--plain button--sm button--toggle disclosure-trigger" type="button" aria-expanded="false" aria-controls="format-controls" hidden><span aria-hidden="true">Aa</span><span>Format</span>${browserChevronIcon}</button>
      </div>
      <div id="format-controls" role="group" aria-label="Text formatting" hidden>
        <div class="format-group" role="group" aria-label="Text styles">
          <button class="quiet-button quiet-button--plain button--sm" data-format="paragraph" aria-label="Normal text" title="Normal text">Text</button>
          <button class="quiet-button quiet-button--plain button--sm" data-format="h1" aria-label="Heading" title="Heading">H1</button>
          <button class="quiet-button quiet-button--plain button--sm" data-format="h2" aria-label="Subheading" title="Subheading">H2</button>
          <button class="quiet-button quiet-button--plain button--sm" data-format="h3" aria-label="Small heading" title="Small heading">H3</button>
        </div>
        <div class="format-group" role="group" aria-label="Inline formatting">
          <button class="icon-button" data-format="bold" aria-label="Bold" title="Bold"><strong>B</strong></button>
          <button class="icon-button" data-format="italic" aria-label="Italic" title="Italic"><em>I</em></button>
          <button class="icon-button" data-format="code" aria-label="Inline code" title="Inline code">&lt;/&gt;</button>
        </div>
        <div class="format-group" role="group" aria-label="Insert blocks">
          <button class="icon-button" data-format="task" aria-label="Task checkbox" title="Task checkbox">☑</button>
          <button class="icon-button" data-format="code-block" aria-label="Code block" title="Code block">{ }</button>
        </div>
      </div>
      <div class="note-writing">
      <p id="note-editor-hint" aria-hidden="true" hidden>Start writing, or type / for options…</p>
      <div id="note-editor" data-testid="graph-note-editor" role="textbox" aria-multiline="true" aria-label="Markdown note body" spellcheck="true" hidden></div>
      </div>
      <nav id="page-backlinks" aria-labelledby="page-backlinks-heading" hidden>
        <h2 id="page-backlinks-heading" class="list-section-label list-section-label--flush">Linked from (<span id="page-backlinks-count">0</span>)</h2>
        <ul id="page-backlinks-list" class="list-reset"></ul>
        <button id="page-backlinks-more" class="quiet-button quiet-button--plain button--sm" type="button" hidden></button>
        <p id="page-backlinks-limited" class="empty-state empty-state--inline" hidden>Showing the first 100 linking notes.</p>
      </nav>
      <nav id="related-pages" aria-label="Related pages" hidden>
        <h2 class="list-section-label list-section-label--flush">Related pages</h2><ul id="related-pages-list" class="chip-list"></ul>
      </nav>
    </div>

    <aside id="page-details" class="card card--compact" aria-label="Page actions and details" hidden>
      <div class="page-card-heading"><h2 class="list-section-label list-section-label--flush">Page</h2><div class="page-card-actions" role="group" aria-label="Page actions">
  <button id="copy-note-draft" class="icon-button" type="button" aria-label="Copy" title="Copy" hidden>${copyIcon}</button>
  <button id="copy-note-file-path" class="icon-button" type="button" aria-label="Copy file path" title="Copy file path" hidden>${browserIcons.link}</button>
  <button id="open-note-graph" class="icon-button" type="button" aria-label="Open in graph" title="Open in graph" hidden>${browserIcons.graph}</button>
  <button id="delete-note" class="icon-button" type="button" aria-label="Delete note" title="Delete note…" hidden>${browserIcons.remove}</button>
      </div></div>
      <div id="note-board-memberships" class="chip-list" role="group" aria-label="Boards containing this page" hidden></div>
      <button id="note-add-to-board" class="quiet-button quiet-button--plain" type="button" aria-haspopup="dialog" aria-controls="note-board-dialog" hidden>${browserIcons.plus}<span>Add to board</span></button>
      <div class="page-card-facts">
      <button id="toggle-page-details" class="list-row disclosure-trigger page-facts-toggle" type="button" aria-expanded="false" aria-controls="note-details-content"><span class="list-row-label">More info</span>${browserChevronIcon}</button>
      <div id="note-details-content" hidden>
      <section class="saved-version" aria-label="Saved version">

        <dl><dt>Saved note · last editor</dt><dd id="saved-version-editor"></dd><dt>Written</dt><dd id="saved-version-written"></dd><dt>Last edited</dt><dd id="saved-version-edited"></dd><dt>Location</dt><dd id="note-file"></dd></dl>
        <p class="context-caption">Editor names are declared by the writing tool.</p>
      </section>
      <details id="living-sources" class="note-frontmatter" hidden>
        <summary class="disclosure-trigger disclosure-trigger--inline"><span>Sources · version checks</span>${browserChevronIcon}</summary>
        <p>Follow evidence beside each claim. Latest substantive change and open questions remain in the page above.</p>
        <button id="check-living-sources" class="quiet-button" type="button">Check source versions</button>
        <p id="living-sources-status" role="status" aria-live="polite"></p>
        <ul id="living-sources-list"></ul>
      </details>
      <details id="note-metadata" class="note-frontmatter" hidden>
        <summary class="disclosure-trigger disclosure-trigger--inline"><span>Markdown metadata</span>${browserChevronIcon}</summary>
        <pre id="note-frontmatter"></pre>
      </details>

      </div>
      </div>
    </aside>
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
    link.className = "list-row recent-link";
    link.href = typeof companionMode !== "undefined" && companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(note.id)) : "/?note=" + encodeURIComponent(note.id);
    const title = document.createElement("span"); title.className = "list-row-label";
    title.textContent = note.title || note.file || "Untitled";
    link.title = title.textContent + (note.file ? " · " + note.file : "");
    link.append(title);
    const date = note.updatedAt || note.createdAt;
    const dated = date && Number.isFinite(Date.parse(date));
    const time = document.createElement(dated ? "time" : "span");
    time.className = "list-row-meta recent-date";
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
function normalizeNoteResults(results, limit = 12, excludedDocumentId = null) {
  const seen = new Set();
  const normalized = (Array.isArray(results) ? results : []).flatMap((hit) => {
    const metadata = hit.provenance?.metadata || {};
    const documentId = isValidMemoryDocumentId(metadata.id) ? metadata.id : null;
    if (documentId && documentId === excludedDocumentId) return [];
    const file = String(hit.provenance?.file || "");
    const key = documentId || file || String(hit.id);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ documentId, file, title: String(metadata.title || file.split("/").pop() || "Untitled"), referenceTitle: typeof metadata.title === "string" ? metadata.title : null, snippet: String(hit.snippet || ""), ...(hit.recognition ? { recognition: hit.recognition } : {}) }];
  });
  // Prefer usable notes without hiding unavailable legacy documents altogether.
  return [...normalized.filter((result) => result.documentId), ...normalized.filter((result) => !result.documentId)].slice(0, limit);
}

function createNoteSearch(options) {
  const search = { query: "", status: "idle", results: [], selected: -1, stale: false, message: "" };
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
    search.recognition = null;
    const selectedId = search.results[search.selected]?.documentId;
    search.results = options.retainResultsWhileLoading && search.query
      ? search.results.filter((result) => result.title.toLocaleLowerCase().includes(search.query.toLocaleLowerCase())) : [];
    search.selected = search.results.findIndex((result) => result.documentId === selectedId);
    if (search.selected < 0) search.selected = search.results.findIndex((result) => result.documentId);
    search.stale = localStale;
    search.status = search.query ? "loading" : "idle";
    search.message = search.query ? "Searching…" : "";
    options.onChange(search);
    if (!search.query) return;
    const run = async () => {
      timer = null;
      request = options.abortController();
      const requestedWriteRevision = writeRevision;
      try {
        const payload = await options.fetch(search.query, request.signal);
        if (token !== generation) return;
        // File-name matches for drawings lead; they open or insert a mention, never a note ID.
        search.results = [...(Array.isArray(payload?.drawings) ? payload.drawings : []), ...normalizeNoteResults(payload?.results, options.resultLimit || 12, options.getExcludedDocumentId?.())];
        search.recognition = payload?.recognition;
        search.selected = search.results.findIndex((result) => result.documentId || result.drawing);
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
        search.message = error.code === "invalid_recognition" ? "Could not load search results. Retry search."
          : error.code === "unsupported_recognition" ? "Update this server to enable search."
          : search.status === "auth" ? "Connect with an access key to search your memory."
          : Number(error.status) === 500 ? "Search is unavailable. The server may need its index built. Retry or ask the server operator."
          : "Search failed. Check your connection and retry.";
      }
      if (token === generation) { request = null; options.onChange(search); }
    };
    if (immediate) run();
    else timer = options.setTimer(run, 180);
  }
  function move(delta) {
    const available = search.results.map((result, index) => result.documentId || result.drawing ? index : -1).filter((index) => index >= 0);
    if (!available.length) return;
    const position = available.indexOf(search.selected);
    search.selected = available[(position + delta + available.length) % available.length];
    search.feedback = "";
    options.onChange(search);
  }
  return { state: search, query, cancel, move, markStale };
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
  resultLimit: 24,
  getExcludedDocumentId: () => searchMode === "navigate" && state.view === "note" ? state.editor?.state.documentId : null,
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timer) => window.clearTimeout(timer),
  abortController: () => new AbortController(),
  fetch: async (query, signal) => {
    const drawings = typeof drawingsUI !== "undefined" ? await drawingsUI.match(query) : [];
    try { return { ...await recentWrites.search(query, signal, 24, { offset: 0 }), drawings }; }
    catch (error) {
      // Drawing names need no index; keep them reachable when note search is unavailable.
      if (!drawings.length || error?.name === "AbortError") throw error;
      return { results: [], drawings };
    }
  },
  onChange: renderNoteSearch,
});

JumpyBrainBrowser.installControlLabels(document);
const noteFind = JumpyBrainBrowser.installNoteFind({
  document, available: () => state.view === "note" && !!state.editor?.state.loaded,
  capture: () => richEditor.captureSelection(), restore: (selection) => richEditor.restoreSelection(selection),
});
const referenceAutocomplete = window.installReferenceAutocomplete($("note-editor"), richEditor, {
  createSearch: createNoteSearch,
  // Drawing file names join the inline [[ / @ picker like Cmd/Ctrl+K; they need no index.
  fetch: async (query, signal) => {
    const drawings = typeof drawingsUI !== "undefined" ? await drawingsUI.match(query) : [];
    signal.throwIfAborted();
    try { return { ...await searchMemoryNotes(query, signal), drawings }; }
    catch (error) {
      if (!drawings.length || error?.name === "AbortError") throw error;
      return { results: [], drawings };
    }
  },
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
    && companionCan("write") && Boolean(state.editor?.state.loaded),
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
  graphTopicPreview.close();
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
  const drawingReference = typeof drawingsUI !== "undefined" ? drawingsUI.referenceName(title) : null;
  if (drawingReference) {
    // A drawing mention opens the drawing; it never resolves or creates a note.
    if (!await navigation.navigate("/?drawing=" + encodeURIComponent(drawingReference))) referenceMessage("Finish saving this note, then open the drawing again.", true);
    return;
  }
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
        ? "No page has this title. Your access to this brain cannot create pages; see Settings → Access keys. Your draft is retained."
        : "No page has this title. Your draft is retained.")
      : error.outcome === "ambiguous" ? "Several pages share this title. Your draft is retained."
      : "This reference could not be opened. It may have changed or be unavailable. Your draft is retained.", true);
  } finally {
    if (referenceRequest === request) referenceRequest = null;
  }
}

// [label](../pages/x.md): resolve against this note's folder via the canonical
// file listing (no title guessing), then open through guarded navigation.
// No schemes, absolute paths or escaping the brain root.
function resolveNoteLinkFile(fromFile, destination) {
  let path = destination.split("#")[0];
  try { path = decodeURIComponent(path); } catch { return null; }
  if (!path || path.startsWith("/") || /[\u0000-\u001f\\]/.test(path) || !/\.md$/i.test(path)) return null;
  const parts = fromFile.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (!parts.length) return null; parts.pop(); continue; }
    parts.push(part);
  }
  return parts.join("/");
}
function noteLinkTargetId(files, currentId, destination) {
  const current = files.find((entry) => entry.id === currentId);
  const file = current ? resolveNoteLinkFile(current.file, destination) : null;
  if (!file) return { status: "unresolvable" };
  const fold = (value) => value.normalize("NFC").toLowerCase();
  const target = files.find((entry) => entry.file === file) || files.find((entry) => fold(entry.file) === fold(file));
  return target?.id ? { status: "found", id: target.id } : { status: "missing", file };
}
async function activateNoteLink(destination) {
  if (typeof companionMode !== "undefined" && companionMode && companionFrozen) return;
  const origin = state.editor, revision = credentialRevision;
  if (referenceRequest || !origin?.state.loaded || origin.state.navigationPending
      || searchDialog.open || connectionDialog.open || dreamDialog.open) return;
  referenceAutocomplete.dismiss();
  const request = new AbortController();
  referenceRequest = request;
  const current = () => referenceRequest === request && !request.signal.aborted
    && state.editor === origin && credentialRevision === revision;
  referenceMessage("Opening linked note…");
  try {
    const opened = await navigation.navigate(async () => {
      if (!current()) throw new Error("cancelled");
      const packet = await graphJson("/memories/all/files", { signal: request.signal });
      if (!current()) throw new Error("cancelled");
      const files = Array.isArray(packet?.files) ? packet.files.filter((entry) => typeof entry?.file === "string") : [];
      const result = noteLinkTargetId(files, origin.state.documentId, destination);
      if (result.status !== "found" || !isValidMemoryDocumentId(result.id)) {
        const error = new Error("note_link_unavailable");
        error.outcome = result.status; error.file = result.file;
        throw error;
      }
      return "/?note=" + encodeURIComponent(result.id);
    });
    if (opened && current()) referenceMessage("");
    else if (!opened && current()) referenceMessage("Save failed or navigation is busy. Retry saving your current note, then open the link again.", true);
  } catch (error) {
    if (!current()) return;
    referenceMessage(Number(error.status) === 401 || Number(error.status) === 403
      ? "Connect with an access key to open this link. Your draft is retained."
      : error.outcome === "missing" ? "No note exists at " + error.file + ". Your draft is retained."
      : error.outcome === "unresolvable" ? "This link points outside the brain or to an invalid path. Your draft is retained."
      : "This link could not be opened. Your draft is retained.", true);
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
      item.className = "list-row search-result";
      item.setAttribute("role", "option");
      item.setAttribute("aria-disabled", String(!result.documentId && !result.drawing));
      if (result.drawing) item.dataset.kind = "drawing";
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [key, value] of Object.entries({ class: "search-result-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) icon.setAttribute(key, value);
      const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
      outline.setAttribute("d", result.drawing ? "M3 12h8v8H3zM13 16a4 4 0 1 0 8 0 4 4 0 0 0-8 0M7 9l5-6 5 6Z" : "M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8M8 16h6"); icon.append(outline);
      const content = document.createElement("div"); content.className = "search-result-content";
      const title = document.createElement("strong"); JumpyBrainBrowser.appendSearchHighlight(title, result.title, search.query);
      title.title = result.title;
      const snippet = document.createElement("span"); snippet.className = "search-result-preview";
      JumpyBrainBrowser.appendSearchHighlight(snippet, JumpyBrainBrowser.searchPreview(result.snippet, result.title, search.query, result.recognition?.preview || ""), search.query);
      const file = document.createElement("small"); file.className = "search-result-path"; file.textContent = result.file; file.title = result.file;
      content.append(title, snippet, file);
      if (!result.documentId && !result.drawing) {
        const unavailable = document.createElement("small"); unavailable.className = "search-result-unavailable"; unavailable.textContent = "Unavailable: missing memory ID";
        content.append(unavailable);
      }
      item.append(icon, content);
      const editContext = JumpyBrainBrowser.resultEditContext(result.recognition);
      if (editContext.label) {
        const edit = document.createElement("small"); edit.className = "search-result-age list-meta"; edit.textContent = "Edited " + editContext.label;
        edit.title = editContext.details; edit.setAttribute("aria-label", editContext.details);
        item.append(edit);
      }
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
  $("search-refresh-index").hidden = !search.stale;
  const reindexReadOnly = typeof companionMode !== "undefined" && companionMode && companionReadOnly();
  // A role restriction leaves the control available: using it explains the restriction.
  const reindexExplains = reindexReadOnly && companionAccessBlocked();
  $("search-refresh-index").disabled = searchIndexRefreshing || (reindexReadOnly && !reindexExplains);
  $("search-refresh-index").setAttribute("aria-busy", String(searchIndexRefreshing));
  $("search-refresh-index").title = reindexExplains ? companionAccessExplanation("Reindexing") : reindexReadOnly ? "Reindexing is unavailable right now" : searchIndexRefreshing ? "Reindexing memory…" : "Reindex memory";
  $("search-retry").hidden = search.status !== "error";
  $("search-connect").hidden = search.status !== "auth";
}

async function chooseSearchResult(result) {
  if ((!result?.documentId && !result?.drawing) || selectingResult) return;
  if (searchMode === "insert") { insertPageReference(result); return; }
  const destination = result.drawing ? "/?drawing=" + encodeURIComponent(result.drawing) : "/?note=" + encodeURIComponent(result.documentId);
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

browserCommands.register({ id: "search.open", title: "Open search", shortcut: "Mod+K", run: () => { if (searchDialog.open) closeSearch(); else openSearch(); } });
$("open-search").addEventListener("click", () => browserCommands.execute("search.open"));
$("home-search").addEventListener("click", () => browserCommands.execute("search.open"));
$("close-search").addEventListener("click", () => closeSearch());
searchDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeSearch(); });
searchDialog.addEventListener("click", (event) => { if (event.target === searchDialog) closeSearch(); });
$("note-search-input").addEventListener("input", (event) => { if (!event.isComposing) { noteSearch.query(event.target.value); } });
$("note-search-input").addEventListener("compositionend", (event) => { noteSearch.query(event.target.value); });
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
  if (!searchDialog.open && !connectionDialog.open && !dreamDialog.open && !document.querySelector("dialog[open]")) {
    if (browserCommands.shortcut(event)) return;
  }
  if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.metaKey || event.ctrlKey)) return;
  if (event.key.toLowerCase() === "k") {
    if (connectionDialog.open || dreamDialog.open) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) browserCommands.execute("search.open");
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
  $("open-access-keys").hidden = !connected;
  $("connection-message").textContent = connected ? "Connected to this server."
    : connectionStatus === "checking" ? "Checking your connection…"
    : connectionStatus === "unavailable" ? "Could not reach the server. Retry connecting."
    : activeApiKey ? "The access key was not accepted. Update it to reconnect." : "Not connected.";
  $("connection-message").dataset.error = String(connectionStatus === "unavailable" || (!connected && connectionStatus !== "checking" && Boolean(activeApiKey)));
}
function maskApiKey() {
  apiKeyInput.type = "password";
  $("toggle-api-key").textContent = "Show key";
}
function openConnection(fromSearch) {
  if (typeof companionMode !== "undefined" && companionMode) {
    if (companionSessionFailed && state.editor?.hasPending()) {
      companionMessage("Your session ended; use Recover draft to copy your work before reopening the editor from the app menu.", true);
      documentActions.openRecovery();
    } else navigation.navigate(companionScopeUrl("/settings"));
    return;
  }
  if (dreamDialog.open || feedback.isOpen()) return;
  cancelReferenceInteraction();
  apiKeyInput.value = activeApiKey === "browser-session" ? "" : activeApiKey;
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
  apiKeyInput.value = activeApiKey === "browser-session" ? "" : activeApiKey;
  maskApiKey();
  connectionDialog.close();
}
$("close-connection").addEventListener("click", closeConnection);
connectionDialog.addEventListener("cancel", (event) => { event.preventDefault(); closeConnection(); });
$("toggle-api-key").addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  $("toggle-api-key").textContent = reveal ? "Hide key" : "Show key";
});
async function setConnectionKey(key) {
  if (typeof companionMode !== "undefined" && companionMode) return;
  referenceCreation.reset();
  cancelReferenceInteraction();
  key = key.trim();
  try {
    await fetch("/session", {method:"DELETE"});
    const response = key ? await fetch("/session", {headers:{Authorization:"Bearer " + key}}) : null;
    if (key && response?.ok) {hostedPrincipalId = (await response.json()).principal?.id; key = "browser-session";}
    else hostedPrincipalId = null;
  } catch { /* A disconnected credential remains session-only until reconnect. */ }
  activeApiKey = key;
  hostedIdentityChannel?.postMessage({principalId: hostedPrincipalId});
  credentialRevision++;
  systemMessages.sync();
  livingSources.sync();
  lifecycleActions?.refresh?.();
  folderExplorer.sync();
  relatedPages.sync();
  pageBacklinks.sync();
  recentWrites.reset();
  map.reset();
  sidebarPages.refresh();
  documentActions.close();
  connectionStatus = activeApiKey ? "checking" : "disconnected";
  try {
    localStorage.removeItem("jumpybrain.graph.apiKey");
  } catch { /* Session-only access still works. */ }
  closeConnection();
  renderConnection();
}
if (hostedIdentityChannel) hostedIdentityChannel.onmessage = async (event) => {
  if (event.data?.principalId === hostedPrincipalId) return;
  hostedPrincipalId = event.data?.principalId || null;
  credentialRevision++;
  const editor = state.editor;
  if (editor?.hasPending()) {
    editor.block("Credentials changed in another tab. Copy or recover this private draft before reopening with the new identity.", true);
    return;
  }
  editor?.cancel();
  if (hostedPrincipalId) activeApiKey = "browser-session";
  else activeApiKey = "";
  if (state.view === "note") await showNote(new URL(location.href).searchParams.get("note"));
  else if (state.view === "home") recentNotes.load();
  else if (state.view === "graph") loadGraph();
  else if (state.view === "drawing") drawingsUI.show(new URL(location.href).searchParams.get("drawing"));
  if (typeof drawingsUI !== "undefined") drawingsUI.connectionChanged();
  renderConnection();
};
$("connection-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = apiKeyInput.value;
  const changed = await requestEditorNavigation(async () => {
    state.editor?.cancel();
    await setConnectionKey(key);
  });
  if (!changed) {$("connection-message").textContent = "Resolve or recover the pending draft before changing credentials."; $("connection-message").dataset.error = "true"; return;}
  if (state.view === "home") recentNotes.load();
  if (reopenSearch) openSearch(searchMode, referenceSelection);
  if (typeof drawingsUI !== "undefined") drawingsUI.connectionChanged();
  if (state.view === "note") {
    await showNote(new URL(location.href).searchParams.get("note"));
  } else if (state.view === "graph") loadGraph();
  else if (state.view === "drawing") drawingsUI.show(new URL(location.href).searchParams.get("drawing"));
});
$("disconnect").addEventListener("click", async () => {
  $("disconnect").disabled = true;
  try {
    // Save with the current key before clearing credentials or rendered memory.
    const disconnected = await navigation.navigate(async () => {
      await setConnectionKey("");
      noteSearch.query("");
      $("note-search-input").value = "";
      state.graphToken++;
      state.graph = null;
      $("viewport").replaceChildren();
      return "/";
    });
    if (!disconnected) { $("connection-message").textContent = "Could not disconnect. Save your pending note and try again."; $("connection-message").dataset.error = "true"; }
  } finally { $("disconnect").disabled = false; }
});
renderConnection();

function shellUrl() { return location.pathname + location.search; }
const initialEntry = { url: shellUrl(), index: Number.isSafeInteger(history.state?.jumpyBrainIndex) ? history.state.jumpyBrainIndex : 0 };
history.replaceState({ jumpyBrainIndex: initialEntry.index }, "", initialEntry.url);
const navigation = JumpyBrainBrowser.createPageNavigation({
  initial: initialEntry,
  beforeLeave: () => requestEditorNavigation(() => {}),
  blocked: () => typeof companionMode !== "undefined" && companionMode && companionFrozen,
  scope: (url) => companionMode ? companionScopeUrl(url) : url,
  resume: () => state.editor?.setNavigationPending(false),
  go: (delta) => history.go(delta),
  push: (entry) => history.pushState({ jumpyBrainIndex: entry.index }, "", entry.url),
  show: showPage,
  onChange: syncWorkspaceHistory,
});
async function navigateSidebar(url) {
  const current = new URL(companionMode ? companionScopeUrl(url) : url, location.origin).href === location.href;
  const opened = await navigation.navigate(url);
  if (opened || (current && !navigation.isBusy())) sidebarPreference.afterNavigate();
  return opened;
}
function syncWorkspaceHistory() {
  const available = navigation.availability();
  $("navigate-back").disabled = !available.back;
  $("navigate-forward").disabled = !available.forward;
}
$("navigate-back").addEventListener("click", () => navigation.back());
$("navigate-forward").addEventListener("click", () => navigation.forward());
syncWorkspaceHistory();
let documentActions, lifecycleActions;
let creatingNote = false;
const folderExplorer = JumpyBrainBrowser.installFolderExplorer({
  document, window,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  enabled: () => Boolean(activeApiKey) && state.view !== "settings" && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  fetch: (signal) => graphJson("/memories/all/files?includeFolders=1", { signal }),
  navigate: (id) => navigateSidebar("/?note=" + encodeURIComponent(id)),
  operations: {
    writable: () => Boolean(activeApiKey) && !(companionMode && companionReadOnly()),
    json: graphJson,
    link: id => new URL(companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(id)) : "/?note=" + encodeURIComponent(id), location.origin).href,
    deleteFile: async id => {
      if (navigation.isBusy() || creatingNote || state.editor?.state.navigationPending) throw new Error("Finish the current action before deleting files.");
      await lifecycleActions.openDelete(id);
    },
    guard: async operation => {
      const editor = state.editor;
      if (editor?.state.navigationPending || navigation.isBusy() || creatingNote || lifecycleActions.isBusy()) throw new Error("Finish the current action before moving files.");
      editor?.setNavigationPending(true);
      try {
        if (editor && !await editor.flush()) throw new Error("Resolve the failed save before changing files.");
        if (editor !== state.editor) throw new Error("The current note changed. Reopen the action.");
        return await operation();
      } finally { if (editor === state.editor) editor?.setNavigationPending(false); }
    },
    changed: result => {
      // The live snapshot supplies the confirmed filename after the move.
      state.graph = null; if (result.id) recentWrites.remove(result.id);
      noteSearch.markStale(); referenceAutocomplete.markStale();
    },
  },
});
const livingSources = JumpyBrainBrowser.installLivingSources({
  document, editor: () => state.editor,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  enabled: () => Boolean(activeApiKey) && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  json: (url, options) => graphJson(url, options),
  navigate: (id) => navigation.navigate("/?note=" + encodeURIComponent(id)),
});
const pageBacklinks = JumpyBrainBrowser.installPageBacklinks({
  document, editor: () => state.view === "note" ? state.editor : null,
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  enabled: () => Boolean(activeApiKey) && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  load: (id, signal) => graphJson("/memories/all/documents/" + encodeURIComponent(id) + "?backlinks=1", { signal }),
  href: (id) => companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(id)) : "/?note=" + encodeURIComponent(id),
  navigate: (url) => navigation.navigate(url),
  changed: () => relatedPages.refilter(),
});
const relatedPages = JumpyBrainBrowser.installRelatedPages({
  document, editor: () => state.view === "note" ? state.editor : null,
  exclude: (id) => pageBacklinks.has(id),
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  enabled: () => Boolean(activeApiKey) && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  search: (query, signal, limit) => recentWrites.search(query, signal, limit),
  read: (id, signal) => graphJson("/memories/all/documents/" + encodeURIComponent(id), { signal }),
  href: (id) => companionMode ? companionScopeUrl("/?note=" + encodeURIComponent(id)) : "/?note=" + encodeURIComponent(id),
  navigate: (url) => navigation.navigate(url),
});
const noteWorkspace = JumpyBrainBrowser.installNoteWorkspace({
  document, editor: () => state.view === "note" ? state.editor : null,
  actor: () => browserActor,
  writable: () => !noteEditingLocked(state.editor?.state),
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
  navigate: navigateSidebar,
  attentionScope: () => activeApiKey ? String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted") : null,
  enabled: () => state.view !== "settings" && (!companionMode || (companionRegistered && !companionFrozen && !companionSessionFailed)),
  writable: () => Boolean(activeApiKey) && !(companionMode && companionReadOnly()) && !documentActions?.isBusy(),
  fetchPreview: (id, signal) => readGraphDocument(id, { signal }),
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
// Saves first like any link, then shows this page's connections on the map.
$("open-note-graph").addEventListener("click", () => {
  const file = state.view === "note" && state.editor?.state.loaded ? state.editor.state.file : "";
  if (file) navigation.navigate("/graph?focus=" + encodeURIComponent(file));
});
for (const [id, url] of [["home-link", "/"], ["notes-link", "/"], ["graph-link", "/graph"]]) {
  $(id).addEventListener("click", (event) => {
    // Native new-tab navigation does not abandon the current draft.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); navigation.navigate(url);
  });
}

let urlGraphFocus = "";
function showPage(url) {
  graphTopicPreview.close();
  noteFind.close(false);
  feedback.close(false);
  if (typeof companionMode !== "undefined" && companionMode && !companionRegistered) return;
  if (typeof companionMode !== "undefined" && companionMode) {
    const requested = new URL(url, location.origin);
    if ((requested.searchParams.has("note") || requested.searchParams.has("board") || requested.searchParams.has("drawing")) && requested.searchParams.get("brain") !== companionState.activeId) {
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
  state.view = typeof companionMode !== "undefined" && companionMode && /^\/settings\/?$/.test(target.pathname) ? "settings" : companionMode && target.searchParams.has("board") ? "board" : target.searchParams.has("drawing") ? "drawing" : documentId !== null ? "note" : /^\/graph\/?$/.test(target.pathname) ? "graph" : "home";
  if (companionMode) { $("board-navigation").hidden=false; $("new-board").hidden=false; boardsUI.show(state.view === "board" ? target.searchParams.get("board") : null); }
  sidebarPages.select(documentId);
  folderExplorer.select(documentId);
  document.body.dataset.view = state.view;
  if (typeof drawingsUI !== "undefined") drawingsUI.show(state.view === "drawing" ? target.searchParams.get("drawing") : null);
  if (companionMode) syncSettingsNavigation(url);
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
  if (state.view === "note") { sidebarPreference.afterNavigate(); showNote(documentId, documentId === newNoteId); newNoteId = null; return; }
  referenceCreation.reset();
  state.noteToken++;
  if (state.editor) state.editor.cancel();
  state.editor = null;
  relatedPages.sync();
  pageBacklinks.sync();
  noteWorkspace.sync();
  extensionUI?.documentChanged();
  $("note-retry").hidden = true;
  $("note-recover").hidden = true;
  document.title = state.view === "graph" ? "Memory map · jumpyBrain" : "Notes · jumpyBrain";
  if (state.view === "settings") {
    document.title = "Settings · jumpyBrain";
    renderCompanionSettings();
    $("companion-heading").focus();
  } else if (state.view === "board") {
    document.title = "Board · jumpyBrain";
  } else if (state.view === "drawing") {
    document.title = "Drawing · jumpyBrain";
  } else if (state.view === "graph") {
    // Open in graph names its page in the URL; a plain map visit clears that focus again.
    const focus = target.searchParams.get("focus"), focusInput = $("focus");
    const nextFocus = focus ?? (focusInput.value === urlGraphFocus ? "" : focusInput.value);
    urlGraphFocus = focus ?? "";
    if (focus !== null) state.selected = focus;
    if (nextFocus !== focusInput.value) { focusInput.value = nextFocus; loadGraph(); }
    else if (!map.hasCurrentGraph()) loadGraph(); else queueGraphLayout(0, true);
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
    relatedPages.sync();
    pageBacklinks.sync();
    noteWorkspace.sync();
    extensionUI?.documentChanged();
    $("note-title").textContent = "";
    toast.clear("draft");
    toast.clear("file-path");
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
    $("copy-note-file-path").hidden = true;
    $("open-note-graph").hidden = true;
    $("delete-note").hidden = true;
    $("note-save-state").textContent = "";
    $("note-external-state").textContent = "";
    $("note-load-retry").hidden = true;
    $("note-load-retry").textContent = "Retry loading";
    $("note-message").hidden = false;
    $("note-message").dataset.error = "false";
    $("note-message").textContent = "Loading note…";
    $("note-panel").scrollTop = 0;
    document.title = "Note · jumpyBrain";
    if (!isValidMemoryDocumentId(documentId)) { noteLoadError("This note link has an invalid memory ID. Use Search to find a note."); return; }
    const editor = createNoteSession(token, documentId, focusEnd);
    state.editor = editor;
    try {
      const payload = staged?.id === documentId && staged.revision === credentialRevision
        ? staged.payload : await readGraphDocument(documentId, { stillWanted: () => token === state.noteToken && state.editor === editor });
      if (token !== state.noteToken || state.editor !== editor) return;
      if (typeof payload?.content !== "string" || typeof payload?.contentHash !== "string") throw new Error("Invalid document response.");
      editor.hydrate(payload);
      if (editor.state.cancelled) return;
      $("note-title").textContent = payload.title || payload.file || "Untitled";
      document.title = $("note-title").textContent + " · jumpyBrain";
      $("note-file").textContent = payload.file || "";
      $("note-message").hidden = true;
      sidebarPages.visit({ id: documentId, title: payload.title || payload.file || "Untitled" });
      if (focusEnd) recentWrites.remember({ recognition: payload.recognition, id: documentId, title: payload.title || "", body: editor.state.savedBody, file: payload.file || "" });
      await editor.connect();
      if (token !== state.noteToken || state.editor !== editor || editor.state.cancelled) return;
      if (!searchDialog.open && !connectionDialog.open) richEditor.focus(focusEnd);
    } catch (error) {
      if (token !== state.noteToken || state.editor !== editor || editor.state.cancelled) return;
      if (editor.state.loaded) {
        // The canonical read succeeded. A missing/incompatible live endpoint
        // says nothing about whether the note exists; retain its saved text.
        editor.block("Saved content is shown. Check your connection and app/server versions, then retry editing.");
        return;
      }
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
let noteTitleComposing = false, noteNameDocument = "";
$("note-name").addEventListener("compositionstart", () => {noteTitleComposing = true;});
$("note-name").addEventListener("compositionend", () => {noteTitleComposing = false; if (!(companionMode && companionReadOnly())) state.editor?.inputTitle($("note-name").value.replace(/[\r\n]/g,""));});
$("note-name").addEventListener("input", (event) => {
  // Soft wrapping is visual only; keep the previous single-line title contract.
  const field = $("note-name");
  const singleLine = field.value.replace(/[\r\n]/g, "");
  if (field.value !== singleLine) field.value = singleLine;
  sizeNoteName();
  if (!noteTitleComposing && !event.isComposing && !(typeof companionMode !== "undefined" && companionMode && companionReadOnly())) state.editor?.inputTitle(field.value);
});
$("note-name").addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.key !== "Enter") return;
  event.preventDefault();
  if (!$("note-name").readOnly) richEditor.focus();
});
window.addEventListener("resize", sizeNoteName);
// Opening page details can change the writing measure without a window resize.
let noteNameWidth = 0;
new ResizeObserver((entries) => {
  const width = entries[0]?.contentRect.width;
  if (width === noteNameWidth) return;
  noteNameWidth = width;
  sizeNoteName();
}).observe($("note-name"));
$("note-name").addEventListener("blur", () => {
  // Whitespace is kept while typing; leaving the field shows the saved spelling.
  const field = $("note-name"), trimmed = field.value.trim();
  if (trimmed && trimmed !== field.value && !(typeof companionMode !== "undefined" && companionMode && companionReadOnly())) { field.value = trimmed; state.editor?.inputTitle(trimmed); }
  state.editor?.flush();
  if (state.editor?.state.loaded) syncEditorUi(state.editor.state);
});

// Presence and generation notices present the live session; publication stays in its owner.
let presenceSignature = "";
function renderLivePresence(snapshot, status, ownClientId) {
  const root = $("note-presence");
  const peers = ["saved", "saving", "readonly", "conflict"].includes(status) ? (snapshot?.presence || []).filter(peer => peer.clientId !== ownClientId && (!peer.leaseExpiresAt || peer.leaseExpiresAt > Date.now())) : [];
  const signature = JSON.stringify(peers.map(peer => [peer.actor, peer.principalId, peer.name, peer.kind, peer.activity]));
  if (signature === presenceSignature) return;
  presenceSignature = signature; root.replaceChildren(); root.hidden = !peers.length;
  for (const peer of peers) {
    const appearance = JumpyBrainBrowser.participantAppearance(peer), chip = document.createElement("span");
    chip.className = "note-participant"; chip.dataset.actor = peer.actor; chip.dataset.kind = peer.kind;
    chip.style.setProperty("--participant-color", appearance.color); chip.textContent = appearance.label + " · " + appearance.activity;
    chip.title = appearance.description; chip.setAttribute("aria-label", appearance.description); root.append(chip);
  }
}
function createNoteSession(token, documentId, focusEnd) {
  let sidebarRefresh = null, generationTimer = null, historyNoticeSequence = 0;
  const generationFeedback = JumpyBrainBrowser.createGenerationFeedback();
  const clearGeneration = () => {
    clearTimeout(generationTimer); generationTimer = null;
    if (state.editor === editor) { $("note-generation-state").textContent = ""; $("note-generation-state").hidden = true; }
  };
  let observedHash = "", observedTitle = "";
  const editor = JumpyBrainBrowser.createLiveEditorSession({
    generation: token, documentId, editor: richEditor, actor: () => browserActor,
    isCurrent: () => state.noteToken === token && state.editor === editor,
    scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) + ":" + companionTabId : "hosted"),
    connection: async () => {
      const capabilities = await graphJsonPatient("/capabilities", () => state.noteToken === token && state.editor === editor);
      if (capabilities.protocol !== 2 || typeof capabilities.brainId !== "string") throw new Error("This backend requires a coordinated client upgrade.");
      const endpoint = new URL("/ws", location.href);
      endpoint.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      return { url: endpoint.href, token: activeApiKey,
        scope: location.origin + ":" + capabilities.brainId + ":" + (companionMode ? String(companionState?.activeId || "") : "hosted"),
        expectedBrainId: capabilities.brainId,
        connectionContext: () => companionMode ? {tabId: companionTabId, generation: companionState?.generation} : {},
      };
    },
    reopen: async () => { await showNote(documentId); return state.editor !== editor && Boolean(state.editor?.state.loaded); },
    onRecovery: code => feedbackDiagnostics.event("save", {severity:"warn",outcome:"unconfirmed",code}),
    onStream: snapshot => {
      const notice = generationFeedback.observe(snapshot);
      if (!notice) return;
      clearGeneration();
      if (notice.kind === "active") return;
      $("note-generation-state").textContent = notice.text;
      $("note-generation-state").hidden = false;
      generationTimer = setTimeout(clearGeneration, 8000);
    },
    onSnapshot: (snapshot, view) => {
      const contentChanged = observedHash !== snapshot.contentHash;
      // Without an earlier observation there is no rename to reveal; the debounced refresh covers it.
      const titleChanged = observedHash !== "" && observedTitle !== snapshot.title;
      observedHash = snapshot.contentHash; observedTitle = snapshot.title;
      $("note-file").textContent = snapshot.file || "";
      if (!contentChanged) return;
      sidebarPages.observe({id: documentId, title: snapshot.title}, snapshot.body, snapshot.recognition);
      if (sidebarRefresh) clearTimeout(sidebarRefresh);
      if (titleChanged) sidebarPages.reloadAttention(documentId);
      else sidebarRefresh = setTimeout(() => {sidebarRefresh = null; if (state.editor === editor && !editor.state.cancelled) sidebarPages.reloadAttention();}, 1500);
      folderExplorer.rename(documentId, snapshot.title);
      recentWrites.remember({recognition: snapshot.recognition, id: documentId, title: snapshot.title, body: snapshot.body, file: snapshot.file});
      state.graph = null; noteSearch.markStale(); referenceAutocomplete.markStale();
      referenceCreation.saved(snapshot.body, view.body);
      extensionUI?.emit({type: "document.saved", document: {id: documentId, title: snapshot.title}});
    },
    onState: (live, firstOpen) => {
      if (["offline", "connecting", "blocked"].includes(live.status)) { generationFeedback.reset(); clearGeneration(); }
      if (live.historyNotice && historyNoticeSequence !== live.historyNotice.sequence) {
        historyNoticeSequence = live.historyNotice.sequence; toast.show("history", live.historyNotice.text);
      }
      renderLivePresence(editor.collaboration?.snapshot, live.status, editor.collaboration?.clientId);
      if (firstOpen && !searchDialog.open && !connectionDialog.open && document.hasFocus()) richEditor.focus(focusEnd);
    },
    onChange: current => {
      if (current.loaded && !observedHash) { observedHash = current.contentHash; observedTitle = current.savedTitle; }
      syncEditorUi(current);
    },
    onDispose: () => {if (state.editor === editor) {toast.clear("editor-save"); renderLivePresence(null, "offline");} clearTimeout(sidebarRefresh); generationFeedback.reset(); clearGeneration();},
  });
  return editor;
}

function noteEditingLocked(editorState = {}) {
  return Boolean((typeof companionMode !== "undefined" && companionMode && companionReadOnly()) || editorState.liveStatus === "readonly" || editorState.liveStatus === "blocked" || (editorState.liveStatus && !editorState.liveHasOpened));
}
function syncEditorUi(editorState) {
  const companionLocked = noteEditingLocked(editorState);
  const needsReview = editorState.saveStatus === "failed" && editorState.saveErrorCode === "precondition_failed";
  const cleanUnavailable = editorState.liveStatus === "blocked" && !editorState.dirty;
  if (!state.editor || state.editor.state !== editorState) return;
  extensionUI?.documentChanged();
  noteAttention.sync();
  sidebarPages.sync();
  livingSources.sync();
  lifecycleActions?.refresh?.();
  folderExplorer.sync();
  relatedPages.sync();
  pageBacklinks.sync();
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

  $("note-retry").hidden = cleanUnavailable || editorState.saveStatus !== "failed" || editorState.saveErrorCode === "precondition_failed";
  $("note-recover").hidden = !editorState.recoveryDrafts?.length && (cleanUnavailable || editorState.saveStatus !== "failed") && !(typeof companionMode !== "undefined" && companionMode && companionSessionFailed);
  if (editorState.loaded) {
    $("note-load-retry").hidden = !cleanUnavailable;
    $("note-load-retry").textContent = "Retry editing";
  }
  $("note-recover").disabled = editorState.navigationPending;
  $("note-recover").textContent = editorState.saveErrorCode === "precondition_failed" ? "Review changes" : "Recover draft";
  $("copy-note-draft").hidden = !editorState.loaded;
  $("copy-note-file-path").hidden = !currentNoteFilePath();
  $("copy-note-file-path").disabled = editorState.navigationPending || (companionMode && (companionFrozen || companionSessionFailed));
  $("open-note-graph").hidden = !editorState.loaded || !editorState.file;
  $("open-note-graph").disabled = editorState.navigationPending;
  if (companionMode && typeof boardsUI !== "undefined") boardsUI.syncNote();
  $("delete-note").hidden = !editorState.loaded;
  // Stays available under a role restriction so that choosing it explains why.
  $("delete-note").disabled = editorState.navigationPending || (companionLocked && !(companionMode && companionAccessBlocked()));
  $("note-retry").disabled = editorState.navigationPending;
  $("note-editor").hidden = !editorState.loaded;
  $("note-name").hidden = !editorState.loaded;
  $("note-title").hidden = editorState.loaded;
  $("note-name").readOnly = editorState.navigationPending || companionLocked;
  $("note-name").setAttribute("aria-invalid", String(["duplicate_title", "invalid_title"].includes(editorState.saveErrorCode)));
  if (editorState.liveStatus) {
    if (editorState.saveError) toast.dispatch({ source: "editor-save", text: editorState.saveError, severity: "error", revision: editorState.documentId, duration: 8000 });
    else toast.clear("editor-save");
  }
  $("note-save-error").hidden = Boolean(editorState.liveStatus) || editorState.saveStatus !== "failed" && editorState.durableDraft !== false;
  $("note-save-error").textContent = editorState.saveError || "";
  $("note-save-error").dataset.error = String(!needsReview);
  if (editorState.navigationPending || !editorState.loaded) referenceAutocomplete.dismiss();
  richEditor.setReadOnly(editorState.navigationPending || companionLocked);
  for (const button of $("format-controls").querySelectorAll("button")) button.disabled = editorState.navigationPending || companionLocked;
  if (editorState.loaded) {
    // Never replace a name its author is typing. Another writer's rename is
    // shown once they leave the field; their next keystroke publishes theirs.
    const typingName = document.activeElement === $("note-name") && noteNameDocument === editorState.documentId && !$("note-name").readOnly;
    if (!noteTitleComposing && !typingName && $("note-name").value !== editorState.title) $("note-name").value = editorState.title;
    noteNameDocument = editorState.documentId;
    sizeNoteName();
    $("note-title").textContent = editorState.title || "Untitled";
    document.title = (editorState.title || "Untitled") + " · jumpyBrain";
    if (!state.editor.collaboration && richEditor.getMarkdown() !== editorState.draft) {
      referenceCreation.reset();
      richEditor.setMarkdown(editorState.draft);
    }
    $("note-frontmatter").textContent = editorState.frontmatterPrefix;
    $("note-metadata").hidden = false;
  }
  noteWorkspace.sync();
  const feedback = editorState.saveStatus === "saving" ? "Saving…"
    : editorState.saveStatus === "failed" ? needsReview ? "Changes need review" : "Save failed"
    : editorState.dirty ? "Editing…" : editorState.loaded ? "Saved" : "";
  const liveFeedback = cleanUnavailable ? "Editing unavailable"
    : editorState.liveStatus === "offline" ? !editorState.dirty ? "Offline · saved note shown" : editorState.durableDraft === false ? "Offline · keep this window open" : "Offline · draft kept on this device"
    : editorState.liveStatus === "connecting" ? "Connecting…" : editorState.liveStatus === "readonly" ? "Read only"
    : editorState.liveStatus === "conflict" ? "Changes need review"
    : editorState.liveStatus === "saving" && editorState.title !== editorState.savedTitle && !editorState.title.trim() ? "Enter a page name to save" : null;
  $("note-save-state").textContent = liveFeedback || feedback;
  $("note-external-state").textContent = editorState.externalStatus === "pending" ? "Changes available"
    : editorState.externalStatus === "updated" ? "Updated elsewhere" : "";
  $("note-save-state").dataset.state = needsReview ? "review" : editorState.saveStatus;
  $("note-save-state").dataset.error = String(!needsReview && editorState.saveStatus === "failed");
  $("note-save-state").title = editorState.saveError || "";
  $("note-save-state").setAttribute("aria-label", (liveFeedback || feedback) + (editorState.saveError ? ": " + editorState.saveError : ""));
}

const noteCapture = createNoteCapture({
  now: () => new Date(),
  key: () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  write: (draft, key) => graphJson("/memories/all/notes", {
    method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ ...draft, actor: browserActor }),
  }),
});
let newNoteId = null;
async function newNote() {
  if (typeof companionMode !== "undefined" && companionMode && companionDenied("Creating a note")) return;
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
    message.textContent = Number(error.status) === 403
      ? "This connection does not allow creating notes. Ask the brain owner for write access, then retry New note."
      : Number(error.status) === 401
      ? "Connect with an access key, then retry New note."
      : error.message === "navigation_blocked"
        ? "Could not leave the current note. Retry any failed save, then try New note again."
        : "Could not confirm note creation. Check your connection and retry New note; the same request will be reused.";
    $("new-note").setAttribute("aria-label", "Retry new note");
    $("new-note").title = "Retry new note · " + newShortcut;
  } finally {
    creatingNote = false;
    for (const id of ["new-note", "home-new"]) $(id).disabled = typeof companionMode !== "undefined" && companionMode && companionReadOnly() && !companionAccessBlocked();
  }
}
for (const id of ["new-note", "home-new"]) $(id).addEventListener("click", (event) => { if (event.detail < 2) newNote(); });
// A view-only key leaves the note readable. Trying to change it says why, at most once
// every few seconds, and points to Settings; nothing else in the note view shows the role.
let editingDeniedAt = 0;
function explainEditingDenied(event) {
  if (typeof companionMode === "undefined" || !companionMode || !companionAccessBlocked() || state.view !== "note" || !state.editor?.state.loaded) return;
  // A read-only editor takes no keyboard focus: typing after clicking into its text arrives at the page.
  const inNote = node => Boolean(node) && ($("note-editor").contains(node) || node === $("note-name"));
  if (!inNote(event.target) && !(event.target === document.body && inNote(getSelection()?.anchorNode))) return;
  if (event.type === "keydown" && (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || !(event.key.length === 1 || ["Backspace", "Delete", "Enter"].includes(event.key)))) return;
  if (Date.now() - editingDeniedAt < 8000) return;
  editingDeniedAt = Date.now();
  companionExplainAccess("Editing this note");
}
for (const type of ["keydown", "paste", "cut", "drop"]) document.addEventListener(type, explainEditingDenied);
$("delete-note").addEventListener("click", () => { if (typeof companionMode !== "undefined" && companionMode && companionAccessBlocked()) companionExplainAccess("Deleting this note"); });

function openReferenceSearch() {
  if (typeof companionMode !== "undefined" && companionMode && companionReadOnly()) return;
  if (!state.editor?.state.loaded || state.editor.state.navigationPending) return;
  const range = richEditor.referenceRange();
  if (range) openSearch("insert", range);
}
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
  const problem = result.drawing ? "" : pageReferenceError(result, noteSearch.state.results);
  if (problem) { noteSearch.state.feedback = problem; renderNoteSearch(noteSearch.state); return; }
  closeSearch();
  editor.focus({ preventScroll: true });
  const text = "[[" + (result.drawing ? result.drawing + ".excalidraw" : result.referenceTitle) + "]]";
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
  if (searchIndexRefreshing || (typeof companionMode !== "undefined" && companionMode && companionDenied("Reindexing"))) return;
  searchIndexRefreshing = true;
  const revision = credentialRevision;
  renderNoteSearch(noteSearch.state);
  $("search-message").textContent = "Refreshing search index…";
  try {
    await graphJson("/memories/all/index", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (revision === credentialRevision && searchDialog.open) noteSearch.query($("note-search-input").value, true);
  } catch {
    if (revision === credentialRevision && searchDialog.open) noteSearch.state.feedback = "Index refresh could not be confirmed. Check the connection before trying again.";
  } finally { searchIndexRefreshing = false; if (searchDialog.open) renderNoteSearch(noteSearch.state); }
});
function currentNoteFilePath(editor = state.editor) {
  const root = companionMode && companionRegistered && companionState?.active?.kind === "local" ? companionState.active.root : null;
  const file = editor?.state.file;
  if (!root?.startsWith("/") || !editor?.state.loaded || editor.state.cancelled || !file || file.startsWith("/") || file.split("/").some(part => part === "..")) return null;
  return root.replace(/\/+$/, "") + "/" + file;
}
lifecycleActions = installDocumentActions({
  document, editor: () => state.editor,
  canPublish: editor => !noteEditingLocked(editor.state),
  filePath: editor => companionMode && !companionFrozen && !companionSessionFailed ? currentNoteFilePath(editor) : null,
  writable: () => !(typeof companionMode !== "undefined" && companionMode && companionReadOnly()),
  scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
  json: graphJson, toast,
  onDeleted: async (id, message) => {
    sidebarPages.remove(id);
    folderExplorer.refresh();
    recentWrites.remove(id); noteSearch.markStale(); referenceAutocomplete.markStale();
    state.graph = null;
    if (state.editor?.state.documentId === id) {
      state.editor.cancel(); state.editor = null;
      await navigation.navigate("/");
    }
    toast.show("deletion", message);
  },
});
const noteAttention = JumpyBrainBrowser.installNoteAttention({
  settled: (page, focusOrigin) => sidebarPages.settle(page, focusOrigin),
  document, editor: () => state.editor,
  writable: () => Boolean(activeApiKey) && !(companionMode && companionReadOnly()),
  scope: () => String(credentialRevision) + ":" + (companionMode ? String(companionState?.generation) : "hosted"),
  blocked: () => lifecycleActions.isBusy() || lifecycleActions.isOpen() || navigation.isBusy() || creatingNote || searchDialog.open || connectionDialog.open || dreamDialog.open || feedback.isOpen(),
  json: graphJson, toast,
  changed: (id) => sidebarPages.reloadAttention(id),
  onBusy: () => sidebarPages.sync(),
});
documentActions = {
  ...lifecycleActions,
  close() { lifecycleActions.close(); noteAttention.close(); },
  isOpen: () => lifecycleActions.isOpen() || noteAttention.isOpen() || folderExplorer.isActionOpen(),
  isBusy: () => lifecycleActions.isBusy() || noteAttention.isBusy() || folderExplorer.isBusy(),
};
const externalUpdates = JumpyBrainBrowser.installExternalDocumentUpdates({
  onReadFailure: (details) => feedbackDiagnostics.event("external_refresh", { severity: "warn", outcome: "failed", code: details.timeout ? "timeout" : details.code || "network" }),
  document, editor: () => state.view === "note" ? state.editor : null,
  scope: () => String(credentialRevision) + ":" + (typeof companionMode !== "undefined" && companionMode ? String(companionState?.generation) : ""),
  enabled: () => state.editor?.kind === "http" && Boolean(activeApiKey) && !(typeof companionMode !== "undefined" && companionMode
    && (!companionRegistered || companionFrozen || companionSessionFailed)),
  read: readGraphDocument,
  onUpdated: () => {
    folderExplorer.rename(state.editor.state.documentId, state.editor.state.savedTitle);
    sidebarPages.rename({ id: state.editor.state.documentId, title: state.editor.state.savedTitle });
    sidebarPages.reloadAttention();
    state.graph = null;
    recentWrites.remove(state.editor.state.documentId);
    noteSearch.markStale(); referenceAutocomplete.markStale();
  },
});
`;
