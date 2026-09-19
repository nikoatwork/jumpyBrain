import path from "node:path";
import { stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";

/** Local-only, body-free presentation over the migration app seam. */
export async function migrateCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  if (args["target-url"] !== undefined || args["remote-url"] !== undefined) {
    throw new Error("Logseq migration is local-only; remote target flags are not supported.");
  }
  const source = stringArg(args, "source");
  const root = stringArg(args, "root");
  const result = await localMemory.migrateLogseq(source, root, {
    apply: args.apply === true,
    failOnConflict: args["fail-on-conflict"] === true,
  });
  if (args.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const lines = [
      `Logseq migration ${result.dryRun ? "dry-run" : result.applied ? "applied" : "not applied"}: ${result.pages} pages → notes, ${result.journals} journals → sessions`,
      `Actions: create ${result.created}, overwrite ${result.overwritten}, delete ${result.deleted}, unchanged ${result.unchanged}`,
      `Destination: ${result.root}`,
      `Documents: ${result.sourceDocuments} source, ${result.outputDocuments} output; bytes: ${result.sourceBytes} source, ${result.outputBytes} output`,
      "Warning: Markdown only; assets, configuration, backups, root Markdown, and other non-Markdown files are omitted. References are not rewritten.",
      "Warning: Logseq is authoritative (source wins). Mapped destination edits are overwritten by default; removed sources delete their manifest-owned outputs. This is not a merge.",
      ...result.warnings.map((warning) => `Warning: ${warning}`),
      ...result.errors.map((error) => `Error: ${error}`),
    ];
    if (result.dryRun) {
      lines.push(`Apply: jumpybrain migrate logseq --source ${shellQuote(path.resolve(source))} --root ${shellQuote(result.root)} --apply${args["fail-on-conflict"] === true ? " --fail-on-conflict" : ""}`);
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
