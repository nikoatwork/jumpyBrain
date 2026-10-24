// Transitional support for functions still composed into the production shell.
// Typed browser controllers/policies are imported directly, never recovered from HTML.
import { createBrowserCommands } from "../dist/adapters/http-server/browser-commands.js";
import * as documentController from "../dist/adapters/http-server/document-controller.js";

import { referenceEligibility } from "../dist/adapters/http-server/reference-policy.js";
import { memoryDocumentPath } from "../dist/adapters/http-server/browser-transport.js";
export const browserControllers = { ...documentController, referenceEligibility, memoryDocumentPath };
export { extractShellFunction } from "../scripts/browser-shell-test-helpers.mjs";
import { extractShellFunction } from "../scripts/browser-shell-test-helpers.mjs";
export function shellFunctions(script, names, context) {
  for (const [key, value] of Object.entries({
    extensionUI: null, syncCompanionExtensions() {}, document: { querySelector: () => null },
    toast: { clear() {}, sync() {}, show() {} },
    documentActions: { isBusy: () => false, isOpen: () => false, close() {}, openRecovery() {} },
    recentWrites: { remember() {}, remove() {}, reset() {} }, searchIndexRefreshing: false, sessionRetry: { disabled: false },
    referenceCreation: { reset() {}, hasPending: () => false, settle: async () => true, saved: async () => true, rebase: async () => true, completed() {} },
    sidebarPages: { select() {}, visit() {}, rename() {}, remove() {}, refresh() {} },
  })) if (!(key in context)) context[key] = value;
  if (!("browserCommands" in context)) {
    context.browserCommands = createBrowserCommands();
    context.browserCommands.register({ id: "search.open", title: "Open search", shortcut: "Mod+K", run: () => context.searchDialog?.open ? context.closeSearch() : context.openSearch() });
  }
  Object.assign(context, { referenceEligibility, memoryDocumentPath });
  return names.map(name => {
    if (name in browserControllers) { context[name] = browserControllers[name]; return ""; }
    return extractShellFunction(script, name);
  }).join("\n");
}
