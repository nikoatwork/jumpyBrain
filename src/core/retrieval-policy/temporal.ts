import path from "node:path";
import { metadataDate } from "../canonical/metadata-date.js";
import type { EvidenceDate, Frontmatter, TemporalQuery, TemporalResolution } from "../../types.js";

const DAY = 86_400_000;
export class TemporalQueryError extends Error {
  readonly code = "invalid_temporal";
  constructor(message: string) { super(message); this.name = "TemporalQueryError"; }
}

/** Strict evidence policy deliberately differs from dream-window import-review fallbacks. */
export function evidenceDate(file: string, metadata: Frontmatter): EvidenceDate {
  if (Object.hasOwn(metadata, "date")) {
    const value = metadataDate(metadata.date);
    return value ? { basis: "declared", value } : { basis: "unknown", reason: "invalid" };
  }
  // Multi-period syntheses never acquire a date from their filename or creation time.
  if (metadata.dream === true || metadata.source === "jumpybrain-process") return { basis: "unknown", reason: "synthesis" };
  if (file.startsWith("sessions/") || metadata.type === "session") {
    const match = /^(\d{4})[-_](\d{2})[-_](\d{2})(?:$|[-_ ].*)/.exec(path.posix.basename(file, ".md"));
    if (match) {
      const value = metadataDate(`${match[1]}-${match[2]}-${match[3]}`);
      return value ? { basis: "filename", value } : { basis: "unknown", reason: "invalid" };
    }
  }
  return { basis: "unknown", reason: "missing" };
}

export function resolveTemporalQuery(query?: TemporalQuery): TemporalResolution | undefined {
  if (query === undefined) return undefined;
  if (!query || typeof query !== "object" || Array.isArray(query)
    || Object.keys(query).some(key => !["from", "to", "referenceDate", "order"].includes(key))) invalid();
  const order = query.order === undefined ? "relevance" : query.order;
  if (order !== "relevance" && order !== "chronological") invalid();
  const referenceDate = query.referenceDate;
  if (referenceDate !== undefined && (typeof referenceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate) || !metadataDate(referenceDate))) invalid();
  const bound = (input: unknown, upper: boolean): string | undefined => {
    if (input === undefined) return undefined;
    if (typeof input !== "string") invalid();
    const relative = /^t-(0|[1-9]\d*)d$/.exec(input);
    let value = input;
    if (relative) {
      if (!referenceDate) throw new TemporalQueryError("Relative date bounds require referenceDate (UTC YYYY-MM-DD).");
      const ms = Date.parse(referenceDate) - Number(relative[1]) * DAY;
      if (!Number.isSafeInteger(ms) || ms < Date.parse("0001-01-01") || ms > Date.parse("9999-12-31")) invalid();
      value = new Date(ms).toISOString().slice(0, 10);
    }
    if (!metadataDate(value) || /\.\d{4,}/u.test(value)) invalid();
    const time = Date.parse(value) + (upper && value.length === 10 ? DAY : 0);
    // Permit the sentinel upper bound immediately after the last supported day.
    if (!Number.isFinite(time) || time < Date.parse("0001-01-01") || time > Date.parse("9999-12-31") + DAY) invalid();
    return new Date(time).toISOString();
  };
  const from = bound(query.from, false);
  const toExclusive = bound(query.to, true);
  if (from && toExclusive && Date.parse(from) >= Date.parse(toExclusive)) throw new TemporalQueryError("Temporal from must precede the exclusive upper bound.");
  if (!from && !toExclusive && order !== "chronological") throw new TemporalQueryError("Temporal query requires a date bound or chronological order.");
  return { basis: "evidence", timezone: "UTC", ...(from ? { from } : {}), ...(toExclusive ? { toExclusive } : {}),
    ...(referenceDate ? { referenceDate } : {}), order };
}

export function evidenceInInterval(date: EvidenceDate, interval: TemporalResolution): boolean {
  if (date.basis === "unknown") return !interval.from && !interval.toExclusive;
  const time = Date.parse(date.value);
  return (!interval.from || time >= Date.parse(interval.from)) && (!interval.toExclusive || time < Date.parse(interval.toExclusive));
}

function invalid(): never {
  throw new TemporalQueryError("Invalid temporal query: use real YYYY-MM-DD days, timezone-explicit ISO timestamps, or pinned t-Nd bounds.");
}
