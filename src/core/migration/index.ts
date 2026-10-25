import { generateMemoryDocumentId, isValidMemoryDocumentId } from "../document-id.js";
import { convertLogseqBody, LOGSEQ_BODY_VERSION, type LogseqBodyConversion } from "./body.js";
import type { LogseqBodyFormat, LogseqMigrationDocument, LogseqMigrationEntry, LogseqMigrationManifest } from "./types.js";
export type * from "./types.js";
export { convertLogseqBody, LOGSEQ_BODY_VERSION } from "./body.js";

import { hashMigrationBytes, migrationPathKey, validMigrationPath, migrationTimestamp, MIGRATION_HASH, renderMigrationEnvelope, migrationDocumentIdentity } from "./shared.js";
export { hashMigrationBytes, migrationPathKey, validMigrationPath, parseMigrationEnvelope, parseLogseqEnvelope, migrationDocumentIdentity } from "./shared.js";
export * from "./obsidian.js";

export function renderLogseqEnvelope(body: Buffer, document: Omit<LogseqMigrationDocument, "outputHash" | "outputBytes">): Buffer {
  return renderMigrationEnvelope(body, document, "logseq-migration");
}

// This is durable deletion-ownership metadata, NOT a rebuildable index/cache.
export const LOGSEQ_MIGRATION_MANIFEST = ".logseq-migration-manifest.json";
export const LOGSEQ_IMPORTER_VERSION = 2;
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

export function planLogseqDocument(input: { sourcePath: string; body: Buffer; current?: Buffer; prior?: LogseqMigrationDocument; now: string; bodyFormat?: LogseqBodyFormat }): { entry: LogseqMigrationEntry; output: Buffer; conversion: LogseqBodyConversion } {
  const { sourcePath, body, current, prior, now } = input;
  const mapped = mapLogseqPath(sourcePath);
  const sourceHash = hashMigrationBytes(body);
  const bodyFormat = input.bodyFormat ?? "readable";
  if (bodyFormat !== "readable" && bodyFormat !== "preserve") throw new Error("Invalid Logseq body format; use readable or preserve.");
  const bodyVersion = bodyFormat === "preserve" ? 0 : LOGSEQ_BODY_VERSION;
  const conversion = convertLogseqBody(body, bodyFormat);
  const bodyHash = hashMigrationBytes(conversion.body);
  const currentHash = current === undefined ? undefined : hashMigrationBytes(current);
  const observed = {
    ...(currentHash ? { destinationHash: currentHash } : {}),
    ...(prior ? { previousSourceHash: prior.sourceHash, previousOutputHash: prior.outputHash } : {}),
  };
  if (prior && sourceHash === prior.sourceHash && currentHash === prior.outputHash && prior.bodyFormat === bodyFormat && prior.bodyVersion === bodyVersion && prior.bodyHash === bodyHash && prior.bodyBytes === conversion.body.length && prior.sourceBytes === body.length && prior.outputBytes === current!.length && current!.equals(renderLogseqEnvelope(conversion.body, prior))) {
    return { entry: { ...prior, ...observed, action: "unchanged", conflict: false }, output: current!, conversion };
  }
  const identity = current === undefined ? {} : migrationDocumentIdentity(current);
  const document = {
    sourcePath, ...mapped, id: identity.id ?? prior?.id ?? generateMemoryDocumentId(),
    createdAt: identity.createdAt ?? prior?.createdAt ?? now,
    updatedAt: prior && now <= prior.updatedAt ? new Date(Date.parse(prior.updatedAt) + 1).toISOString() : now,
    sourceHash, sourceBytes: body.length, bodyFormat, bodyVersion, bodyHash, bodyBytes: conversion.body.length,
  };
  const output = renderLogseqEnvelope(conversion.body, document);
  return { entry: { ...document, ...observed, outputHash: hashMigrationBytes(output), outputBytes: output.length,
    action: current === undefined ? "create" : "overwrite",
    conflict: current !== undefined && (!prior || prior.outputHash !== currentHash),
  }, output, conversion };
}

/** Strictly validate ownership before it can authorize deletion. Never echo untrusted JSON. */
export function parseLogseqManifest(bytes: Buffer): LogseqMigrationManifest {
  const invalid = () => new Error("Invalid or unsupported Logseq migration ownership manifest; restore a trusted manifest before retrying.");
  let value: LogseqMigrationManifest;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw invalid(); }
  if (!value || ![1, 2].includes(value.version) || value.importer !== "jumpybrain-logseq" || value.importerVersion !== value.version || !migrationTimestamp(value.migratedAt) || !Array.isArray(value.entries) || !value.counts) throw invalid();
  for (const key of ["created", "overwritten", "deleted", "unchanged", "warnings"] as const) if (!Number.isSafeInteger(value.counts[key]) || value.counts[key] < 0) throw invalid();
  const sourceKeys = new Set<string>(), outputKeys = new Set<string>(), ids = new Set<string>();
  for (const entry of value.entries) {
    if (!entry || !validMigrationPath(entry.sourcePath, ["pages", "journals"]) || !validMigrationPath(entry.outputPath, ["notes", "sessions"])) throw invalid();
    const expected = mapLogseqPath(entry.sourcePath);
    if (entry.outputPath !== expected.outputPath || entry.type !== expected.type || entry.title !== expected.title || entry.date !== expected.date || !isValidMemoryDocumentId(entry.id) || !migrationTimestamp(entry.createdAt) || !migrationTimestamp(entry.updatedAt) || !MIGRATION_HASH.test(entry.sourceHash) || !MIGRATION_HASH.test(entry.outputHash) || !Number.isSafeInteger(entry.sourceBytes) || entry.sourceBytes < 0 || !Number.isSafeInteger(entry.outputBytes) || entry.outputBytes < 0) throw invalid();
    if (value.version === 2 && ((entry.bodyFormat !== "readable" && entry.bodyFormat !== "preserve") || entry.bodyVersion !== (entry.bodyFormat === "preserve" ? 0 : LOGSEQ_BODY_VERSION) || !MIGRATION_HASH.test(entry.bodyHash) || !Number.isSafeInteger(entry.bodyBytes) || entry.bodyBytes < 0 || entry.bodyBytes > entry.outputBytes || (entry.bodyFormat === "preserve" && (entry.bodyHash !== entry.sourceHash || entry.bodyBytes !== entry.sourceBytes)))) throw invalid();
    const sourceKey = migrationPathKey(entry.sourcePath), outputKey = migrationPathKey(entry.outputPath);
    if (sourceKeys.has(sourceKey) || outputKeys.has(outputKey) || ids.has(entry.id)) throw invalid();
    sourceKeys.add(sourceKey); outputKeys.add(outputKey); ids.add(entry.id);
  }
  // Drop unknown fields, so even a hand-edited manifest cannot leak bodies into results.
  return { version: value.version, importer: "jumpybrain-logseq", importerVersion: value.importerVersion, migratedAt: value.migratedAt,
    counts: { created: value.counts.created, overwritten: value.counts.overwritten, deleted: value.counts.deleted, unchanged: value.counts.unchanged, warnings: value.counts.warnings },
    entries: value.entries.map(entry => ({ sourcePath: entry.sourcePath, outputPath: entry.outputPath, type: entry.type, title: entry.title, ...(entry.date ? { date: entry.date } : {}), id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, sourceHash: entry.sourceHash, outputHash: entry.outputHash, sourceBytes: entry.sourceBytes, outputBytes: entry.outputBytes,
      ...(value.version === 1 ? { bodyFormat: "preserve" as const, bodyVersion: 0, bodyHash: entry.sourceHash, bodyBytes: entry.sourceBytes } : { bodyFormat: entry.bodyFormat, bodyVersion: entry.bodyVersion, bodyHash: entry.bodyHash, bodyBytes: entry.bodyBytes }),
    })) };
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
