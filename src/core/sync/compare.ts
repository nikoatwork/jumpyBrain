/**
 * Pure comparison of two brains' canonical inventories (a local root and a
 * shared server). Notes match by memory ID, else by path; drawings by name.
 * No I/O: callers collect inventories and perform any writes.
 */

export interface InventoryNote {
  /** Null when the note has no unique valid ID. */
  id: string | null;
  file: string;
  title?: string;
  /** sha256 over the exact file bytes (frontmatter included). */
  contentHash: string;
  /** sha256 over the exact body after the frontmatter. */
  bodyHash: string;
  /** Declared edit date only; file mtimes do not order notes across machines. */
  updatedAt?: string;
}
export interface InventoryDrawing {
  name: string;
  /** Hash of the stored file bytes; the If-Match value for writes. */
  contentHash: string;
  /** Hash of the parsed scene, so formatting-only differences (compact vs. pretty JSON) compare equal. */
  sceneHash: string;
  updatedAt?: string;
}
export interface MemoryInventory { notes: InventoryNote[]; drawings: InventoryDrawing[] }

/**
 * same: identical bytes. metadata: identical body, frontmatter differs.
 * local-newer / remote-newer: bodies differ and the edit dates order them.
 * differs: bodies differ without a usable order. local-only / remote-only.
 */
export type SyncStatus = "same" | "metadata" | "local-newer" | "remote-newer" | "differs" | "local-only" | "remote-only";
export const SYNC_STATUSES: readonly SyncStatus[] = ["same", "metadata", "local-newer", "remote-newer", "differs", "local-only", "remote-only"];

export interface NoteComparison {
  kind: "note";
  status: SyncStatus;
  id: string | null;
  title?: string;
  local?: { file: string; contentHash: string; updatedAt?: string };
  remote?: { file: string; contentHash: string; updatedAt?: string };
  /** The same ID lives at different paths. */
  moved?: true;
}
export interface DrawingComparison {
  kind: "drawing";
  status: Exclude<SyncStatus, "metadata">;
  name: string;
  local?: { contentHash: string; updatedAt?: string };
  remote?: { contentHash: string; updatedAt?: string };
}
export type SyncComparison = NoteComparison | DrawingComparison;
export interface SyncReport { items: SyncComparison[]; counts: Record<SyncStatus, number> }

const time = (value?: string) => { const parsed = value ? Date.parse(value) : NaN; return Number.isFinite(parsed) ? parsed : undefined; };
function order(local?: string, remote?: string): "local-newer" | "remote-newer" | "differs" {
  const a = time(local), b = time(remote);
  return a === undefined || b === undefined || a === b ? "differs" : a > b ? "local-newer" : "remote-newer";
}
const side = (note: InventoryNote) => ({ file: note.file, contentHash: note.contentHash, ...(note.updatedAt ? { updatedAt: note.updatedAt } : {}) });

export function compareInventories(local: MemoryInventory, remote: MemoryInventory): SyncReport {
  const items: SyncComparison[] = [];
  const remoteById = new Map<string, InventoryNote>(), remoteByFile = new Map<string, InventoryNote>(), matched = new Set<InventoryNote>();
  for (const note of remote.notes) { if (note.id) remoteById.set(note.id, note); remoteByFile.set(note.file, note); }
  for (const note of local.notes) {
    // An ID match wins; a path match is only used when neither side has a usable ID for it.
    let other = note.id ? remoteById.get(note.id) : undefined;
    if (!other) {
      const byFile = remoteByFile.get(note.file);
      if (byFile && !matched.has(byFile) && (!byFile.id || !note.id)) other = byFile;
    }
    const title = note.title ?? other?.title;
    if (!other) { items.push({ kind: "note", status: "local-only", id: note.id, ...(title ? { title } : {}), local: side(note) }); continue; }
    matched.add(other);
    const status: SyncStatus = note.contentHash === other.contentHash ? "same" : note.bodyHash === other.bodyHash ? "metadata" : order(note.updatedAt, other.updatedAt);
    items.push({ kind: "note", status, id: note.id ?? other.id, ...(title ? { title } : {}), local: side(note), remote: side(other), ...(note.file !== other.file ? { moved: true as const } : {}) });
  }
  for (const note of remote.notes) if (!matched.has(note)) items.push({ kind: "note", status: "remote-only", id: note.id, ...(note.title ? { title: note.title } : {}), remote: side(note) });

  const remoteDrawings = new Map(remote.drawings.map(drawing => [drawing.name, drawing]));
  const drawingSide = (drawing: InventoryDrawing) => ({ contentHash: drawing.contentHash, ...(drawing.updatedAt ? { updatedAt: drawing.updatedAt } : {}) });
  for (const drawing of local.drawings) {
    const other = remoteDrawings.get(drawing.name);
    remoteDrawings.delete(drawing.name);
    if (!other) { items.push({ kind: "drawing", status: "local-only", name: drawing.name, local: drawingSide(drawing) }); continue; }
    // Drawings have no declared edit date and file times do not survive copies or
    // checkouts, so differing drawings are never ordered (and never pushed).
    items.push({ kind: "drawing", status: drawing.sceneHash === other.sceneHash ? "same" : "differs", name: drawing.name, local: drawingSide(drawing), remote: drawingSide(other) });
  }
  for (const drawing of remoteDrawings.values()) items.push({ kind: "drawing", status: "remote-only", name: drawing.name, remote: drawingSide(drawing) });

  const counts = Object.fromEntries(SYNC_STATUSES.map(status => [status, 0])) as Record<SyncStatus, number>;
  for (const item of items) counts[item.status]++;
  const rank = (item: SyncComparison) => SYNC_STATUSES.indexOf(item.status);
  const label = (item: SyncComparison) => item.kind === "note" ? (item.local ?? item.remote)!.file : `drawings/${item.name}`;
  items.sort((a, b) => rank(b) - rank(a) || (label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0));
  return { items, counts };
}

export type MigrationAction =
  | { action: "create-note"; id: string; file: string; contentHash: string }
  | { action: "update-note"; id: string; file: string; ifMatch: string }
  | { action: "create-drawing"; name: string }
  | { action: "update-drawing"; name: string; ifMatch: string };
export interface MigrationSkip { item: string; status: SyncStatus; reason: string }
export interface MigrationPlan { actions: MigrationAction[]; skipped: MigrationSkip[]; unchanged: number }

/**
 * Local → remote plan. Copies notes and drawings missing on the server and
 * pushes local edits that are newer than the server's. Never deletes, never
 * overwrites newer or unordered remote work, never moves remote files.
 */
export function planRemoteMigration(report: SyncReport): MigrationPlan {
  const actions: MigrationAction[] = [], skipped: MigrationSkip[] = [];
  let unchanged = 0;
  const remoteFiles = new Set(report.items.flatMap(item => item.kind === "note" && item.remote ? [item.remote.file] : []));
  for (const item of report.items) {
    const label = item.kind === "note" ? (item.local ?? item.remote)!.file : `drawings/${item.name}`;
    const skip = (reason: string) => skipped.push({ item: label, status: item.status, reason });
    if (item.status === "same" || item.status === "metadata") { unchanged++; continue; }
    if (item.status === "remote-only") { skip("only on the server; kept"); continue; }
    if (item.status === "remote-newer") { skip("the server's version is newer; review it by hand"); continue; }
    if (item.status === "differs") { skip("both changed and the edit dates cannot order them; review by hand"); continue; }
    if (item.kind === "drawing") {
      if (item.status === "local-only") actions.push({ action: "create-drawing", name: item.name });
      else actions.push({ action: "update-drawing", name: item.name, ifMatch: item.remote!.contentHash });
      continue;
    }
    if (item.status === "local-only") {
      if (!item.id) { skip("no unique memory ID; stamp IDs locally with jumpybrain process --root <local> --mode ensure-ids --apply, then rerun"); continue; }
      if (remoteFiles.has(item.local!.file)) { skip("the server already has a different note at this path"); continue; }
      actions.push({ action: "create-note", id: item.id, file: item.local!.file, contentHash: item.local!.contentHash });
      continue;
    }
    if (!item.id) { skip("no unique memory ID on the server; update it by hand"); continue; }
    actions.push({ action: "update-note", id: item.id, file: item.remote!.file, ifMatch: item.remote!.contentHash });
  }
  return { actions, skipped, unchanged };
}
