import { packageVersion } from "../adapters/package-info/index.js";
import { parseArgs } from "./args.js";
import { doctorReport, formatDoctorReport } from "./doctor.js";
import { dreamCli } from "./dream.js";
import { agentInstructions } from "./instructions.js";
import { createLocalMemoryTransport } from "./local-transport.js";
import { runMemoryCommand, type MemoryCommand } from "./memory-commands.js";
import { runRecipe } from "./recipes.js";
import { enforceRemoteAccessPolicy } from "./remote-access-policy.js";
import { serveCli } from "./serve.js";
import { requireLocalRoot } from "./targets.js";
import { updateCli } from "./update.js";
import { usage } from "./usage.js";

const localMemory = createLocalMemoryTransport();

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
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

  await enforceRemoteAccessPolicy(args);

  if (command === "run") {
    await runRecipe(args, localMemory);
    return;
  }

  if (command === "instructions" || command === "agent-hint") {
    console.log(agentInstructions());
    return;
  }

  if (command === "doctor") {
    const result = await doctorReport(args, localMemory);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatDoctorReport(result));
    return;
  }

  if (command === "serve") {
    await serveCli(args);
    return;
  }

  if (command === "update" && !looksLikeMemoryDocumentUpdate(args)) {
    await updateCli(args);
    return;
  }

  if (command === "dream") {
    await dreamCli(args, localMemory);
    return;
  }

  if (command === "init") {
    const root = requireLocalRoot(args);
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

  if (isMemoryCommand(command)) {
    await runMemoryCommand(command, args, localMemory);
    return;
  }

  if (command === "note") {
    throw new Error("`jumpybrain note` was renamed to `jumpybrain remember`. Use the same flags and stdin with `jumpybrain remember`.");
  }

  throw new Error(`Unknown command '${command}'.\n\n${usage()}`);
}

function isMemoryCommand(command: string): command is MemoryCommand {
  return ["status", "index", "tree", "overview", "search", "recall", "show", "update", "process", "remember", "wrapup"].includes(command);
}

function looksLikeMemoryDocumentUpdate(args: ReturnType<typeof parseArgs>): boolean {
  return Boolean(args.id || args["if-match"] || args.root || args["target-url"] || args["remote-url"]);
}
