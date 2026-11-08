import type { SearchRecognitionMetadata } from "../../types.js";
import type { DocumentPayload } from "./document-controller.js";
import type { CollaborationEditorState, SourceIntent } from "./collaboration-editor.js";
import type { CollaborationSnapshot } from "./collaboration-client.js";
import type { CollaborationDraft } from "./collaboration-drafts.js";

/** Consumer view of acknowledged source, private input and the navigation lifetime.
 * Connectivity, canonical publication and draft durability remain separate facts.
 * Persistence timers, HTTP retries and live operation queues belong to their owner.
 */
export interface EditorSessionState {
  readonly generation: number; readonly documentId: string;
  readonly contentHash: string; readonly frontmatterPrefix: string; readonly newline: string;
  readonly savedBody: string; readonly savedTitle: string; readonly title: string; readonly draft: string;
  readonly dirty: boolean; readonly draftRevision: number;
  readonly saveStatus: "idle" | "editing" | "saving" | "saved" | "failed";
  readonly saveError: string; readonly saveErrorCode: string; readonly unconfirmedSave: boolean;
  readonly loaded: boolean; readonly cancelled: boolean; readonly navigationPending: boolean;
  readonly externalStatus: "" | "pending" | "updated";
  readonly file: string; readonly recognition?: SearchRecognitionMetadata;
  readonly liveStatus?: CollaborationEditorState["status"];
  readonly liveCanWrite?: boolean; readonly liveHasOpened?: boolean;
  readonly durableDraft?: boolean; readonly recoveryDrafts?: CollaborationDraft[];
}

/** The explicit agreement used by document actions, attention and workspace views.
 * Optional recovery operations are capabilities of the live implementation.
 */
export interface EditorSession {
  readonly kind: "http" | "live";
  readonly state: EditorSessionState;
  input(body: string, intent?: SourceIntent): void;
  inputTitle(title: string): void;
  setNavigationPending(value: boolean): void;
  flush(): Promise<boolean>;
  retry(): Promise<boolean>;
  hasPending(): boolean;
  reloadSaved(allowed?: () => boolean): Promise<boolean>;
  acceptMetadata(payload: DocumentPayload, expectedHash: string): boolean;
  cancel(): void;
  publishReviewedDraft?(contentHash: string): Promise<boolean>;
  getRecoveryDrafts?(): CollaborationDraft[];
  recoverDraft?(draft: CollaborationDraft): boolean;
  getRetainedRecovery?(): CollaborationSnapshot["recovery"];
  getRetainedDiscovery?(): CollaborationSnapshot["recoveryDiscovery"];
  readRetainedVersion?(recovery: NonNullable<CollaborationSnapshot["recovery"]>, copy?: "base" | "external"): Promise<unknown>;
  restoreRetainedVersion?(version: { title: string; body: string }, expectedCurrentHash: string): Promise<boolean>;
}
