import { media } from "./browser-design-system.js";

// Shared surface, field and feedback primitives (docs/design-system.md#primitives):
// dialog, card, popover/menu, fields, status dot, badge, chip, kbd, callout, status text, empty state.
// Feature styles compose these classes and own only their layout.
const textFields = `input:where(:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="hidden"]))`;

export const componentStyles = /* @__PURE__ */ (() => String.raw`
    dialog { --dialog-width: var(--width-dialog-md); box-sizing: border-box; width: min(var(--dialog-width), calc(100vw - var(--viewport-gutter))); max-height: calc(100dvh - var(--space-16)); padding: var(--space-6); overflow: auto; border: 1px solid var(--line-strong); border-radius: var(--radius-lg); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); }
    dialog::backdrop { background: var(--backdrop); }
    .dialog--sm { --dialog-width: var(--width-dialog-sm); }
    .dialog--md { --dialog-width: var(--width-dialog-md); }
    .dialog--lg { --dialog-width: var(--width-dialog-lg); }
    .dialog--sections { padding: 0; overflow: hidden; }
    .dialog--sections[open] { display: flex; flex-direction: column; }
    .dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-3); }
    .dialog-heading h2, .dialog-title { min-width: 0; margin: 0; color: var(--ink); font: var(--weight-semibold) var(--text-heading)/var(--leading-heading) var(--font-ui); letter-spacing: var(--tracking-tight); overflow-wrap: anywhere; }
    .dialog-close { flex: none; margin: calc(-1 * var(--space-1)) calc(-1 * var(--space-1)) 0 0; }
    .dialog-body { min-height: 0; overflow: auto; }
    .dialog--sections > .dialog-heading { flex: none; margin: 0; padding: var(--space-6) var(--space-6) var(--space-3); }
    .dialog--sections > .dialog-body { padding: 0 var(--space-6); }
    .dialog-footer { flex: none; padding: var(--space-4) var(--space-6); border-top: 1px solid var(--line); }
    .dialog-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-6); }
    .dialog-footer > .dialog-actions { margin-top: 0; }

    .card { --card-pad: var(--space-4); box-sizing: border-box; min-width: 0; padding: var(--card-pad); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); }
    .card--compact { --card-pad: var(--space-2); }
    .card--roomy { --card-pad: var(--space-5); }
    .card--raised { box-shadow: var(--shadow-sm); }
    .card:is([aria-pressed="true"], [aria-current]:not([aria-current="false"]), .is-selected), .card--interactive:has(> input:checked) { border-color: var(--accent); box-shadow: var(--ring-selected); }
    /* Choice cards (a <label> wrapping a visually hidden radio/checkbox): pointer, hover wash, focus ring from the input. */
    .card--interactive { cursor: pointer; }
    .card--interactive:hover { background: var(--hover-fill); }
    .card--interactive:has(> input:focus-visible) { outline: var(--focus-outline); outline-offset: var(--focus-offset); }

    .popover { --popover-width: var(--width-popover); position: fixed; inset: auto; z-index: var(--z-popover); box-sizing: border-box; max-width: min(var(--popover-width), calc(100vw - var(--space-4))); margin: 0; padding: var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-md); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); overflow-wrap: anywhere; }
    .popover--tooltip { --popover-width: var(--width-tooltip); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); font-size: var(--text-caption); pointer-events: none; }
    .popover--caption { color: var(--ink-soft); font-size: var(--text-caption); }
    .popover--menu { padding: var(--space-1); overflow: auto; overscroll-behavior: contain; }
    .menu-item { box-sizing: border-box; display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: var(--control-compact); margin: 0; padding: var(--space-1) var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--ink); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); text-align: left; cursor: pointer; }
    .menu-item:where(:hover):not(:disabled, [aria-disabled="true"]) { background: var(--hover-fill); }
    .menu-item:is([aria-selected="true"], [aria-current="true"]) { background: var(--surface-hover); }
    .menu-item:is(:disabled, [aria-disabled="true"]) { color: var(--ink-faint); cursor: default; }
    .menu-item:focus-visible { outline-offset: var(--focus-offset-inset); }
    .menu-separator { height: 1px; margin: var(--space-1) 0; border: 0; background: var(--line); }

    ${textFields}, textarea { box-sizing: border-box; border: 1px solid var(--line-strong); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); transition: border-color var(--duration-fast) var(--ease), box-shadow var(--duration-fast) var(--ease); }
    ${textFields} { height: var(--control-height); padding: 0 var(--space-3); }
    textarea { min-height: calc(var(--control-height) * 3); padding: var(--space-2) var(--space-3); resize: vertical; }
    input::placeholder, textarea::placeholder { color: var(--ink-faint); opacity: 1; }
    :is(${textFields}, textarea):not(.input--bare):hover:not(:disabled):not(:focus) { border-color: var(--hover-line); }
    :is(${textFields}, textarea):not(.input--bare):focus { border-color: var(--focus-ring); }
    input:where([type="checkbox"], [type="radio"]) { accent-color: var(--accent); }
    .input--entry { font-size: var(--text-section); }
    .input--mono { font: var(--text-caption)/var(--leading-code) var(--font-mono); }
    .input--bare { border-color: transparent; background: transparent; }
    .input--bare:focus-visible { outline: 1px solid var(--focus-line); outline-offset: 0; }
    .field { display: grid; gap: var(--space-1); min-width: 0; margin-block: var(--space-4); }
    .field > :is(input, textarea, select) { width: 100%; }
    .field-label { color: var(--ink); font-size: var(--text-ui); }
    .field-help { margin: 0; color: var(--ink-soft); font-size: var(--text-caption); overflow-wrap: anywhere; }
    .check { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-ui); }
    .check > input { flex: none; width: var(--icon-size); height: var(--icon-size); margin: 0; accent-color: var(--accent); }
    .search-field { position: relative; display: flex; align-items: center; min-width: 0; }
    .search-field > svg { position: absolute; left: var(--space-3); width: var(--icon-size); height: var(--icon-size); color: var(--ink-faint); pointer-events: none; }
    .search-field > input { width: 100%; padding-left: calc(var(--space-3) + var(--icon-size) + var(--space-2)); }

    .status-dot { --status-dot-color: var(--ink-faint); display: inline-block; flex: none; width: var(--dot-size); height: var(--dot-size); border-radius: var(--radius-round); background: var(--status-dot-color); }
    .status-dot--connected, [data-state="connected"] > .status-dot { --status-dot-color: var(--status-connected); }
    .status-dot--error, :is([data-state="disconnected"], [data-state="unavailable"]) > .status-dot { --status-dot-color: var(--error-ink); }
    .status-dot--accent { --status-dot-color: var(--accent); }
    .status-dot--soft { --status-dot-color: var(--ink-soft); }
    .badge { display: inline-flex; align-items: center; padding: var(--space-0-5) var(--space-2); border-radius: var(--radius-sm); background: var(--surface-hover); color: var(--ink-soft); font: var(--weight-regular) var(--text-caption)/var(--leading-ui) var(--font-ui); white-space: nowrap; }
    .chip-list { display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0; padding: 0; list-style: none; }
    .chip-list > li { min-width: 0; max-width: 100%; }
    .chip { max-width: 100%; min-height: var(--control-compact); padding: var(--space-1) var(--space-2); font-size: var(--text-caption); text-align: left; overflow-wrap: anywhere; }
    .chip--truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kbd { padding: 0 var(--space-1); border: 1px solid var(--line); border-radius: var(--radius-sm); color: var(--ink-faint); font: var(--weight-regular) var(--text-caption)/var(--leading-ui) var(--font-ui); }

    .callout { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink-soft); font-size: var(--text-ui); }
    .callout > :is(p, span):first-child { flex: 1 1 var(--card-width); min-width: 0; margin: 0; overflow-wrap: anywhere; }
    .callout--strip { padding: var(--space-2) var(--space-4); border-width: 0 0 1px; border-radius: 0; font-size: var(--text-caption); }
    .callout--error { border-color: var(--error-line); background: var(--error-fill); color: var(--error-ink); }
    .callout--warning { border-color: var(--accent); }
    .status-text { margin: var(--space-3) 0 0; color: var(--ink-soft); font-size: var(--text-ui); overflow-wrap: anywhere; white-space: pre-line; }
    .status-text--caption { font-size: var(--text-caption); }
    .status-text[data-error="true"] { color: var(--error-ink); }
    .empty-state { max-width: var(--measure-narrow); margin: var(--space-8) auto; color: var(--ink-soft); font-size: var(--text-body); text-align: center; }
    .empty-state--inline { max-width: none; margin: var(--space-1) 0; color: var(--ink-faint); font-size: var(--text-caption); text-align: left; }
    .empty-state--pending { font-style: italic; }

    @media ${media.narrow} {
      .card--roomy { --card-pad: var(--space-4); }
    }
    @media ${media.narrow}, ${media.coarse} {
      ${textFields} { height: var(--control-touch); }
      .menu-item, .chip { min-height: var(--control-touch); }
    }
`)();
