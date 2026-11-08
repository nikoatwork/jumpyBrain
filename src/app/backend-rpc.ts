import { withQmdBinary } from "../adapters/qmd/index.js";
/** Local-owner RPC. The transport supplies the root; callers cannot select another root. */
import * as memory from "./local-memory/index.js";
import * as dream from "./dream/index.js";
import * as writing from "./writing/index.js";
import * as migration from "./migration/index.js";
import * as boards from "./boards/index.js";
import { initializeMemoryRoot } from "../core/index.js";
import { processMemory } from "./processing/index.js";
import { ensureSavedMemoryIndexed } from "./creation.js";
import { checkDreamSources } from "./dream/source-check.js";

import { listMemoryAttention, patchMemoryDocumentAttention } from "./attention.js";

import { backendHostArgs, isBackendMethod, type BackendArgs, type BackendMethod, type BackendResult } from "../adapters/backend-protocol.js";
export { backendCallMutates } from "../adapters/backend-protocol.js";

type BackendContext = { root: string; version?: string };
type BackendHandler<M extends BackendMethod> = (context: BackendContext, ...args: BackendArgs<M>) => Promise<BackendResult<M>>;
type BackendHandlers = { [M in BackendMethod]: BackendHandler<M> };
function owned<Args extends unknown[], Result>(useCase: (root: string, ...args: Args) => Promise<Result>) {
  return (context: BackendContext, ...args: Args) => useCase(context.root, ...args);
}

// Exhaustive, signature-checked bindings. Policy and argument positions live in the private contract.
const handlers: BackendHandlers = {
  listMemoryAttention: owned(listMemoryAttention), patchMemoryDocumentAttention: owned(patchMemoryDocumentAttention),
  memoryRootStatus: owned(memory.memoryStatus), indexMemory: owned(memory.indexMemory),
  overviewMemory: owned(memory.overviewMemory), searchMemory: owned(memory.searchMemory),
  compactSearchMemory: owned(memory.compactSearchMemory), expandMemoryDocument: owned(memory.expandMemoryDocument),
  processMemory: owned(processMemory), ensureSavedMemoryIndexed: owned(ensureSavedMemoryIndexed),
  readMemoryDocument: owned(memory.readMemoryDocument), updateMemoryDocument: owned(memory.updateMemoryDocument),
  previewMemoryDocumentDeletion: owned(memory.previewMemoryDocumentDeletion), deleteMemoryDocument: owned(memory.deleteMemoryDocument),
  checkDreamSources: owned(checkDreamSources), rememberMemory: owned(writing.rememberMemory), writeSessionWrapup: owned(writing.writeSessionWrapup),
  listBoards: owned(boards.listBoards), readBoard: owned(boards.readBoard), saveBoard: owned(boards.saveBoard),
  deleteBoard: owned(boards.deleteBoard), getBoardStatus: owned(boards.getBoardStatus),
  initializeMemoryRoot: (context, options) => initializeMemoryRoot(context.root, { ...options, packageVersion: context.version }),
  migrateLogseq: (context, source, options) => migration.migrateLogseq(source, context.root, options),
  migrateObsidian: (context, source, options) => migration.migrateObsidian(source, context.root, options),
  getDreamWindow: (context, request) => dream.getDreamWindow({ root: context.root, request }),
  getDreamStatus: context => dream.getDreamStatus({ root: context.root }),
  createDreamBatch: (context, request) => dream.createDreamBatch({ root: context.root, request }),
  getDreamBatch: (context, batchId) => dream.getDreamBatch({ root: context.root, batchId }),
  completeDreamBatch: (context, request) => dream.completeDreamBatch({ root: context.root, request }),
  abandonDreamBatch: (context, batchId, summary) => dream.abandonDreamBatch({ root: context.root, batchId, summary }),
};

export function callBackend(root: string, method: string, args: unknown[], signal?: AbortSignal, version?: string, qmdBinary?: string | null): Promise<unknown> {
  return qmdBinary === undefined ? callBackendInternal(root,method,args,signal,version) : withQmdBinary(qmdBinary, () => callBackendInternal(root,method,args,signal,version));
}
function dispatch<M extends BackendMethod>(context: BackendContext, method: M, args: unknown[]): Promise<BackendResult<M>> {
  // The only untrusted positional boundary: preserve domain validation instead of inventing a schema.
  return handlers[method](context, ...args as BackendArgs<M>);
}
async function callBackendInternal(root: string, method: string, args: unknown[], signal?: AbortSignal, version?: string): Promise<unknown> {
  if (!Array.isArray(args) || args.length > 8) throw Object.assign(new Error("Invalid backend arguments."), { code: "invalid_request" });
  if (!isBackendMethod(method)) throw Object.assign(new Error("Unknown backend operation."), { code: "method_not_found" });
  return dispatch({ root, version }, method, backendHostArgs(method, args, signal));
}
