import type { ExtensionFactory } from "jumpybrain/extensions.js";

/** An executable package: the host calls this factory on activation/reload. */
const activate: ExtensionFactory = api => {
  api.registerTheme({
    id: "plum", name: "Plum", appearance: "dark",
    colors: {
      surface: "#211d29", "control-fill": "#2c2635", "surface-hover": "#3b3046",
      ink: "#eee4ef", "ink-soft": "#c2b3c8", "ink-faint": "#b2a1bb",
      line: "#493d54", "line-strong": "#71617f", accent: "#f0af96", "focus-ring": "#f0af96",
      "selection-fill": "#f0af9640", "error-ink": "#ffc0c8", "error-fill": "#482835", "error-line": "#d995a6",
      edge: "#b19bce", "edge-link": "#d49bbf", "edge-end": "#9dbfae",
      "node-page": "#b19bce", "node-note": "#9dbfae", "node-finding": "#d49bbf",
      "edge-highlight": "#eee4ef", "node-light": "#eee4ef", "node-shade": "#17121e", "edge-shadow": "#17121e",
    },
  });
};
export default activate;
