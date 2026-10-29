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
  mono: {
    light: {
      ink: "#161616", "ink-soft": "#505050", "ink-faint": "#5b5b5b",
      surface: "#ffffff", "control-fill": "#f2f2f2", "surface-hover": "#e8e8e8",
      "focus-ring": "#424242", accent: "#424242", "selection-fill": "#42424233",
      "status-connected": "#6b6b6b", "error-ink": "#333333", "error-fill": "#ededed", "error-line": "#777777",
      line: "#dedede", "line-strong": "#b8b8b8", edge: "#626262", "edge-link": "#777777", "edge-end": "#515151",
      "node-page": "#444444", "node-decision": "#656565", "node-finding": "#777777", "node-preference": "#525252",
      "node-session": "#858585", "node-note": "#333333", "node-unresolved": "#999999",
      "edge-shadow": "#161616", "edge-highlight": "#ffffff", "node-light": "#ffffff", "node-shade": "#161616",
      backdrop: "rgba(0, 0, 0, .24)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .08)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .16), 0 2px 8px rgba(0, 0, 0, .08)",
    },
    dark: {
      ink: "#eeeeee", "ink-soft": "#bdbdbd", "ink-faint": "#ababab",
      surface: "#101010", "control-fill": "#1c1c1c", "surface-hover": "#292929",
      "focus-ring": "#d4d4d4", accent: "#d4d4d4", "selection-fill": "#d4d4d440",
      "status-connected": "#b8b8b8", "error-ink": "#e0e0e0", "error-fill": "#242424", "error-line": "#999999",
      line: "#373737", "line-strong": "#555555", edge: "#a3a3a3", "edge-link": "#b8b8b8", "edge-end": "#8f8f8f",
      "node-page": "#cfcfcf", "node-decision": "#aaaaaa", "node-finding": "#999999", "node-preference": "#bbbbbb",
      "node-session": "#888888", "node-note": "#dedede", "node-unresolved": "#777777",
      "edge-shadow": "#080808", "edge-highlight": "#eeeeee", "node-light": "#eeeeee", "node-shade": "#080808",
      backdrop: "rgba(0, 0, 0, .55)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .2)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2)",
    },
  },
  pride: {
    light: {
      ink: "#35313d", "ink-soft": "#514d5b", "ink-faint": "#61596a",
      surface: "#fcfbfd", "control-fill": "#f1edf5", "surface-hover": "#e7e0ed",
      "sidebar-wash": "linear-gradient(165deg, #f6dfe7 0%, #f7e7dc 20%, #f5efd9 38%, #e1eee2 57%, #e0eaf5 78%, #eadef3 100%)",
      "focus-ring": "#753bb4", accent: "#77548f", "selection-fill": "#753bb433",
      "status-connected": "#52785f", "error-ink": "#873e55", "error-fill": "#f6e4eb", "error-line": "#aa6a80",
      line: "#e3dce9", "line-strong": "#bdb0c9", edge: "#626262", "edge-link": "#9047b5", "edge-end": "#515151",
      "node-page": "#3065b5", "node-decision": "#8a6900", "node-finding": "#9047b5", "node-preference": "#ba354b",
      "node-session": "#278044", "node-note": "#305237", "node-unresolved": "#bb591a",
      "edge-shadow": "#161616", "edge-highlight": "#ffffff", "node-light": "#ffffff", "node-shade": "#161616",
      backdrop: "rgba(0, 0, 0, .24)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .08)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .16), 0 2px 8px rgba(0, 0, 0, .08)",
    },
    dark: {
      ink: "#eeeeee", "ink-soft": "#bdbdbd", "ink-faint": "#ababab",
      surface: "#1b1920", "control-fill": "#28232f", "surface-hover": "#352d3e",
      "sidebar-wash": "linear-gradient(165deg, #34252e 0%, #342b26 20%, #313025 38%, #25322d 57%, #252e3b 78%, #30263c 100%)",
      "focus-ring": "#d5a5ff", accent: "#d5a5ff", "selection-fill": "#d5a5ff40",
      "status-connected": "#b8b8b8", "error-ink": "#edafc4", "error-fill": "#382630", "error-line": "#ba8298",
      line: "#373737", "line-strong": "#555555", edge: "#a3a3a3", "edge-link": "#b8b8b8", "edge-end": "#8f8f8f",
      "node-page": "#80b5ff", "node-decision": "#f2cf65", "node-finding": "#c7a1e2", "node-preference": "#ff8e9a",
      "node-session": "#84d29a", "node-note": "#a6dfb4", "node-unresolved": "#9047b5",
      "edge-shadow": "#080808", "edge-highlight": "#eeeeee", "node-light": "#eeeeee", "node-shade": "#080808",
      backdrop: "rgba(0, 0, 0, .55)", "shadow-sm": "0 1px 3px rgba(0, 0, 0, .2)", "shadow-lg": "0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2)",
    },
  },
} as const;

export const paletteStyles = Object.entries(builtInPalettes).flatMap(([name, modes]) =>
  Object.entries(modes).map(([mode, tokens]) => `:root[data-palette="${name}"][data-theme="${mode}"] { ${Object.entries(tokens).map(([key, value]) => `--${key}: ${value};`).join(" ")} }`)
).join("\n");
