import { provisionLocalModel, localModelAvailable } from '../adapters/qmd/index.js';
import { automaticIndexingPolicy } from '../core/memory-root/index.js';
import type { RetrievalReadiness, SemanticSetupStatus } from '../types.js';
/** Optional device-local provisioning; callers explicitly index their selected brain separately. */
export function prepareSemanticModel(options: { download?: boolean; file?: string; signal?: AbortSignal } = {}) {
  return provisionLocalModel(options);
}
export async function semanticSetupStatus(root: string, readiness: RetrievalReadiness): Promise<SemanticSetupStatus> {
  const policy = await automaticIndexingPolicy(root);
  if (policy.mode === 'lexical') return { state: 'lexical', nextAction: 'Optional: index --setup-semantic with the same local root to review model setup.' };
  const available = await localModelAvailable(policy);
  const state = !available ? 'unavailable' : readiness.embedding === 'complete' && readiness.freshness === 'fresh' ? 'ready'
    : readiness.lastFailure ? 'failed' : 'incomplete';
  return { state, ...(policy.modelId ? { modelId: policy.modelId } : {}),
    ...(state === 'ready' ? {} : { nextAction: available ? 'Run index on this brain; use --rebuild only when changing model identity.' : policy.modelId ? 'Restore the device-local model with index --setup-semantic --download-model, then index this brain.' : 'Restore the configured local GGUF or select index --semantic-model /absolute/model.gguf.' }) };
}
