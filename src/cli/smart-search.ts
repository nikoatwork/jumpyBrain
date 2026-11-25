// `jumpybrain smart-search status|on|off`: the discoverable name for optional
// semantic search. It reuses the explicit consent flow of `index --setup-semantic`
// (no download without --download-model or --model-file) and `index --lexical`;
// both older spellings keep working.
import { prepareSemanticModel, removeSemanticModel, semanticModelFile, semanticModelPreset } from "../runtime/index.js";
import type { ParsedCliArgs } from "./args.js";
import { cancelOnCliSignal, type LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget } from "./memory-target.js";
import { resolveCliTarget } from "./targets.js";
import { formatMegabytes, formatSearchLine, searchModeSummary, smartSearchExplanation } from "./search-mode.js";

export async function smartSearchCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  const action = args._[1] ?? "status";
  const target = resolveCliTarget(args, { allowDiscovery: true }).kind === "remote" ? undefined : await commandMemoryTarget(args, localMemory, { allowDiscovery: true });
  if (target?.kind !== "local") throw new Error("Smart search is set up on the computer that holds the brain. Run smart-search there with --root; a remote --target-url cannot change it.");
  const root = target.root;
  const status = await localMemory.memoryRootStatus(root);
  if (!status.compatible) throw new Error(status.message ?? `Select a compatible brain before changing its search: ${root}`);
  const print = (value: unknown, lines: string[]) => console.log(args.json ? JSON.stringify(value, null, 2) : lines.join("\n"));

  if (action === "status") {
    const search = searchModeSummary(status.semanticSetup);
    const model = await semanticModelFile(status.semanticSetup?.modelId);
    print({ root, search: search?.mode ?? "keyword", ready: search?.ready ?? true, semanticSetup: status.semanticSetup, model },
      [
        `Brain: ${root}`,
        formatSearchLine(status.semanticSetup) ?? "Search: keyword search",
        model.present ? `Model on this computer: ${model.path} (${formatMegabytes(model.bytes)})` : "Model on this computer: not downloaded",
        "",
        ...(search?.mode === "smart" ? ["Turn it off: jumpybrain smart-search off [--remove-model]"] : [...smartSearchExplanation(semanticModelPreset.bytes), "", "Turn it on: jumpybrain smart-search on"]),
      ]);
    return;
  }

  if (action === "on") {
    let shown = 0;
    const onProgress = (bytes: number, total: number) => {
      const percent = Math.floor((bytes / total) * 100);
      if (percent >= shown + 10 || bytes === total) { shown = percent; console.error(`[jumpybrain] Downloading smart search model: ${percent}% of ${formatMegabytes(total)}`); }
    };
    const prepared = await cancelOnCliSignal(undefined, signal => prepareSemanticModel({ signal, onProgress, download: args["download-model"] === true, ...(args["model-file"] ? { file: String(args["model-file"]) } : {}) }));
    if (prepared.status === "consent_required") {
      const nextAction = `Review the download and model terms, then run: jumpybrain smart-search on --root ${shellQuote(root)} --download-model (or --model-file /absolute/model.gguf for bytes you already have).`;
      print({ ...prepared, state: "consent_required", root, nextAction }, [...smartSearchExplanation(prepared.downloadBytes), `Model terms: ${prepared.terms}`, "", "Nothing was downloaded.", nextAction]);
      return;
    }
    let result;
    try { result = await localMemory.indexMemory(root, { indexing: prepared.policy, ...(args.rebuild ? { rebuild: true } : {}) }); }
    catch (error) {
      // The policy is saved before indexing; a brain that was on keyword search goes back to it.
      if (status.semanticSetup?.state !== "lexical") throw error;
      await localMemory.indexMemory(root, { indexing: { mode: "lexical" } }).catch(() => undefined);
      throw new Error(`Smart search could not index this brain, so it stays on keyword search; the model stays downloaded. Retry with smart-search on (add --rebuild if the error names a model change). ${(error as Error).message}`, { cause: error });
    }
    const after = await localMemory.memoryRootStatus(root);
    print({ state: "on", root, model: { ...prepared, policy: undefined }, documents: result.documents, readiness: result.readiness, semanticSetup: after.semanticSetup },
      [`Smart search is on for ${root} (${prepared.reused ? "model already on this computer" : "model downloaded and verified"}); indexed ${result.documents} notes.`, formatSearchLine(after.semanticSetup) ?? ""]);
    return;
  }

  // off: keyword search again; the model file stays unless explicitly removed.
  const modelId = status.semanticSetup?.modelId;
  const result = await localMemory.indexMemory(root, { indexing: { mode: "lexical" } });
  const removal = args["remove-model"] === true ? await removeSemanticModel(modelId) : undefined;
  const kept = removal ? undefined : await semanticModelFile(modelId);
  print({ state: "off", root, documents: result.documents, readiness: result.readiness, model: removal ?? kept, modelRemoved: Boolean(removal?.removed) },
    [
      `Smart search is off for ${root}. Search: keyword search; indexed ${result.documents} notes.`,
      removal ? (removal.removed ? `Removed the model ${removal.path}, freeing ${formatMegabytes(removal.bytes)}. Another brain on this computer that used it needs smart-search on again.` : "No downloaded model was found to remove.")
        : kept?.present ? `The model stays at ${kept.path} (${formatMegabytes(kept.bytes)}) in case another brain on this computer uses it. Free the space with: jumpybrain smart-search off --root ${shellQuote(root)} --remove-model` : "No downloaded model is on this computer.",
    ]);
}

function shellQuote(value: string): string {
  return /^[\w./~-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}
