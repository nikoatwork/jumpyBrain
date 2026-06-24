#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { formatHumanResults } from "./cli/formatting.js";
import { createLocalMemoryTransport } from "./cli/local-transport.js";
import { packageVersion } from "./package-info.js";
import type { SearchResult } from "./cli/local-transport.js";

interface Args {
  _: string[];
  [key: string]: string | boolean | string[];
}

const localMemory = createLocalMemoryTransport();

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const command = args._[0];

  if (command === "version" || command === "-v" || args.version || args.v) {
    console.log(await packageVersion());
    return;
  }

  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  if (command === "run") {
    await runRecipe(args);
    return;
  }

  if (command === "instructions" || command === "agent-hint") {
    console.log(agentInstructions());
    return;
  }

  if (command === "init") {
    const root = stringArg(args, "root");
    const result = await localMemory.initializeMemoryRoot(root, { force: Boolean(args.force) });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Initialized memory root: ${result.root}`);
      console.log(`Config: ${result.configFile} (schema v${result.schemaVersion}${result.configCreated ? ", written" : ", existing"})`);
      console.log(`Memory dirs: ${result.memoryDirs.join(", ")}`);
      console.log(`Derived state ignored: ${result.gitignoreUpdated ? "updated .gitignore" : "already ignored"}`);
    }
    return;
  }

  if (command === "status") {
    const root = stringArg(args, "root");
    const result = await localMemory.memoryRootStatus(root);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Memory root: ${result.root}`);
      console.log(`Initialized: ${result.initialized ? "yes" : "no"}`);
      if (result.configFile) console.log(`Config: ${result.configFile}${result.schemaVersion ? ` (schema v${result.schemaVersion})` : ""}`);
      console.log(`Compatible: ${result.compatible ? "yes" : "no"}`);
      if (result.message) console.log(result.message);
    }
    return;
  }

  if (command === "index") {
    const root = stringArg(args, "root");
    const result = await localMemory.indexMemory(root);
    console.log(`Indexed ${result.documents} Markdown documents into QMD collection '${result.qmdCollection}' from ${result.root}`);
    return;
  }

  if (command === "search" || command === "recall") {
    const root = stringArg(args, "root");
    const query = stringArg(args, command === "recall" ? "topic" : "query", command === "recall" ? stringArg(args, "query", false) : undefined);
    const limit = numberArg(args, "limit", command === "recall" ? 5 : 10);
    const depth = stringArg(args, "depth", "normal");
    const result = await localMemory.searchMemory(root, query, limit, { depth });

    if (args.json) {
      console.log(JSON.stringify({ ...result, mode: command }, null, 2));
    } else {
      if (command === "recall") {
        console.log(`Prior memory scan for: ${query}\n`);
      }
      console.log(formatHumanResults(result.results));
    }
    return;
  }

  if (command === "process") {
    const root = stringArg(args, "root");
    const mode = stringArg(args, "mode");
    const result = await localMemory.processMemory(root, {
      mode,
      apply: Boolean(args.apply),
      topic: stringArg(args, "topic", false).trim() || undefined,
      since: stringArg(args, "since", false).trim() || undefined,
      limit: numberArg(args, "limit", 0) || undefined,
    });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Processed memory: ${result.mode}${result.topic ? ` topic=${result.topic}` : ""}`);
      console.log(`Applied: ${result.applied ? "yes" : "no"}`);
      for (const file of result.files) console.log(`File: ${file}`);
      for (const line of result.summary) console.log(`- ${line}`);
    }
    return;
  }

  if (command === "remember") {
    const root = stringArg(args, "root");
    const result = await rememberFromStdin(root, args);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Remembered memory: ${result.file}`);
    }
    return;
  }

  if (command === "note") {
    throw new Error("`jumpybrain note` was renamed to `jumpybrain remember`. Use the same flags and stdin with `jumpybrain remember`.");
  }

  if (command === "wrapup") {
    const root = stringArg(args, "root");
    const title = stringArg(args, "title");
    const topic = stringArg(args, "topic", false).trim();
    const limit = numberArg(args, "limit", 5);
    const body = readStdin();
    const relatedMemory = topic ? await recallRelatedMemory(root, topic, limit) : { skipped: true as const, reason: "--topic not provided" };
    const result = await localMemory.writeSessionWrapup(root, { title, body, tags: stringListArg(args, "tag"), recallTopic: topic || undefined });

    if (args.json) {
      console.log(JSON.stringify({ ...result, relatedMemory }, null, 2));
    } else {
      if (topic && !relatedMemory.skipped) {
        console.log(`Related memory preflight for: ${topic}\n`);
        console.log(formatHumanResults(relatedMemory.results));
        console.log("");
      } else {
        console.log("Related memory preflight skipped: --topic not provided.\n");
      }
      console.log(`Wrote session wrapup: ${result.file}\n`);
      console.log(result.body);
    }
    return;
  }

  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

async function runRecipe(args: Args): Promise<void> {
  const recipe = args._[1];
  if (!recipe) throw new Error(`Recipe is required.\n\n${runUsage()}`);
  if (recipe === "memory:note") {
    throw new Error("`jumpybrain run memory:note` was renamed to `jumpybrain run memory:remember`. Use the same flags and stdin with `memory:remember`.");
  }
  const root = await recipeRoot(args);

  if (recipe === "memory:status") {
    const result = await localMemory.memoryRootStatus(root);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Memory root: ${result.root}`);
      console.log(`Initialized: ${result.initialized ? "yes" : "no"}`);
      if (result.configFile) console.log(`Config: ${result.configFile}${result.schemaVersion ? ` (schema v${result.schemaVersion})` : ""}`);
      console.log(`Compatible: ${result.compatible ? "yes" : "no"}`);
      if (result.message) console.log(result.message);
    }
    return;
  }

  if (recipe === "memory:index") {
    const result = await localMemory.indexMemory(root);
    console.log(`Indexed ${result.documents} Markdown documents into QMD collection '${result.qmdCollection}' from ${result.root}`);
    return;
  }

  if (recipe === "memory:search" || recipe === "memory:recall") {
    const query = stringArg(args, recipe === "memory:recall" ? "topic" : "query", recipe === "memory:recall" ? stringArg(args, "query", false) : undefined);
    const limit = numberArg(args, "limit", recipe === "memory:recall" ? 5 : 10);
    const depth = stringArg(args, "depth", "normal");
    const result = await localMemory.searchMemory(root, query, limit, { depth });
    if (args.json) console.log(JSON.stringify({ ...result, mode: recipe }, null, 2));
    else {
      if (recipe === "memory:recall") console.log(`Prior memory scan for: ${query}\n`);
      console.log(formatHumanResults(result.results));
    }
    return;
  }

  if (recipe === "memory:process") {
    const mode = stringArg(args, "mode");
    const result = await localMemory.processMemory(root, {
      mode,
      apply: Boolean(args.apply),
      topic: stringArg(args, "topic", false).trim() || undefined,
      since: stringArg(args, "since", false).trim() || undefined,
      limit: numberArg(args, "limit", 0) || undefined,
    });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Processed memory: ${result.mode}${result.topic ? ` topic=${result.topic}` : ""}`);
      console.log(`Applied: ${result.applied ? "yes" : "no"}`);
      for (const file of result.files) console.log(`File: ${file}`);
      for (const line of result.summary) console.log(`- ${line}`);
    }
    return;
  }

  if (recipe === "memory:remember") {
    const result = await rememberFromStdin(root, args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`Remembered memory: ${result.file}`);
    return;
  }

  if (recipe === "memory:wrapup") {
    const title = stringArg(args, "title");
    const topic = stringArg(args, "topic", false).trim();
    const limit = numberArg(args, "limit", 5);
    const body = readStdin();
    const relatedMemory = topic ? await recallRelatedMemory(root, topic, limit) : { skipped: true as const, reason: "--topic not provided" };
    const result = await localMemory.writeSessionWrapup(root, { title, body, tags: stringListArg(args, "tag"), recallTopic: topic || undefined });
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
      console.log(result.body);
    }
    return;
  }

  throw new Error(`Unknown recipe '${recipe}'.\n\n${runUsage()}`);
}

async function recipeRoot(args: Args): Promise<string> {
  const explicit = stringArg(args, "root", false).trim();
  return explicit ? explicit : localMemory.findMemoryRoot();
}

async function recallRelatedMemory(root: string, topic: string, limit: number): Promise<{ skipped: false; query: string; results: SearchResult[] }> {
  const result = await localMemory.searchMemory(root, topic, limit);
  return { skipped: false, query: result.query, results: result.results };
}

async function rememberFromStdin(root: string, args: Args): Promise<{ file: string; indexed: boolean }> {
  const type = stringArg(args, "type", "note");
  const title = stringArg(args, "title");
  const body = readStdin();
  const result = await localMemory.rememberMemory(root, { type, title, body, tags: stringListArg(args, "tag") });
  await localMemory.indexMemory(root);
  return { ...result, indexed: true };
}

function parseArgs(argv: string[]): Args {
  const args: Args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    const current = args[key];
    if (current === undefined) {
      args[key] = next;
    } else if (Array.isArray(current)) {
      current.push(next);
    } else {
      args[key] = [String(current), next];
    }
    index += 1;
  }
  return args;
}

function stringArg(args: Args, key: string, fallback?: string | false): string {
  const value = args[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return String(value[0]);
  if (fallback !== undefined && fallback !== false) return fallback;
  if (fallback === false) return "";
  throw new Error(`--${key} is required.`);
}

function numberArg(args: Args, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`--${key} must be a positive integer.`);
  return parsed;
}

function stringListArg(args: Args, key: string): string[] {
  const value = args[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function agentInstructions(): string {
  return [
    "# jumpyBrain memory hint for coding agents",
    "",
    "If jumpybrain is installed and the task may benefit from project memory, use visible recall before acting. Good triggers include architecture decisions, prior bugs, user/project preferences, benchmark history, handoffs, or continuing earlier work.",
    "",
    "- Prefer explicit, bounded recall; do not silently inject memory into prompts.",
    "- Remember writes memory; recall reads memory.",
    "- If this repo has memory/jumpybrain.json, run: jumpybrain run memory:recall --topic \"<current task/topic>\" --limit 5",
    "- For a specific question, run: jumpybrain run memory:recall --query \"<question>\" --limit 10 --json",
    "- Use --depth shallow|normal|deep to shape recall from compressed pages/decisions toward raw session evidence.",
    "- If recipes cannot discover the root, pass --root <memory-root> to remember/recall/wrapup.",
    "- `remember` indexes after writing; run memory:index only after manually editing Markdown memory files.",
    "- At session end, recall likely duplicates/conflicts, then pipe a strict wrapup with sections: ## Findings, ## Decisions, ## Conflicts / Corrections, ## Open Questions",
    "- Do not memorize secrets, credentials, tokens, raw chat noise, or vague status updates.",
  ].join("\n");
}

function usage(): string {
  return [
    "Usage:",
    "  jumpybrain --version",
    "  jumpybrain instructions",
    "  jumpybrain run memory:remember --type finding --title \"...\"",
    "  jumpybrain run memory:recall --topic \"...\" --limit 5",
    "  jumpybrain init --root <memory-root>",
    "  jumpybrain status --root <memory-root> --json",
    "  jumpybrain recall --root <memory-root> --topic \"...\" --limit 5 --depth shallow",
    "  jumpybrain recall --root <memory-root> --query \"...\" --limit 10 --depth normal --json",
    "  jumpybrain process --root <memory-root> --mode lint|synthesize --topic \"...\" --apply",
    "  cat memory.md | jumpybrain remember --root <memory-root> --type finding --title \"...\"",
    "  cat wrapup.md | jumpybrain wrapup --root <memory-root> --title \"...\" --topic \"...\"",
  ].join("\n");
}

function runUsage(): string {
  return [
    "Usage:",
    "  jumpybrain run memory:status [--root <memory-root>] [--json]",
    "  jumpybrain run memory:remember --type finding --title \"...\" [--root <memory-root>]",
    "  jumpybrain run memory:recall --topic \"...\" [--root <memory-root>] [--limit 5] [--depth shallow|normal|deep]",
    "  jumpybrain run memory:recall --query \"...\" [--root <memory-root>] [--limit 10] [--depth shallow|normal|deep] [--json]",
    "  jumpybrain run memory:process --mode lint|synthesize --topic \"...\" [--root <memory-root>] --apply",
    "  cat memory.md | jumpybrain run memory:remember --type finding --title \"...\" [--root <memory-root>]",
    "  cat wrapup.md | jumpybrain run memory:wrapup --title \"...\" --topic \"...\" [--root <memory-root>]",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
