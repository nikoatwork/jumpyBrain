import { generateMemoryDocumentId, isValidMemoryDocumentId } from "../document-id.js";
import { hashMigrationBytes, migrationDocumentIdentity, migrationPathKey, migrationTimestamp, MIGRATION_HASH, renderMigrationEnvelope, validMigrationPath } from "./shared.js";
import type { LogseqMigrationDocument, LogseqMigrationEntry, LogseqMigrationResult } from "./types.js";

export const OBSIDIAN_MIGRATION_MANIFEST = ".obsidian-migration-manifest.json";
export type ObsidianMigrationOptions = { apply?: boolean; failOnConflict?: boolean };
/** Same byte/hash/identity vocabulary as Logseq preserve mode; type is always note. */
export type ObsidianMigrationDocument = LogseqMigrationDocument;
export type ObsidianMigrationEntry = LogseqMigrationEntry;
export interface ObsidianMigrationManifest {
  version: 1;
  importer: "jumpybrain-obsidian";
  importerVersion: 1;
  /** Digest of the resolved local vault path. Never include the absolute source path. */
  sourceIdentity: string;
  migratedAt: string;
  entries: ObsidianMigrationDocument[];
  counts: { created: number; overwritten: number; deleted: number; unchanged: number; warnings: number };
}
export interface ObsidianReferences {
  wikiLinks: number; markdownLinks: number; aliases: number; headingReferences: number; blockReferences: number;
  noteEmbeds: number; assetEmbeds: number; omittedAssetReferences: number;
  unresolvedNoteTargets: number; ambiguousNoteTargets: number; vaultRootMarkdownLinks: number;
}
export interface ObsidianOmissions { hidden: number; nonMarkdown: number; symlinks: number }
export interface ObsidianMigrationResult extends Omit<LogseqMigrationResult, "pages" | "journals" | "conversion"> {
  notes: number;
  references: ObsidianReferences;
  omissions: ObsidianOmissions;
}

export function mapObsidianPath(sourcePath: string): { outputPath: string; type: "note"; title: string } {
  // Prefix only for validation: root-level Markdown is a valid vault document.
  if (!validMigrationPath(`notes/${sourcePath}`, ["notes"])) throw new Error("Unsafe Obsidian source-relative path.");
  return { outputPath: `notes/${sourcePath}`, type: "note", title: sourcePath.replace(/\.md$/i, "") };
}

export function planObsidianDocument(input: { sourcePath: string; body: Buffer; current?: Buffer; prior?: ObsidianMigrationDocument; now: string }): { entry: ObsidianMigrationEntry; output: Buffer } {
  const { sourcePath, body, current, prior, now } = input;
  const mapped = mapObsidianPath(sourcePath);
  const sourceHash = hashMigrationBytes(body), currentHash = current && hashMigrationBytes(current);
  const observed = { ...(currentHash ? { destinationHash: currentHash } : {}), ...(prior ? { previousSourceHash: prior.sourceHash, previousOutputHash: prior.outputHash } : {}) };
  if (prior && prior.sourceHash === sourceHash && currentHash === prior.outputHash && current!.equals(renderMigrationEnvelope(body, prior, "obsidian-migration"))) {
    return { entry: { ...prior, ...observed, action: "unchanged", conflict: false }, output: current! };
  }
  const identity = current ? migrationDocumentIdentity(current) : {};
  const document: Omit<ObsidianMigrationDocument, "outputHash" | "outputBytes"> = {
    sourcePath, ...mapped, id: identity.id ?? prior?.id ?? generateMemoryDocumentId(),
    createdAt: identity.createdAt ?? prior?.createdAt ?? now,
    updatedAt: prior && now <= prior.updatedAt ? new Date(Date.parse(prior.updatedAt) + 1).toISOString() : now,
    sourceHash, sourceBytes: body.length, bodyFormat: "preserve", bodyVersion: 0, bodyHash: sourceHash, bodyBytes: body.length,
  };
  const output = renderMigrationEnvelope(body, document, "obsidian-migration");
  return { entry: { ...document, ...observed, outputHash: hashMigrationBytes(output), outputBytes: output.length, action: current ? "overwrite" : "create", conflict: !!current && (!prior || prior.outputHash !== currentHash) }, output };
}

/** Ownership is strict, versioned, body-free and distinct from rebuildable search state. */
export function parseObsidianManifest(bytes: Buffer): ObsidianMigrationManifest {
  const invalid = () => new Error("Invalid or unsupported Obsidian migration ownership manifest; restore a trusted manifest before retrying.");
  let value: ObsidianMigrationManifest;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw invalid(); }
  if (!value || value.version !== 1 || value.importer !== "jumpybrain-obsidian" || value.importerVersion !== 1 || !MIGRATION_HASH.test(value.sourceIdentity) || !migrationTimestamp(value.migratedAt) || !Array.isArray(value.entries) || !value.counts) throw invalid();
  for (const key of ["created", "overwritten", "deleted", "unchanged", "warnings"] as const) if (!Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0) throw invalid();
  const sources = new Set<string>(), outputs = new Set<string>(), ids = new Set<string>();
  const entries: ObsidianMigrationDocument[] = [];
  for (const entry of value.entries) {
    if (!entry || typeof entry.sourcePath !== "string" || !validMigrationPath(`notes/${entry.sourcePath}`, ["notes"])) throw invalid();
    const mapped = mapObsidianPath(entry.sourcePath);
    if (entry.outputPath !== mapped.outputPath || entry.title !== mapped.title || entry.type !== "note" || entry.date !== undefined || !isValidMemoryDocumentId(entry.id) || !migrationTimestamp(entry.createdAt) || !migrationTimestamp(entry.updatedAt) || !MIGRATION_HASH.test(entry.sourceHash) || !MIGRATION_HASH.test(entry.outputHash) || !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 0 || !Number.isSafeInteger(entry.outputBytes) || entry.outputBytes < entry.sourceBytes || entry.bodyFormat !== "preserve" || entry.bodyVersion !== 0 || entry.bodyHash !== entry.sourceHash || entry.bodyBytes !== entry.sourceBytes) throw invalid();
    const sourceKey = migrationPathKey(entry.sourcePath), outputKey = migrationPathKey(entry.outputPath);
    if (sources.has(sourceKey) || outputs.has(outputKey) || ids.has(entry.id)) throw invalid();
    sources.add(sourceKey); outputs.add(outputKey); ids.add(entry.id);
    entries.push({ sourcePath: entry.sourcePath, ...mapped, id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, sourceHash: entry.sourceHash, outputHash: entry.outputHash, sourceBytes: entry.sourceBytes, outputBytes: entry.outputBytes, bodyFormat: "preserve", bodyVersion: 0, bodyHash: entry.sourceHash, bodyBytes: entry.sourceBytes });
  }
  return { version: 1, importer: "jumpybrain-obsidian", importerVersion: 1, sourceIdentity: value.sourceIdentity, migratedAt: value.migratedAt, entries, counts: { created: value.counts.created, overwritten: value.counts.overwritten, deleted: value.counts.deleted, unchanged: value.counts.unchanged, warnings: value.counts.warnings } };
}

/** Advisory syntax counts only, not Obsidian's resolver or a Markdown interpreter. */
export function analyzeObsidianReferences(documents: readonly { sourcePath: string; body: Buffer }[]): ObsidianReferences {
  const targets = new Map<string, Set<string>>();
  const add = (key: string, source: string) => { key = migrationPathKey(key); const paths = targets.get(key) ?? new Set(); paths.add(source); targets.set(key, paths); };
  for (const doc of documents) {
    const title = mapObsidianPath(doc.sourcePath).title;
    add(title, doc.sourcePath); add(title.split("/").at(-1)!, doc.sourcePath);
  }
  const counts: ObsidianReferences = { wikiLinks: 0, markdownLinks: 0, aliases: 0, headingReferences: 0, blockReferences: 0, noteEmbeds: 0, assetEmbeds: 0, omittedAssetReferences: 0, unresolvedNoteTargets: 0, ambiguousNoteTargets: 0, vaultRootMarkdownLinks: 0 };
  function inspect(raw: string, embedded: boolean, wiki: boolean, source: string) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) return;
    if (raw.includes("#^")) counts.blockReferences++;
    else if (raw.includes("#")) counts.headingReferences++;
    let target = raw.split("#")[0]!.split("?")[0]!;
    if (!wiki) { try { target = decodeURIComponent(target); } catch { /* Literal malformed escapes. */ } }
    if (!wiki && target.startsWith("/")) counts.vaultRootMarkdownLinks++;
    const asset = !!target && /\.[^/.]+$/.test(target) && !/\.md$/i.test(target);
    if (asset) { counts.omittedAssetReferences++; if (embedded) counts.assetEmbeds++; return; }
    if (embedded) counts.noteEmbeds++;
    if (!target) return;
    target = target.replace(/\.md$/i, "");
    // Resolve literal vault paths and relative Markdown paths for diagnostics only.
    const parts = (target.startsWith("/") ? target.slice(1) : (!wiki && !targets.has(migrationPathKey(target)) ? `${source.includes("/") ? source.slice(0, source.lastIndexOf("/")) + "/" : ""}${target}` : target)).split("/");
    const normalized: string[] = [];
    for (const part of parts) { if (part === "..") { if (!normalized.length) { counts.unresolvedNoteTargets++; return; } normalized.pop(); } else if (part && part !== ".") normalized.push(part); }
    const matches = targets.get(migrationPathKey(normalized.join("/")));
    if (!matches) counts.unresolvedNoteTargets++;
    else if (matches.size > 1) counts.ambiguousNoteTargets++;
  }
  for (const doc of documents) {
    const text = doc.body.toString("utf8");
    for (const match of text.matchAll(/(!?)\[\[([^\]\r\n]+)\]\]/g)) {
      counts.wikiLinks++; if (match[2]!.includes("|")) counts.aliases++;
      inspect(match[2]!.split("|")[0]!.trim(), !!match[1], true, doc.sourcePath);
    }
    for (const match of text.matchAll(/(!?)\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)) {
      counts.markdownLinks++; inspect(match[2]!.trim().replace(/^</, "").split(/[>\s]/)[0]!, !!match[1], false, doc.sourcePath);
    }
  }
  return counts;
}
