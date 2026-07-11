import type { MemoryDocumentReadResult, MemoryDocumentUpdateResult } from "../types.js";
import { stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import type { CommandMemoryTarget } from "./memory-target.js";
import { readStdin } from "./stdin.js";

export async function showMemoryDocumentFromArgs(
  target: CommandMemoryTarget,
  localMemory: LocalMemoryTransport,
  args: ParsedCliArgs,
): Promise<void> {
  const id = stringArg(args, "id");
  const result = target.kind === "remote"
    ? await target.memory.readMemoryDocument(id)
    : await localMemory.readMemoryDocument(target.root, id);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  writeHumanDocumentRead(result);
}

export async function updateMemoryDocumentFromArgs(
  target: CommandMemoryTarget,
  localMemory: LocalMemoryTransport,
  args: ParsedCliArgs,
): Promise<void> {
  const id = stringArg(args, "id");
  const ifMatch = stringArg(args, "if-match", false).trim();
  if (!ifMatch) {
    throw new Error("jumpybrain update requires --if-match <contentHash> from `jumpybrain show`. Re-run `jumpybrain show` before retrying.");
  }

  const content = readStdin();
  try {
    const result = target.kind === "remote"
      ? await target.memory.updateMemoryDocument(id, content, { ifMatch })
      : await localMemory.updateMemoryDocument(target.root, id, content, { ifMatch });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    writeHumanDocumentUpdate(result);
  } catch (error) {
    throw rewriteUpdatePreconditionError(error, id);
  }
}

function writeHumanDocumentRead(result: MemoryDocumentReadResult): void {
  process.stdout.write([
    `ID: ${result.id}`,
    `File: ${result.file}`,
    `Content-Hash: ${result.contentHash}`,
    "",
  ].join("\n"));
  process.stdout.write("\n");
  process.stdout.write(result.content);
}

function writeHumanDocumentUpdate(result: MemoryDocumentUpdateResult): void {
  console.log(`Updated memory document: ${result.file}`);
  console.log(`ID: ${result.id}`);
  console.log(`Old-Content-Hash: ${result.oldContentHash}`);
  console.log(`New-Content-Hash: ${result.newContentHash}`);
  console.log(`Updated-At: ${result.updatedAt}`);
  console.log(`Indexed: ${result.indexed ? "yes" : "no"}`);
  if (result.index?.stale) console.log("Index: stale; run `jumpybrain index` before recall/search if you need fresh retrieval.");
}

function rewriteUpdatePreconditionError(error: unknown, id: string): Error {
  if (hasEditCode(error) && error.code === "precondition_required") {
    return new Error("jumpybrain update requires --if-match <contentHash> from `jumpybrain show`. Re-run `jumpybrain show` before retrying.");
  }
  if (hasEditCode(error) && error.code === "precondition_failed") {
    return new Error(`Document content hash is stale for ${id}. Re-run \`jumpybrain show --id ${id}\` and retry with the new Content-Hash.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

function hasEditCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string";
}
