import { numberArg, stringArg, stringListArg, type ParsedCliArgs } from "./args.js";
import { showMemoryDocumentFromArgs, updateMemoryDocumentFromArgs } from "./document-edit.js";
import { formatHumanResults } from "./formatting.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget, recallRelatedMemory } from "./memory-target.js";
import { resolveCliTarget } from "./targets.js";
import { rememberFromStdin } from "./memory-write.js";
import { formatMemoryOverview, overviewOptionsFromArgs } from "./overview.js";
import { readStdin } from "./stdin.js";

export type MemoryCommand =
  | "status"
  | "index"
  | "tree"
  | "overview"
  | "search"
  | "recall"
  | "show"
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

  const target = await commandMemoryTarget(args, localMemory, { allowDiscovery: options.allowDiscovery });

  if (command === "status") {
    const result = target.kind === "remote" ? await target.memory.memoryRootStatus() : await localMemory.memoryRootStatus(target.root);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`${target.kind === "remote" ? "Remote memory" : "Memory root"}: ${target.kind === "remote" ? target.url : result.root}`);
      console.log(`Initialized: ${result.initialized ? "yes" : "no"}`);
      if (result.configFile) console.log(`Config: ${result.configFile}${result.schemaVersion ? ` (schema v${result.schemaVersion})` : ""}`);
      console.log(`Compatible: ${result.compatible ? "yes" : "no"}`);
      if (result.message) console.log(result.message);
    }
    return;
  }

  if (command === "index") {
    const result = target.kind === "remote" ? await target.memory.indexMemory() : await localMemory.indexMemory(target.root);
    console.log(`Indexed ${result.documents} Markdown documents into QMD collection '${result.qmdCollection}' from ${result.root}`);
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
    const result = target.kind === "remote"
      ? await target.memory.searchMemory(query, limit, { depth, mode: command })
      : await localMemory.searchMemory(target.root, query, limit, { depth });
    if (args.json) console.log(JSON.stringify({ ...result, mode: command }, null, 2));
    else {
      if (command === "recall") console.log(`Prior memory scan for: ${query}\n`);
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

function processOptionsFromArgs(args: ParsedCliArgs) {
  return {
    mode: stringArg(args, "mode"),
    apply: Boolean(args.apply),
    topic: stringArg(args, "topic", false).trim() || undefined,
    since: stringArg(args, "since", false).trim() || undefined,
    limit: numberArg(args, "limit", 0) || undefined,
  };
}
