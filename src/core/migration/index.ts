import { createHash } from "node:crypto";
import { generateMemoryDocumentId, isValidMemoryDocumentId } from "../document-id.js";
import { parseFrontmatter } from "../frontmatter.js";
import type { LogseqMigrationDocument, LogseqMigrationEntry, LogseqMigrationManifest } from "./types.js";
export type * from "./types.js";

// This is durable deletion-ownership metadata, NOT a rebuildable index/cache.
export const LOGSEQ_MIGRATION_MANIFEST = ".logseq-migration-manifest.json";
export const LOGSEQ_IMPORTER_VERSION = 1;
export const hashMigrationBytes = (bytes: Buffer): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const HASH = /^sha256:[a-f0-9]{64}$/;

export function migrationPathKey(value: string): string {
  // Compatibility normalization plus upper/lower folding deliberately errs toward rejecting aliases.
  return value.normalize("NFKC").toUpperCase().toLowerCase().normalize("NFC");
}

export function validMigrationPath(value: unknown, buckets: readonly string[]): value is string {
  if (typeof value !== "string" || value.length > 4096 || !/\.md$/i.test(value)) return false;
  const parts = value.split("/");
  return parts.length > 1 && buckets.includes(parts[0]!) && parts.every(part =>
    !!part && part !== "." && part !== ".." && !part.startsWith(".") &&
    !/[\\\x00-\x1f\x7f]/.test(part) && !/[. ]$/.test(part));
}

export function mapLogseqPath(sourcePath: string): { outputPath: string; type: "note" | "session"; title: string; date?: string } {
  if (!validMigrationPath(sourcePath, ["pages", "journals"])) throw new Error("Unsafe Logseq source-relative path.");
  const journal = sourcePath.startsWith("journals/");
  const relative = sourcePath.slice(sourcePath.indexOf("/") + 1);
  const literal = relative.replace(/\.md$/i, "");
  let title = literal;
  try { title = decodeURIComponent(literal); } catch { /* Invalid escapes remain literal. */ }
  // Decode once, never use the decoded title as a path.
  title = title.replace(/___/g, "/").replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 1024);
  const match = relative.split("/").at(-1)!.match(/^(\d{4})_(\d{2})_(\d{2})\.md$/i);
  const date = match ? `${match[1]}-${match[2]}-${match[3]}` : undefined;
  const validDate = date && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  return { outputPath: `${journal ? "sessions" : "notes"}/${relative}`, type: journal ? "session" : "note", title: journal && validDate ? date : title, ...(journal && validDate ? { date } : {}) };
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

/** Parse only the envelope's bytes. Unlike the general Markdown parser, never normalize its body. */
export function parseLogseqEnvelope(bytes: Buffer): { metadata: Record<string, string>; body: Buffer } {
  if (!bytes.subarray(0, 4).equals(Buffer.from("---\n"))) throw new Error("Invalid migration envelope.");
  const end = bytes.indexOf(Buffer.from("\n---\n"), 3);
  if (end < 0 || end > 65536) throw new Error("Invalid migration envelope.");
  const metadata: Record<string, string> = Object.create(null);
  for (const line of bytes.subarray(4, end).toString("utf8").split("\n")) {
    const match = /^([a-z_]+): (.*)$/.exec(line);
    if (!match || Object.hasOwn(metadata, match[1]!)) throw new Error("Invalid migration envelope metadata.");
    let value: unknown;
    try { value = JSON.parse(match[2]!); } catch { throw new Error("Invalid migration envelope metadata."); }
    if (typeof value !== "string") throw new Error("Invalid migration envelope metadata.");
    metadata[match[1]!] = value;
  }
  return { metadata, body: bytes.subarray(end + 5) };
}

export function renderLogseqEnvelope(body: Buffer, document: Omit<LogseqMigrationDocument, "outputHash" | "outputBytes">): Buffer {
  const fields: Record<string, string> = {
    id: document.id, type: document.type, title: document.title,
    source: "logseq-migration", source_path: document.sourcePath,
    created_at: document.createdAt, updated_at: document.updatedAt,
    ...(document.date ? { date: document.date } : {}),
  };
  const header = `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n`;
  const output = Buffer.concat([Buffer.from(header), body]);
  const parsed = parseLogseqEnvelope(output);
  if (hashMigrationBytes(parsed.body) !== document.sourceHash || Object.entries(fields).some(([key, value]) => parsed.metadata[key] !== value)) {
    throw new Error("Migration envelope verification failed.");
  }
  // Also ensure normal canonical parsing agrees on every field; source frontmatter stays in the body.
  const canonical = parseFrontmatter(header).frontmatter;
  if (Object.entries(fields).some(([key, value]) => canonical[key] !== value)) throw new Error("Canonical envelope verification failed.");
  return output;
}

export function migrationDocumentIdentity(bytes: Buffer): { id?: string; createdAt?: string } {
  // Read a bounded header, not Logseq body id:: properties.
  const parsed = parseFrontmatter(bytes.subarray(0, 65536).toString("utf8")).frontmatter;
  return { ...(isValidMemoryDocumentId(parsed.id) ? { id: parsed.id } : {}), ...(timestamp(parsed.created_at) ? { createdAt: parsed.created_at } : {}) };
}

export function planLogseqDocument(input: { sourcePath: string; body: Buffer; current?: Buffer; prior?: LogseqMigrationDocument; now: string }): { entry: LogseqMigrationEntry; output: Buffer } {
  const { sourcePath, body, current, prior, now } = input;
  const mapped = mapLogseqPath(sourcePath);
  const sourceHash = hashMigrationBytes(body);
  const currentHash = current === undefined ? undefined : hashMigrationBytes(current);
  const observed = {
    ...(currentHash ? { destinationHash: currentHash } : {}),
    ...(prior ? { previousSourceHash: prior.sourceHash, previousOutputHash: prior.outputHash } : {}),
  };
  if (prior && sourceHash === prior.sourceHash && currentHash === prior.outputHash && prior.sourceBytes === body.length && prior.outputBytes === current!.length && current!.equals(renderLogseqEnvelope(body, prior))) {
    return { entry: { ...prior, ...observed, action: "unchanged", conflict: false }, output: current! };
  }
  const identity = current === undefined ? {} : migrationDocumentIdentity(current);
  const document = {
    sourcePath, ...mapped, id: identity.id ?? prior?.id ?? generateMemoryDocumentId(),
    createdAt: identity.createdAt ?? prior?.createdAt ?? now,
    updatedAt: prior && now <= prior.updatedAt ? new Date(Date.parse(prior.updatedAt) + 1).toISOString() : now,
    sourceHash, sourceBytes: body.length,
  };
  const output = renderLogseqEnvelope(body, document);
  return { entry: { ...document, ...observed, outputHash: hashMigrationBytes(output), outputBytes: output.length,
    action: current === undefined ? "create" : "overwrite",
    conflict: current !== undefined && (!prior || prior.outputHash !== currentHash),
  }, output };
}

/** Strictly validate ownership before it can authorize deletion. Never echo untrusted JSON. */
export function parseLogseqManifest(bytes: Buffer): LogseqMigrationManifest {
  const invalid = () => new Error("Invalid or unsupported Logseq migration ownership manifest; restore a trusted manifest before retrying.");
  let value: LogseqMigrationManifest;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw invalid(); }
  if (!value || value.version !== 1 || value.importer !== "jumpybrain-logseq" || value.importerVersion !== 1 || !timestamp(value.migratedAt) || !Array.isArray(value.entries) || !value.counts) throw invalid();
  for (const key of ["created", "overwritten", "deleted", "unchanged", "warnings"] as const) if (!Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0) throw invalid();
  const sourceKeys = new Set<string>(), outputKeys = new Set<string>(), ids = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || !validMigrationPath(entry.sourcePath, ["pages", "journals"]) || !validMigrationPath(entry.outputPath, ["notes", "sessions"])) throw invalid();
    const expected = mapLogseqPath(entry.sourcePath);
    if (entry.outputPath !== expected.outputPath || entry.type !== expected.type || entry.title !== expected.title || entry.date !== expected.date || !isValidMemoryDocumentId(entry.id) || !timestamp(entry.createdAt) || !timestamp(entry.updatedAt) || !HASH.test(entry.sourceHash) || !HASH.test(entry.outputHash) || !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 0 || !Number.isSafeInteger(entry.outputBytes) || entry.outputBytes < 0) throw invalid();
    const sourceKey = migrationPathKey(entry.sourcePath), outputKey = migrationPathKey(entry.outputPath);
    if (sourceKeys.has(sourceKey) || outputKeys.has(outputKey) || ids.has(entry.id)) throw invalid();
    sourceKeys.add(sourceKey); outputKeys.add(outputKey); ids.add(entry.id);
  }
  // Drop unknown fields, so even a hand-edited manifest cannot leak bodies into results.
  return { version: 1, importer: "jumpybrain-logseq", importerVersion: 1, migratedAt: value.migratedAt,
    counts: { created: value.counts.created, overwritten: value.counts.overwritten, deleted: value.counts.deleted, unchanged: value.counts.unchanged, warnings: value.counts.warnings },
    entries: value.entries.map(entry => ({ sourcePath: entry.sourcePath, outputPath: entry.outputPath, type: entry.type, title: entry.title, ...(entry.date ? { date: entry.date } : {}), id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, sourceHash: entry.sourceHash, outputHash: entry.outputHash, sourceBytes: entry.sourceBytes, outputBytes: entry.outputBytes })) };
}

/** Counts only: never expose referenced targets or snippets in diagnostics. */
export function analyzeLogseqReferences(documents: readonly { sourcePath: string; body: Buffer }[]): { wikiLinks: number; unresolvedWikiLinks: number; omittedAssetReferences: number; likelyDatabaseMirror: boolean } {
  const known = new Set<string>();
  for (const document of documents) {
    const mapped = mapLogseqPath(document.sourcePath);
    known.add(migrationPathKey(mapped.title));
    known.add(migrationPathKey(mapped.title.split("/").at(-1)!));
    known.add(migrationPathKey(document.sourcePath.replace(/^(pages|journals)\//, "").replace(/\.md$/i, "")));
  }
  let wikiLinks = 0, unresolvedWikiLinks = 0, omittedAssetReferences = 0, likelyDatabaseMirror = false;
  for (const document of documents) {
    const text = document.body.toString("utf8");
    if (/^\s*(?:-\s*)?(?:logseq\.property[/.]|:logseq\.db[/.])/m.test(text)) likelyDatabaseMirror = true;
    for (const match of text.matchAll(/\[\[([^\]\r\n]+)\]\]/g)) {
      wikiLinks++;
      const target = match[1]!.split("|")[0]!.split("#")[0]!.replace(/\.md$/i, "").trim();
      if (!known.has(migrationPathKey(target))) unresolvedWikiLinks++;
    }
    for (const match of text.matchAll(/!?\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)) {
      const target = match[1]!.trim().replace(/^</, "").split(/[>\s]/)[0]!;
      if (!/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target) && !/\.md(?:[?#]|$)/i.test(target)) omittedAssetReferences++;
    }
  }
  return { wikiLinks, unresolvedWikiLinks, omittedAssetReferences, likelyDatabaseMirror };
}
