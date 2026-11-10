export const DRAWING_EXTENSION = '.excalidraw';
export const DRAWING_MAX_BYTES = 4 * 1024 * 1024;
export const DRAWING_MAX_FILES = 1000;
export type DrawingScene = { type: 'excalidraw'; elements: unknown[]; [key: string]: unknown };
export type DrawingSummary = { name: string; bytes: number; updatedAt: string };
export type DrawingList = { drawings: DrawingSummary[]; skipped: number };
export type DrawingRecord = { name: string; scene: DrawingScene; contentHash: string; updatedAt: string };
export type DrawingErrorCode = 'invalid_drawing' | 'drawing_missing' | 'drawing_conflict' | 'drawing_busy' | 'drawing_unsafe';
export class DrawingError extends Error {
  constructor(readonly code: DrawingErrorCode, message: string) { super(message); this.name = 'DrawingError'; }
}
/** A drawing name is its filename without the extension, and is safe inside `[[Name.excalidraw]]`. */
export function isDrawingName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim()
    && !/[\x00-\x1f\x7f\[\]|#\\/:]/.test(value) && !value.startsWith('.') && !value.endsWith('.');
}
export function drawingNameFromReference(target: unknown): string | null {
  if (typeof target !== 'string' || !target.toLowerCase().endsWith(DRAWING_EXTENSION)) return null;
  const name = target.slice(0, -DRAWING_EXTENSION.length);
  return isDrawingName(name) ? name : null;
}
export function emptyDrawingScene(): DrawingScene {
  return { type: 'excalidraw', version: 2, source: 'jumpybrain', elements: [], appState: {}, files: {} };
}
/** Checks only the portable envelope; element semantics belong to the Excalidraw editor. */
export function validateDrawingScene(value: unknown): DrawingScene {
  const fail = (): never => { throw new DrawingError('invalid_drawing', 'Use an Excalidraw scene with type "excalidraw" and an elements list.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const scene = value as Record<string, unknown>;
  const object = (item: unknown) => item === undefined || item === null || (typeof item === 'object' && !Array.isArray(item));
  if (scene.type !== 'excalidraw' || !Array.isArray(scene.elements) || !object(scene.appState) || !object(scene.files)) return fail();
  return scene as DrawingScene;
}
