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

const ordinary = {
  memoryRootStatus: memory.memoryStatus, indexMemory: memory.indexMemory,
  overviewMemory: memory.overviewMemory, searchMemory: memory.searchMemory,
  compactSearchMemory: memory.compactSearchMemory, expandMemoryDocument: memory.expandMemoryDocument,
  processMemory, ensureSavedMemoryIndexed, readMemoryDocument: memory.readMemoryDocument,
  updateMemoryDocument: memory.updateMemoryDocument, previewMemoryDocumentDeletion: memory.previewMemoryDocumentDeletion,
  deleteMemoryDocument: memory.deleteMemoryDocument, checkDreamSources,
  rememberMemory: writing.rememberMemory, writeSessionWrapup: writing.writeSessionWrapup,
  listBoards: boards.listBoards, readBoard: boards.readBoard, saveBoard: boards.saveBoard,
  deleteBoard: boards.deleteBoard, getBoardStatus: boards.getBoardStatus,
};
const reads = new Set(["indexMemory", "ensureSavedMemoryIndexed", "searchMemory", "compactSearchMemory", "memoryRootStatus", "overviewMemory", "readMemoryDocument", "previewMemoryDocumentDeletion", "checkDreamSources", "getDreamWindow", "getDreamStatus", "getDreamBatch", "expandMemoryDocument", "listBoards", "readBoard", "getBoardStatus"]);
// Derived index work has its own bounded QMD admission; it must not hold the canonical write queue.
export function backendCallMutates(method: string): boolean { return !reads.has(method); }

export function callBackend(root: string, method: string, args: unknown[], signal?: AbortSignal, version?: string, qmdBinary?: string | null): Promise<unknown> {
  return qmdBinary === undefined ? callBackendInternal(root,method,args,signal,version) : withQmdBinary(qmdBinary, () => callBackendInternal(root,method,args,signal,version));
}
async function callBackendInternal(root: string, method: string, args: unknown[], signal?: AbortSignal, version?: string): Promise<unknown> {
  if (!Array.isArray(args) || args.length > 8) throw Object.assign(new Error("Invalid backend arguments."), { code: "invalid_request" });
  // JSON has no AbortSignal; only the host's request lifecycle can supply one.
  const optionsAt: Record<string, number> = { indexMemory: 0, searchMemory: 2, compactSearchMemory: 2, ensureSavedMemoryIndexed: 1, processMemory: 0, overviewMemory: 0 };
  const index = optionsAt[method];
  if (index !== undefined) args[index] = { ...(typeof args[index] === "object" && args[index] ? args[index] : {}), signal };
  if (Object.hasOwn(ordinary, method)) {
    return (ordinary[method as keyof typeof ordinary] as (...args: any[]) => Promise<unknown>)(root, ...args);
  }
  switch (method) {
    case "initializeMemoryRoot": return initializeMemoryRoot(root, { ...(args[0] as object), packageVersion: version });
    case "migrateLogseq": return migration.migrateLogseq(args[0] as string, root, args[1] as any);
    case "migrateObsidian": return migration.migrateObsidian(args[0] as string, root, args[1] as any);
    case "getDreamWindow": return dream.getDreamWindow({ root, request: args[0] as any });
    case "getDreamStatus": return dream.getDreamStatus({ root });
    case "createDreamBatch": return dream.createDreamBatch({ root, request: args[0] as any });
    case "getDreamBatch": return dream.getDreamBatch({ root, batchId: args[0] as string });
    case "completeDreamBatch": return dream.completeDreamBatch({ root, request: args[0] as any });
    case "abandonDreamBatch": return dream.abandonDreamBatch({ root, batchId: args[0] as string, summary: args[1] as string });
    default: throw Object.assign(new Error("Unknown backend operation."), { code: "method_not_found" });
  }
}
