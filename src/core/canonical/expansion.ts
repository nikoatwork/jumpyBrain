import type { MemoryDocumentContentHash } from "../../types.js";
import { markdownStructure } from "./markdown-structure.js";
import { hashMemoryDocumentContent, parseFrontmatter, readCanonicalMemoryDocumentById } from "./markdown-store.js";

import { packetFits, serializeBudgetedPacket, validatePacketMaxBytes } from "../serialized-budget.js";
export { MIN_PACKET_MAX_BYTES as MIN_EXPANSION_MAX_BYTES, MAX_PACKET_MAX_BYTES as MAX_EXPANSION_MAX_BYTES,
  DEFAULT_PACKET_MAX_BYTES as DEFAULT_EXPANSION_MAX_BYTES } from "../serialized-budget.js";

export interface ExpansionOptions {
  id: string;
  expectedContentHash: string;
  /** Inclusive, 1-based source lines, including frontmatter; defaults to the entire document. */
  startLine?: number;
  endLine?: number;
  /** Body-line anchor selecting its innermost enclosing heading section (including subsections). */
  sectionLine?: number;
  /** Compact serialized JSON UTF-8 bytes, including one trailing LF. */
  maxBytes?: number;
}

export interface ExpansionResult {
  version: 1;
  kind: "expansion";
  id: string;
  /** Canonical root-relative path, never a local/server absolute path. */
  filePath: string;
  contentHash: MemoryDocumentContentHash;
  scope: "lines" | "section";
  requestedStartLine: number;
  requestedEndLine: number;
  startLine: number;
  endLine: number;
  totalLines: number;
  /** Exact whole source lines, preserving CRLF, whitespace, and final-newline presence. */
  text: string;
  /** True only when the requested range/section has been truncated by the budget. */
  partial: boolean;
  /** Requested lines not returned. Context outside the requested scope is not counted. */
  omittedLines: number;
  continuationLine?: number;
  maxBytes: number;
}

export type ExpansionErrorCode = "invalid_expansion" | "invalid_budget" | "budget_too_small" | "line_too_large"
  | "precondition_required" | "precondition_failed" | "invalid_utf8";

export class MemoryExpansionError extends Error {
  constructor(readonly code: ExpansionErrorCode, message: string) {
    super(message);
    this.name = "MemoryExpansionError";
  }
}

/** The wire representation whose aggregate budget is enforced. Do not pretty-print or wrap it. */
export function serializeExpansion(result: ExpansionResult): string {
  return serializeBudgetedPacket(result);
}

/** Read-only ID lookup at the canonical root; no index, stamping, state, or filesystem writes. */
export async function expandCanonicalMemoryDocument(root: string, options: ExpansionOptions): Promise<ExpansionResult> {
  const maxBytes = validateOptions(options);
  let document;
  try {
    document = await readCanonicalMemoryDocumentById(root, options.id, { guarded: true });
  } catch (error) {
    if ((error as { code?: string }).code === "precondition_failed") throw staleSource();
    throw error;
  }
  if (document.contentHash !== options.expectedContentHash) throw staleSource();
  // The existing read returns UTF-8 text and a raw-byte hash. Refuse lossy decoding,
  // rather than returning replacement characters as if they were exact evidence.
  if (hashMemoryDocumentContent(document.content) !== document.contentHash) {
    throw new MemoryExpansionError("invalid_utf8", "Document is not valid UTF-8; exact evidence expansion is unavailable.");
  }
  // Retain each real line's terminator; a final newline does not create a phantom line.
  const lines = document.content.split(/(?<=\n)/u);
  const totalLines = lines.length;
  let requestedStartLine = options.startLine ?? 1;
  let requestedEndLine = options.endLine ?? totalLines;
  if (options.sectionLine !== undefined) {
    const bodyStartLine = parseFrontmatter(document.content).bodyStartLine;
    if (options.sectionLine < bodyStartLine || options.sectionLine > totalLines) {
      throw new MemoryExpansionError("invalid_expansion", "sectionLine must address a body line in the current document.");
    }
    const headings = markdownStructure(lines.map(line => line.replace(/\r?\n$/u, "")), bodyStartLine - 1).headings;
    requestedStartLine = bodyStartLine;
    requestedEndLine = totalLines;
    let level = 0;
    for (const [offset, headingLevel] of headings) {
      const line = offset + 1;
      if (line <= options.sectionLine) {
        requestedStartLine = line;
        level = headingLevel;
      } else if (!level || headingLevel <= level) {
        requestedEndLine = line - 1;
        break;
      }
    }
  }
  if (requestedStartLine > requestedEndLine || requestedEndLine > totalLines) {
    throw new MemoryExpansionError("invalid_expansion", "Requested inclusive line range is outside the current document or reversed.");
  }

  const packet = (endLine: number, text = lines.slice(requestedStartLine - 1, endLine).join("")): ExpansionResult => ({
    version: 1,
    kind: "expansion",
    id: document.id,
    filePath: document.file,
    contentHash: document.contentHash,
    scope: options.sectionLine === undefined ? "lines" : "section",
    requestedStartLine,
    requestedEndLine,
    startLine: requestedStartLine,
    endLine,
    totalLines,
    text,
    partial: endLine < requestedEndLine,
    omittedLines: requestedEndLine - endLine,
    ...(endLine < requestedEndLine ? { continuationLine: endLine + 1 } : {}),
    maxBytes,
  });
  const fits = (result: ExpansionResult) => packetFits(result, maxBytes);
  // Completion drops the continuation marker; check it separately before searching
  // strictly partial prefixes, whose serialized sizes grow monotonically.
  const complete = packet(requestedEndLine);
  if (fits(complete)) return complete;
  if (!fits(packet(requestedStartLine, ""))) {
    throw new MemoryExpansionError("budget_too_small", "Byte budget cannot fit the expansion identity and minimum envelope.");
  }
  if (!fits(packet(requestedStartLine))) {
    throw new MemoryExpansionError("line_too_large", "The first requested whole source line cannot fit the byte budget. Increase maxBytes or request another range.");
  }
  let low = requestedStartLine;
  let high = requestedEndLine - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(packet(middle))) low = middle;
    else high = middle - 1;
  }
  return packet(low);
}

function staleSource(): MemoryExpansionError {
  return new MemoryExpansionError("precondition_failed", "Document content hash is stale or its identity changed. Refresh recall or re-read the document before expanding.");
}

function validateOptions(options: ExpansionOptions): number {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new MemoryExpansionError("invalid_expansion", "Expansion options are required.");
  }
  const maxBytes = validatePacketMaxBytes(options.maxBytes);
  if (options.expectedContentHash === undefined || options.expectedContentHash === "") {
    throw new MemoryExpansionError("precondition_required", "Expansion requires expectedContentHash from a prior recall or document read.");
  }
  if (typeof options.expectedContentHash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(options.expectedContentHash)) {
    throw new MemoryExpansionError("invalid_expansion", "expectedContentHash must be a sha256 content hash from a prior recall or document read.");
  }
  for (const field of ["startLine", "endLine", "sectionLine"] as const) {
    const value = options[field];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new MemoryExpansionError("invalid_expansion", `${field} must be a positive safe integer.`);
    }
  }
  if (options.sectionLine !== undefined && (options.startLine !== undefined || options.endLine !== undefined)) {
    throw new MemoryExpansionError("invalid_expansion", "sectionLine cannot be combined with startLine or endLine.");
  }
  return maxBytes;
}
