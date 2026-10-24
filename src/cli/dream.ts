import { readStdin } from "./stdin.js";
import { writeFile } from "node:fs/promises";
import type { DreamWindow, DreamWindowRequest } from "../types.js";
import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget } from "./memory-target.js";

const LEGACY_FLAGS = ["status", "complete", "abandon", "force", "apply-manifest", "summary"];
const VALUE_FLAGS = ["root", "target-url", "remote-url", "from", "days", "date-basis", "offset", "max-files", "bytes-per-file", "max-total-bytes", "out"];

export async function dreamCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  if (args["check-sources"] !== undefined || args.draft !== undefined || args["page-file"] !== undefined || args.id !== undefined) {
    const allowed = ["_", "check-sources", "id", "draft", "page-file", "root", "target-url", "remote-url", "json"];
    if (Object.keys(args).some(key => !allowed.includes(key)) || args._.length !== 1 || args["check-sources"] !== true || (args.json !== undefined && args.json !== true) || (args.draft !== undefined && args.draft !== true)) throw new Error("Use dream --check-sources --id <dream-page-id> OR --draft --page-file pages/topic.md; flags take no values.");
    for (const key of ["id", "page-file", "root", "target-url", "remote-url"]) optionalValue(args, key);
    if (Boolean(args.id) === Boolean(args.draft) || (args.draft ? !args["page-file"] : args["page-file"] !== undefined)) throw new Error("Select one saved Dream page with --id OR stdin --draft --page-file pages/topic.md.");
    const target = await commandMemoryTarget(args, localMemory);
    const request = args.draft ? { content: readStdin(), file: optionalValue(args, "page-file")! } : { id: optionalValue(args, "id")! };
    const packet = target.kind === "remote" ? await target.memory.checkDreamSources(request) : await localMemory.checkDreamSources(target.root, request);
    if (args.json) console.log(JSON.stringify(packet, null, 2));
    else console.log([`Source versions checked at ${packet.checkedAt} · ${packet.coverage} coverage`, ...packet.sources.map(source => `- ${source.target}: ${source.status}${source.reason ? " (" + source.reason + ")" : ""}`), ...packet.warnings].join("\n"));
    return;
  }
  for (const flag of LEGACY_FLAGS) {
    if (args[flag] !== undefined) throw new Error(`dream --${flag} is deprecated. Dream now reads stateless UTC windows: dream --from t-0d --days 3 --out dream-window.json. No completion is needed. Apply edits with remember/update, then index. Legacy batch data is untouched; legacy runtime/HTTP APIs remain available for compatibility.`);
  }
  for (const key of Object.keys(args)) {
    if (key !== "_" && key !== "json" && !VALUE_FLAGS.includes(key)) throw new Error(`Unknown dream flag --${key}.`);
  }
  if (args._.length !== 1) throw new Error("dream accepts flags, not positional arguments. Use --from t-1d --days 3.");
  for (const key of VALUE_FLAGS) optionalValue(args, key);
  if (args.json !== undefined && args.json !== true && args.json !== "true" && args.json !== "false") throw new Error("--json must be a boolean flag or true/false.");
  const request: DreamWindowRequest = {
    from: optionalValue(args, "from"),
    days: optionalInteger(args, "days"),
    dateBasis: optionalValue(args, "date-basis") as DreamWindowRequest["dateBasis"],
    offset: optionalInteger(args, "offset", true),
    maxFiles: optionalInteger(args, "max-files"),
    bytesPerFile: optionalInteger(args, "bytes-per-file"),
    maxTotalBytes: optionalInteger(args, "max-total-bytes"),
  };
  const target = await commandMemoryTarget(args, localMemory);
  const packet = target.kind === "remote"
    ? await target.memory.getDreamWindow(request)
    : await localMemory.getDreamWindow(target.root, request);
  const out = optionalValue(args, "out");
  if (out) await writeFile(out, `${JSON.stringify(packet, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  if (args.json === true || args.json === "true") console.log(JSON.stringify(packet, null, 2));
  else console.log(formatDreamWindow(packet, out));
}

function optionalValue(args: ParsedCliArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${key} requires one non-empty value and must not be repeated.`);
  return value;
}

function optionalInteger(args: ParsedCliArgs, key: string, zero = false): number | undefined {
  const raw = optionalValue(args, key);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1)) throw new Error(`--${key} must be a ${zero ? "non-negative" : "positive"} safe integer.`);
  return value;
}

function formatDreamWindow(packet: DreamWindow, out?: string): string {
  const days = Math.round((Date.parse(packet.window.to) - Date.parse(packet.window.from)) / 86400000) + 1;
  const lines = [
    `${packet.target === "remote" ? "Remote" : "Local"} dream window: ${packet.window.from} through ${packet.window.to} (inclusive, UTC)`,
    `Root: ${packet.root}`,
    `Date basis: ${packet.window.dateBasis}`,
    `Files: ${packet.files.length} returned / ${packet.totalFiles} matching; offset ${packet.offset}`,
    "Read-only context. No dreamed state recorded; no completion step needed.",
    out ? `Full context written to: ${out}` : "Use --out dream-window.json or --json to read full context.",
  ];
  for (const file of packet.files) lines.push(`- ${file.file} (${file.date}; ${file.dateBasis}; ${file.id ?? "no ID"}${file.truncated ? "; truncated" : ""})`);
  if (packet.hasMore) lines.push(`More evidence: repeat with --from ${packet.window.to} --days ${days} --date-basis ${packet.window.dateBasis} --offset ${packet.nextOffset} and the same target/limits.`);
  lines.push("", "Agent instructions:", ...packet.instructions.map((text) => `- ${text}`), "", "Warnings:", ...packet.warnings.map((text) => `- ${text}`));
  return lines.join("\n");
}
