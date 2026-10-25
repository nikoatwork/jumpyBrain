import path from "node:path";
import { stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";

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
      ...("notes" in result ? [`Obsidian migration ${result.dryRun ? "dry-run" : result.applied ? "applied" : "not applied"}: ${result.notes} notes → notes; original body bytes preserved`] : [`Logseq migration ${result.dryRun ? "dry-run" : result.applied ? "applied" : "not applied"}: ${result.pages} pages → notes, ${result.journals} journals → sessions`]),
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
