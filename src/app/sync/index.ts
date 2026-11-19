import { createHash } from "node:crypto";
import { compareInventories, planRemoteMigration, type InventoryDrawing, type MemoryInventory, type MigrationAction, type MigrationPlan, type SyncReport } from "../../core/sync/compare.js";
import type { DrawingList, DrawingRecord } from "../../core/drawings/model.js";
import { listServerMemoryFiles } from "../server-memory/folder-explorer.js";
import { listDrawingFiles, readDrawingFile } from "../../core/drawings/store.js";
import { readCanonicalMemoryDocumentById } from "../../core/canonical/index.js";

export { compareInventories, planRemoteMigration, SYNC_STATUSES } from "../../core/sync/compare.js";
export type { MemoryInventory, MigrationAction, MigrationPlan, SyncComparison, SyncReport, SyncStatus } from "../../core/sync/compare.js";

/** One brain as the comparison sees it: a canonical file listing with hashes, plus drawings. */
export interface InventorySource {
  listFiles(): Promise<{ files: { id: string | null; file: string; title?: string; editedAt?: string; contentHash?: string; bodyHash?: string }[] }>;
  listDrawings(): Promise<DrawingList>;
  readDrawing(name: string): Promise<DrawingRecord>;
}

export function localInventorySource(root: string, signal?: AbortSignal): InventorySource {
  return {
    listFiles: () => listServerMemoryFiles({ root, signal, hashes: true }),
    listDrawings: () => listDrawingFiles(root),
    readDrawing: name => readDrawingFile(root, name),
  };
}

export async function memoryInventory(source: InventorySource): Promise<MemoryInventory> {
  const { files } = await source.listFiles();
  const notes = files.map(file => {
    if (!file.contentHash || !file.bodyHash) throw new Error("The file listing has no content hashes. Upgrade the server to compare or migrate notes.");
    return { id: file.id, file: file.file, ...(file.title ? { title: file.title } : {}), contentHash: file.contentHash, bodyHash: file.bodyHash, ...(file.editedAt ? { updatedAt: file.editedAt } : {}) };
  });
  const drawings: InventoryDrawing[] = [];
  // Drawings are few and small; their list has no hash, so each is read once.
  for (const summary of (await source.listDrawings()).drawings) {
    const record = await source.readDrawing(summary.name);
    drawings.push({ name: record.name, contentHash: record.contentHash, sceneHash: "sha256:" + createHash("sha256").update(JSON.stringify(record.scene)).digest("hex"), updatedAt: record.updatedAt });
  }
  return { notes, drawings };
}

export async function compareMemorySources(local: InventorySource, remote: InventorySource): Promise<SyncReport> {
  const [left, right] = await Promise.all([memoryInventory(local), memoryInventory(remote)]);
  return compareInventories(left, right);
}

/** The remote writes a migration needs; each one is guarded and never retried. */
export interface MigrationTarget {
  copyMemoryDocument(file: string, content: string): Promise<{ id: string; file: string; contentHash: string }>;
  updateMemoryDocument(id: string, content: string, options: { ifMatch: string }): Promise<{ newContentHash?: string }>;
  createDrawing(name: string, scene: unknown): Promise<DrawingRecord>;
  saveDrawing(name: string, scene: unknown, ifMatch: string): Promise<DrawingRecord>;
}
export interface MigrationOutcome { action: MigrationAction; outcome: "done" | "skipped" | "failed"; reason?: string }

/**
 * Applies a local → remote plan in order. Local bytes are re-read and must
 * still match the planned hash; remote writes carry the planned If-Match, so
 * anything that changed since planning is refused, not overwritten.
 */
export async function applyRemoteMigration(root: string, plan: MigrationPlan, report: SyncReport, target: MigrationTarget): Promise<MigrationOutcome[]> {
  const outcomes: MigrationOutcome[] = [];
  const plannedLocal = new Map<string, string>();
  for (const item of report.items) {
    if (item.kind === "note" && item.local && item.id) plannedLocal.set("note:" + item.id, item.local.contentHash);
    if (item.kind === "drawing" && item.local) plannedLocal.set("drawing:" + item.name, item.local.contentHash);
  }
  for (const action of plan.actions) {
    try {
      if (action.action === "create-note" || action.action === "update-note") {
        const document = await readCanonicalMemoryDocumentById(root, action.id);
        if (document.contentHash !== plannedLocal.get("note:" + action.id)) { outcomes.push({ action, outcome: "skipped", reason: "the local note changed since planning; rerun" }); continue; }
        if (action.action === "create-note") await target.copyMemoryDocument(action.file, document.content);
        else await target.updateMemoryDocument(action.id, document.content, { ifMatch: action.ifMatch });
      } else {
        const drawing = await readDrawingFile(root, action.name);
        if (drawing.contentHash !== plannedLocal.get("drawing:" + action.name)) { outcomes.push({ action, outcome: "skipped", reason: "the local drawing changed since planning; rerun" }); continue; }
        if (action.action === "create-drawing") await target.createDrawing(action.name, drawing.scene);
        else await target.saveDrawing(action.name, drawing.scene, action.ifMatch);
      }
      outcomes.push({ action, outcome: "done" });
    } catch (error) {
      const { code, status } = error as { code?: string; status?: number };
      // Authentication or permission failures affect every action: stop instead of repeating them.
      if (status === 401 || status === 403) throw error;
      outcomes.push({ action, outcome: "failed", reason: `${code ?? "error"}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return outcomes;
}
