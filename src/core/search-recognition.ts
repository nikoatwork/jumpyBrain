import { metadataDate } from "./canonical/metadata-date.js";
import type { SearchRecognitionOptions, SearchRecognitionMetadata } from "../types.js";

export const RECOGNITION_CANDIDATE_LIMIT = 120;

export function normalizeRecognitionOptions(value: unknown): SearchRecognitionOptions | undefined {
  if (value === undefined) return undefined;
  const fail = (): never => { throw Object.assign(new Error("Invalid search recognition options."), { code: "invalid_recognition" }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["editor", "actorId", "dateField", "from", "to", "timeZone", "sort", "offset"].includes(key))) return fail();
  if (input.editor !== undefined && (typeof input.editor !== "string" || !["human", "agent", "unknown", "you"].includes(input.editor))) return fail();
  if (input.actorId !== undefined && (typeof input.actorId !== "string" || !input.actorId || input.actorId.length > 120)) return fail();
  if (input.editor === "you" && !input.actorId) return fail();
  if (input.dateField !== undefined && (typeof input.dateField !== "string" || !["edited", "created"].includes(input.dateField))) return fail();
  if (input.sort !== undefined && (typeof input.sort !== "string" || !["relevance", "edited"].includes(input.sort))) return fail();
  for (const key of ["from", "to"]) if (input[key] !== undefined && (typeof input[key] !== "string" || (input[key] as string).length !== 10 || !metadataDate(input[key]))) return fail();
  if (input.from && input.to && String(input.from) > String(input.to)) return fail();
  if (input.offset !== undefined && (!Number.isSafeInteger(input.offset) || Number(input.offset) < 0 || Number(input.offset) > RECOGNITION_CANDIDATE_LIMIT)) return fail();
  if (input.timeZone !== undefined && (typeof input.timeZone !== "string" || input.timeZone.length > 100)) return fail();
  try { new Intl.DateTimeFormat("en", { timeZone: (input.timeZone as string | undefined) ?? "UTC" }); } catch { return fail(); }
  return { editor: input.editor, actorId: input.actorId, from: input.from, to: input.to, timeZone: input.timeZone ?? "UTC", sort: input.sort ?? "relevance", dateField: input.dateField ?? "edited", offset: input.offset ?? 0 } as SearchRecognitionOptions;
}

/** Date-only values describe a calendar day, never an invented midnight instant. */
export function recognitionDay(value: unknown, timeZone: string): string | undefined {
  const date = metadataDate(value);
  if (!date || date.length === 10) return date;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function matchesRecognition(metadata: SearchRecognitionMetadata, options: SearchRecognitionOptions): boolean {
  if (options.editor === "unknown" && metadata.editor) return false;
  if ((options.editor === "human" || options.editor === "agent") && metadata.editor?.kind !== options.editor) return false;
  if (options.editor === "you" && (metadata.editor?.kind !== "human" || metadata.editor.id !== options.actorId)) return false;
  const day = recognitionDay(options.dateField === "created" ? metadata.createdAt : metadata.updatedAt, options.timeZone ?? "UTC");
  if ((options.from || options.to) && (!day || (options.from && day < options.from) || (options.to && day > options.to))) return false;
  return true;
}
