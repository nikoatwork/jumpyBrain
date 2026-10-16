import { evidenceInInterval, resolveTemporalQuery } from "../../core/retrieval-policy/temporal.js";
import { metadataDate } from "../../core/canonical/metadata-date.js";
import type { EvidenceDate, TemporalQuery, TemporalRetrieval } from "../../types.js";

/** Bind the response to the requested resolved scope: an old server must not silently ignore it. */
export function validTemporalResponse(value: unknown, query: TemporalQuery | undefined): value is TemporalRetrieval | undefined {
  if (query === undefined) return value === undefined;
  const expected = resolveTemporalQuery(query)!;
  if (!record(value) || !fields(value, ["interval", "coverage"]) || !record(value.interval) || !record(value.coverage)) return false;
  const interval = value.interval;
  const keys = ["basis", "timezone", "from", "toExclusive", "referenceDate", "order"] as const;
  if (!fields(interval, [...keys]) || !keys.every(key => interval[key] === expected[key])) return false;
  const counts = ["eligibleDocuments", "excludedUndated", "excludedInvalid", "backfillBudget", "backfilledDocuments", "unvisitedDocuments"];
  const coverage = value.coverage;
  return fields(coverage, counts) && counts.every(key => typeof coverage[key] === "number"
    && Number.isSafeInteger(coverage[key]) && (coverage[key] as number) >= 0);
}

export function validTemporalEvidence(value: unknown, query: TemporalQuery): value is EvidenceDate {
  if (!record(value)) return false;
  const valid = value.basis === "unknown" ? fields(value, ["basis", "reason"]) && typeof value.reason === "string" && ["missing", "invalid", "synthesis"].includes(value.reason)
    : typeof value.basis === "string" && ["declared", "filename"].includes(value.basis) && fields(value, ["basis", "value"])
      && typeof value.value === "string" && metadataDate(value.value) !== undefined;
  return valid && evidenceInInterval(value as unknown as EvidenceDate, resolveTemporalQuery(query)!);
}

function fields(value: Record<string, unknown>, keys: string[]): boolean { return Object.keys(value).every(key => keys.includes(key)); }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
