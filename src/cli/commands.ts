import { packageVersion } from "../adapters/package-info/index.js";
import { parseArgs, stringArg } from "./args.js";
import { doctorReport, formatDoctorReport } from "./doctor.js";
import { dreamCli } from "./dream.js";
import { agentInstructions } from "./instructions.js";
import { createLocalMemoryTransport } from "./local-transport.js";
import { runMemoryCommand, type MemoryCommand } from "./memory-commands.js";
import { migrateCli } from "./migrate.js";
import { runRecipe } from "./recipes.js";
import { enforceRemoteAccessPolicy } from "./remote-access-policy.js";
import { serveCli } from "./serve.js";
import { memoryRootInspectionMessage, requireLocalRoot, resolveCliTarget } from "./targets.js";
import { updateCli } from "./update.js";
import { helpForArgv, usage } from "./usage.js";

const localMemory = createLocalMemoryTransport();

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const help = helpForArgv(argv);
  if (help !== undefined) {
    console.log(help);
    return;
  }
  const args = parseArgs(argv);
  try { await dispatchCli(args); }
  catch (error) {
    let root;
    if (isMemoryCommand(args._[0]!) || args._[0] === "run") {
      try { const target = resolveCliTarget(args); if (target.kind === "local") root = target.root; } catch {}
    }
    const message = root ? memoryRootInspectionMessage(error, root) : undefined;
    if (message) throw new Error(message);
    throw error;
  }
}

async function dispatchCli(args: ReturnType<typeof parseArgs>): Promise<void> {
  const command = args._[0];

  if (command === "connections") {
    const { connectionsCli } = await import("./connections.js"); await connectionsCli(args); return;
  }

  if (command === "identity") {
    const { identityCli } = await import("./identity.js"); await identityCli(args); return;
  }

  if (command === "backend" || command === "access") {
    const { backendCli, accessCli } = await import("./backend-commands.js");
    await (command === "backend" ? backendCli : accessCli)(args); return;
  }
  if (command === "collaborate") {
    const { collaborateCli } = await import("./collaborate.js"); await enforceRemoteAccessPolicy(args); await collaborateCli(args); return;
  }

  if (command === "board") {
    if (!args.help) await enforceRemoteAccessPolicy(args);
    const { boardsCli } = await import("./boards.js");
    await boardsCli(args);
    return;
  }

  if (command === "feedback") {
    const { feedbackCli } = await import("./feedback.js");
    await feedbackCli(args);
    return;
  }

  if (command === "extensions") {
    const { extensionsCli } = await import("./extensions.js");
    await extensionsCli(args);
    return;
  }

  // Local-only migration must reject remote flags before policy or credentials.
  if (command === "migrate") {
    await migrateCli(args, localMemory);
    return;
  }

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
    if (args.check && !result.ok) process.exitCode = 1;
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
    stringArg(args, "root"); // Initialization always requires an explicit destination.
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
  return ["status", "index", "tree", "overview", "search", "recall", "show", "delete", "expand", "update", "process", "remember", "wrapup"].includes(command);
}

function looksLikeMemoryDocumentUpdate(args: ReturnType<typeof parseArgs>): boolean {
  return Boolean(args.id || args["if-match"] || args.root || args["target-url"] || args["remote-url"]);
}
