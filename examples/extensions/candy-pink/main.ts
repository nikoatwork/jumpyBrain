import type { ExtensionFactory } from "jumpybrain/extensions.js";

/** Strawberry milk surfaces, raspberry ink, and a little confetti in the graph. */
const activate: ExtensionFactory = api => {
  api.registerTheme({
    id: "strawberry", name: "Strawberry milk", appearance: "light",
    colors: {
      surface: "#fff1f7", "control-fill": "#fbd8e8", "surface-hover": "#f5c5dc",
      ink: "#522039", "ink-soft": "#793651", "ink-faint": "#85405f",
      line: "#e8b6cd", "line-strong": "#b96b90", accent: "#a11d55", "focus-ring": "#a11d55",
      "selection-fill": "#e9599a36", "status-connected": "#356b57",
      "error-ink": "#9a2244", "error-fill": "#ffe1e7", "error-line": "#bc506e",
      edge: "#a24d7b", "edge-link": "#8c5bb5", "edge-end": "#347e7d",
      "node-page": "#c94983", "node-decision": "#9857b5", "node-finding": "#c46a34",
      "node-preference": "#347e7d", "node-session": "#6974bd", "node-note": "#bb648c",
      "node-unresolved": "#b13d57", "edge-highlight": "#522039",
      "node-light": "#fff8fc", "node-shade": "#74344f", "edge-shadow": "#74344f",
      backdrop: "#52203942",
    },
  });
};
export default activate;
