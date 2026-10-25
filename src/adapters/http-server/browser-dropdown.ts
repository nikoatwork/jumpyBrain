// Shared native single-select component. Values, labels, validation and keyboard
// behavior belong to the select; selectedcontent is mirrored by the browser.
export function prepareDropdown(select: HTMLSelectElement): void {
  select.classList.add("dropdown");
  if (!select.ownerDocument.defaultView?.CSS.supports("appearance", "base-select") || select.querySelector(":scope > button")) return;
  const button = select.ownerDocument.createElement("button");
  button.type = "button";
  button.append(select.ownerDocument.createElement("selectedcontent"));
  select.prepend(button);
}

export const dropdownStyles = `
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
  }
  .dropdown:hover:not(:disabled) { border-color: var(--ink-faint); }
  .dropdown:disabled { opacity: .5; cursor: not-allowed; }
  .dropdown--quiet { width: 100%; min-height: var(--control-compact); border-color: transparent; background: transparent; color: var(--ink-soft); padding: var(--space-1) var(--space-2); }
  .dropdown--quiet:hover:not(:disabled) { border-color: transparent; background: var(--surface-hover); color: var(--ink); }
  @supports (appearance: base-select) {
    .dropdown, .dropdown::picker(select) { appearance: base-select; }
    .dropdown { display: flex; align-items: center; gap: var(--space-2); overflow: hidden; white-space: nowrap; }
    .dropdown > button { all: unset; display: flex; flex: 1; min-width: 0; text-align: start; }
    .dropdown selectedcontent { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dropdown::picker-icon { color: var(--ink-soft); flex-shrink: 0; margin-inline-start: auto; }
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
    .dropdown option:hover, .dropdown option:focus { background: var(--surface-hover); }
    .dropdown option:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
    .dropdown option::checkmark { color: var(--accent); }
    .dropdown option:disabled { color: var(--ink-faint); cursor: not-allowed; }
  }
  @media (max-width: 680px) {
    .dropdown, .dropdown--quiet { min-height: var(--control-touch); }
    .dropdown option { min-height: var(--control-touch); }
  }
`;
