import { stripVTControlCharacters } from "node:util";
import type { Provenance, SearchResult } from "../types.js";
import { compactEvidenceLinks } from "./evidence-links.js";
import { metadataDate } from "../core/canonical/metadata-date.js";

/** Metadata is untrusted display text, never a new output line or terminal command. */
function metadataText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = stripVTControlCharacters(value)
    .replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function sourceReference(provenance: Provenance): string {
  const where = `${provenance.file}:${provenance.lineStart}-${provenance.lineEnd}`;
  const session = provenance.sessionId ? ` session=${provenance.sessionId}` : "";
  return `${where}${session}`;
}

function resultMetadata(provenance: Provenance, temporal = false): string {
  const metadata = provenance.metadata ?? {};
  const fields = [
    `Title: ${metadataText(metadata.title, 160) ?? "(untitled)"}`,
    `Type: ${metadataText(metadata.type, 48) ?? "unknown"}`,
    `Written date: ${metadataDate(metadata.created_at) ?? metadataDate(metadata.createdAt) ?? "unknown"}`,
  ];
  // A document's explicit date is not necessarily an observation date for every passage.
  if (temporal) {
    const date = provenance.evidenceDate;
    const valid = date && (date.basis === "declared" || date.basis === "filename") && metadataDate(date.value);
    const reason = date?.basis === "unknown" && ["missing", "invalid", "synthesis"].includes(date.reason) ? date.reason : "missing";
    fields.push(`Evidence date: ${valid ? `${valid} (${date!.basis})` : `unknown (${reason})`}`);
    for (const key of ["conflicts_with", "supersedes"] as const) {
      const value = metadata[key];
      if (value !== undefined) fields.push(`Declared ${key}: ${metadataText(Array.isArray(value) ? JSON.stringify(value) : String(value), 320) ?? "(empty)"}`);
    }
  } else if (metadata.date !== undefined) fields.push(`Evidence date: ${metadataDate(metadata.date) ?? "unknown"}`);
  return fields.join(" | ");
}

export function formatHumanResults(results: SearchResult[], options: { temporal?: boolean } = {}): string {
  if (results.length === 0) return "No memory matches found.";

  let linksShortened = false;
  const displaySnippet = (snippet: string) => {
    const formatted = compactEvidenceLinks(snippet);
    linksShortened ||= formatted.shortened;
    return formatted.text;
  };
  const output = results.map((result, index) => {
    const lines = [
      `${index + 1}. ${sourceReference(result.provenance)} score=${result.score}`,
      `   ${resultMetadata(result.provenance, options.temporal)}`,
      `   ${displaySnippet(result.snippet)}`,
    ];
    // Accept additive passages while preserving the legacy representative snippet.
    const passages = result.passages ?? [];
    const seen = new Set([JSON.stringify([result.snippet, sourceReference(result.provenance)])]);
    for (const passage of passages) {
      const key = JSON.stringify([passage.snippet, sourceReference(passage.provenance)]);
      if (seen.has(key)) continue;
      seen.add(key);
      if (options.temporal) lines.push(`   ${resultMetadata(passage.provenance, true)}`);
      lines.push(`   Source: ${sourceReference(passage.provenance)}`, `   ${displaySnippet(passage.snippet)}`);
    }
    if (Number.isSafeInteger(result.omittedPassages) && result.omittedPassages! > 0) {
      lines.push(`   ${result.omittedPassages} additional candidate passage(s) not shown; narrow the query or expand this source.`);
    }
    return lines.join("\n");
  }).join("\n\n");
  return output + (linksShortened ? "\n\nLinks abbreviated (…); use --json or the cited source for exact destinations." : "");
}
