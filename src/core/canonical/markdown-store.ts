import { createHash, randomUUID } from "node:crypto";
import { open, readdir, readFile, realpath, rename, unlink } from "node:fs/promises";
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

export interface ReplaceCanonicalMemoryDocumentOptions extends ReadCanonicalMemoryDocumentOptions {
  updatedAt?: string;
}

export async function replaceCanonicalMemoryDocumentById(
  rootArg: string,
  id: string,
  submittedContent: string,
  options: ReplaceCanonicalMemoryDocumentOptions = {},
): Promise<MemoryDocumentUpdateResult> {
  const location = await findCanonicalMemoryDocumentById(rootArg, id);
  const oldBytes = await readFile(location.absolutePath);
  const oldContentHash = hashMemoryDocumentContent(oldBytes);
  const merged = mergeMemoryDocumentUpdate(oldBytes.toString("utf8"), submittedContent, { updatedAt: options.updatedAt });

  await atomicWriteUtf8File(location.absolutePath, merged.content);
  const newBytes = await readFile(location.absolutePath);
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

async function walkMarkdownFiles(root: string, starts: string[], options: { ignoreMissingStart?: boolean } = {}): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (options.ignoreMissingStart && (error as { code?: string }).code === "ENOENT") return;
      throw error;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      const relative = normalizeRelative(root, absolute);
      if (!IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(relative))) results.push(absolute);
    }
  }

  for (const start of starts) await walk(start);
  return results;
}

async function atomicWriteUtf8File(file: string, content: string): Promise<void> {
  const dir = path.dirname(file);
  const tempFile = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(tempFile, "w");
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempFile, file);
    await fsyncDirectoryBestEffort(dir);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await unlink(tempFile).catch(() => undefined);
    throw error;
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
