/** Private coordinated-version root-owner protocol. No domain implementations or host authority. */
import type {
  DreamAbandonResult, DreamBatch, DreamCompleteRequest, DreamCompleteResult, DreamCreateRequest,
  DreamStatus, DreamWindow, DreamWindowRequest, FrontmatterValue, IndexMemoryOptions, IndexMemoryResult,
  MemoryActor, MemoryAttentionPacket, MemoryDocumentContentHash, MemoryDocumentDeletePreview, MemoryDocumentDeleteResult,
  MemoryDocumentReadResult, MemoryDocumentUpdateResult, MemoryNoteDraft, MemoryOverviewOptions,
  MemoryOverviewResult, MemoryRootInitResult, MemoryRootStatus, MemoryWriteResult,
  ProcessMemoryOptions, ProcessMemoryResult, SearchMemoryOptions, SearchMemoryResult, WrapupWriteResult,
} from "../types.js";
import type { CompactRecallOptions, CompactRecallPacket } from "../core/retrieval-policy/compact.js";
import type { ExpansionOptions, ExpansionResult } from "../core/canonical/expansion.js";
import type { SourceCheckRequest, SourceCheckResult } from "../core/dream/source-references.js";
import type { LogseqMigrationOptions, LogseqMigrationResult } from "../core/migration/types.js";
import type { ObsidianMigrationOptions, ObsidianMigrationResult } from "../core/migration/obsidian.js";
import type { BoardList, BoardRecord } from "../core/boards/model.js";

type WrapupDraft = { title: string; body: string; tags?: string[]; recallTopic?: string };
type DocumentUpdateOptions = {
  ifMatch?: string; contentHash?: string; actor?: MemoryActor; updatedAt?: string; maxSourceBytes?: number;
};
type BoardStatus = {
  id: string; name: string; archived: boolean; observedAt: string; contentHash: string;
  columns: { name: string; count: number; cards: {
    id: string; availability: string; title?: string; file?: string; contentHash?: string;
    excerpt?: string; startLine?: number | null; endLine?: number | null; truncated?: boolean;
    writtenAt?: FrontmatterValue; updatedAt?: FrontmatterValue;
  }[] }[];
  totalCards: number; omittedCards: number; unavailableCards: number; truncatedCards: number;
  partial: boolean; interpretation: string;
};

type OperationPolicy = {
  admission: "read" | "derived" | "canonical";
  signalOptionsAt?: number;
  indexOptionsAt?: number;
  preflightIndex?: true;
  guardedDocument?: true;
};
// Phantom types retain each tuple/result without generating wire fields or runtime validators.
declare const operationTypes: unique symbol;
interface Operation<Args extends unknown[], Result> extends OperationPolicy {
  readonly [operationTypes]?: { args: Args; result: Result };
}
const operation = <Args extends unknown[], Result>(policy: OperationPolicy): Operation<Args, Result> => policy;

export const backendOperations = {
  readMemoryDocument: operation<[id: string], MemoryDocumentReadResult>({ admission: "read" }),
  updateMemoryDocument: operation<[id: string, content: string, options?: DocumentUpdateOptions], MemoryDocumentUpdateResult>({ admission: "canonical", guardedDocument: true }),
  patchMemoryDocumentAttention: operation<[id: string, options: { ifMatch: string; mutation: unknown; now?: number }], MemoryDocumentReadResult & { oldContentHash: MemoryDocumentContentHash; newContentHash: MemoryDocumentContentHash; indexed: false; indexing: { status: "pending" } }>({ admission: "canonical", guardedDocument: true }),
  deleteMemoryDocument: operation<[id: string, options: { ifMatch: string; apply: true }], MemoryDocumentDeleteResult>({ admission: "canonical", guardedDocument: true }),
  previewMemoryDocumentDeletion: operation<[id: string], MemoryDocumentDeletePreview>({ admission: "read" }),
  listMemoryAttention: operation<[options?: { now?: number }], MemoryAttentionPacket>({ admission: "read" }),
  memoryRootStatus: operation<[], MemoryRootStatus>({ admission: "read" }),
  initializeMemoryRoot: operation<[options?: { force?: boolean }], MemoryRootInitResult>({ admission: "canonical" }),
  indexMemory: operation<[options?: IndexMemoryOptions], IndexMemoryResult>({ admission: "derived", signalOptionsAt: 0, indexOptionsAt: 0, preflightIndex: true }),
  ensureSavedMemoryIndexed: operation<[saved: MemoryWriteResult, options?: IndexMemoryOptions], MemoryWriteResult>({ admission: "derived", signalOptionsAt: 1, indexOptionsAt: 1 }),
  searchMemory: operation<[query: string, limit: number, options?: SearchMemoryOptions], SearchMemoryResult>({ admission: "derived", signalOptionsAt: 2, preflightIndex: true }),
  compactSearchMemory: operation<[query: string, limit: number, options?: CompactRecallOptions], CompactRecallPacket>({ admission: "derived", signalOptionsAt: 2, preflightIndex: true }),
  overviewMemory: operation<[options?: MemoryOverviewOptions], MemoryOverviewResult>({ admission: "read", signalOptionsAt: 0 }),
  expandMemoryDocument: operation<[options: ExpansionOptions], ExpansionResult>({ admission: "read" }),
  processMemory: operation<[options: ProcessMemoryOptions], ProcessMemoryResult>({ admission: "canonical", signalOptionsAt: 0 }),
  rememberMemory: operation<[draft: MemoryNoteDraft], MemoryWriteResult>({ admission: "canonical" }),
  writeSessionWrapup: operation<[draft: WrapupDraft], WrapupWriteResult>({ admission: "canonical" }),
  migrateLogseq: operation<[source: string, options?: LogseqMigrationOptions], LogseqMigrationResult>({ admission: "canonical" }),
  migrateObsidian: operation<[source: string, options?: ObsidianMigrationOptions], ObsidianMigrationResult>({ admission: "canonical" }),
  checkDreamSources: operation<[request: SourceCheckRequest], SourceCheckResult>({ admission: "read" }),
  getDreamWindow: operation<[request?: DreamWindowRequest], DreamWindow>({ admission: "read" }),
  getDreamStatus: operation<[], DreamStatus>({ admission: "read" }),
  getDreamBatch: operation<[batchId: string], DreamBatch>({ admission: "read" }),
  createDreamBatch: operation<[request?: DreamCreateRequest], DreamBatch>({ admission: "canonical" }),
  completeDreamBatch: operation<[request: DreamCompleteRequest], DreamCompleteResult>({ admission: "canonical" }),
  abandonDreamBatch: operation<[batchId: string, summary?: string], DreamAbandonResult>({ admission: "canonical" }),
  listBoards: operation<[], BoardList>({ admission: "read" }),
  readBoard: operation<[id: string], BoardRecord>({ admission: "read" }),
  saveBoard: operation<[board: unknown, ifMatch?: string], BoardRecord>({ admission: "canonical" }),
  deleteBoard: operation<[id: string, ifMatch: string], { id: string; deleted: true; notesPreserved: true }>({ admission: "canonical" }),
  getBoardStatus: operation<[id: string, limit?: number, signal?: AbortSignal], BoardStatus>({ admission: "read" }),
} satisfies Record<string, OperationPolicy>;

export type BackendMethod = keyof typeof backendOperations;
export type BackendArgs<M extends BackendMethod> = NonNullable<(typeof backendOperations)[M][typeof operationTypes]>["args"];
export type BackendResult<M extends BackendMethod> = NonNullable<(typeof backendOperations)[M][typeof operationTypes]>["result"];

export function isBackendMethod(method: string): method is BackendMethod {
  return Object.hasOwn(backendOperations, method);
}
export function backendOperation(method: string): OperationPolicy | undefined {
  return isBackendMethod(method) ? backendOperations[method] : undefined;
}
/** Unknown methods retain conservative admission until dispatch rejects them. */
export function backendCallMutates(method: string): boolean {
  return (backendOperation(method)?.admission ?? "canonical") === "canonical";
}

/** Preserve legacy guard precedence, including tolerated extra positional arguments. */
export function backendDocumentPrecondition(method: string, args: unknown[]): { id: string; ifMatch?: string } | undefined {
  if (!backendOperation(method)?.guardedDocument) return;
  const update = args[2] as DocumentUpdateOptions | undefined;
  const other = args[1] as { ifMatch?: string } | undefined;
  return { id: String(args[0]), ifMatch: update?.ifMatch ?? update?.contentHash ?? other?.ifMatch };
}

/** JSON cannot supply the host's live AbortSignal. Domain owners validate other inputs. */
export function backendHostArgs(method: BackendMethod, args: unknown[], signal?: AbortSignal): unknown[] {
  const index = backendOperation(method)?.signalOptionsAt;
  if (index !== undefined) args[index] = { ...(typeof args[index] === "object" && args[index] ? args[index] : {}), signal };
  return args;
}
