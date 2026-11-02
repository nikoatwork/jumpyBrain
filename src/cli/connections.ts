import os from "node:os";
import path from "node:path";
import type { ParsedCliArgs } from "./args.js";
import { liveCompanion } from "./companion.js";

// App profile control only. Never open the store offline or select a CLI memory target.
export async function connectionsCli(args: ParsedCliArgs): Promise<void> {
  const directory = path.resolve(typeof args.directory === "string" ? args.directory : path.join(os.homedir(), "Library/Application Support/jumpyBrain Companion"));
  const companion = await liveCompanion(directory, "connection control");
  if (!companion) throw new Error("No running companion. Open the Mac app and retry. CLI-only installs use --root or JUMPYBRAIN_MEMORY_ROOT.");
  let result;
  try {
    result = await companion.request("/companion/connections", args._[1] === "list" ? undefined : {
      action: args._[1], revision: Number(args.revision),
      ...(args._[1] === "add" ? { profile: { name: args.name, kind: "local", root: path.resolve(String(args.root)) } } : { id: args.id }),
    });
  } catch (error) {
    const { status, code } = error as { status?: number; code?: string };
    if (code === "ACTIVE_PROFILE") throw new Error("Switch away from the active app connection before removing it.");
    if (code === "DUPLICATE_DESTINATION") throw new Error("A connection already uses this canonical destination.");
    if (code === "INVALID_ROOT") throw new Error("Use a brain with a regular jumpybrain.json; add never initializes it.");
    if (status === 409) throw new Error("Revision changed or save/switch is blocked. Resolve drafts, run connections list, then retry deliberately.");
    throw error;
  }
  if (!args.json) console.log(`App connections (revision ${result.revision}; CLI target unchanged):`);
  console.log(JSON.stringify(result, null, 2));
}
