// Drawing packets carry names and scenes only; no host paths.
import { renameDrawingAndMentions, type DrawingMentionHooks, type DrawingRenameResult } from '../drawings/index.js';
import { markRemoteIndexStale } from './state.js';
export { listDrawings, readDrawing, createDrawing, saveDrawing, renameDrawing, deleteDrawing, DrawingError, DRAWING_MAX_BYTES, isDrawingName } from '../drawings/index.js';

/** Rename plus mention rewrite; rewritten notes mark the derived index stale. Callers serialize it in their write queue. */
export async function renameServerMemoryDrawing(options: { root: string; name: string; nextName: string; ifMatch: string } & DrawingMentionHooks): Promise<DrawingRenameResult> {
  const result = await renameDrawingAndMentions(options);
  if (result.mentions.updated.length) await markRemoteIndexStale(options.root).catch(() => {});
  return result;
}
