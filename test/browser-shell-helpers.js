// Transitional support for functions still composed into the production shell.
// Typed browser controllers/policies are imported directly, never recovered from HTML.
import * as documentController from "../dist/adapters/http-server/document-controller.js";

import { referenceEligibility } from "../dist/adapters/http-server/reference-policy.js";
import { memoryDocumentPath } from "../dist/adapters/http-server/browser-transport.js";
export const browserControllers = { ...documentController, referenceEligibility, memoryDocumentPath };
export { extractShellFunction } from "../scripts/browser-shell-test-helpers.mjs";
import { extractShellFunction } from "../scripts/browser-shell-test-helpers.mjs";
export function shellFunctions(script, names, context) {
  for (const [key, value] of Object.entries({
    documentActions: { isBusy: () => false, isOpen: () => false, close() {}, openRecovery() {} },
    recentWrites: { remember() {}, remove() {}, reset() {} }, searchIndexRefreshing: false, sessionRetry: { disabled: false },
    sidebarPages: { select() {}, visit() {}, rename() {}, remove() {}, refresh() {} },
  })) if (!(key in context)) context[key] = value;
  Object.assign(context, { referenceEligibility, memoryDocumentPath });
  return names.map(name => {
    if (name in browserControllers) { context[name] = browserControllers[name]; return ""; }
    return extractShellFunction(script, name);
  }).join("\n");
}
