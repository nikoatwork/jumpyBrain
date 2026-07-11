import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { hashMemoryDocumentContent, listCanonicalMemoryMarkdownFiles, normalizeRelative, parseFrontmatter, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import {
  compareDreamBatchFiles,
  DEFAULT_DREAM_LIMITS,
  DREAM_BATCH_TTL_DAYS,
  DREAM_INSTRUCTIONS,
  DREAM_LOOKBACK_HOURS,
  DREAM_WARNINGS,
  dreamBatchSummary,
  dreamCursorFor,
  DreamPolicyError,
  HARD_DREAM_CAPS,
  isDreamCursorAfter,
  maxDreamCursor,
  memoryTypeForDreamPath,
  normalizeDreamLimits,
  normalizeDreamRelativeFile,
  stringArray,
  stringFrontmatterDreamDate,
  truncateDreamContent,
  validateDreamBatchId,
} from "../../core/dream/index.js";
import type {
  DreamAbandonResult,
  DreamBatch,
  DreamBatchFileMetadata,
  DreamBatchMetadata,
  DreamBatchStatus,
  DreamCompleteRequest,
  DreamCompleteResult,
  DreamCreateRequest,
  DreamCursor,
  DreamFileContext,
  DreamLimits,
  DreamState,
  DreamStatus,
  Frontmatter,
  MemoryDocumentTargetKind,
  MemoryDocumentTargetMetadata,
  MemoryNoteType,
} from "../../types.js";

export const LOCAL_DREAM_STATE_RELATIVE_PATH = ".jumpybrain/dream/state.json";
export const LOCAL_DREAM_BATCHES_RELATIVE_DIR = ".jumpybrain/dream/batches";
export const REMOTE_DREAM_STATE_RELATIVE_PATH = ".jumpybrain/remote/dream-state.json";
export const REMOTE_DREAM_BATCHES_RELATIVE_DIR = ".jumpybrain/remote/dream-batches";

export interface DreamWorkflowConfig {
  target: MemoryDocumentTargetKind;
  rootLabel: string | ((root: string) => string);
  memory?: "all";
  stateRelativePath: string;
  batchesRelativeDir: string;
}

export const LOCAL_DREAM_WORKFLOW: DreamWorkflowConfig = {
  target: "local",
  rootLabel: (root) => root,
  stateRelativePath: LOCAL_DREAM_STATE_RELATIVE_PATH,
  batchesRelativeDir: LOCAL_DREAM_BATCHES_RELATIVE_DIR,
};

export const REMOTE_DREAM_WORKFLOW: DreamWorkflowConfig = {
  target: "remote",
  rootLabel: "remote:all",
  memory: "all",
  stateRelativePath: REMOTE_DREAM_STATE_RELATIVE_PATH,
  batchesRelativeDir: REMOTE_DREAM_BATCHES_RELATIVE_DIR,
};

export class DreamStateError extends Error {
  constructor(readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "DreamStateError";
  }
}

export async function getDreamStatus(options: { root: string; config?: DreamWorkflowConfig }): Promise<DreamStatus> {
  const config = options.config ?? LOCAL_DREAM_WORKFLOW;
  const root = await compatibleRoot(options.root);
  const state = await readDreamState(root, config);
  return {
    ...targetMetadata(config, root),
    available: true,
    openBatch: state.openBatch,
    lastCompletedCursor: state.lastCompletedCursor,
    lastCompletedBatch: state.lastCompletedBatch,
    lastCompletedAt: state.lastCompletedAt,
    defaults: { lookbackHours: DREAM_LOOKBACK_HOURS, ...DEFAULT_DREAM_LIMITS },
    caps: HARD_DREAM_CAPS,
    warnings: [...DREAM_WARNINGS],
  };
}

export async function createDreamBatch(options: { root: string; request?: DreamCreateRequest; config?: DreamWorkflowConfig }): Promise<DreamBatch> {
  const config = options.config ?? LOCAL_DREAM_WORKFLOW;
  const request = options.request ?? {};
  const root = await compatibleRoot(options.root);
  const limits = normalizeDreamLimits(request);
  const now = new Date();
  const state = await readDreamState(root, config);

  if (state.openBatch && !request.force) {
    const batch = await readDreamBatch(root, config, state.openBatch.batchId);
    return hydrateDreamBatch(root, config, batch, limits, true);
  }

  if (state.openBatch && request.force) {
    await markBatchStatus(root, config, state.openBatch.batchId, "abandoned", now.toISOString(), "Abandoned by forced dream batch creation.");
    state.openBatch = undefined;
  }

  const selected = await selectDreamFiles(root, state.lastCompletedCursor, state.completedFileCursors, limits, now);
  const batchId = `dream_${randomUUID()}`;
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + DREAM_BATCH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const batchStatus: DreamBatchStatus = selected.files.length === 0 ? "completed" : "open";
  const completedFields = batchStatus === "completed" ? { completedAt: createdAt, summary: "No changed canonical Markdown files were available for dreaming." } : {};
  const metadata: DreamBatchMetadata = {
    version: 1,
    ...targetMetadata(config, root),
    batchId,
    status: batchStatus,
    fromCursor: selected.fromCursor,
    toCursor: selected.toCursor,
    createdAt,
    expiresAt,
    ...completedFields,
    files: selected.files,
    hasMore: selected.hasMore,
    limits,
    warnings: [...selected.warnings, ...DREAM_WARNINGS],
  };
  const summary = dreamBatchSummary(metadata);

  await writeDreamBatch(root, config, metadata);
  await writeDreamState(root, config, {
    ...state,
    version: 1,
    openBatch: batchStatus === "open" ? summary : undefined,
    lastCompletedBatch: batchStatus === "completed" ? summary : state.lastCompletedBatch,
    lastCompletedAt: batchStatus === "completed" ? createdAt : state.lastCompletedAt,
    updatedAt: createdAt,
  });

  return hydrateDreamBatch(root, config, metadata, limits, false);
}

export async function getDreamBatch(options: { root: string; batchId: string; config?: DreamWorkflowConfig }): Promise<DreamBatch> {
  const config = options.config ?? LOCAL_DREAM_WORKFLOW;
  const root = await compatibleRoot(options.root);
  const batch = await readDreamBatch(root, config, options.batchId);
  return hydrateDreamBatch(root, config, batch, batch.limits, false);
}

export async function completeDreamBatch(options: { root: string; request: DreamCompleteRequest; config?: DreamWorkflowConfig }): Promise<DreamCompleteResult> {
  const config = options.config ?? LOCAL_DREAM_WORKFLOW;
  const root = await compatibleRoot(options.root);
  const request = options.request;
  if (!request.batchId) throw new DreamStateError("validation_failed", "Dream completion requires batchId.");
  const batch = await readDreamBatch(root, config, request.batchId);
  if (batch.status !== "open") throw new DreamStateError("invalid_state", `Dream batch ${request.batchId} is ${batch.status}, not open.`, { batchId: request.batchId, status: batch.status });
  const state = await readDreamState(root, config);
  if (state.openBatch?.batchId !== request.batchId) throw new DreamStateError("invalid_state", `Dream batch ${request.batchId} is not the current open batch.`, { batchId: request.batchId });

  const completedAt = new Date().toISOString();
  const completedFileCursors = await completionFileCursors(root, batch);
  const completed = await markBatchStatus(root, config, request.batchId, "completed", completedAt, request.summary, {
    updatedDocumentIds: stringArray(request.updatedDocumentIds),
    skippedDocumentIds: stringArray(request.skippedDocumentIds),
    operatorNotes: typeof request.operatorNotes === "string" ? request.operatorNotes : undefined,
  });
  const summary = dreamBatchSummary(completed);
  await writeDreamState(root, config, {
    ...state,
    version: 1,
    openBatch: state.openBatch?.batchId === request.batchId ? undefined : state.openBatch,
    lastCompletedCursor: completed.toCursor,
    completedFileCursors: { ...state.completedFileCursors, ...completedFileCursors },
    lastCompletedBatch: summary,
    lastCompletedAt: completedAt,
    updatedAt: completedAt,
  });

  return {
    ...targetMetadata(config, root),
    batchId: request.batchId,
    status: "completed",
    advancedCursor: completed.toCursor,
    lastCompletedAt: completedAt,
    summary: request.summary,
    updatedDocumentIds: stringArray(request.updatedDocumentIds),
    skippedDocumentIds: stringArray(request.skippedDocumentIds),
    warnings: [...DREAM_WARNINGS],
  };
}

export async function abandonDreamBatch(options: { root: string; batchId: string; summary?: string; config?: DreamWorkflowConfig }): Promise<DreamAbandonResult> {
  const config = options.config ?? LOCAL_DREAM_WORKFLOW;
  const root = await compatibleRoot(options.root);
  const batch = await readDreamBatch(root, config, options.batchId);
  if (batch.status !== "open") throw new DreamStateError("invalid_state", `Dream batch ${options.batchId} is ${batch.status}, not open.`, { batchId: options.batchId, status: batch.status });

  const abandonedAt = new Date().toISOString();
  await markBatchStatus(root, config, options.batchId, "abandoned", abandonedAt, options.summary);
  const state = await readDreamState(root, config);
  await writeDreamState(root, config, {
    ...state,
    version: 1,
    openBatch: state.openBatch?.batchId === options.batchId ? undefined : state.openBatch,
    updatedAt: abandonedAt,
  });

  return {
    ...targetMetadata(config, root),
    batchId: options.batchId,
    status: "abandoned",
    abandonedAt,
    summary: options.summary,
    warnings: [...DREAM_WARNINGS],
  };
}

async function selectDreamFiles(root: string, lastCompletedCursor: DreamCursor | undefined, completedFileCursors: Record<string, DreamCursor> | undefined, limits: DreamLimits, now: Date): Promise<{ files: DreamBatchFileMetadata[]; fromCursor?: DreamCursor; toCursor?: DreamCursor; hasMore: boolean; warnings: string[] }> {
  const cutoffMs = now.getTime() - DREAM_LOOKBACK_HOURS * 60 * 60 * 1000;
  const files = await listCanonicalMemoryMarkdownFiles(root);
  const candidates: Array<DreamBatchFileMetadata & { absolutePath: string }> = [];
  const warnings: string[] = [];
  let skippedMissingId = 0;

  for (const absolutePath of files) {
    const fileStat = await stat(absolutePath);
    const relativePath = normalizeRelative(root, absolutePath);
    const cursor = dreamCursorFor(relativePath, fileStat.mtimeMs);
    if (lastCompletedCursor) {
      if (!isDreamCursorAfter(cursor, lastCompletedCursor)) continue;
    } else if (fileStat.mtimeMs < cutoffMs) {
      continue;
    }
    const completedFileCursor = completedFileCursors?.[relativePath];
    if (completedFileCursor && !isDreamCursorAfter(cursor, completedFileCursor)) continue;

    const bytes = await readFile(absolutePath);
    const parsed = parseFrontmatter(bytes.toString("utf8"));
    const id = typeof parsed.frontmatter.id === "string" ? parsed.frontmatter.id : "";
    if (!id) {
      skippedMissingId += 1;
      continue;
    }
    candidates.push({
      id,
      file: relativePath,
      type: memoryTypeForDreamPath(relativePath, parsed.frontmatter),
      title: typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title : "",
      frontmatter: parsed.frontmatter,
      contentHash: hashMemoryDocumentContent(bytes),
      byteLength: bytes.byteLength,
      mtime: cursor.mtime,
      mtimeMs: cursor.mtimeMs,
      updatedAt: stringFrontmatterDreamDate(parsed.frontmatter),
      absolutePath,
    });
  }

  candidates.sort(compareDreamBatchFiles);
  const selected = candidates.slice(0, limits.maxFiles);
  if (skippedMissingId > 0) warnings.push(`Skipped ${skippedMissingId} canonical Markdown file(s) without document IDs. Run process --mode ensure-ids --apply on the memory root to make them update-addressable.`);

  return {
    files: selected.map(({ absolutePath: _absolutePath, ...metadata }) => metadata),
    fromCursor: lastCompletedCursor,
    toCursor: selected.length > 0 ? dreamCursorFor(selected.at(-1)!.file, selected.at(-1)!.mtimeMs) : lastCompletedCursor,
    hasMore: candidates.length > selected.length,
    warnings,
  };
}

async function hydrateDreamBatch(root: string, config: DreamWorkflowConfig, metadata: DreamBatchMetadata, limits: DreamLimits, resumed: boolean): Promise<DreamBatch> {
  let remainingBytes = limits.maxTotalBytes;
  const files: DreamFileContext[] = [];
  const warnings = [...metadata.warnings];

  for (const file of metadata.files) {
    const safeFile = normalizeDreamRelativeFile(file.file);
    const absolutePath = path.join(root, safeFile);
    try {
      const bytes = await readFile(absolutePath);
      const truncated = truncateDreamContent(bytes, limits, remainingBytes);
      remainingBytes = truncated.remainingBytes;
      files.push({
        ...file,
        root: rootLabel(config, root),
        contentHash: hashMemoryDocumentContent(bytes),
        content: truncated.contentBytes.toString("utf8"),
        byteLength: bytes.byteLength,
        truncated: truncated.truncated,
      });
    } catch {
      warnings.push(`Dream batch file is no longer readable: ${safeFile}`);
    }
  }

  if (remainingBytes <= 0) warnings.push("Dream batch response reached maxTotalBytes; later file contents may be truncated to zero bytes.");

  return {
    ...targetMetadata(config, root),
    batchId: metadata.batchId,
    status: metadata.status,
    fromCursor: metadata.fromCursor,
    toCursor: metadata.toCursor,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    completedAt: metadata.completedAt,
    abandonedAt: metadata.abandonedAt,
    summary: metadata.summary,
    files,
    hasMore: metadata.hasMore,
    resumed,
    instructions: [...DREAM_INSTRUCTIONS],
    limits,
    warnings,
  };
}

async function readDreamState(root: string, config: DreamWorkflowConfig): Promise<DreamState> {
  try {
    const parsed = JSON.parse(await readFile(dreamStateFile(root, config), "utf8")) as Partial<DreamState>;
    return normalizeDreamState(parsed);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT" || error instanceof SyntaxError) return { version: 1 };
    throw stateError(error, "state_read_failed", "Failed to read dream state");
  }
}

async function writeDreamState(root: string, config: DreamWorkflowConfig, state: DreamState): Promise<void> {
  await mkdir(path.dirname(dreamStateFile(root, config)), { recursive: true });
  await writeFile(dreamStateFile(root, config), `${JSON.stringify(normalizeDreamState(state), null, 2)}\n`, "utf8");
}

async function readDreamBatch(root: string, config: DreamWorkflowConfig, batchId: string): Promise<DreamBatchMetadata> {
  validateBatchId(batchId);
  try {
    const parsed = JSON.parse(await readFile(dreamBatchFile(root, config, batchId), "utf8")) as Partial<DreamBatchMetadata>;
    return normalizeDreamBatch(parsed, batchId, config, root);
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code === "ENOENT") throw new DreamStateError("missing_batch", `Dream batch ${batchId} was not found.`, { batchId });
    if (error instanceof SyntaxError) throw new DreamStateError("corrupt_batch", `Dream batch ${batchId} metadata is corrupt.`, { batchId });
    if (error instanceof DreamStateError || error instanceof DreamPolicyError) throw error;
    throw stateError(error, "batch_read_failed", "Failed to read dream batch", { batchId });
  }
}

async function writeDreamBatch(root: string, config: DreamWorkflowConfig, batch: DreamBatchMetadata): Promise<void> {
  validateBatchId(batch.batchId);
  await mkdir(path.dirname(dreamBatchFile(root, config, batch.batchId)), { recursive: true });
  const safe = normalizeDreamBatch(batch, batch.batchId, config, root);
  await writeFile(dreamBatchFile(root, config, batch.batchId), `${JSON.stringify(safe, null, 2)}\n`, "utf8");
}

async function markBatchStatus(root: string, config: DreamWorkflowConfig, batchId: string, status: Exclude<DreamBatchStatus, "open">, at: string, summary?: string, extra: Partial<DreamBatchMetadata> = {}): Promise<DreamBatchMetadata> {
  const batch = await readDreamBatch(root, config, batchId);
  const updated = normalizeDreamBatch({
    ...batch,
    ...extra,
    status,
    summary,
    ...(status === "completed" ? { completedAt: at } : { abandonedAt: at }),
  }, batchId, config, root);
  await writeDreamBatch(root, config, updated);
  return updated;
}

async function completionFileCursors(root: string, batch: DreamBatchMetadata): Promise<Record<string, DreamCursor>> {
  const cursors: Record<string, DreamCursor> = {};
  for (const file of batch.files) {
    const safeFile = normalizeDreamRelativeFile(file.file);
    let cursor = dreamCursorFor(safeFile, file.mtimeMs);
    try {
      const fileStat = await stat(path.join(root, safeFile));
      cursor = maxDreamCursor(cursor, dreamCursorFor(safeFile, fileStat.mtimeMs)) ?? cursor;
    } catch {
      // Missing files are still considered completed at their original batch cursor.
    }
    cursors[safeFile] = cursor;
  }
  return cursors;
}

function normalizeDreamState(value: Partial<DreamState>): DreamState {
  return {
    version: 1,
    openBatch: value.openBatch && typeof value.openBatch.batchId === "string" ? value.openBatch : undefined,
    lastCompletedCursor: normalizeCursor(value.lastCompletedCursor),
    completedFileCursors: normalizeCompletedFileCursors(value.completedFileCursors),
    lastCompletedBatch: value.lastCompletedBatch && typeof value.lastCompletedBatch.batchId === "string" ? value.lastCompletedBatch : undefined,
    lastCompletedAt: typeof value.lastCompletedAt === "string" ? value.lastCompletedAt : undefined,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function normalizeDreamBatch(value: Partial<DreamBatchMetadata>, batchId: string, config: DreamWorkflowConfig, root: string): DreamBatchMetadata {
  validateBatchId(batchId);
  const files = Array.isArray(value.files) ? value.files.map(normalizeBatchFile).filter((file): file is DreamBatchFileMetadata => Boolean(file)) : [];
  const status = value.status === "completed" || value.status === "abandoned" ? value.status : "open";
  return {
    version: 1,
    ...targetMetadata(config, root),
    batchId,
    status,
    fromCursor: normalizeCursor(value.fromCursor),
    toCursor: normalizeCursor(value.toCursor),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : new Date(0).toISOString(),
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined,
    abandonedAt: typeof value.abandonedAt === "string" ? value.abandonedAt : undefined,
    summary: typeof value.summary === "string" ? value.summary : undefined,
    files,
    hasMore: Boolean(value.hasMore),
    limits: value.limits ? normalizeDreamLimits(value.limits) : DEFAULT_DREAM_LIMITS,
    updatedDocumentIds: stringArray(value.updatedDocumentIds),
    skippedDocumentIds: stringArray(value.skippedDocumentIds),
    operatorNotes: typeof value.operatorNotes === "string" ? value.operatorNotes : undefined,
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
  };
}

function normalizeBatchFile(value: unknown): DreamBatchFileMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const file = typeof record.file === "string" ? normalizeDreamRelativeFile(record.file) : "";
  const id = typeof record.id === "string" ? record.id : "";
  if (!file || !id) return undefined;
  const frontmatter = record.frontmatter && typeof record.frontmatter === "object" && !Array.isArray(record.frontmatter) ? record.frontmatter as Frontmatter : {};
  const type = memoryTypeForDreamPath(file, frontmatter);
  const mtimeMs = typeof record.mtimeMs === "number" ? record.mtimeMs : Date.parse(String(record.mtime ?? ""));
  const safeMtimeMs = Number.isFinite(mtimeMs) ? mtimeMs : 0;
  return {
    id,
    file,
    type,
    title: typeof record.title === "string" ? record.title : "",
    frontmatter,
    contentHash: typeof record.contentHash === "string" && record.contentHash.startsWith("sha256:") ? record.contentHash as `sha256:${string}` : "sha256:unknown",
    byteLength: typeof record.byteLength === "number" ? record.byteLength : 0,
    mtime: typeof record.mtime === "string" ? record.mtime : new Date(safeMtimeMs).toISOString(),
    mtimeMs: safeMtimeMs,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function normalizeCursor(value: unknown): DreamCursor | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.file !== "string" || typeof record.mtimeMs !== "number") return undefined;
  return dreamCursorFor(record.file, record.mtimeMs);
}

function normalizeCompletedFileCursors(value: unknown): Record<string, DreamCursor> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const cursors: Record<string, DreamCursor> = {};
  for (const [file, cursorValue] of Object.entries(value as Record<string, unknown>)) {
    try {
      const safeFile = normalizeDreamRelativeFile(file);
      const cursor = normalizeCursor(cursorValue);
      if (cursor && cursor.file === safeFile) cursors[safeFile] = cursor;
    } catch {
      // Ignore invalid recovered state entries.
    }
  }
  return Object.keys(cursors).length > 0 ? cursors : undefined;
}

function validateBatchId(batchId: string): void {
  try {
    validateDreamBatchId(batchId);
  } catch (error) {
    if (error instanceof DreamPolicyError) throw new DreamStateError(error.code, error.message, error.details);
    throw error;
  }
}

function targetMetadata(config: DreamWorkflowConfig, root: string): MemoryDocumentTargetMetadata {
  return {
    root: rootLabel(config, root),
    target: config.target,
    ...(config.memory ? { memory: config.memory } : {}),
  };
}

function rootLabel(config: DreamWorkflowConfig, root: string): string {
  return typeof config.rootLabel === "function" ? config.rootLabel(root) : config.rootLabel;
}

function dreamStateFile(root: string, config: DreamWorkflowConfig): string {
  return path.join(root, config.stateRelativePath);
}

function dreamBatchFile(root: string, config: DreamWorkflowConfig, batchId: string): string {
  validateBatchId(batchId);
  return path.join(root, config.batchesRelativeDir, `${batchId}.json`);
}

async function compatibleRoot(rootArg: string): Promise<string> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  return root;
}

function stateError(error: unknown, code: string, message: string, details: Record<string, unknown> = {}): DreamStateError {
  return new DreamStateError(code, `${message}: ${error instanceof Error ? error.message : String(error)}`, details);
}
