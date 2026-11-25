import { provisionLocalModel, localModelAvailable, localModelFile, removeLocalModel, SEMANTIC_MODEL } from '../adapters/qmd/index.js';
import { automaticIndexingPolicy } from '../core/memory-root/index.js';
import type { RetrievalReadiness, SemanticSetupStatus } from '../types.js';
/** Optional device-local provisioning; callers explicitly index their selected brain separately. */
export function prepareSemanticModel(options: { download?: boolean; file?: string; signal?: AbortSignal; onProgress?: (bytes: number, total: number) => void } = {}) {
  return provisionLocalModel(options);
}
/** The pinned smart-search model: name, size and terms, for explanations without touching the network or disk. */
export const semanticModelPreset = SEMANTIC_MODEL;
/** The downloaded smart-search model on this computer (the preset unless a brain names another managed identity). */
export function semanticModelFile(modelId?: string) {
  return localModelFile(modelId);
}
/** Explicitly frees the downloaded model; never removes a user-selected model path. */
export function removeSemanticModel(modelId?: string) {
  return removeLocalModel(modelId);
}
export async function semanticSetupStatus(root: string, readiness: RetrievalReadiness): Promise<SemanticSetupStatus> {
  const policy = await automaticIndexingPolicy(root);
  if (policy.mode === 'lexical') return { state: 'lexical', nextAction: 'Optional: smart-search on with the same local root reviews the model download before anything is fetched.' };
  const available = await localModelAvailable(policy);
  const state = !available ? 'unavailable' : readiness.embedding === 'complete' && readiness.freshness === 'fresh' ? 'ready'
    : readiness.lastFailure ? 'failed' : 'incomplete';
  return { state, ...(policy.modelId ? { modelId: policy.modelId } : {}),
    ...(state === 'ready' ? {} : { nextAction: available ? 'Run index on this brain; use --rebuild only when changing model identity.' : policy.modelId ? 'Restore the device-local model with smart-search on --download-model (same as index --setup-semantic --download-model), or turn it off with smart-search off.' : 'Restore the configured local GGUF or select index --semantic-model /absolute/model.gguf.' }) };
}
