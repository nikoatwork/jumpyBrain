import { stripVTControlCharacters } from "node:util";
import type { Provenance, SearchResult } from "../types.js";
import { compactEvidenceLinks } from "./evidence-links.js";

/** Metadata is untrusted display text, never a new output line or terminal command. */
function metadataText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = stripVTControlCharacters(value)
    .replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2060-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Accept explicit ISO dates only; Date.parse alone silently rolls invalid days forward. */
function metadataDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(value);
  if (!match || match[0] !== value || value.startsWith("0000-")) return undefined;
  const day = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day) || new Date(day).toISOString().slice(0, 10) !== match[1]) return undefined;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

function sourceReference(provenance: Provenance): string {
  const where = `${provenance.file}:${provenance.lineStart}-${provenance.lineEnd}`;
  const session = provenance.sessionId ? ` session=${provenance.sessionId}` : "";
  return `${where}${session}`;
}

function resultMetadata(provenance: Provenance): string {
  const metadata = provenance.metadata ?? {};
  const fields = [
    `Title: ${metadataText(metadata.title, 160) ?? "(untitled)"}`,
    `Type: ${metadataText(metadata.type, 48) ?? "unknown"}`,
    `Written date: ${metadataDate(metadata.created_at) ?? metadataDate(metadata.createdAt) ?? "unknown"}`,
  ];
  // A document's explicit date is not necessarily an observation date for every passage.
  if (metadata.date !== undefined) fields.push(`Evidence date: ${metadataDate(metadata.date) ?? "unknown"}`);
  return fields.join(" | ");
}

export function formatHumanResults(results: SearchResult[]): string {
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
      `   ${resultMetadata(result.provenance)}`,
      `   ${displaySnippet(result.snippet)}`,
    ];
    // Accept additive passages while preserving the legacy representative snippet.
    const passages = result.passages ?? [];
    const seen = new Set([JSON.stringify([result.snippet, sourceReference(result.provenance)])]);
    for (const passage of passages) {
      const key = JSON.stringify([passage.snippet, sourceReference(passage.provenance)]);
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`   Source: ${sourceReference(passage.provenance)}`, `   ${displaySnippet(passage.snippet)}`);
    }
    if (Number.isSafeInteger(result.omittedPassages) && result.omittedPassages! > 0) {
      lines.push(`   ${result.omittedPassages} additional candidate passage(s) not shown; narrow the query or expand this source.`);
    }
    return lines.join("\n");
  }).join("\n\n");
  return output + (linksShortened ? "\n\nLinks abbreviated (…); use --json or the cited source for exact destinations." : "");
}
