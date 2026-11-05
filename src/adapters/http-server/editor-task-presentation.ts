// Presentation only: classes/timers never enter Lexical state or Markdown history.
export function createTaskCompletionFeedback(element: HTMLElement) {
  const win = element.ownerDocument.defaultView!;
  const timers = new Map<HTMLElement, number>();
  function stop(row: HTMLElement) {
    win.clearTimeout(timers.get(row));
    timers.delete(row);
    row.classList.remove("task-completed");
  }
  return {
    play(button: HTMLElement) {
      const row = button.parentElement;
      if (!row || !element.contains(row) || button.getAttribute("aria-checked") !== "true") return;
      stop(row);
      void row.offsetWidth; // Restart after a rapid uncheck/check without remounting.
      row.classList.add("task-completed");
      timers.set(row, win.setTimeout(() => stop(row), 850));
    },
    sync() {
      for (const row of timers.keys()) {
        const button = row.querySelector<HTMLButtonElement>("[data-task-toggle]");
        if (!element.contains(row) || !button || button.disabled || button.getAttribute("aria-checked") !== "true") stop(row);
      }
    },
    clear() { for (const row of timers.keys()) stop(row); },
  };
}

export const taskCompletionStyles = `
#note-editor .markdown-task {
  --delight-success: color-mix(in srgb, var(--status-connected) 74%, var(--ink));
  --delight-fill: color-mix(in srgb, var(--status-connected) 62%, var(--ink));
}

#note-editor .markdown-task > button {
  position: relative;
  transition: background-color 140ms ease, border-color 140ms ease;
}

/* Keep a forgiving pointer target around the smaller visible box. */
#note-editor .markdown-task > button::before {
  content: "";
  position: absolute;
  inset: -4px;
}

#note-editor .markdown-task > button[aria-checked="true"] {
  border-color: var(--delight-fill);
  background: var(--delight-fill);
  color: var(--surface);
}

#note-editor .markdown-task > button[aria-checked="true"]::after {
  content: "";
  width: 7px;
  height: 4px;
  margin-top: -2px;
  border: solid currentColor;
  border-width: 0 0 2px 2px;
  transform: rotate(-45deg);
}

#note-editor .markdown-task > span {
  position: relative;
  isolation: isolate;
  color: var(--ink);
  text-decoration: none;
}

/* Fade the entire label, including inline formatting and wrapped lines. */
#note-editor .markdown-task > button[aria-checked="true"] + span {
  opacity: .8;
}

/* The wash advances beneath the words, then dissolves completely. */
#note-editor .markdown-task.task-completed > button[aria-checked="true"] + span::before {
  content: "";
  position: absolute;
  pointer-events: none;
  z-index: -1;
  inset-inline-start: 0;
  top: 3px;
  bottom: 3px;
  width: 100%;
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--delight-success) 7%, transparent),
    color-mix(in srgb, var(--delight-success) 17%, transparent));
  transform-origin: left center;
  animation: task-quiet-wash 780ms cubic-bezier(.2,.65,.25,1) both;
}

#note-editor .markdown-task.task-completed > button[aria-checked="true"] {
  animation: task-quiet-settle 300ms ease-out both;
}

#note-editor .markdown-task > button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

@keyframes task-quiet-wash {
  0% { transform: scaleX(0); opacity: 0; }
  12% { opacity: 1; }
  62% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(1); opacity: 0; }
}

@keyframes task-quiet-settle {
  0% { transform: translateY(1px); }
  65% { transform: translateY(-1px); }
  100% { transform: translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  #note-editor .markdown-task > button {
    transition: none;
  }
  #note-editor .markdown-task.task-completed > button,
  #note-editor .markdown-task.task-completed > button + span::before {
    animation: none !important;
  }
  #note-editor .markdown-task.task-completed > button + span::before {
    content: none;
  }
}
`;
