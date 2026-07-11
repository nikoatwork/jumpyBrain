import {
  abandonDreamBatch as abandonSharedDreamBatch,
  createDreamBatch as createSharedDreamBatch,
  DreamStateError,
  getDreamBatch as getSharedDreamBatch,
  getDreamStatus as getSharedDreamStatus,
  completeDreamBatch as completeSharedDreamBatch,
  REMOTE_DREAM_BATCHES_RELATIVE_DIR,
  REMOTE_DREAM_STATE_RELATIVE_PATH,
  REMOTE_DREAM_WORKFLOW,
} from "../dream/index.js";
import type { DreamAbandonResult, DreamBatch, DreamCompleteRequest, DreamCompleteResult, DreamCreateRequest, DreamStatus } from "../../types.js";

export const DREAM_STATE_RELATIVE_PATH = REMOTE_DREAM_STATE_RELATIVE_PATH;
export const DREAM_BATCHES_RELATIVE_DIR = REMOTE_DREAM_BATCHES_RELATIVE_DIR;
export { DreamStateError };

export async function getDreamStatus(options: { root: string }): Promise<DreamStatus> {
  return getSharedDreamStatus({ root: options.root, config: REMOTE_DREAM_WORKFLOW });
}

export async function createDreamBatch(options: { root: string; request?: DreamCreateRequest } | string): Promise<DreamBatch> {
  const root = typeof options === "string" ? options : options.root;
  const request = typeof options === "string" ? {} : options.request;
  return createSharedDreamBatch({ root, request, config: REMOTE_DREAM_WORKFLOW });
}

export async function getDreamBatch(options: { root: string; batchId: string }): Promise<DreamBatch> {
  return getSharedDreamBatch({ root: options.root, batchId: options.batchId, config: REMOTE_DREAM_WORKFLOW });
}

export async function completeDreamBatch(options: { root: string; request: DreamCompleteRequest }): Promise<DreamCompleteResult> {
  return completeSharedDreamBatch({ root: options.root, request: options.request, config: REMOTE_DREAM_WORKFLOW });
}

export async function abandonDreamBatch(options: { root: string; batchId: string; summary?: string }): Promise<DreamAbandonResult> {
  return abandonSharedDreamBatch({ root: options.root, batchId: options.batchId, summary: options.summary, config: REMOTE_DREAM_WORKFLOW });
}
