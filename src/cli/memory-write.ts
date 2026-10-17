import { failedCreationIndex, pendingCreationIndex } from "../runtime/index.js";
import type { MemoryWriteResult } from "../types.js";
import { stringArg, stringListArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import type { CommandMemoryTarget } from "./memory-target.js";
import { readStdin } from "./stdin.js";

export async function rememberFromStdin(
  target: CommandMemoryTarget,
  localMemory: LocalMemoryTransport,
  args: ParsedCliArgs,
): Promise<MemoryWriteResult & Record<string, unknown>> {
  const type = stringArg(args, "type", "note");
  const title = stringArg(args, "title");
  const dreamArg = args.dream;
  if (dreamArg !== undefined && dreamArg !== true && dreamArg !== "true" && dreamArg !== "false") {
    throw new Error("--dream must be a boolean flag or true/false.");
  }
  const dream = dreamArg === undefined ? undefined : dreamArg === true || dreamArg === "true";
  const body = readStdin();
  const draft = { type, title, body, tags: stringListArg(args, "tag"),
    ...(args.date === undefined ? {} : { date: stringArg(args, "date") }),
    ...(dream === undefined ? {} : { dream }) };
  if (target.kind === "remote") {
    const result = await target.memory.rememberMemory(draft);
    return { ...pendingCreationIndex(), ...result };
  }
  const result = await localMemory.rememberMemory(target.root, draft);
  // Publication errors above must propagate. Only derived indexing is partial success.
  try {
    return { ...await localMemory.ensureSavedMemoryIndexed(target.root, result) };
  } catch (error) {
    return { ...result, ...failedCreationIndex(error) };
  }
}
