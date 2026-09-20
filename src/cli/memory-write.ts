import { stringArg, stringListArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import type { CommandMemoryTarget } from "./memory-target.js";
import { readStdin } from "./stdin.js";

export async function rememberFromStdin(
  target: CommandMemoryTarget,
  localMemory: LocalMemoryTransport,
  args: ParsedCliArgs,
): Promise<{ file: string; indexed: boolean } & Record<string, unknown>> {
  const type = stringArg(args, "type", "note");
  const title = stringArg(args, "title");
  const dreamArg = args.dream;
  if (dreamArg !== undefined && dreamArg !== true && dreamArg !== "true" && dreamArg !== "false") {
    throw new Error("--dream must be a boolean flag or true/false.");
  }
  const dream = dreamArg === undefined ? undefined : dreamArg === true || dreamArg === "true";
  const body = readStdin();
  const draft = { type, title, body, tags: stringListArg(args, "tag"), ...(dream === undefined ? {} : { dream }) };
  if (target.kind === "remote") {
    const result = await target.memory.rememberMemory(draft);
    return { ...result, indexed: false };
  }
  const result = await localMemory.rememberMemory(target.root, draft);
  await localMemory.indexMemory(target.root);
  return { ...result, indexed: true };
}
