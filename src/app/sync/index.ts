import { createHash } from "node:crypto";
import { compareInventories, planRemoteMigration, type InventoryDrawing, type MemoryInventory, type MigrationAction, type MigrationPlan, type SyncReport } from "../../core/sync/compare.js";
import type { DrawingList, DrawingRecord } from "../../core/drawings/model.js";
import { listServerMemoryFiles } from "../server-memory/folder-explorer.js";
import { listDrawingFiles, readDrawingFile } from "../../core/drawings/store.js";
import { hashMemoryDocumentContent } from "../../core/canonical/index.js";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  /** Up to 100 exact copies per call; results per note, in order. */
  copyMemoryDocuments(notes: { path: string; content: string }[]): Promise<({ ok: true } | { ok: false; code: string; message: string })[]>;
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
  const outcomes: MigrationOutcome[] = new Array(plan.actions.length);
  const plannedLocal = new Map<string, string>(), localFiles = new Map<string, string>();
  for (const item of report.items) {
    if (item.kind === "note" && item.local && item.id) { plannedLocal.set("note:" + item.id, item.local.contentHash); localFiles.set(item.id, item.local.file); }
    if (item.kind === "drawing" && item.local) plannedLocal.set("drawing:" + item.name, item.local.contentHash);
  }
  // Read the planned local file by its listed path (one read, no root scan per
  // note); a changed hash means it was edited since planning.
  const readLocalNote = async (id: string) => {
    const file = localFiles.get(id);
    const bytes = file ? await readFile(path.join(root, file)).catch(() => null) : null;
    return bytes && hashMemoryDocumentContent(bytes) === plannedLocal.get("note:" + id) ? bytes.toString("utf8") : null;
  };
  const failure = (action: MigrationAction, error: unknown): MigrationOutcome => {
    const { code, status } = error as { code?: string; status?: number };
    // Authentication or permission failures affect every action: stop instead of repeating them.
    if (status === 401 || status === 403) throw error;
    return { action, outcome: "failed", reason: `${code ?? "error"}: ${error instanceof Error ? error.message : String(error)}` };
  };

  // New notes go in batches (one server-side ID scan per batch, bounded request size).
  let batch: { index: number; action: MigrationAction; path: string; content: string }[] = [], bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    const current = batch; batch = []; bytes = 0;
    try {
      const results = await target.copyMemoryDocuments(current.map(entry => ({ path: entry.path, content: entry.content })));
      current.forEach((entry, position) => {
        const result = results[position]!;
        outcomes[entry.index] = result.ok ? { action: entry.action, outcome: "done" } : { action: entry.action, outcome: "failed", reason: `${result.code}: ${result.message}` };
      });
    } catch (error) { for (const entry of current) outcomes[entry.index] = failure(entry.action, error); }
  };
  for (const [index, action] of plan.actions.entries()) {
    if (action.action !== "create-note") continue;
    try {
      const content = await readLocalNote(action.id);
      if (content === null) { outcomes[index] = { action, outcome: "skipped", reason: "the local note changed since planning; rerun" }; continue; }
      const size = Buffer.byteLength(JSON.stringify({ path: action.file, content }));
      if (batch.length && (batch.length >= 100 || bytes + size > 700_000)) await flush();
      batch.push({ index, action, path: action.file, content }); bytes += size;
    } catch (error) { outcomes[index] = failure(action, error); }
  }
  await flush();

  for (const [index, action] of plan.actions.entries()) {
    if (action.action === "create-note") continue;
    try {
      if (action.action === "update-note") {
        const content = await readLocalNote(action.id);
        if (content === null) { outcomes[index] = { action, outcome: "skipped", reason: "the local note changed since planning; rerun" }; continue; }
        await target.updateMemoryDocument(action.id, content, { ifMatch: action.ifMatch });
      } else {
        const drawing = await readDrawingFile(root, action.name);
        if (drawing.contentHash !== plannedLocal.get("drawing:" + action.name)) { outcomes[index] = { action, outcome: "skipped", reason: "the local drawing changed since planning; rerun" }; continue; }
        if (action.action === "create-drawing") await target.createDrawing(action.name, drawing.scene);
        else await target.saveDrawing(action.name, drawing.scene, action.ifMatch);
      }
      outcomes[index] = { action, outcome: "done" };
    } catch (error) { outcomes[index] = failure(action, error); }
  }
  return outcomes;
}
