// Compatibility surface for note confirmations. All presentation/lifecycle lives
// in the shared system-message component.
export { installSystemMessages as installToast } from "./browser-system-messages.js";
export type { SystemMessages as Toast } from "./browser-system-messages.js";
