import { createHash } from "node:crypto";
import { isValidMemoryDocumentId } from "../document-id.js";
import { parseFrontmatter } from "../frontmatter.js";
import type { LogseqMigrationDocument } from "./types.js";

export const hashMigrationBytes = (bytes: Buffer): string => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
export const MIGRATION_HASH = /^sha256:[a-f0-9]{64}$/;

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

export function migrationTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && !Number.isNaN(Date.parse(value));
}

/** Parse only the envelope's bytes. Unlike the general Markdown parser, never normalize its body. */
export function parseMigrationEnvelope(bytes: Buffer): { metadata: Record<string, string>; body: Buffer } {
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

export function renderMigrationEnvelope(body: Buffer, document: Omit<LogseqMigrationDocument, "outputHash" | "outputBytes">, source: "logseq-migration" | "obsidian-migration"): Buffer {
  const fields: Record<string, string> = {
    id: document.id, type: document.type, title: document.title,
    source, source_path: document.sourcePath,
    created_at: document.createdAt, updated_at: document.updatedAt,
    ...(document.date ? { date: document.date } : {}),
  };
  const header = `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n`;
  const output = Buffer.concat([Buffer.from(header), body]);
  const parsed = parseMigrationEnvelope(output);
  if (hashMigrationBytes(parsed.body) !== document.bodyHash || parsed.body.length !== document.bodyBytes || Object.entries(fields).some(([key, value]) => parsed.metadata[key] !== value)) {
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
  return { ...(isValidMemoryDocumentId(parsed.id) ? { id: parsed.id } : {}), ...(migrationTimestamp(parsed.created_at) ? { createdAt: parsed.created_at } : {}) };
}


// Preserve the original Logseq public helper while sharing the byte-envelope contract.
export { parseMigrationEnvelope as parseLogseqEnvelope };
