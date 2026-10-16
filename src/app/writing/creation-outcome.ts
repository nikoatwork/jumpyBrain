import type { MemoryWriteResult } from "../../types.js";

type CreationIndexResult = Pick<MemoryWriteResult, "saved" | "indexed" | "indexing">;
const recovery = "Do not repeat creation: the Markdown memory is saved. Run jumpybrain index for the same root/target, or allow automatic index maintenance to repair derived state.";

/** Writers publish Markdown only; hosts may replace this outcome after indexing. */
export function pendingCreationIndex(): CreationIndexResult {
  return {
    saved: true,
    indexed: false,
    indexing: { status: "pending", diagnostic: {
      code: "index_deferred",
      message: "Memory saved; indexing is deferred. Retrieval may be incomplete until indexing succeeds.",
      recovery,
    } },
  };
}

/** Canonical publication completed, but subsequent replay bookkeeping did not. */
export function failedCreationReplay(): CreationIndexResult {
  return { saved: true, indexed: false, indexing: { status: "failed", diagnostic: {
    code: "creation_replay_failed",
    message: "Memory saved, but derived creation replay storage failed. Reusing the creation key may not be safe; keep the returned ID/path and repair server derived storage.",
    recovery,
  } } };
}

export function indexedCreation(): CreationIndexResult {
  return { saved: true, indexed: true, indexing: { status: "indexed" } };
}

/** Call ONLY around derived indexing, after the canonical writer has returned. */
export function failedCreationIndex(error: unknown, indexState = false): CreationIndexResult {
  // Never serialize an arbitrary error/message: backend output can contain private
  // content, provisioned model paths, credentials or server-local filesystem paths.
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  const messages: Record<string, string> = {
    execution_timeout: "Indexing exceeded its deadline; retry indexing or adjust the local index deadline.",
    execution_aborted: "Indexing was canceled; retry indexing when ready.",
    execution_overloaded: "Indexing capacity is busy; retry indexing shortly.",
    execution_output_limit: "Indexing backend output exceeded its limit; check the local backend before retrying indexing.",
    execution_failed: "Indexing backend execution failed; check dependencies and local indexing configuration.",
  };
  const knownCode = typeof code === "string" && Object.hasOwn(messages, code) ? code : undefined;
  return {
    saved: true,
    indexed: false,
    indexing: { status: "failed", diagnostic: {
      code: indexState ? "index_state_failed" : knownCode ?? "index_failed",
      message: indexState
        ? "Memory saved, but derived index-state bookkeeping failed. Check server derived-storage permissions and index-state integrity, then retry indexing."
        : knownCode ? messages[knownCode]! : "Memory saved, but indexing failed. Check derived-storage permissions, backend dependencies and local indexing policy/model configuration before retrying indexing.",
      recovery,
    } },
  };
}
