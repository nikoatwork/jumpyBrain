import path from "node:path";
import type { IndexMemoryOptions, RetrievalReadiness, SearchMemoryResult } from "../types.js";
import { numberArg, stringArg, stringListArg, type ParsedCliArgs } from "./args.js";
import { showMemoryDocumentFromArgs, updateMemoryDocumentFromArgs } from "./document-edit.js";
import { formatHumanResults } from "./formatting.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget, recallRelatedMemory } from "./memory-target.js";
import { resolveCliTarget } from "./targets.js";
import { rememberFromStdin } from "./memory-write.js";
import { formatMemoryOverview, overviewOptionsFromArgs } from "./overview.js";
import { readStdin } from "./stdin.js";
import { compactOptions, expansionOptions, printCompactRecall, printExpansion } from "./bounded-reads.js";

export type MemoryCommand =
  | "status"
  | "index"
  | "tree"
  | "overview"
  | "search"
  | "recall"
  | "show"
  | "expand"
  | "update"
  | "process"
  | "remember"
  | "wrapup";

export async function runMemoryCommand(
  command: MemoryCommand,
  args: ParsedCliArgs,
  localMemory: LocalMemoryTransport,
  options: { allowDiscovery?: boolean } = {},
): Promise<void> {
  const compact = command === "recall" || command === "search" ? compactOptions(args) : undefined;
  const expansion = command === "expand" ? expansionOptions(args) : undefined;
  if (command === "process") {
    const selected = resolveCliTarget(args, { allowDiscovery: options.allowDiscovery });
    if (selected.kind === "remote") throw new Error("process is local/server-side only in remote V1. Run it on the server memory root.");
    const root = selected.root ?? await localMemory.findMemoryRoot();
    const result = await localMemory.processMemory(root, processOptionsFromArgs(args));
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Processed memory: ${result.mode}${result.topic ? ` topic=${result.topic}` : ""}`);
      console.log(`Applied: ${result.applied ? "yes" : "no"}`);
      if (typeof result.modifiedCount === "number") console.log(`Modified count: ${result.modifiedCount}`);
      for (const file of result.files) console.log(`File: ${file}`);
      for (const line of result.summary) console.log(`- ${line}`);
    }
    return;
  }

  if (command === "index" && (args.lexical !== undefined || args["semantic-model"] !== undefined) && resolveCliTarget(args, { allowDiscovery: options.allowDiscovery }).kind === "remote") {
    throw new Error("--lexical and --semantic-model are server-local policy flags; configure them on the server memory root, not a remote target.");
  }
  const indexOptions = command === "index" ? indexOptionsFromArgs(args) : undefined;
  const target = await commandMemoryTarget(args, localMemory, { allowDiscovery: options.allowDiscovery });

  if (expansion) {
    await printExpansion(target, localMemory, expansion);
    return;
  }

  if (command === "status") {
    const result = target.kind === "remote" ? await target.memory.memoryRootStatus() : await localMemory.memoryRootStatus(target.root);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${target.kind === "remote" ? "Remote memory" : "Memory root"}: ${target.kind === "remote" ? target.url : result.root}`);
      console.log(`Initialized: ${result.initialized ? "yes" : "no"}`);
      if (result.configFile) console.log(`Config: ${result.configFile}${result.schemaVersion ? ` (schema v${result.schemaVersion})` : ""}`);
      console.log(`Compatible: ${result.compatible ? "yes" : "no"}`);
      if (result.message) console.log(result.message);
      printReadiness(result.readiness);
    }
    return;
  }

  if (command === "index") {
    const result = target.kind === "remote" ? await target.memory.indexMemory(indexOptions) : await localMemory.indexMemory(target.root, indexOptions);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Indexed ${result.documents} Markdown documents into QMD collection '${result.qmdCollection}' from ${result.root}`);
      printReadiness(result.readiness);
    }
    return;
  }

  if (command === "tree" || command === "overview") {
    const overviewOptions = overviewOptionsFromArgs(args);
    const result = target.kind === "remote"
      ? await target.memory.overviewMemory(overviewOptions)
      : await localMemory.overviewMemory(target.root, overviewOptions);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatMemoryOverview(result, overviewOptions));
    return;
  }

  if (command === "search" || command === "recall") {
    const query = stringArg(args, command === "recall" ? "topic" : "query", command === "recall" ? stringArg(args, "query", false) : undefined);
    const limit = numberArg(args, "limit", command === "recall" ? 5 : 10);
    const depth = stringArg(args, "depth", "normal");
    if (compact) {
      await printCompactRecall(target, localMemory, query, limit, compact);
      return;
    }
    const result = target.kind === "remote"
      ? await target.memory.searchMemory(query, limit, { depth, mode: command })
      : await localMemory.searchMemory(target.root, query, limit, { depth });
    if (args.json) console.log(JSON.stringify({ ...result, mode: command }, null, 2));
    else {
      if (command === "recall") console.log(`Prior memory scan for: ${query}\n`);
      printRetrievalWarnings(result);
      console.log(formatHumanResults(result.results));
    }
    return;
  }

  if (command === "show") {
    await showMemoryDocumentFromArgs(target, localMemory, args);
    return;
  }

  if (command === "update") {
    await updateMemoryDocumentFromArgs(target, localMemory, args);
    return;
  }

  if (command === "remember") {
    const result = await rememberFromStdin(target, localMemory, args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Remembered memory: ${result.file}`);
    return;
  }

  if (command === "wrapup") {
    const title = stringArg(args, "title");
    const topic = stringArg(args, "topic", false).trim();
    const limit = numberArg(args, "limit", 5);
    const body = readStdin();
    const relatedMemory = topic ? await recallRelatedMemory(target, localMemory, topic, limit) : { skipped: true as const, reason: "--topic not provided" };
    const result = target.kind === "remote"
      ? await target.memory.writeSessionWrapup({ title, body, tags: stringListArg(args, "tag"), recallTopic: topic || undefined })
      : await localMemory.writeSessionWrapup(target.root, { title, body, tags: stringListArg(args, "tag"), recallTopic: topic || undefined });
    if (args.json) console.log(JSON.stringify({ ...result, relatedMemory }, null, 2));
    else {
      if (topic && !relatedMemory.skipped) {
        console.log(`Related memory preflight for: ${topic}\n`);
        console.log(formatHumanResults(relatedMemory.results));
        console.log("");
      } else {
        console.log("Related memory preflight skipped: --topic not provided.\n");
      }
      console.log(`Wrote session wrapup: ${result.file}\n`);
      console.log(typeof result.body === "string" ? result.body : body.trimEnd());
    }
  }
}

function processApplyArg(args: ParsedCliArgs): boolean {
  // Legacy parseArgs preserves '=' in flag keys; handle Boolean spelling here
  // without changing parsing for unrelated commands.
  const equals = Object.keys(args).filter(key => key.startsWith("apply="));
  if (equals.length > 1 || (equals.length && args.apply !== undefined)) throw new Error("--apply must not be repeated.");
  let value: unknown = args.apply;
  if (equals.length) {
    const key = equals[0]!;
    if (args[key] !== true) throw new Error("--apply must be a boolean flag or true/false.");
    value = key.slice("apply=".length);
  }
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new Error("--apply must be a boolean flag or true/false.");
}

function processOptionsFromArgs(args: ParsedCliArgs) {
  return {
    mode: stringArg(args, "mode"),
    apply: processApplyArg(args),
    topic: stringArg(args, "topic", false).trim() || undefined,
    since: stringArg(args, "since", false).trim() || undefined,
    ifMatch: stringArg(args, "if-match", false).trim() || undefined,
    limit: numberArg(args, "limit", 0) || undefined,
  };
}

function indexOptionsFromArgs(args: ParsedCliArgs): IndexMemoryOptions {
  for (const flag of ["rebuild", "lexical"]) {
    if (args[flag] !== undefined && args[flag] !== true) throw new Error(`--${flag} is a boolean flag and takes no value.`);
  }
  if (args.lexical && args["semantic-model"] !== undefined) throw new Error("Use only one of --lexical or --semantic-model.");
  const options: IndexMemoryOptions = {};
  if (args.rebuild) options.rebuild = true;
  if (args.lexical) options.indexing = { mode: "lexical" };
  if (args["semantic-model"] !== undefined) {
    const model = args["semantic-model"];
    if (typeof model !== "string" || !path.isAbsolute(model)) throw new Error("--semantic-model requires an absolute local model path.");
    options.indexing = { mode: "semantic", model };
  }
  return options;
}

function printReadiness(readiness?: RetrievalReadiness): void {
  if (!readiness) return;
  console.log(`Readiness: ${readiness.freshness}; modes: ${readiness.modes.join(", ") || "none"}; embeddings: ${readiness.embedding}`);
  if (readiness.lastFailure) console.log(`Last index failure: ${readiness.lastFailure.code}`);
}

function printRetrievalWarnings(result: SearchMemoryResult): void {
  const warnings = new Set(result.retrieval?.warnings ?? []);
  if (result.readiness && result.readiness.freshness !== "fresh") warnings.add(`Index is ${result.readiness.freshness}; results may be incomplete. Run index to refresh.`);
  if (result.readiness?.embedding === "incomplete" || result.readiness?.embedding === "unknown") warnings.add("Semantic readiness is incomplete or unknown; retrieval may be degraded.");
  if (result.retrieval?.status === "partial" && !warnings.size) warnings.add("Retrieval is partial; results may be incomplete.");
  for (const warning of warnings) console.log(`Warning: ${warning}`);
}
