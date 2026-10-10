import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import { lstat, open, readdir, readFile, realpath, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { mergeMemoryDocumentUpdate } from "../document-update.js";
import { isValidMemoryDocumentId } from "../document-id.js";
import { parseFrontmatter } from "../frontmatter.js";
import type { Frontmatter, MarkdownDocument, MemoryDocumentContentHash, MemoryDocumentEditError, MemoryDocumentEditErrorCode, MemoryDocumentReadResult, MemoryDocumentTargetKind, MemoryDocumentUpdateResult, MemoryNoteType } from "../../types.js";

export { parseFrontmatter } from "../frontmatter.js";

const IGNORED_DIRS = new Set([
  ".git",
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

export async function listMarkdownFiles(root: string): Promise<string[]> {
  return walkMarkdownFiles(root, [root]);
}

export async function listCanonicalMemoryMarkdownFiles(root: string): Promise<string[]> {
  return walkMarkdownFiles(root, CANONICAL_MEMORY_BUCKETS.map((bucket) => path.join(root, bucket)), { ignoreMissingStart: true });
}

export async function readMarkdownDocument(root: string, absolutePath: string): Promise<MarkdownDocument> {
  const content = await readFile(absolutePath, "utf8");
  const parsed = parseFrontmatter(content);
  return {
    absolutePath,
    relativePath: normalizeRelative(root, absolutePath),
    frontmatter: parsed.frontmatter,
    bodyStartLine: parsed.bodyStartLine,
  };
}

export async function readMarkdownDocuments(root: string): Promise<MarkdownDocument[]> {
  const files = await listMarkdownFiles(root);
  return Promise.all(files.map((file) => readMarkdownDocument(root, file)));
}

export async function findCanonicalMemoryDocumentById(rootArg: string, id: string): Promise<CanonicalMemoryDocumentLocation> {
  if (!isValidMemoryDocumentId(id)) {
    throw new MemoryDocumentLookupError("invalid_id", `Invalid memory document id '${id}'. Expected mem_<uuid>.`, { id });
  }

  const root = await resolveMemoryRoot(rootArg);
  const files = await listCanonicalMemoryMarkdownFiles(root);
  const matches: CanonicalMemoryDocumentLocation[] = [];

  for (const absolutePath of files) {
    const document = await readMarkdownDocument(root, absolutePath);
    if (document.frontmatter.id !== id) continue;
    matches.push(toCanonicalMemoryDocumentLocation(root, document, id));
  }

  if (matches.length === 0) {
    throw new MemoryDocumentLookupError("missing_id", `No canonical memory document found for id '${id}'.`, { id });
  }

  if (matches.length > 1) {
    throw new MemoryDocumentLookupError("duplicate_id", `Multiple canonical memory documents found for id '${id}'.`, {
      id,
      files: matches.map((match) => match.file),
    });
  }

  return matches[0]!;
}

export async function readCanonicalMemoryDocumentById(rootArg: string, id: string, options: ReadCanonicalMemoryDocumentOptions = {}): Promise<MemoryDocumentReadResult> {
  const location = await findCanonicalMemoryDocumentById(rootArg, id);
  const bytes = await readFile(location.absolutePath);
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
  const previous = replacementQueues.get(root) ?? Promise.resolve();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  replacementQueues.set(root, pending);
  await previous;
  try {
    return await replaceCanonicalMemoryDocument(root, id, submittedContent, options);
  } finally {
    release();
    if (replacementQueues.get(root) === pending) replacementQueues.delete(root);
  }
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
  const merged = mergeMemoryDocumentUpdate(oldBytes.toString("utf8"), submittedContent, { updatedAt: options.updatedAt });

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
    updatedAt: merged.updatedAt,
    indexed: false,
    index: { stale: true, indexed: false },
  };
}

export function normalizedDocumentTitle(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase().normalize("NFC") : "";
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

function isLogseqOutputPath(relative: string): boolean {
  const parts = relative.split("/");
  return (parts[0] === "notes" || parts[0] === "sessions") &&
    parts.every((part) => !!part && !part.startsWith("."));
}

async function isImportedLogseqDocument(root: string, absolute: string): Promise<boolean> {
  const relative = normalizeRelative(root, absolute);
  if (!isLogseqOutputPath(relative)) return false;
  const { frontmatter } = await readMarkdownDocument(root, absolute);
  const journal = relative.startsWith("sessions/");
  const sourcePath = `${journal ? "journals" : "pages"}/${relative.slice(relative.indexOf("/") + 1)}`;
  return frontmatter.source === "logseq-migration" && isValidMemoryDocumentId(frontmatter.id) &&
    frontmatter.type === (journal ? "session" : "note") && frontmatter.source_path === sourcePath;
}

async function walkMarkdownFiles(root: string, starts: string[], options: { ignoreMissingStart?: boolean } = {}): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string, importsOnly = false): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (options.ignoreMissingStart && (error as { code?: string }).code === "ENOENT") return;
      throw error;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const relative = normalizeRelative(root, absolute);
      const ignored = IGNORED_DIRS.has(entry.name);
      if (entry.isDirectory()) {
        // Reopen only nonhidden migration paths, and retain exclusion state for descendants.
        if ((ignored || importsOnly) && !isLogseqOutputPath(relative)) continue;
        await walk(absolute, importsOnly || ignored);
        continue;
      }
      if (ignored || !entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      const excluded = importsOnly || IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(relative));
      if (!excluded || await isImportedLogseqDocument(root, absolute)) results.push(absolute);
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

async function replacementSnapshot(location: CanonicalMemoryDocumentLocation, expected?: ReplacementSnapshot): Promise<ReplacementSnapshot> {
  let handle;
  try {
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
    const bytes = await handle.readFile();
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
  const lockFile = path.join(dir, `.${path.basename(file)}.replace.lock`);
  let handle;
  let lock;
  let staged = false;
  try {
    handle = await open(tempFile, "wx");
    staged = true;
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      lock = await open(lockFile, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw replacementConflict(location);
      throw error;
    }
    // Last asynchronous work before rename: recheck path policy, original inode,
    // frontmatter ID and bytes. Node/POSIX rename is not a hostile-writer CAS.
    const latest = await replacementSnapshot(location, original);
    const latestHash = hashMemoryDocumentContent(latest.bytes);
    if (latestHash !== oldContentHash) throw replacementConflict(location, latestHash);
    await rename(tempFile, file);
    staged = false;
    await fsyncDirectoryBestEffort(dir);
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (staged) await unlink(tempFile).catch(() => undefined);
    if (lock) {
      await lock.close().catch(() => undefined);
      await unlink(lockFile).catch(() => undefined);
    }
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
