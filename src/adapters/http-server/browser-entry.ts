// One browser bundle; pure controllers also remain directly importable in tests.
import "./lexical-editor.js";
export { createDocumentEditor, splitEditableDocument, composeEditableDocument, withEditableTitle } from "./document-controller.js";
export { createMapController } from "./map-controller.js";
export { referenceEligibility } from "./reference-policy.js";
export { createReferenceCreation } from "./reference-creation.js";
export { memoryDocumentPath, createBrowserSearchRequest } from "./browser-transport.js";

export { createRecentWriteSearch } from "./recent-write-search.js";
export { installPageNavigation } from "./browser-page-navigation.js";
export { installDocumentActions } from "./document-actions.js";
export { installExternalDocumentUpdates } from "./external-document-updates.js";
export { createFeedbackDiagnostics, installFeedback, diagnosticBuildInfo } from "./feedback.js";

export { installNoteAttention } from "./note-attention.js";

export { installSearchMaintenance } from "./search-maintenance.js";

export { installToast } from "./browser-toast.js";
