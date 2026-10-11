import { validTemporalResponse, validTemporalEvidence } from "./temporal-response.js";
import type { TemporalQuery } from "../../types.js";
import { isValidMemoryDocumentId } from "../../core/document-id.js";
import { compactWrittenDate } from "../../core/retrieval-policy/compact.js";

/** Bound decoded wire bytes for both successes and errors before parsing JSON. */
export async function readBoundedResponse(response: Response, maxBytes: number, invalid: () => Error): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw invalid();
      }
      chunks.push(value);
    }
  } catch { throw invalid(); } finally { reader.releaseLock(); }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw invalid(); }
}

/** V1 is closed except for the explicitly reserved optional fields documented by this adapter. */
export function validBoundedPacket(packet: unknown, kind: "recall" | "expansion", maxBytes: number,
  request: Record<string, unknown>): boolean {
  if (!record(packet)) return false;
  const p = packet;
  if (p.version !== 1 || p.kind !== kind || p.maxBytes !== maxBytes) return false;
  if (kind === "recall") return fields(p, ["version", "kind", "query", "depth", "maxBytes", "scope", "partial",
    "readiness", "retrieval", "passages", "omitted", "diagnostics", "temporal"])
    && validTemporalResponse(p.temporal, request.temporal as TemporalQuery | undefined)
    && typeof p.query === "string" && p.query === request.query
    && oneOf(p.depth, ["shallow", "normal", "deep"]) && p.depth === (request.depth === undefined ? "normal" : request.depth)
    && p.scope === "selected_passages" && p.partial === true
    && Array.isArray(p.passages) && p.passages.every(passage => validPassage(passage, request.diagnostics === true, request.temporal as TemporalQuery | undefined))
    && validReadiness(p.readiness)
    && record(p.retrieval) && fields(p.retrieval, ["status", "warnings"])
    && oneOf(p.retrieval.status, ["complete", "partial"])
    && Array.isArray(p.retrieval.warnings) && p.retrieval.warnings.every(warning => typeof warning === "string")
    && record(p.omitted) && fields(p.omitted, ["results", "passages"])
    && nonnegativeInteger(p.omitted.results) && nonnegativeInteger(p.omitted.passages)
    && (!("diagnostics" in p) || (request.diagnostics === true && record(p.diagnostics)
      && fields(p.diagnostics, ["candidateResults", "candidatePassages", "budgetOmittedPassages"])
      && nonnegativeInteger(p.diagnostics.candidateResults) && nonnegativeInteger(p.diagnostics.candidatePassages)
      && nonnegativeInteger(p.diagnostics.budgetOmittedPassages)));
  if (!(fields(p, ["version", "kind", "id", "filePath", "contentHash", "scope", "requestedStartLine", "requestedEndLine",
    "startLine", "endLine", "totalLines", "text", "partial", "omittedLines", "continuationLine", "maxBytes"])
    && isValidMemoryDocumentId(p.id) && p.id === request.id && relativePath(p.filePath)
    && contentHash(p.contentHash) && p.contentHash === request.expectedContentHash
    && oneOf(p.scope, ["lines", "section"]) && typeof p.text === "string" && p.text.length > 0 && typeof p.partial === "boolean"
    && positiveInteger(p.requestedStartLine) && positiveInteger(p.requestedEndLine)
    && positiveInteger(p.startLine) && positiveInteger(p.endLine) && positiveInteger(p.totalLines)
    && nonnegativeInteger(p.omittedLines))) return false;
  if (["startLine", "endLine", "sectionLine"].some(key => request[key] !== undefined && !positiveInteger(request[key]))) return false;
  const matchesRequest = request.sectionLine === undefined
    ? p.scope === "lines" && p.requestedStartLine === (request.startLine ?? 1)
      && p.requestedEndLine === (request.endLine ?? p.totalLines)
    : p.scope === "section" && request.startLine === undefined && request.endLine === undefined
      && positiveInteger(request.sectionLine) && p.requestedStartLine <= request.sectionLine
      && request.sectionLine <= p.requestedEndLine;
  return matchesRequest && p.startLine === p.requestedStartLine && p.startLine <= p.endLine
    && p.endLine <= p.requestedEndLine && p.requestedEndLine <= p.totalLines
    // Match core's real-line counting: a final LF does not add a phantom line.
    && p.text.split(/(?<=\n)/u).length === p.endLine - p.startLine + 1
    && (p.endLine === p.totalLines || p.text.endsWith("\n"))
    && p.omittedLines === p.requestedEndLine - p.endLine
    && (p.partial ? p.omittedLines > 0 && p.continuationLine === p.endLine + 1
      : p.omittedLines === 0 && !("continuationLine" in p));
}

function validReadiness(p: unknown): boolean {
  return record(p) && fields(p, ["freshness", "embedding", "modes", "lastFailure"])
    && oneOf(p.freshness, ["fresh", "stale", "missing", "unknown"])
    && oneOf(p.embedding, ["disabled", "complete", "incomplete", "unknown"])
    && Array.isArray(p.modes) && p.modes.every(mode => oneOf(mode, ["lexical", "semantic"]))
    && (!("lastFailure" in p) || (record(p.lastFailure) && fields(p.lastFailure, ["code", "at"])
      && oneOf(p.lastFailure.code, ["index_failed", "interrupted_update"]) && validDate(p.lastFailure.at)));
}

function validPassage(p: unknown, diagnostics: boolean, temporal?: TemporalQuery): boolean {
  if (!record(p) || !fields(p, ["documentId", "filePath", "pathBasis", "startLine", "endLine", "text", "scope", "partial",
    "date", "expansion", "diagnostics", "evidenceDate", "relationships"]) || !relativePath(p.filePath) || typeof p.text !== "string"
    || !oneOf(p.pathBasis, ["canonical_root", "index_root"])
    || p.scope !== "excerpt" || p.partial !== true
    || !positiveInteger(p.startLine) || !positiveInteger(p.endLine) || p.endLine < p.startLine
    || !record(p.expansion) || !record(p.date)) return false;
  if (temporal ? !validTemporalEvidence(p.evidenceDate, temporal) : ("evidenceDate" in p || "relationships" in p)) return false;
  if ("relationships" in p && (!record(p.relationships) || !fields(p.relationships, ["conflicts_with", "supersedes"])
    || !Object.values(p.relationships).every(value => typeof value === "string" || (Array.isArray(value) && value.every(item => typeof item === "string"))))) return false;
  if (!(p.date.basis === "unknown" ? fields(p.date, ["basis"])
    : p.date.basis === "written" && fields(p.date, ["basis", "value", "field"])
      && validDate(p.date.value) && oneOf(p.date.field, ["created_at", "createdAt"]))) return false;
  if ("diagnostics" in p && (!diagnostics || !validPassageDiagnostics(p.diagnostics))) return false;
  if ("documentId" in p && (!isValidMemoryDocumentId(p.documentId) || p.pathBasis !== "canonical_root")) return false;
  const e = p.expansion;
  return e.available === false ? fields(e, ["available", "reason"])
    && oneOf(e.reason, ["missing_id", "invalid_id", "duplicate_id", "source_unavailable", "source_changed", "source_mismatch",
      "invalid_utf8", "outside_canonical_root"])
    && (!("documentId" in p) || e.reason === "source_changed")
    && (p.pathBasis === "index_root" ? e.reason === "outside_canonical_root" : e.reason !== "outside_canonical_root")
    : e.available === true && fields(e, ["available", "id", "expectedContentHash", "startLine", "endLine"])
      && p.pathBasis === "canonical_root" && isValidMemoryDocumentId(e.id) && e.id === p.documentId
      && contentHash(e.expectedContentHash) && e.startLine === p.startLine && e.endLine === p.endLine;
}

function validPassageDiagnostics(p: unknown): boolean {
  if (!record(p) || !fields(p, ["hitId", "score", "scoreBreakdown", "metadata"])
    || typeof p.hitId !== "string" || !finiteNumber(p.score)) return false;
  if ("scoreBreakdown" in p) {
    const score = p.scoreBreakdown;
    const required = ["qmdScore", "exactMatchBoost", "metadataBoost", "finalScore"];
    const optional = ["titleMatchBoost", "temporalRelevance", "memoryStrength", "provenanceConfidence", "depthPolicyBoost", "dreamBoost"];
    if (!record(score) || !fields(score, [...required, ...optional, "driver", "retrievalDepth"])
      || !required.every(key => finiteNumber(score[key])) || !optional.every(key => !(key in score) || finiteNumber(score[key]))
      || typeof score.driver !== "string"
      || ("retrievalDepth" in score && !oneOf(score.retrievalDepth, ["shallow", "normal", "deep"]))) return false;
  }
  // Explicitly requested canonical frontmatter is the only open-key record in V1.
  return !("metadata" in p) || (record(p.metadata) && Object.values(p.metadata).every(value =>
    typeof value === "string" || typeof value === "boolean" || finiteNumber(value)
    || (Array.isArray(value) && value.every(item => typeof item === "string"))));
}

function validDate(value: unknown): boolean {
  return typeof value === "string" && compactWrittenDate({ created_at: value }).basis === "written";
}

function fields(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return nonnegativeInteger(value) && value > 0;
}

function oneOf(value: unknown, values: string[]): boolean {
  return typeof value === "string" && values.includes(value);
}

function contentHash(value: unknown): boolean {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function relativePath(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/")
    && !value.includes("\\") && !value.includes("\0") && !/^[a-z]:/iu.test(value)
    && !value.split("/").some(part => part === ".." || part === "." || !part);
}

/** Error bodies have a separate, fixed cap, independent of the requested evidence budget. */
export async function readBoundedErrorCode(response: Response): Promise<string | undefined> {
  try {
    const payload: unknown = JSON.parse(await readBoundedResponse(response, 8192, () => new Error("Invalid error response.")));
    if (!record(payload) || !record(payload.error) || typeof payload.error.message !== "string") return undefined;
    const code = payload.error.code;
    return typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(code) ? code : undefined;
  } catch { return undefined; }
}

/** Never surface server-controlled messages, even when a small error body is well-formed. */
export function boundedErrorMessage(code: string, status: number): string {
  const messages: Record<string, string> = {
    invalid_temporal: "Invalid temporal query; use real ISO dates or timezone-explicit timestamps and pin relative bounds with referenceDate.",
    invalid_id: "Expected a canonical mem_<uuid> document ID.",
    missing_id: "Canonical memory document not found.",
    duplicate_id: "Canonical document ID is ambiguous; repair duplicate IDs before expanding.",
    invalid_expansion: "Invalid expansion hash or line/section range.",
    invalid_budget: "Invalid byte budget for bounded memory retrieval.",
    budget_too_small: "Byte budget cannot fit the minimum packet. Increase maxBytes.",
    line_too_large: "First requested whole source line exceeds the budget. Increase maxBytes or request another range.",
    precondition_required: "Expansion requires expectedContentHash from prior recall or document read.",
    precondition_failed: "Document hash is stale or identity changed. Refresh recall before expanding.",
    invalid_utf8: "Document is not valid UTF-8; exact expansion is unavailable.",
    bounded_read_failed: "Remote bounded memory read failed.",
    execution_timeout: "Memory operation deadline exceeded; retry or adjust the local deadline.",
    execution_aborted: "Memory operation canceled.",
    execution_overloaded: "Memory execution queue is full; retry shortly.",
  };
  return Object.hasOwn(messages, code) ? messages[code]! : `Remote bounded memory request failed with HTTP ${status}.`;
}
