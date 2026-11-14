import { media } from "./browser-design-system.js";

/** Server-rendered glyph source for prepareDropdown; render once per page with the shared
 * browserChevronDownIcon/browserChevronsUpDownIcon (graph-page.ts). Not imported here so the
 * browser bundles stay free of glyph data and its license notice. */
export function dropdownGlyphsMarkup(down: string, switcher: string): string {
  return `<template id="dropdown-glyphs"><span data-glyph="down">${down}</span><span data-glyph="switcher">${switcher}</span></template>`;
}

// Shared native single-select component. Values, labels, validation and keyboard
// behavior belong to the select; selectedcontent is mirrored by the browser.
// Supporting browsers get the shared chevron (chevrons-up-down for `.dropdown--switcher`,
// chosen at preparation time) cloned from #dropdown-glyphs, so browser bundles carry no
// glyph data; without that template, or in unsupported browsers, the native arrow stays.
export function prepareDropdown(select: HTMLSelectElement): void {
  select.classList.add("dropdown");
  const doc = select.ownerDocument;
  if (!doc.defaultView?.CSS.supports("appearance", "base-select") || select.querySelector(":scope > button")) return;
  const button = doc.createElement("button");
  button.type = "button";
  button.append(doc.createElement("selectedcontent"));
  const glyphs = doc.getElementById("dropdown-glyphs") as HTMLTemplateElement | null;
  const glyph = glyphs?.content.querySelector(`[data-glyph="${select.classList.contains("dropdown--switcher") ? "switcher" : "down"}"] > svg`);
  if (glyph) button.append(glyph.cloneNode(true));
  select.prepend(button);
}

export const dropdownStyles = /* @__PURE__ */ (() => `
  .dropdown {
    min-width: 0;
    max-width: 100%;
    min-height: var(--control-height);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-sm);
    background: var(--control-fill);
    color: var(--ink);
    font: var(--text-ui)/var(--leading-ui) var(--font-ui);
    text-overflow: ellipsis;
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease);
  }
  .dropdown:hover:not(:disabled) { border-color: var(--hover-line); }
  .dropdown:disabled { opacity: var(--opacity-disabled); cursor: not-allowed; }
  .dropdown--quiet { min-height: var(--control-height); border-color: transparent; background: transparent; color: var(--ink-soft); padding: var(--space-1) var(--space-2); }
  .dropdown--quiet:hover:not(:disabled) { border-color: transparent; background: var(--hover-fill); color: var(--ink); }
  /* Full-row switcher (brain switcher): one wash covers the row, including a decorative lead
     (status dot) that a parent overlays inside --switcher-lead. Parents may redefine both variables. */
  :root { --switcher-height: var(--control-height); --switcher-lead: var(--space-2); }
  .dropdown--switcher { width: 100%; min-height: var(--switcher-height); padding: var(--space-1) var(--space-3) var(--space-1) var(--switcher-lead); border-color: transparent; background: transparent; color: var(--ink-soft); }
  .dropdown--switcher:is(:hover, :open):not(:disabled) { border-color: transparent; background: var(--hover-fill); color: var(--ink); }
  .dropdown--switcher:focus-visible { outline-offset: var(--focus-offset-inset); }
  @supports (appearance: base-select) {
    .dropdown, .dropdown::picker(select) { appearance: base-select; }
    .dropdown { display: flex; align-items: center; gap: var(--space-2); overflow: hidden; white-space: nowrap; }
    .dropdown > button { all: unset; display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; text-align: start; }
    .dropdown selectedcontent { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dropdown:has(> button > .dropdown-chevron)::picker-icon { display: none; }
    .dropdown::picker-icon { color: var(--ink-soft); flex-shrink: 0; margin-inline-start: auto; }
    .dropdown-chevron { flex: none; width: var(--icon-size); height: var(--icon-size); margin-inline-start: auto; color: var(--ink-soft); transition: color var(--duration-fast) var(--ease); }
    .dropdown:is(:hover, :open):not(:disabled) .dropdown-chevron { color: var(--ink); }
    .dropdown::picker(select) {
      box-sizing: border-box;
      inline-size: anchor-size(self-inline);
      min-inline-size: 0;
      max-inline-size: calc(100vw - var(--space-6));
      max-block-size: min(280px, calc(100dvh - var(--space-6)));
      margin-block: var(--space-1);
      padding: var(--space-1);
      overflow: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-md);
      background: var(--surface);
      color: var(--ink);
      box-shadow: var(--shadow-lg);
      font: var(--text-ui)/var(--leading-ui) var(--font-ui);
      white-space: normal;
    }
    .dropdown option {
      min-height: var(--control-compact);
      padding: var(--space-2);
      gap: var(--space-2);
      border-radius: var(--radius-sm);
      overflow-wrap: anywhere;
      white-space: normal;
      cursor: pointer;
    }
    .dropdown option:checked { background: var(--control-fill); }
    .dropdown option:not(:disabled):not(:checked):is(:hover, :focus) { background: var(--hover-fill); }
    .dropdown option:focus-visible { outline: var(--focus-outline); outline-offset: var(--focus-offset-inset); }
    .dropdown option::checkmark { color: var(--accent); }
    .dropdown option:disabled { color: var(--ink-faint); cursor: not-allowed; }
  }
  @media ${media.narrow}, ${media.coarse} {
    .dropdown, .dropdown--quiet { min-height: var(--control-touch); }
    :root { --switcher-height: var(--control-touch); }
    .dropdown option { min-height: var(--control-touch); }
  }
  @media ${media.reducedMotion} {
    .dropdown, .dropdown-chevron { transition: none; }
  }
`)();
