import { normalizeMemoryActor } from "../core/contribution.js";
import { normalizeRecognitionOptions } from "../core/search-recognition.js";
import { stringArg, numberArg, type ParsedCliArgs } from "./args.js";

export function actorFromArgs(args: ParsedCliArgs) {
  if (args.actor === undefined) {
    if (args["actor-id"] !== undefined || args["actor-name"] !== undefined) throw new Error("--actor-id/name require --actor human|agent.");
    return undefined;
  }
  if (args.actor === "unknown" && args["actor-id"] === undefined && args["actor-name"] === undefined) return undefined;
  return normalizeMemoryActor({ kind: stringArg(args, "actor"),
    ...(args["actor-id"] === undefined ? {} : { id: stringArg(args, "actor-id") }),
    ...(args["actor-name"] === undefined ? {} : { name: stringArg(args, "actor-name") }) });
}

export function recognitionFromArgs(args: ParsedCliArgs) {
  const fields = { "last-editor": "editor", "editor-id": "actorId", "edited-from": "from", "edited-to": "to", "date-field": "dateField", "time-zone": "timeZone", "sort": "sort" };
  if (args.recognition === undefined && args.offset === undefined && Object.keys(fields).every(key => args[key] === undefined)) return undefined;
  if (args.recognition !== undefined && args.recognition !== true) throw new Error("--recognition takes no value.");
  const input: Record<string, unknown> = {};
  for (const [flag, field] of Object.entries(fields)) if (args[flag] !== undefined) input[field] = stringArg(args, flag);
  if (args.offset !== undefined) input.offset = numberArg(args, "offset", 0);
  return normalizeRecognitionOptions(input);
}
