import { currentMemoryEditor } from "../contribution.js";
import { metadataDate } from "./metadata-date.js";
import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { normalizedDocumentTitle } from "../document-title.js";
export { normalizedDocumentTitle } from "../document-title.js";
import { patchMemoryAttention, validateMemoryAttentionAction, type MemoryAttentionAction } from "../attention.js";
import { mergeMemoryDocumentUpdate } from "../document-update.js";
import { isValidMemoryDocumentId } from "../document-id.js";
import { parseFrontmatter } from "../frontmatter.js";
import type { Frontmatter, MarkdownDocument, MemoryDocumentContentHash, MemoryDocumentDeleteResult, MemoryDocumentEditError, MemoryDocumentEditErrorCode, MemoryDocumentReadResult, MemoryDocumentTargetKind, MemoryDocumentUpdateResult, MemoryNoteType } from "../../types.js";

export { parseFrontmatter } from "../frontmatter.js";

const IGNORED_DIRS = new Set([
  ".git",
  ".obsidian",
  ".trash",
  ".jumpybrain",
  ".qmd",
  "node_modules",
  "dist",
  "build",
  "logs",
  "reports",
]);

export const CANONICAL_MEMORY_BUCKETS = ["notes", "findings", "decisions", "preferences", "sessions", "pages"] as const;

const CANONICAL_MEMORY_TYPES = new Set<MemoryNoteType>(["note", "finding", "decision", "preference", "session", "page"]);

const CANONICAL_BUCKET_TYPES = {
  notes: "note",
  findings: "finding",
  decisions: "decision",
  preferences: "preference",
  sessions: "session",
  pages: "page",
} as const satisfies Record<(typeof CANONICAL_MEMORY_BUCKETS)[number], MemoryNoteType>;

const IGNORED_FILE_PATTERNS = [/gold/i, /answer_session_ids/i];

export interface CanonicalMemoryDocumentLocation {
  id: string;
  root: string;
  file: string;
  absolutePath: string;
  type: MemoryNoteType;
  title: string;
  frontmatter: Frontmatter;
}

export interface ReadCanonicalMemoryDocumentOptions {
  /** Reuse guarded inode/ancestor/ID checks for source evidence reads; reject hardlinks. */
  guarded?: boolean;
  signal?: AbortSignal;
  target?: MemoryDocumentTargetKind;
  rootLabel?: string;
  memory?: "all";
}

export class MemoryDocumentLookupError extends Error implements MemoryDocumentEditError {
  readonly code: MemoryDocumentEditErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: MemoryDocumentEditErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "MemoryDocumentLookupError";
    this.code = code;
    this.details = details;
  }
}

export async function resolveMemoryRoot(rootArg: string): Promise<string> {
  if (!rootArg || typeof rootArg !== "string") {
    throw new Error("--root is required.");
  }

  const resolved = path.resolve(rootArg);
  return realpath(resolved);
}

export async function listMarkdownFiles(root: string, signal?: AbortSignal): Promise<string[]> {
  return walkMarkdownFiles(root, [root], { signal });
}

export async function listCanonicalMemoryMarkdownFiles(root: string, signal?: AbortSignal): Promise<string[]> {
  return walkMarkdownFiles(root, CANONICAL_MEMORY_BUCKETS.map((bucket) => path.join(root, bucket)), { ignoreMissingStart: true, signal });
}

export async function readMarkdownDocument(root: string, absolutePath: string, signal?: AbortSignal): Promise<MarkdownDocument> {
  signal?.throwIfAborted();
  const parsed = await readMarkdownMetadata(absolutePath, signal);
  return {
    absolutePath,
    relativePath: normalizeRelative(root, absolutePath),
    frontmatter: parsed.frontmatter,
    bodyStartLine: parsed.bodyStartLine,
  };
}

/** Metadata callers need no body. Oversized/unfinished headers retain the full parser's behavior. */
async function readMarkdownMetadata(file: string, signal?: AbortSignal) {
  const handle = await open(file, "r");
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    while (length < 65536) {
      signal?.throwIfAborted();
      const buffer = Buffer.allocUnsafe(4096);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, length);
      signal?.throwIfAborted();
      chunks.push(buffer.subarray(0, bytesRead)); length += bytesRead;
      const text = Buffer.concat(chunks, length).toString("utf8");
      const eof = bytesRead === 0;
      let start = 0, line = 0;
      while (start < text.length || (eof && start === text.length)) {
        const newline = text.indexOf("\n", start);
        if (newline === -1 && !eof) break;
        const end = newline === -1 ? text.length : newline;
        const delimiter = text.slice(start, end).trim() === "---";
        if (line === 0 && !delimiter) return { frontmatter: {}, bodyStartLine: 1 };
        if (line > 0 && delimiter) {
          // Detach metadata strings from the read buffer/body prefix before retaining them.
          const header = Buffer.from(text.slice(0, end)).toString("utf8");
          return parseFrontmatter(header);
        }
        if (newline === -1) break;
        start = newline + 1; line++;
      }
      if (eof) return { frontmatter: {}, bodyStartLine: 1 };
    }
    // Positional reads above do not advance the handle's readFile offset.
    return parseFrontmatter(await handle.readFile({ encoding: "utf8", signal }));
  } finally { await handle.close(); }
}

export interface CanonicalMarkdownIndexInput {
  absolutePath: string;
  /** Excluded names require exact migration-envelope eligibility at snapshot time. */
  importedMigrationOnly?: boolean;
}

/** Discovery without content reads; validate exceptional envelopes with locked snapshots. */
export async function discoverMarkdownIndexInputs(root: string, signal?: AbortSignal): Promise<CanonicalMarkdownIndexInput[]> {
  const deferredMigration = new Set<string>();
  const files = await walkMarkdownFiles(root, [root], { signal, deferredMigration });
  return files.map(absolutePath => ({ absolutePath, ...(deferredMigration.has(absolutePath) ? { importedMigrationOnly: true } : {}) }));
}

export async function readCanonicalMarkdownIndexInput(root: string, input: CanonicalMarkdownIndexInput, signal?: AbortSignal) {
  const snapshot = await readCanonicalMarkdownSnapshot(root, input.absolutePath, signal);
  return input.importedMigrationOnly && !isImportedMigrationFrontmatter(snapshot.relativePath, snapshot.frontmatter) ? undefined : snapshot;
}

export interface CanonicalMarkdownSnapshot extends MarkdownDocument {
  content: string;
  sourceStat: { size: number; mtimeMs: number; ctimeMs: number };
}

/** Caller owns any operation lock; detect changes across the canonical content read. */
export async function readCanonicalMarkdownSnapshot(root: string, absolutePath: string, signal?: AbortSignal): Promise<CanonicalMarkdownSnapshot> {
  signal?.throwIfAborted();
  const before = await stat(absolutePath);
  const content = await readFile(absolutePath, { encoding: "utf8", signal });
  signal?.throwIfAborted();
  const after = await stat(absolutePath);
  signal?.throwIfAborted();
  if (before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.size !== after.size) {
    throw new Error("Canonical memory changed during snapshot; retry index.");
  }
  const parsed = parseFrontmatter(content);
  return { absolutePath, relativePath: normalizeRelative(root, absolutePath), content,
    frontmatter: parsed.frontmatter, bodyStartLine: parsed.bodyStartLine,
    sourceStat: { size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs } };
}

export async function readMarkdownDocuments(root: string, signal?: AbortSignal): Promise<MarkdownDocument[]> {
  const files = await listMarkdownFiles(root, signal);
  const documents = [];
  for (const file of files) documents.push(await readMarkdownDocument(root, file, signal));
  return documents;
}

/** Request-scoped discovery; matched reads revalidate current file identity/bytes. */
export async function discoverCanonicalMemoryDocumentsById(rootArg: string, ids: Iterable<string>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const root = await resolveMemoryRoot(rootArg);
  const requested = new Set([...ids].filter(isValidMemoryDocumentId));
  const matches = new Map<string, CanonicalMemoryDocumentLocation[]>();
  if (requested.size) for (const absolutePath of await listCanonicalMemoryMarkdownFiles(root, signal)) {
    const document = await readMarkdownDocument(root, absolutePath, signal);
    const id = document.frontmatter.id;
    if (typeof id !== "string" || !requested.has(id)) continue;
    const locations = matches.get(id) ?? [];
    locations.push(toCanonicalMemoryDocumentLocation(root, document, id));
    matches.set(id, locations);
  }
  const find = (id: string): CanonicalMemoryDocumentLocation => {
    signal?.throwIfAborted();
    if (!isValidMemoryDocumentId(id)) throw new MemoryDocumentLookupError("invalid_id", `Invalid memory document id '${id}'. Expected mem_<uuid>.`, { id });
    const locations = matches.get(id) ?? [];
    if (!locations.length) throw new MemoryDocumentLookupError("missing_id", `No canonical memory document found for id '${id}'.`, { id });
    if (locations.length > 1) throw new MemoryDocumentLookupError("duplicate_id", `Multiple canonical memory documents found for id '${id}'.`, { id, files: locations.map(location => location.file) });
    return locations[0]!;
  };
  return {
    find,
    async read(id: string, options: ReadCanonicalMemoryDocumentOptions = {}) {
      return readCanonicalMemoryDocumentAtLocation(find(id), { ...options, signal: options.signal ?? signal });
    },
  };
}

export async function findCanonicalMemoryDocumentById(rootArg: string, id: string, signal?: AbortSignal): Promise<CanonicalMemoryDocumentLocation> {
  if (!isValidMemoryDocumentId(id)) throw new MemoryDocumentLookupError("invalid_id", `Invalid memory document id '${id}'. Expected mem_<uuid>.`, { id });
  return (await discoverCanonicalMemoryDocumentsById(rootArg, [id], signal)).find(id);
}

export async function readCanonicalMemoryDocumentById(rootArg: string, id: string, options: ReadCanonicalMemoryDocumentOptions = {}): Promise<MemoryDocumentReadResult> {
  const location = await findCanonicalMemoryDocumentById(rootArg, id, options.signal);
  return readCanonicalMemoryDocumentAtLocation(location, options);
}

async function readCanonicalMemoryDocumentAtLocation(location: CanonicalMemoryDocumentLocation, options: ReadCanonicalMemoryDocumentOptions): Promise<MemoryDocumentReadResult> {
  const id = location.id;
  const bytes = options.guarded ? (await replacementSnapshot(location, undefined, options.signal)).bytes : await readFile(location.absolutePath, { signal: options.signal });
  options.signal?.throwIfAborted();
  const content = bytes.toString("utf8");
  const parsed = parseFrontmatter(content);
  const type = memoryTypeForPath(location.file, parsed.frontmatter);
  const title = typeof parsed.frontmatter.title === "string" ? parsed.frontmatter.title : "";
  const target = options.target ?? "local";
  const result: MemoryDocumentReadResult = {
    root: options.rootLabel ?? location.root,
    target,
    ...(options.memory ? { memory: options.memory } : {}),
    id,
    file: location.file,
    type,
    title,
    frontmatter: parsed.frontmatter,
    content,
    contentHash: hashMemoryDocumentContent(bytes),
  };
  return result;
}

export type CanonicalMemoryTitleResolution =
  | { status: "found"; id: string }
  | { status: "missing" | "ambiguous" | "unopenable" };

/** Fresh title-only lookup; read-only, but not atomic against filesystem writers. */
export async function resolveCanonicalMemoryDocumentByTitle(rootArg: string, title: string): Promise<CanonicalMemoryTitleResolution> {
  const key = normalizedDocumentTitle(title);
  if (!key) return { status: "missing" };
  try {
    const root = await resolveMemoryRoot(rootArg);
    const matches: MarkdownDocument[] = [];
    for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
      const document = await readMarkdownDocument(root, file);
      // ID-less and invalid-ID matches still make a title ambiguous.
      if (normalizedDocumentTitle(document.frontmatter.title) === key) matches.push(document);
    }
    if (!matches.length) return { status: "missing" };
    if (matches.length > 1) return { status: "ambiguous" };
    const match = matches[0]!;
    const id = match.frontmatter.id;
    if (typeof id !== "string") return { status: "unopenable" };
    // Reuse editor ID validation/global duplicate detection at the same root.
    const opened = await readCanonicalMemoryDocumentById(root, id);
    if (opened.file !== match.relativePath || opened.frontmatter.id !== id ||
        normalizedDocumentTitle(opened.title) !== key) return { status: "unopenable" };
    return { status: "found", id };
  } catch {
    // Never expose scan diagnostics or mistake a failed read for a missing title.
    return { status: "unopenable" };
  }
}

export interface ReplaceCanonicalMemoryDocumentOptions extends ReadCanonicalMemoryDocumentOptions {
  actor?: import("../../types.js").MemoryActor;
  updatedAt?: string;
  /** Optional for direct core callers; app updates require the prior read token. */
  ifMatch?: MemoryDocumentContentHash | string;
}

// Serialize this module's updates (including title checks) by real root. Publication
// also takes an exclusive filesystem lock so separate cooperating processes fail closed.
const replacementQueues = new Map<string, Promise<void>>();

export async function replaceCanonicalMemoryDocumentById(
  rootArg: string,
  id: string,
  submittedContent: string,
  options: ReplaceCanonicalMemoryDocumentOptions = {},
): Promise<MemoryDocumentUpdateResult> {
  if (!isValidMemoryDocumentId(id)) {
    throw new MemoryDocumentLookupError("invalid_id", `Invalid memory document id '${id}'. Expected mem_<uuid>.`, { id });
  }
  const root = await resolveMemoryRoot(rootArg);
  return withCanonicalMutation(root, () => replaceCanonicalMemoryDocument(root, id, submittedContent, options));
}

/** Metadata-only attention change, using the same guarded queue/lock/atomic publisher as content saves. */
export async function patchCanonicalMemoryDocumentAttention(
  rootArg: string, id: string, options: { ifMatch: string; mutation: MemoryAttentionAction },
): Promise<MemoryDocumentReadResult & { oldContentHash: MemoryDocumentContentHash; newContentHash: MemoryDocumentContentHash }> {
  if (!/^sha256:[0-9a-f]{64}$/.test(options.ifMatch ?? "")) {
    throw new MemoryDocumentLookupError("precondition_required", "Attention changes require the content hash from a prior read.");
  }
  const root = await resolveMemoryRoot(rootArg);
  return withCanonicalMutation(root, async () => {
    const mutation = validateMemoryAttentionAction(options.mutation, Date.now());
    if (!mutation) throw new MemoryDocumentLookupError("validation_failed", "Invalid attention action or snooze timestamp.");
    const location = await findCanonicalMemoryDocumentById(root, id);
    const original = await replacementSnapshot(location);
    const oldContentHash = hashMemoryDocumentContent(original.bytes);
    if (oldContentHash !== options.ifMatch) throw replacementConflict(location, oldContentHash);
    let source: string;
    try { source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(original.bytes); }
    catch { throw new MemoryDocumentLookupError("validation_failed", "Attention changes require a valid UTF-8 Markdown document."); }
    const content = patchMemoryAttention(source, mutation);
    await atomicWriteUtf8File(location, content, original, oldContentHash);
    const frontmatter = parseFrontmatter(content).frontmatter;
    const contentHash = hashMemoryDocumentContent(content);
    return { root, target: "local", id, file: location.file, type: memoryTypeForPath(location.file, frontmatter),
      title: typeof frontmatter.title === "string" ? frontmatter.title : "", frontmatter, content, contentHash,
      oldContentHash, newContentHash: contentHash };
  });
}

async function withCanonicalMutation<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = replacementQueues.get(root) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  replacementQueues.set(root, pending);
  await previous;
  try { return await operation(); }
  finally {
    release();
    if (replacementQueues.get(root) === pending) replacementQueues.delete(root);
  }
}

/** Permanent single-file removal; never stamps IDs, rewrites backlinks or retries. */
export async function deleteCanonicalMemoryDocumentById(rootArg: string, id: string, options: { ifMatch: string; apply: true }): Promise<MemoryDocumentDeleteResult> {
  if (options?.apply !== true) throw new MemoryDocumentLookupError("validation_failed", "Permanent deletion requires explicit apply authorization.");
  if (!/^sha256:[0-9a-f]{64}$/.test(options.ifMatch ?? "")) throw new MemoryDocumentLookupError("precondition_required", "Deletion requires the content hash from a prior read.");
  const root = await resolveMemoryRoot(rootArg);
  return withCanonicalMutation(root, async () => {
    const location = await findCanonicalMemoryDocumentById(root, id);
    const original = await replacementSnapshot(location);
    const hash = hashMemoryDocumentContent(original.bytes);
    if (hash !== options.ifMatch) throw replacementConflict(location, hash);
    await withDocumentLock(location, async () => {
      const latest = await replacementSnapshot(location, original);
      if (hashMemoryDocumentContent(latest.bytes) !== hash) throw replacementConflict(location);
      await unlink(location.absolutePath);
      await fsyncDirectoryBestEffort(path.dirname(location.absolutePath));
    });
    return { root, target: "local", id, file: location.file, removed: true, oldContentHash: hash,
      indexed: false, index: { stale: true, indexed: false }, indexing: { status: "pending" } };
  });
}

async function replaceCanonicalMemoryDocument(
  root: string, id: string, submittedContent: string, options: ReplaceCanonicalMemoryDocumentOptions,
): Promise<MemoryDocumentUpdateResult> {
  const location = await findCanonicalMemoryDocumentById(root, id);
  const original = await replacementSnapshot(location);
  const oldBytes = original.bytes;
  const oldContentHash = hashMemoryDocumentContent(oldBytes);
  if (options.ifMatch !== undefined && options.ifMatch !== oldContentHash) {
    throw replacementConflict(location, oldContentHash);
  }
  // An exact no-op still checks destination identity/hash, but never republishes bytes or edit time.
  if (submittedContent === oldBytes.toString("utf8")) {
    const updated = parseFrontmatter(submittedContent).frontmatter.updated_at;
    return { unchanged: true, root: options.rootLabel ?? root, target: options.target ?? "local", ...(options.memory ? { memory: options.memory } : {}),
      id, file: location.file, oldContentHash, newContentHash: oldContentHash,
      recognition: { metadataStatus: "current", updatedAt: metadataDate(updated), createdAt: metadataDate(parseFrontmatter(submittedContent).frontmatter.created_at), editor: currentMemoryEditor(submittedContent) },
      updatedAt: typeof updated === "string" ? updated : "", indexed: false };
  }
  const merged = mergeMemoryDocumentUpdate(oldBytes.toString("utf8"), submittedContent, { updatedAt: options.updatedAt, actor: options.actor });

  // Compare the merged metadata against canonical files, never the derived index.
  // Equivalent titles are not renames: legacy duplicates must remain body-editable.
  const oldTitle = normalizedDocumentTitle(parseFrontmatter(oldBytes.toString("utf8")).frontmatter.title);
  const newTitle = normalizedDocumentTitle(merged.frontmatter.title);
  if (newTitle && newTitle !== oldTitle) {
    const conflicts: string[] = [];
    for (const absolutePath of await listCanonicalMemoryMarkdownFiles(location.root)) {
      if (absolutePath === location.absolutePath) continue;
      const document = await readMarkdownDocument(location.root, absolutePath);
      if (normalizedDocumentTitle(document.frontmatter.title) === newTitle) {
        conflicts.push(document.relativePath);
      }
    }
    if (conflicts.length > 0) {
      throw new MemoryDocumentLookupError(
        "duplicate_title",
        "Another memory document already uses this title. Choose a different title.",
        { id, file: location.file, files: conflicts },
      );
    }
  }

  await atomicWriteUtf8File(location, merged.content, original, oldContentHash);
  // Describe the bytes we published, not a subsequent external writer's revision.
  const newBytes = Buffer.from(merged.content, "utf8");
  const target = options.target ?? "local";
  return {
    root: options.rootLabel ?? location.root,
    target,
    ...(options.memory ? { memory: options.memory } : {}),
    id,
    file: location.file,
    oldContentHash,
    newContentHash: hashMemoryDocumentContent(newBytes),
    recognition: { metadataStatus: "current", updatedAt: metadataDate(merged.frontmatter.updated_at), createdAt: metadataDate(merged.frontmatter.created_at) ?? metadataDate(merged.frontmatter.createdAt), editor: currentMemoryEditor(merged.content) },
    updatedAt: merged.updatedAt,
    indexed: false,
    index: { stale: true, indexed: false },
  };
}

export function hashMemoryDocumentContent(content: Buffer | string): MemoryDocumentContentHash {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function toCanonicalMemoryDocumentLocation(root: string, document: MarkdownDocument, id: string): CanonicalMemoryDocumentLocation {
  return {
    id,
    root,
    file: document.relativePath,
    absolutePath: document.absolutePath,
    type: memoryTypeForPath(document.relativePath, document.frontmatter),
    title: typeof document.frontmatter.title === "string" ? document.frontmatter.title : "",
    frontmatter: document.frontmatter,
  };
}

function memoryTypeForPath(relativePath: string, frontmatter: Frontmatter): MemoryNoteType {
  const frontmatterType = frontmatter.type;
  if (typeof frontmatterType === "string" && CANONICAL_MEMORY_TYPES.has(frontmatterType as MemoryNoteType)) {
    return frontmatterType as MemoryNoteType;
  }

  const bucket = relativePath.split("/")[0] as (typeof CANONICAL_MEMORY_BUCKETS)[number] | undefined;
  if (bucket && Object.hasOwn(CANONICAL_BUCKET_TYPES, bucket)) {
    return CANONICAL_BUCKET_TYPES[bucket];
  }

  return "note";
}

function isImportOutputPath(relative: string): boolean {
  const parts = relative.split("/");
  return (parts[0] === "notes" || parts[0] === "sessions") &&
    parts.every((part) => !!part && !part.startsWith("."));
}

async function isImportedMigrationDocument(root: string, absolute: string, signal?: AbortSignal): Promise<boolean> {
  const relative = normalizeRelative(root, absolute);
  if (!isImportOutputPath(relative)) return false;
  const { frontmatter } = await readMarkdownDocument(root, absolute, signal);
  return isImportedMigrationFrontmatter(relative, frontmatter);
}

function isImportedMigrationFrontmatter(relative: string, frontmatter: Frontmatter): boolean {
  if (!isImportOutputPath(relative)) return false;
  if (frontmatter.source === "obsidian-migration") {
    return relative.startsWith("notes/") && isValidMemoryDocumentId(frontmatter.id) && frontmatter.type === "note" &&
      frontmatter.source_path === relative.slice("notes/".length);
  }
  const journal = relative.startsWith("sessions/");
  const sourcePath = `${journal ? "journals" : "pages"}/${relative.slice(relative.indexOf("/") + 1)}`;
  return frontmatter.source === "logseq-migration" && isValidMemoryDocumentId(frontmatter.id) &&
    frontmatter.type === (journal ? "session" : "note") && frontmatter.source_path === sourcePath;
}

async function walkMarkdownFiles(root: string, starts: string[], options: { ignoreMissingStart?: boolean; signal?: AbortSignal; deferredMigration?: Set<string> } = {}): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, importsOnly = false): Promise<void> {
    options.signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (options.ignoreMissingStart && (error as { code?: string }).code === "ENOENT") return;
      throw error;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      const absolute = path.join(dir, entry.name);
      const relative = normalizeRelative(root, absolute);
      const ignored = IGNORED_DIRS.has(entry.name);
      if (entry.isDirectory()) {
        // Reopen only nonhidden migration paths, and retain exclusion state for descendants.
        if ((ignored || importsOnly) && !isImportOutputPath(relative)) continue;
        await walk(absolute, importsOnly || ignored);
        continue;
      }
      if (ignored || !entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      const excluded = importsOnly || IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(relative));
      if (excluded && options.deferredMigration) {
        if (isImportOutputPath(relative)) { options.deferredMigration.add(absolute); results.push(absolute); }
      } else if (!excluded || await isImportedMigrationDocument(root, absolute, options.signal)) results.push(absolute);
    }
  }

  for (const start of starts) {
    if (options.ignoreMissingStart) {
      // Bucket entrypoints must obey the same no-symlink rule as recursive entries.
      try {
        if ((await lstat(start)).isSymbolicLink()) continue;
      } catch (error) {
        if ((error as { code?: string }).code === "ENOENT") continue;
        throw error;
      }
    }
    await walk(start);
  }
  return results;
}

interface ReplacementSnapshot {
  bytes: Buffer;
  file: Stats;
  directories: Stats[];
}

function sameIdentity(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

function replacementConflict(location: CanonicalMemoryDocumentLocation, currentContentHash?: MemoryDocumentContentHash): MemoryDocumentLookupError {
  return new MemoryDocumentLookupError(
    "precondition_failed",
    "Document content hash is stale. Re-read the document before retrying the update.",
    { id: location.id, file: location.file, ...(currentContentHash ? { currentContentHash } : {}) },
  );
}

async function replacementSnapshot(location: CanonicalMemoryDocumentLocation, expected?: ReplacementSnapshot, signal?: AbortSignal): Promise<ReplacementSnapshot> {
  let handle;
  try {
    signal?.throwIfAborted();
    const directories: Stats[] = [];
    let dir = location.root;
    for (const component of ["", ...path.dirname(location.file).split("/")]) {
      dir = path.join(dir, component);
      const stat = await lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw replacementConflict(location);
      directories.push(stat);
    }
    if (expected && directories.some((stat, index) => !sameIdentity(stat, expected.directories[index]!))) {
      throw replacementConflict(location);
    }
    const file = await lstat(location.absolutePath);
    if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1 || (expected && !sameIdentity(file, expected.file))) {
      throw replacementConflict(location);
    }
    handle = await open(location.absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!sameIdentity(file, opened) || !opened.isFile() || opened.nlink !== 1) throw replacementConflict(location);
    const bytes = await handle.readFile({ signal });
    signal?.throwIfAborted();
    if (parseFrontmatter(bytes.toString("utf8")).frontmatter.id !== location.id) throw replacementConflict(location);
    await handle.close();
    handle = undefined;
    // Reads/close are asynchronous too: recheck ancestors again at publication.
    dir = location.root;
    for (const [index, component] of ["", ...path.dirname(location.file).split("/")].entries()) {
      dir = path.join(dir, component);
      const stat = await lstat(dir);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !sameIdentity(stat, directories[index]!)) throw replacementConflict(location);
    }
    const latest = await lstat(location.absolutePath);
    if (!sameIdentity(file, latest) || !latest.isFile() || latest.nlink !== 1) throw replacementConflict(location);
    return { bytes, file, directories };
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) throw replacementConflict(location);
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

async function atomicWriteUtf8File(location: CanonicalMemoryDocumentLocation, content: string, original: ReplacementSnapshot, oldContentHash: MemoryDocumentContentHash): Promise<void> {
  const file = location.absolutePath;
  const dir = path.dirname(file);
  const tempFile = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  let staged = false;
  try {
    handle = await open(tempFile, "wx");
    staged = true;
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await withDocumentLock(location, async () => {
      const latest = await replacementSnapshot(location, original);
      const latestHash = hashMemoryDocumentContent(latest.bytes);
      if (latestHash !== oldContentHash) throw replacementConflict(location, latestHash);
      await rename(tempFile, file);
      staged = false;
      await fsyncDirectoryBestEffort(dir);
    });
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (staged) await unlink(tempFile).catch(() => undefined);

  }
}

async function withDocumentLock<T>(location: CanonicalMemoryDocumentLocation, operation: () => Promise<T>): Promise<T> {
  const lockFile = path.join(path.dirname(location.absolutePath), `.${path.basename(location.file)}.replace.lock`);
  let lock;
  try {
    try { lock = await open(lockFile, "wx"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw replacementConflict(location);
      throw error;
    }
    return await operation();
  } finally {
    if (lock) { await lock.close().catch(() => undefined); await unlink(lockFile).catch(() => undefined); }
  }
}

async function fsyncDirectoryBestEffort(dir: string): Promise<void> {
  let handle;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // Some platforms/filesystems do not permit directory fsync from Node; the file itself was fsynced before rename.
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}

export function normalizeRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

/** Bounded observational read; rejects symlinks, hardlinks, special files and changing bytes. */
export async function readBoundedCanonicalSource(root: string, absolutePath: string, maxBytes: number): Promise<Buffer> {
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid canonical source.");
  const parents = relative.split(path.sep).slice(0, -1);
  const verifyParents = async () => {
    let current = root;
    for (const part of parents) {
      current = path.join(current, part);
      const entry = await lstat(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Unsafe canonical ancestor.");
    }
    if (await realpath(path.dirname(absolutePath)) !== path.dirname(absolutePath)) throw new Error("Changed canonical ancestor.");
  };
  await verifyParents();
  const handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > maxBytes) throw new Error("Source unavailable within byte budget.");
    const buffer = Buffer.alloc(before.size);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    const after = await handle.stat(), current = await lstat(absolutePath);
    await verifyParents();
    if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || current.ino !== after.ino || current.dev !== after.dev || current.isSymbolicLink()) throw new Error("Canonical source changed during read.");
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}
