import path from "node:path";
import { stringArg, withoutRoot, type ParsedCliArgs } from "./args.js";
import { createLocalMemoryTransport, type LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget } from "./memory-target.js";
import { applyRemoteMigration, compareMemorySources, localInventorySource, planRemoteMigration, SYNC_STATUSES, type SyncComparison, type SyncReport, type SyncStatus } from "../runtime/index.js";

/** Local-only, body-free presentation over the migration app seam. */
export async function migrateCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  const obsidian = args._[1] === "obsidian";
  if (args["target-url"] !== undefined || args["remote-url"] !== undefined) {
    throw new Error("Migration is local-only; remote target flags are not supported.");
  }
  const source = stringArg(args, "source");
  const root = stringArg(args, "root");
  const result = obsidian ? await localMemory.migrateObsidian(source, root, { apply: args.apply === true, failOnConflict: args["fail-on-conflict"] === true }) : await localMemory.migrateLogseq(source, root, {
    apply: args.apply === true,
    failOnConflict: args["fail-on-conflict"] === true,
    ...(args["body-format"] !== undefined ? { bodyFormat: stringArg(args, "body-format") as "readable" | "preserve" } : {}),
  });
  if (args.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const lines = [
      ...("notes" in result ? [`Obsidian migration ${result.dryRun ? "dry-run" : result.applied ? "applied" : "not applied"}: ${result.notes} notes → notes/; Markdown folder structure, filenames and original body bytes preserved`] : [`Logseq migration ${result.dryRun ? "dry-run" : result.applied ? "applied" : "not applied"}: ${result.pages} pages → notes, ${result.journals} journals → sessions`]),
      `Actions: create ${result.created}, overwrite ${result.overwritten}, delete ${result.deleted}, unchanged ${result.unchanged}`,
      ...("conversion" in result ? [`Body format: ${result.conversion.bodyFormat} v${result.conversion.bodyVersion}; changed ${result.conversion.changedDocuments}, preserved ${result.conversion.preservedDocuments}, with limitations ${result.conversion.unsupportedDocuments}; outline markers removed ${result.conversion.removedOutlineMarkers}, nested blocks retained ${result.conversion.retainedNestedBlocks}`] : []),
      `Destination: ${result.root}`,
      `Documents: ${result.sourceDocuments} source, ${result.outputDocuments} output; bytes: ${result.sourceBytes} source, ${result.outputBytes} output`,
      obsidian ? "Warning: Hidden support, attachments and non-Markdown files are omitted. References are not rewritten." : "Warning: Markdown only; assets, configuration, backups, root Markdown, and other non-Markdown files are omitted. References are not rewritten.",
      `Warning: ${obsidian ? "Obsidian" : "Logseq"} is authoritative (source wins). Mapped destination edits are overwritten by default; removed sources delete their manifest-owned outputs. This is not a merge.`,
      ...result.warnings.map((warning) => `Warning: ${warning}`),
      ...result.errors.map((error) => `Error: ${error}`),
    ];
    if (result.dryRun) {
      lines.push(`Apply: jumpybrain migrate ${obsidian ? "obsidian" : "logseq"} --source ${shellQuote(path.resolve(source))} --root ${shellQuote(result.root)}${"conversion" in result ? ` --body-format ${result.conversion.bodyFormat}` : ""} --apply${args["fail-on-conflict"] === true ? " --fail-on-conflict" : ""}`);
    }
    if (result.applied) {
      lines.push(`Manifest: ${result.manifest}`, "Index not rebuilt. Run separately:", `jumpybrain index --root ${shellQuote(result.root)}`);
    }
    console.log(lines.join("\n"));
  }
  if (result.errors.length > 0) process.exitCode = 1;
}

// POSIX-shell quoting, including embedded apostrophes; never execute the hint.
function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  same: "same", metadata: "same body, metadata differs", "local-newer": "local newer", "remote-newer": "remote newer",
  differs: "both changed, order unknown", "local-only": "local only", "remote-only": "remote only",
};
const oneLine = (value: unknown) => String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, " ");
const label = (item: SyncComparison) => item.kind === "drawing" ? `drawings/${item.name}.excalidraw`
  : item.moved ? `${item.local!.file} → ${item.remote!.file}` : (item.local ?? item.remote)!.file;

/** `diff` and `migrate remote`: a local root (--root) against a server (--target-url). Local side is read only. */
export async function syncCli(args: ParsedCliArgs): Promise<void> {
  const root = path.resolve(String(args.root));
  const target = await commandMemoryTarget(withoutRoot(args), createLocalMemoryTransport());
  if (target.kind !== "remote") throw new Error("--target-url is required.");
  const report = await compareMemorySources(localInventorySource(root), {
    listFiles: () => target.memory.listMemoryFiles({ hashes: true }),
    listDrawings: () => target.memory.listDrawings(),
    readDrawing: name => target.memory.readDrawing(name),
  });
  const brains = { local: root, remote: target.url };

  if (args._[0] === "diff") {
    if (args.json) { console.log(JSON.stringify({ ...brains, ...report }, null, 2)); return; }
    console.log(`Local: ${oneLine(root)}\nRemote: ${oneLine(target.url)}`);
    console.log(summary(report));
    const shown = report.items.filter(item => args.all === true || !["same", "metadata"].includes(item.status));
    for (const item of shown) console.log(`  ${STATUS_TEXT[item.status].padEnd(28)} ${oneLine(label(item))}${item.kind === "note" && item.title ? `  (${oneLine(item.title)})` : ""}`);
    if (!shown.length) console.log("No differences in note bodies or drawings.");
    else if (args.all !== true && report.counts.same + report.counts.metadata) console.log(`(${report.counts.same + report.counts.metadata} matching items hidden; --all lists them.)`);
    return;
  }

  const plan = planRemoteMigration(report);
  const apply = args.apply === true;
  const outcomes = apply ? await applyRemoteMigration(root, plan, report, {
    copyMemoryDocument: (file, content) => target.memory.copyMemoryDocument(file, content),
    updateMemoryDocument: (id, content, options) => target.memory.updateMemoryDocument(id, content, options),
    createDrawing: (name, scene) => target.memory.createDrawing(name, scene),
    saveDrawing: (name, scene, ifMatch) => target.memory.saveDrawing(name, scene, ifMatch),
  }) : undefined;
  const failed = outcomes?.some(outcome => outcome.outcome === "failed") ?? false;
  if (failed) process.exitCode = 1;
  if (args.json) { console.log(JSON.stringify({ ...brains, dryRun: !apply, ...plan, ...(outcomes ? { outcomes } : {}), counts: report.counts }, null, 2)); return; }
  console.log(`Migration ${apply ? "applied" : "dry run"}: ${oneLine(root)} → ${oneLine(target.url)}`);
  console.log(summary(report));
  const describe = (action: (typeof plan.actions)[number]) => action.action === "create-note" ? `copy note ${action.file}`
    : action.action === "update-note" ? `update note ${action.file} (local is newer)`
    : action.action === "create-drawing" ? `copy drawing ${action.name}` : `update drawing ${action.name} (local is newer)`;
  if (!plan.actions.length) console.log("Nothing to copy.");
  for (const [index, action] of plan.actions.entries()) {
    const outcome = outcomes?.[index];
    console.log(`  ${outcome ? outcome.outcome.padEnd(8) : "would".padEnd(8)} ${oneLine(describe(action))}${outcome?.reason ? `: ${oneLine(outcome.reason)}` : ""}`);
  }
  for (const skip of plan.skipped) console.log(`  ${"skip".padEnd(8)} ${oneLine(skip.item)}: ${skip.reason}`);
  console.log(apply
    ? "Never deleted or overwrote newer server work. Run jumpybrain diff again to check the result; the server indexes copied notes on its next refresh."
    : `Copies only what is missing or newer locally; never deletes. Apply: jumpybrain migrate remote --root ${shellQuote(root)} --target-url ${shellQuote(target.url)} --apply`);
}

function summary(report: SyncReport): string {
  return "Summary: " + SYNC_STATUSES.filter(status => report.counts[status]).map(status => `${report.counts[status]} ${STATUS_TEXT[status]}`).join(", ") + (report.items.length ? "" : "both brains are empty");
}
