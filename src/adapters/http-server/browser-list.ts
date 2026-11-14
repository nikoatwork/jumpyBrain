import { media } from "./browser-design-system.js";

// Shared row, list and disclosure primitives (docs/design-system.md#primitives).
// .list-row slots: .list-row-lead, .list-row-label, .list-row-meta, .row-actions; composite rows put one
// .list-row-target inside. Variants: --edge (square, full pane width), --compact (32px), --shelf (48px),
// --page (two lines + age lane). Indent with style="--row-depth: n".
export const listStyles = /* @__PURE__ */ (() => String.raw`
    .list-reset { margin: 0; padding: 0; list-style: none; }
    .list-row { --row-fill: transparent; --row-depth: 0; --row-action-count: 3; position: relative; box-sizing: border-box; display: flex; align-items: center; gap: var(--space-2); min-width: 0; min-height: var(--row-height); margin: 0; padding: var(--space-1) var(--row-inset) var(--space-1) calc(var(--row-inset) + var(--row-depth) * var(--row-indent)); border: 0; border-radius: var(--radius-sm); background: var(--row-fill); color: var(--ink-soft); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); text-align: left; text-decoration: none; cursor: pointer; }
    button.list-row { width: 100%; }
    .list-row--edge { border-radius: 0; }
    .list-row--compact { --row-height: var(--control-compact); }
    .list-row--shelf { --row-height: var(--header-height); padding-block: var(--space-3); padding-inline: var(--space-5) var(--space-6); font-size: var(--text-body); }
    .list-row--page { display: grid; grid-template-columns: minmax(0, 1fr) minmax(var(--space-8), max-content); gap: var(--space-2) var(--row-meta-gap); padding: var(--space-3); }
    .list-row:where(:hover, :focus-within):not(:disabled, [aria-disabled="true"]) { --row-fill: var(--hover-fill); color: var(--ink); }
    .list-row[aria-selected="true"] { --row-fill: var(--surface-hover); color: var(--ink); }
    .list-row:is([aria-current="page"], [aria-current="true"], :has(> .list-row-target[aria-current="page"])) { --row-fill: var(--control-fill); color: var(--ink); }
    .list-row:is(:disabled, [aria-disabled="true"]) { color: var(--ink-faint); cursor: default; }
    .list-row:focus-visible, .list-row .list-row-target:focus-visible, .list-row .row-action:focus-visible { outline-offset: var(--focus-offset-inset); }
    .list-row-target { flex: 1; min-width: 0; color: inherit; text-decoration: none; }
    .list-row-target[aria-current] { background: transparent; }
    .list-row-lead { flex: none; display: grid; place-items: center; width: var(--icon-size); height: var(--icon-size); color: var(--ink-faint); }
    .list-row-lead svg { width: var(--icon-size); height: var(--icon-size); }
    .list-row-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list-row--page .list-row-title { grid-area: 1 / 1; min-width: 0; overflow: hidden; color: var(--ink); font-size: var(--text-body); font-weight: var(--weight-semibold); text-overflow: ellipsis; white-space: nowrap; }
    .list-row--page .list-row-preview { grid-area: 2 / 1; min-width: 0; overflow: hidden; color: var(--ink-soft); font-size: var(--text-ui); text-overflow: ellipsis; white-space: nowrap; }
    .list-row--page .list-row-meta { grid-area: 1 / 2; align-self: center; justify-self: end; padding-left: 0; }
    .list-meta, .list-row-meta { flex: none; margin-left: auto; padding-left: var(--row-meta-gap); color: var(--ink-faint); font-size: var(--text-caption); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .list-section-label { margin: 0 0 var(--space-2); padding-inline: var(--row-inset); color: var(--ink-soft); font: var(--weight-regular) var(--text-caption)/var(--leading-ui) var(--font-ui); }
    .list-section-label--flush { padding-inline: 0; }
    .list-status { margin: 0; padding: var(--space-1) var(--row-inset) var(--space-2) calc(var(--row-inset) + var(--row-depth, 0) * var(--row-indent)); color: var(--ink-faint); font: italic var(--weight-regular) var(--text-caption)/var(--leading-ui) var(--font-ui); }
    .list-more { margin: var(--space-1) var(--row-inset); font-size: var(--text-caption); }
    /* Inline actions stay clickable while faded (they own their lane); overlay actions sit over the
       label/meta, so they ignore the pointer until the row is hovered or focused. */
    .row-actions { display: flex; flex: none; align-items: center; opacity: 0; transition: opacity var(--duration-fast) var(--ease); }
    .list-row:is(:hover, :focus-within) .row-actions, .row-actions--always { opacity: 1; pointer-events: auto; }
    .row-actions--overlay { position: absolute; right: var(--space-4); top: 50%; transform: translateY(-50%); pointer-events: none; }
    .disclosure-trigger { cursor: pointer; }
    summary.disclosure-trigger { list-style: none; }
    summary.disclosure-trigger::-webkit-details-marker { display: none; }
    .disclosure-chevron { flex: none; width: var(--icon-size); height: var(--icon-size); color: var(--ink-faint); transition: transform var(--duration-fast) var(--ease), color var(--duration-fast) var(--ease); }
    .disclosure-trigger:is(:hover, :focus-visible) > .disclosure-chevron { color: var(--ink); }
    .disclosure-trigger[aria-expanded="true"] > .disclosure-chevron, details[open] > summary.disclosure-trigger > .disclosure-chevron { transform: rotate(90deg); }
    .disclosure-trigger--inline { display: inline-flex; align-items: center; gap: var(--space-1); width: fit-content; color: var(--ink-soft); }
    @media ${media.hover} {
      .list-row:has(.row-actions--overlay):is(:hover, :focus-within) { padding-right: calc(var(--row-action-count) * var(--control-compact) + var(--space-2)); }
      .list-row--page:has(.row-actions--overlay):is(:hover, :focus-within) .list-row-meta { visibility: hidden; }
    }
    @media ${media.touch} {
      .row-actions { opacity: 1; pointer-events: auto; }
      .row-actions--overlay { position: static; transform: none; }
    }
    @media ${media.narrow}, ${media.coarse} {
      .list-row:not(.list-row--shelf) { --row-height: var(--control-touch); }
      .list-row--edge { border-radius: var(--radius-sm); }
    }
    @media ${media.reducedMotion} {
      .row-actions, .disclosure-chevron { transition: none; }
    }
`)();

export interface DisclosureOptions {
  /** Short subject; sets "Expand <label>" / "Collapse <label>" as tooltip and accessible name. */
  label?: string;
  /** Controlled region; linked through aria-controls and hidden while closed. */
  controls?: HTMLElement;
}

/** Sync a disclosure trigger (button or summary) with its open state. Exposed as `JumpyBrainBrowser.setDisclosure`. */
export function setDisclosure(trigger: HTMLElement, open: boolean, options: DisclosureOptions = {}): void {
  trigger.setAttribute("aria-expanded", String(open));
  if (options.controls) {
    if (options.controls.id) trigger.setAttribute("aria-controls", options.controls.id);
    options.controls.hidden = !open;
  }
  if (options.label) {
    const name = `${open ? "Collapse" : "Expand"} ${options.label}`;
    trigger.title = name;
    trigger.setAttribute("aria-label", name);
  }
}
