import { liveCompanion } from "./companion.js";
import os from "node:os";
import path from "node:path";
import type { ParsedCliArgs } from "./args.js";
import { extensionsUsage } from "./usage.js";

export async function extensionsCli(args: ParsedCliArgs): Promise<void> {
  if (args.help) { console.log(extensionsUsage()); return; }
  const supplied = typeof args.directory === "string" ? args.directory : path.join(os.homedir(), "Library/Application Support/jumpyBrain Companion/extensions");
  const directory = path.resolve(supplied === "~" ? os.homedir() : supplied.startsWith("~/") ? path.join(os.homedir(), supplied.slice(2)) : supplied);
  const command = args._[1]!;
  if (command === "check") {
    const manager = await import("../app/extensions/index.js");
    const source = String(args.source);
    try {
      const result = await manager.checkExtension(path.resolve(source.startsWith("~/") ? path.join(os.homedir(), source.slice(2)) : source));
      console.log(args.json ? JSON.stringify(result) : "Extension compilation passed. No package code was executed.");
    } catch (error) {
      const diagnostics = error && typeof error === "object" && "localDiagnostics" in error ? error.localDiagnostics as Array<{ file?: string; line?: number; column?: number; reason: string }> : [];
      const message = error instanceof Error ? error.message : "Extension check failed.";
      if (args.json) console.log(JSON.stringify({ ok: false, error: message, diagnostics }));
      else console.error([message, ...(diagnostics ?? []).map(item => `${item.file ?? "package"}${item.line ? `:${item.line}:${item.column}` : ""}: ${item.reason}`)].join("\n"));
      process.exitCode = 1;
    }
    return;
  }
  const companion = await liveCompanion(path.dirname(directory));
  if (companion && path.basename(directory) !== "extensions") throw new Error("Companion control descriptor does not match this extensions directory.");
  // This app management seam prepares trusted packages, but never activates factories in the CLI.
  const manager = await import("../app/extensions/index.js");
  let result: unknown;
  if (command === "install" || command === "link") {
    const source = String(args.source);
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) throw new Error("Only local extension package paths are supported.");
    result = await manager.installExtension({ directory, source: path.resolve(source.startsWith("~/") ? path.join(os.homedir(), source.slice(2)) : source) });
    if (companion) {
      const state = await companion.request("/companion/state");
      result = await companion.request("/companion/extensions/manage", { action: "reload" }, state.generation);
    }
  } else if (companion) {
    const state = await companion.request("/companion/state");
    result = command === "list" ? await companion.request("/companion/extensions", undefined, state.generation)
      : await companion.request("/companion/extensions/manage", { action: command, ...(command === "reload" ? {} : { id: args.id }) }, state.generation);
  } else {
    result = command === "list" ? await manager.listExtensions({ directory })
      : command === "reload" ? await manager.prepareExtensions({ directory })
      : command === "remove" ? await manager.removeExtension({ directory, id: String(args.id) })
      : await manager.setExtensionEnabled({ directory, id: String(args.id), enabled: command === "enable" });
  }
  result ??= { ok: true };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Extensions ${command}: ${companion ? "active companion" : "local configuration"}`);
    console.log(JSON.stringify(result, null, 2));
  }
}
