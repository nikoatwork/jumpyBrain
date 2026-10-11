import { serializeCompactRecall, serializeExpansion, type CompactRecallOptions, type ExpansionOptions } from "../runtime/index.js";
import { validatePacketMaxBytes } from "../core/serialized-budget.js";
import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import type { CommandMemoryTarget } from "./memory-target.js";

/** New bounded modes are deliberately stricter than legacy argument coercion. */
export function compactOptions(args: ParsedCliArgs): CompactRecallOptions | undefined {
  if (args.compact === undefined) {
    if (args["max-bytes"] !== undefined || args.diagnostics !== undefined) throw new Error("--max-bytes and --diagnostics require --compact for search/recall.");
    return undefined;
  }
  if (args.compact !== true || (args.diagnostics !== undefined && args.diagnostics !== true)) {
    throw new Error("--compact and --diagnostics are boolean flags and take no value.");
  }
  const depth = args.depth ?? "normal";
  if (typeof depth !== "string" || !["shallow", "normal", "deep"].includes(depth)) throw new Error("--depth must be shallow, normal, or deep.");
  if (args.limit !== undefined) positiveInteger(args, "limit");
  return { depth, maxBytes: validatePacketMaxBytes(optionalInteger(args, "max-bytes")), diagnostics: args.diagnostics === true };
}

export function expansionOptions(args: ParsedCliArgs): ExpansionOptions {
  const startLine = optionalInteger(args, "start-line");
  const endLine = optionalInteger(args, "end-line");
  const sectionLine = optionalInteger(args, "section-line");
  if (sectionLine !== undefined && (startLine !== undefined || endLine !== undefined)) throw new Error("--section-line cannot be combined with --start-line or --end-line.");
  if (startLine !== undefined && endLine !== undefined && startLine > endLine) throw new Error("--start-line must not exceed --end-line.");
  const expectedContentHash = requiredString(args, "if-match");
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedContentHash)) throw new Error("--if-match requires the sha256 content hash from recall or show.");
  return { id: requiredString(args, "id"), expectedContentHash, startLine, endLine, sectionLine,
    maxBytes: validatePacketMaxBytes(optionalInteger(args, "max-bytes")) };
}

export async function printCompactRecall(target: CommandMemoryTarget, local: LocalMemoryTransport, query: string, limit: number, options: CompactRecallOptions): Promise<void> {
  const packet = target.kind === "remote" ? await target.memory.compactSearchMemory(query, limit, options)
    : await local.compactSearchMemory(target.root, query, limit, options);
  process.stdout.write(serializeCompactRecall(packet));
}

export async function printExpansion(target: CommandMemoryTarget, local: LocalMemoryTransport, options: ExpansionOptions): Promise<void> {
  const packet = target.kind === "remote" ? await target.memory.expandMemoryDocument(options)
    : await local.expandMemoryDocument(target.root, options);
  process.stdout.write(serializeExpansion(packet));
}

function requiredString(args: ParsedCliArgs, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${key} requires one non-empty value.`);
  return value;
}

function positiveInteger(args: ParsedCliArgs, key: string): number {
  const value = requiredString(args, key);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`--${key} must be a positive safe integer.`);
  return Number(value);
}

function optionalInteger(args: ParsedCliArgs, key: string): number | undefined {
  return args[key] === undefined ? undefined : positiveInteger(args, key);
}
