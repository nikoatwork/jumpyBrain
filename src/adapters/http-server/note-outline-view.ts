export const noteOutlineMarkup = `<nav id="note-outline" aria-label="Note sections" hidden>
  <button id="note-outline-control" type="button" aria-label="Navigate sections" aria-describedby="note-outline-help"></button>
  <span id="note-outline-help" hidden>Use Up and Down arrows to preview sections, Home and End for first and last, and Enter or Space to jump.</span>
  <div id="note-outline-preview" role="tooltip" hidden><strong id="note-outline-title"></strong><span id="note-outline-excerpt"></span></div>
</nav>`;

export const noteOutlineStyles = `
  #note-outline { position: sticky; top: 50%; width: var(--space-8); height: 0; z-index: 4; }
  #note-outline-control { display: flex; flex-direction: column; justify-content: space-around; align-items: flex-start; width: var(--space-8); min-height: 0; padding: 0 var(--space-2); border: 0; border-radius: var(--radius-sm); background: transparent; transform: translateY(-50%); cursor: pointer; }
  #note-outline-control::before { content: ''; position: absolute; left: var(--space-2); top: 0; bottom: 0; width: 1px; background: var(--line); opacity: .6; }
  #note-outline-control:focus-visible { outline-offset: -2px; }
  .note-outline-tick { display: block; position: absolute; height: 2px; border-radius: 2px; background: var(--ink-faint); opacity: .55; transform-origin: left; transition: transform 120ms ease, background 120ms ease; }
  .note-outline-tick[data-current="true"] { background: var(--accent); opacity: 1; }
  #note-outline:hover .note-outline-tick, #note-outline:focus-within .note-outline-tick { opacity: 1; }
  #note-outline-preview { position: absolute; left: var(--space-10); width: min(300px, calc(100vw - 96px)); padding: var(--space-3) var(--space-4); border: 1px solid var(--line); border-radius: var(--radius-md); background: var(--surface); color: var(--ink); box-shadow: var(--shadow-lg); font: var(--text-ui)/var(--leading-ui) var(--font-ui); overflow-wrap: anywhere; }
  #note-outline-preview::before { content: ''; position: absolute; right: 100%; top: 0; height: 100%; width: var(--space-2); }
  #note-outline-title, #note-outline-excerpt { display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
  #note-outline-title { font-weight: var(--weight-semibold); -webkit-line-clamp: 2; }
  #note-outline-excerpt { margin-top: var(--space-1); color: var(--ink-soft); -webkit-line-clamp: 3; }
  #note-outline[hidden], #note-outline-preview[hidden], #note-outline-excerpt[hidden] { display: none; }
  @media (max-width: 680px) { #note-outline { display: none; } }
`;
