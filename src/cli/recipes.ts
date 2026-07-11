import type { ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { runMemoryCommand, type MemoryCommand } from "./memory-commands.js";
import { runUsage } from "./usage.js";

const MEMORY_RECIPES = new Map<string, MemoryCommand>([
  ["memory:status", "status"],
  ["memory:index", "index"],
  ["memory:tree", "tree"],
  ["memory:overview", "overview"],
  ["memory:search", "search"],
  ["memory:recall", "recall"],
  ["memory:show", "show"],
  ["memory:update", "update"],
  ["memory:process", "process"],
  ["memory:remember", "remember"],
  ["memory:wrapup", "wrapup"],
]);

export async function runRecipe(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  const recipe = args._[1];
  if (!recipe) throw new Error(`Recipe is required.\n\n${runUsage()}`);
  if (recipe === "memory:note") {
    throw new Error("`jumpybrain run memory:note` was renamed to `jumpybrain run memory:remember`. Use the same flags and stdin with `memory:remember`.");
  }

  const command = MEMORY_RECIPES.get(recipe);
  if (command) {
    await runMemoryCommand(command, args, localMemory, { allowDiscovery: true });
    return;
  }

  throw new Error(`Unknown recipe '${recipe}'.\n\n${runUsage()}`);
}
