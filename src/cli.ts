#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { formatHumanResults } from "./cli/formatting.js";
import { indexMemory, searchMemory, writeMemoryNote, writeSessionWrapup } from "./index.js";
import type { SearchResult } from "./index.js";

interface Args {
  _: string[];
  [key: string]: string | boolean | string[];
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const command = args._[0];

  if (!command || command === "help" || command === "--help") {
    console.log(usage());
    return;
  }

  if (command === "index") {
    const root = stringArg(args, "root");
    const result = await indexMemory(root);
    console.log(`Indexed ${result.documents} Markdown documents into QMD collection '${result.qmdCollection}' from ${result.root}`);
    return;
  }

  if (command === "search" || command === "recall") {
    const root = stringArg(args, "root");
    const query = stringArg(args, command === "recall" ? "topic" : "query", command === "recall" ? stringArg(args, "query", false) : undefined);
    const limit = numberArg(args, "limit", command === "recall" ? 5 : 10);
    const result = await searchMemory(root, query, limit);

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

  if (command === "note") {
    const root = stringArg(args, "root");
    const type = stringArg(args, "type", "note");
    const title = stringArg(args, "title");
    const body = readStdin();
    const result = await writeMemoryNote(root, { type, title, body, tags: stringListArg(args, "tag") });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Wrote memory note: ${result.file}`);
    }
    return;
  }

  if (command === "wrapup") {
    const root = stringArg(args, "root");
    const title = stringArg(args, "title");
    const topic = stringArg(args, "topic", false).trim();
    const limit = numberArg(args, "limit", 5);
    const body = readStdin();
    const relatedMemory = topic ? await recallRelatedMemory(root, topic, limit) : { skipped: true as const, reason: "--topic not provided" };
    const result = await writeSessionWrapup(root, { title, body, tags: stringListArg(args, "tag"), recallTopic: topic || undefined });

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

async function recallRelatedMemory(root: string, topic: string, limit: number): Promise<{ skipped: false; query: string; results: SearchResult[] }> {
  const result = await searchMemory(root, topic, limit);
  return { skipped: false, query: result.query, results: result.results };
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

function usage(): string {
  return [
    "Usage:",
    "  jumpybrain index --root <memory-root>",
    "  jumpybrain search --root <memory-root> --query \"...\" --limit 10 --json",
    "  jumpybrain recall --root <memory-root> --topic \"...\" --limit 5",
    "  cat note.md | jumpybrain note --root <memory-root> --type finding --title \"...\"",
    "  cat wrapup.md | jumpybrain wrapup --root <memory-root> --title \"...\" --topic \"...\"",
  ].join("\n");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
