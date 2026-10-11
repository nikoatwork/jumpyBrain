import { resolveTemporalQuery } from "../core/retrieval-policy/temporal.js";
import type { TemporalQuery } from "../types.js";
import type { ParsedCliArgs } from "./args.js";

/** Resolve before selecting a target or reading credentials. */
export function temporalOptions(args: ParsedCliArgs): TemporalQuery | undefined {
  const temporal: TemporalQuery = {};
  for (const [flag, key] of [["from", "from"], ["to", "to"], ["reference-date", "referenceDate"], ["order", "order"]] as const) {
    if (args[flag] === undefined) continue;
    if (typeof args[flag] !== "string") throw new Error(`--${flag} requires one value.`);
    (temporal as Record<string, string>)[key] = args[flag];
  }
  if (!Object.keys(temporal).length) return undefined;
  resolveTemporalQuery(temporal);
  const operation = args._[0] === "run" ? args._[1]?.replace(/^memory:/u, "") : args._[0];
  const query = operation === "recall" ? args.topic ?? args.query : args.query;
  if (typeof query !== "string" || !query.trim()) throw new Error("Temporal search/recall requires a non-empty --query (or recall --topic).");
  if (args.depth !== undefined && !["shallow", "normal", "deep"].includes(String(args.depth))) throw new Error("--depth must be shallow, normal, or deep.");
  if (args.limit !== undefined && (typeof args.limit !== "string" || !/^\d+$/u.test(args.limit) || !Number.isSafeInteger(Number(args.limit)) || Number(args.limit) < 1)) throw new Error("--limit must be a positive safe integer.");
  return temporal;
}
