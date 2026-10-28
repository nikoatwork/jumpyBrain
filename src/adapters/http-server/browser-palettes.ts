// Built-in alternatives to Ember. Shared semantic roles keep editor/map/dialogs in sync.
export const builtInPalettes = {
  ocean: {
    light: {
      ink: "#1d2b38", "ink-soft": "#405266", "ink-faint": "#46566a",
      surface: "#edf3f8", "control-fill": "#dfe8f0", "surface-hover": "#d2dfe9",
      "focus-ring": "#276586", accent: "#276586", "selection-fill": "#27658633",
      "status-connected": "#43725f", "error-ink": "#803c42", "error-fill": "#f2dddd", "error-line": "#a45a64",
      line: "#cdd9e3", "line-strong": "#a9bdcd", edge: "#466c88", "edge-link": "#716281", "edge-end": "#3e786f",
      "node-page": "#466c88", "node-decision": "#7b6829", "node-finding": "#716281", "node-preference": "#925858",
      "node-session": "#53764b", "node-note": "#3e786f", "node-unresolved": "#97642e",
      "edge-shadow": "#1d2b38", "edge-highlight": "#edf3f8", "node-light": "#edf3f8", "node-shade": "#1d2b38",
      backdrop: "rgba(29, 43, 56, .24)", "shadow-sm": "0 1px 3px rgba(29, 43, 56, .08)", "shadow-lg": "0 16px 48px rgba(29, 43, 56, .16), 0 2px 8px rgba(29, 43, 56, .08)",
    },
    dark: {
      ink: "#e0eaf1", "ink-soft": "#b0c1ce", "ink-faint": "#a6b8c6",
      surface: "#16212b", "control-fill": "#1f2d3a", "surface-hover": "#2a3b4a",
      "focus-ring": "#81bfde", accent: "#81bfde", "selection-fill": "#81bfde40",
      "status-connected": "#8fb9a5", "error-ink": "#e5abb4", "error-fill": "#392b35", "error-line": "#b87988",
      line: "#344757", "line-strong": "#536d80", edge: "#8cbbd7", "edge-link": "#b29cc5", "edge-end": "#89c3b5",
      "node-page": "#8cbbd7", "node-decision": "#d3be80", "node-finding": "#b29cc5", "node-preference": "#ce979f",
      "node-session": "#a4be91", "node-note": "#89c3b5", "node-unresolved": "#d5af7c",
      "edge-shadow": "#0e1720", "edge-highlight": "#e0eaf1", "node-light": "#e0eaf1", "node-shade": "#0e1720",
      backdrop: "rgba(5, 12, 20, .55)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .2)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2)",
    },
  },
  grove: {
    light: {
      ink: "#263023", "ink-soft": "#46533d", "ink-faint": "#4c5943",
      surface: "#eef1e7", "control-fill": "#e0e6d4", "surface-hover": "#d2dcc5",
      "focus-ring": "#496d39", accent: "#496d39", "selection-fill": "#496d3933",
      "status-connected": "#57704a", "error-ink": "#783c3c", "error-fill": "#eddfd4", "error-line": "#9a6560",
      line: "#cdd7bf", "line-strong": "#a8b99a", edge: "#4e7560", "edge-link": "#76617a", "edge-end": "#3f727b",
      "node-page": "#4e7560", "node-decision": "#7b6829", "node-finding": "#76617a", "node-preference": "#925858",
      "node-session": "#657638", "node-note": "#3f727b", "node-unresolved": "#97642e",
      "edge-shadow": "#263023", "edge-highlight": "#eef1e7", "node-light": "#eef1e7", "node-shade": "#263023",
      backdrop: "rgba(38, 48, 35, .24)", "shadow-sm": "0 1px 3px rgba(38, 48, 35, .08)", "shadow-lg": "0 16px 48px rgba(38, 48, 35, .16), 0 2px 8px rgba(38, 48, 35, .08)",
    },
    dark: {
      ink: "#dfe9d9", "ink-soft": "#b7c5af", "ink-faint": "#adbea5",
      surface: "#19231d", "control-fill": "#243128", "surface-hover": "#303f33",
      "focus-ring": "#a1c38a", accent: "#a1c38a", "selection-fill": "#a1c38a40",
      "status-connected": "#a1bb95", "error-ink": "#e3b0a5", "error-fill": "#392e29", "error-line": "#b97d73",
      line: "#3b4c3e", "line-strong": "#5e755b", edge: "#9ebda2", "edge-link": "#baa1c2", "edge-end": "#92bdc5",
      "node-page": "#9ebda2", "node-decision": "#d1bd83", "node-finding": "#baa1c2", "node-preference": "#cc9e9a",
      "node-session": "#b3c38e", "node-note": "#92bdc5", "node-unresolved": "#d2ad7e",
      "edge-shadow": "#101811", "edge-highlight": "#dfe9d9", "node-light": "#dfe9d9", "node-shade": "#101811",
      backdrop: "rgba(10, 20, 12, .55)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .2)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2)",
    },
  },
} as const;

export const paletteStyles = Object.entries(builtInPalettes).flatMap(([name, modes]) =>
  Object.entries(modes).map(([mode, tokens]) => `:root[data-palette="${name}"][data-theme="${mode}"] { ${Object.entries(tokens).map(([key, value]) => `--${key}: ${value};`).join(" ")} }`)
).join("\n");
