import { media } from "./browser-design-system.js";

// Shared button primitive. Classes are the public API (docs/design-system.md#primitives):
// .button (+ .button-primary), .quiet-button (+ .quiet-button--plain), .icon-button (+ .icon-button--framed),
// modifiers .button--danger, .button--sm, .button--toggle, .icon-button--glyph-toggle. States only move --btn-* variables, so a
// component rule that sets a property (e.g. `background: transparent`) keeps it in every state.
export const buttonStyles = /* @__PURE__ */ (() => String.raw`
    .button, .quiet-button, .icon-button { --btn-fill: var(--control-fill); --btn-fill-hover: var(--control-hover); --btn-on-fill: var(--surface-hover); --btn-ring: transparent; --btn-ink: var(--ink-soft); --btn-ink-hover: var(--ink); --btn-size: var(--control-height); --btn-bg: var(--btn-fill); --btn-color: var(--btn-ink); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: var(--btn-size); margin: 0; padding: var(--space-2) var(--space-3); border: 0 solid transparent; border-radius: var(--radius-sm); background: var(--btn-bg); color: var(--btn-color); box-shadow: inset 0 0 0 1px var(--btn-ring); font: var(--weight-regular) var(--text-ui)/var(--leading-ui) var(--font-ui); text-align: center; text-decoration: none; cursor: pointer; transition: color var(--duration-fast) var(--ease); }
    :where(.button, .quiet-button, .icon-button) svg { display: block; flex: none; width: var(--icon-size); height: var(--icon-size); }
    .button { padding-inline: var(--space-4); font-weight: var(--weight-semibold); }
    .button-primary { --btn-fill: var(--control-fill); --btn-ring: var(--line); --btn-ink: var(--ink); }
    .quiet-button--plain { --btn-fill: transparent; --btn-fill-hover: var(--hover-fill); --btn-on-fill: var(--control-fill); }
    .button--danger { --btn-ink: var(--error-ink); --btn-ink-hover: var(--error-ink); }
    .button--sm { --btn-size: var(--control-compact); padding: var(--space-1) var(--space-2); }
    .icon-button { --btn-fill: transparent; --btn-fill-hover: var(--btn-fill); --btn-on-fill: var(--control-fill); --btn-size: var(--control-compact); flex: 0 0 auto; display: inline-grid; place-items: center; width: var(--btn-size); height: var(--btn-size); min-width: var(--btn-size); padding: 0; }
    .icon-button--framed { --btn-fill: var(--control-fill); --btn-ring: var(--line); --btn-on-fill: var(--surface-hover); }
    :is(.button, .quiet-button, .icon-button):hover:not(:disabled, [aria-disabled="true"]) { --btn-bg: var(--btn-fill-hover); --btn-color: var(--btn-ink-hover); }
    :is(.button, .quiet-button, .icon-button):is([aria-pressed="true"], [aria-current="page"], .button--toggle[aria-expanded="true"]), details[open] > summary:is(.button, .quiet-button, .icon-button).button--toggle { --btn-fill: var(--btn-on-fill); --btn-fill-hover: var(--btn-on-fill); --btn-ink: var(--ink); }
    .icon-button:is([aria-pressed="true"], [aria-current="page"], .button--toggle[aria-expanded="true"]), details[open] > summary.icon-button.button--toggle { --btn-ring: var(--accent); }
    /* Glyph toggles (e.g. the sidebar pin) draw their pressed state in the glyph itself, not with the shared on-state fill/ring. */
    .icon-button.icon-button--glyph-toggle:is([aria-pressed="true"], [aria-current="page"]) { --btn-fill: transparent; --btn-fill-hover: transparent; --btn-ring: transparent; --btn-ink: var(--ink-soft); }
    button:disabled, :is(.button, .quiet-button, .icon-button):is(:disabled, [aria-disabled="true"]) { opacity: var(--opacity-disabled); cursor: not-allowed; }
    :is(button, .button, .quiet-button, .icon-button)[aria-busy="true"] { cursor: progress; }
    summary:is(.button, .quiet-button, .icon-button) { list-style: none; }
    summary:is(.button, .quiet-button, .icon-button)::-webkit-details-marker { display: none; }
    @media ${media.narrow}, ${media.coarse} {
      .button, .quiet-button, .icon-button, .button--sm { --btn-size: var(--control-touch); }
    }
    @media ${media.reducedMotion} {
      .button, .quiet-button, .icon-button { transition: none; }
    }
`)();
