import { media } from "./browser-design-system.js";

// Shared button primitive. Classes are the public API (docs/design-system.md#primitives):
// .button (+ .button-primary), .quiet-button (+ .quiet-button--plain), .icon-button (+ .icon-button--framed),
// modifiers .button--danger, .button--sm, .button--toggle. States only move --btn-* variables, so a
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
    .icon-button:is([aria-pressed="true"], [aria-current="page"], .button--toggle[aria-expanded="true"]), details[open] > summary.icon-button.button--toggle { --btn-ring: var(--line); }
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

export type ButtonVariant = "primary" | "secondary" | "plain";

export interface ButtonOptions {
  /** Accessible name. Icon-only buttons also use it as their tooltip unless `title` is given. */
  label: string;
  /** Trusted SVG markup from browser-icons.ts. */
  icon?: string;
  /** Show `label` as visible text next to the icon (icon + text button). */
  showLabel?: boolean;
  /** Text-button emphasis; ignored for icon-only buttons. Default "secondary". */
  variant?: ButtonVariant;
  /** Destructive ink (.button--danger); combine with any variant. */
  danger?: boolean;
  /** "sm" = 32px text button (.button--sm). Icon buttons are always 32px (40px touch). */
  size?: "sm" | "md";
  /** Icon-only: filled + ringed (.icon-button--framed), for controls floating over the graph canvas. */
  framed?: boolean;
  /** Opt in to the aria-expanded "on" state (.button--toggle). */
  toggle?: boolean;
  /** Sets aria-pressed (true/false) for pressed toggles. */
  pressed?: boolean;
  /** Tooltip override, e.g. a disabled reason. */
  title?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Extra component hook class(es). */
  className?: string;
  id?: string;
}

/** Class list for a button with these options (shared by createButton and buttonMarkup). */
export function buttonClassName(options: Omit<ButtonOptions, "label">): string {
  const iconOnly = Boolean(options.icon) && !options.showLabel;
  const classes = iconOnly
    ? ["icon-button", options.framed ? "icon-button--framed" : ""]
    : options.variant === "primary" ? ["button", "button-primary"]
    : options.variant === "plain" ? ["quiet-button", "quiet-button--plain"]
    : ["quiet-button"];
  if (options.danger) classes.push("button--danger");
  if (!iconOnly && options.size === "sm") classes.push("button--sm");
  if (options.toggle) classes.push("button--toggle");
  if (options.className) classes.push(options.className);
  return classes.filter(Boolean).join(" ");
}

/** Browser helper: builds a primitive button. Exposed as `JumpyBrainBrowser.createButton` for inline scripts. */
export function createButton(doc: Document, options: ButtonOptions & { onClick?: (event: MouseEvent) => void }): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = options.type ?? "button";
  button.className = buttonClassName(options);
  if (options.id) button.id = options.id;
  const iconOnly = Boolean(options.icon) && !options.showLabel;
  if (options.icon) button.insertAdjacentHTML("afterbegin", options.icon);
  if (iconOnly) {
    button.setAttribute("aria-label", options.label);
    button.title = options.title ?? options.label;
  } else {
    const text = doc.createElement("span");
    text.textContent = options.label;
    button.append(text);
    if (options.title) button.title = options.title;
  }
  if (options.pressed !== undefined) button.setAttribute("aria-pressed", String(options.pressed));
  if (options.disabled) button.disabled = true;
  if (options.onClick) button.addEventListener("click", options.onClick);
  return button;
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** Server-template helper: same contract as createButton. `attrs` is trusted extra attribute markup. */
export function buttonMarkup(options: ButtonOptions & { attrs?: string }): string {
  const iconOnly = Boolean(options.icon) && !options.showLabel;
  const title = options.title ?? (iconOnly ? options.label : undefined);
  const attributes = [
    options.id ? `id="${escapeHtml(options.id)}"` : "",
    `class="${escapeHtml(buttonClassName(options))}"`,
    `type="${options.type ?? "button"}"`,
    iconOnly ? `aria-label="${escapeHtml(options.label)}"` : "",
    title ? `title="${escapeHtml(title)}"` : "",
    options.pressed !== undefined ? `aria-pressed="${options.pressed}"` : "",
    options.disabled ? "disabled" : "",
    options.attrs ?? "",
  ].filter(Boolean).join(" ");
  return `<button ${attributes}>${options.icon ?? ""}${iconOnly ? "" : `<span>${escapeHtml(options.label)}</span>`}</button>`;
}
