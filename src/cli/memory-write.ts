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
  const body = readStdin();
  if (target.kind === "remote") {
    const result = await target.memory.rememberMemory({ type, title, body, tags: stringListArg(args, "tag") });
    return { ...result, indexed: false };
  }
  const result = await localMemory.rememberMemory(target.root, { type, title, body, tags: stringListArg(args, "tag") });
  await localMemory.indexMemory(target.root);
  return { ...result, indexed: true };
}
