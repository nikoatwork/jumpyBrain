import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RemoteMemoryTransport } from "../adapters/http-client/index.js";
import type { DreamAbandonResult, DreamBatch, DreamCompleteRequest, DreamCompleteResult, DreamCreateRequest, DreamStatus } from "../types.js";
import { numberArg, stringArg, type ParsedCliArgs } from "./args.js";
import type { LocalMemoryTransport } from "./local-transport.js";
import { commandMemoryTarget, type CommandMemoryTarget } from "./memory-target.js";

type DreamTransport = {
  kind: "local" | "remote";
  root?: string;
  getDreamStatus(): Promise<DreamStatus>;
  createDreamBatch(request?: DreamCreateRequest): Promise<DreamBatch>;
  completeDreamBatch(request: DreamCompleteRequest): Promise<DreamCompleteResult>;
  abandonDreamBatch(batchId: string, summary?: string): Promise<DreamAbandonResult>;
  updateMemoryDocument(id: string, content: string, options: { ifMatch?: string; contentHash?: string }): Promise<unknown>;
};

export async function dreamCli(args: ParsedCliArgs, localMemory: LocalMemoryTransport): Promise<void> {
  const target = await commandMemoryTarget(args, localMemory);
  const dream = dreamTransport(target, localMemory);

  if (args["apply-manifest"]) {
    const result = await applyDreamManifest(dream, stringArg(args, "apply-manifest"));
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatCompleteResult(result));
    return;
  }

  if (args.status) {
    const status = await dream.getDreamStatus();
    if (args.json) console.log(JSON.stringify(status, null, 2));
    else console.log(formatDreamStatus(status));
    return;
  }

  if (args.complete) {
    const batchId = stringArg(args, "complete");
    const result = await dream.completeDreamBatch({ batchId, summary: stringArg(args, "summary", false) || undefined });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatCompleteResult(result));
    return;
  }

  if (args.abandon) {
    const result = await dream.abandonDreamBatch(stringArg(args, "abandon"), stringArg(args, "summary", false) || undefined);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(formatAbandonResult(result));
    return;
  }

  const batch = await dream.createDreamBatch({
    maxFiles: numberArg(args, "max-files", 0) || undefined,
    bytesPerFile: numberArg(args, "bytes-per-file", 0) || undefined,
    maxTotalBytes: numberArg(args, "max-total-bytes", 0) || undefined,
    force: Boolean(args.force),
  });

  const out = stringArg(args, "out", false).trim();
  if (out) await writeFile(out, `${JSON.stringify(batch, null, 2)}\n`, "utf8");

  if (args.json) console.log(JSON.stringify(batch, null, 2));
  else console.log(formatDreamBatch(batch, out || undefined));
}

function dreamTransport(target: CommandMemoryTarget, localMemory: LocalMemoryTransport): DreamTransport {
  if (target.kind === "remote") return remoteDreamTransport(target.memory);
  const root = target.root;
  return {
    kind: "local",
    root,
    getDreamStatus: () => localMemory.getDreamStatus(root),
    createDreamBatch: (request) => localMemory.createDreamBatch(root, request),
    completeDreamBatch: (request) => localMemory.completeDreamBatch(root, request),
    abandonDreamBatch: (batchId, summary) => localMemory.abandonDreamBatch(root, batchId, summary),
    updateMemoryDocument: (id, content, options) => localMemory.updateMemoryDocument(root, id, content, options),
  };
}

function remoteDreamTransport(memory: RemoteMemoryTransport): DreamTransport {
  return {
    kind: "remote",
    getDreamStatus: () => memory.getDreamStatus(),
    createDreamBatch: (request) => memory.createDreamBatch(request),
    completeDreamBatch: (request) => memory.completeDreamBatch(request),
    abandonDreamBatch: (batchId, summary) => memory.abandonDreamBatch(batchId, summary),
    updateMemoryDocument: (id, content, options) => memory.updateMemoryDocument(id, content, { ifMatch: options.ifMatch ?? options.contentHash ?? "" }),
  };
}

async function applyDreamManifest(memory: DreamTransport, manifestPath: string): Promise<DreamCompleteResult> {
  const absoluteManifest = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(absoluteManifest, "utf8")) as {
    batchId?: string;
    summary?: string;
    updates?: Array<{ id?: string; ifMatch?: string; contentFile?: string }>;
    skippedDocumentIds?: string[];
  };
  if (!manifest.batchId) throw new Error("Dream apply manifest requires batchId.");
  const updates = Array.isArray(manifest.updates) ? manifest.updates : [];
  const updatedDocumentIds: string[] = [];
  for (const update of updates) {
    if (!update.id || !update.ifMatch || !update.contentFile) throw new Error("Each dream apply update requires id, ifMatch, and contentFile.");
    if (path.isAbsolute(update.contentFile) || update.contentFile.split(/[\\/]+/).includes("..")) {
      throw new Error("Dream apply contentFile paths must be relative to the manifest and must not contain '..'.");
    }
    const contentPath = path.resolve(path.dirname(absoluteManifest), update.contentFile);
    const content = await readFile(contentPath, "utf8");
    await memory.updateMemoryDocument(update.id, content, { ifMatch: update.ifMatch });
    updatedDocumentIds.push(update.id);
  }
  return memory.completeDreamBatch({
    batchId: manifest.batchId,
    summary: manifest.summary,
    updatedDocumentIds,
    skippedDocumentIds: Array.isArray(manifest.skippedDocumentIds) ? manifest.skippedDocumentIds.map(String) : [],
  });
}

function formatDreamStatus(status: DreamStatus): string {
  const label = targetLabel(status.target);
  const lines = [
    `${label} dream status`,
    `Root: ${status.root}`,
    `Available: ${status.available ? "yes" : "no"}`,
    `Open batch: ${status.openBatch ? `${status.openBatch.batchId} (${status.openBatch.fileCount} files${status.openBatch.hasMore ? ", more pending" : ""})` : "none"}`,
    `Last completed: ${status.lastCompletedBatch ? status.lastCompletedBatch.batchId : "none"}`,
    `Defaults: maxFiles=${status.defaults.maxFiles}, bytesPerFile=${status.defaults.bytesPerFile}, maxTotalBytes=${status.defaults.maxTotalBytes}, lookbackHours=${status.defaults.lookbackHours}`,
  ];
  return lines.join("\n");
}

function formatDreamBatch(batch: DreamBatch, out?: string): string {
  const label = targetLabel(batch.target);
  const lines = [
    `${label} dream batch: ${batch.batchId}${batch.resumed ? " (resumed open batch)" : ""}`,
    `Root: ${batch.root}`,
    `Status: ${batch.status}`,
    `Files: ${batch.files.length}${batch.hasMore ? " (more pending)" : ""}`,
    `Cursor: retrieving this batch does not mark it dreamt; only --complete advances dream state.`,
  ];
  if (out) lines.push(`Full context written to: ${out}`);
  else lines.push("Tip: use --out dream-batch.json for full context without filling stdout.");
  for (const file of batch.files) lines.push(`- ${file.file} (${file.id}, ${file.contentHash}${file.truncated ? ", truncated" : ""})`);
  lines.push("", "Local-agent instructions:");
  for (const instruction of batch.instructions) lines.push(`- ${instruction}`);
  lines.push("", "Warnings:");
  for (const warning of batch.warnings) lines.push(`- ${warning}`);
  lines.push("", `When done: jumpybrain dream ${completionTargetHint(batch)} --complete ${batch.batchId} --summary "..."`);
  return lines.join("\n");
}

function formatCompleteResult(result: DreamCompleteResult): string {
  return [
    `Completed dream batch: ${result.batchId}`,
    `Cursor advanced: ${result.advancedCursor ? `${result.advancedCursor.mtime} ${result.advancedCursor.file}` : "none"}`,
    `Updated documents: ${result.updatedDocumentIds.length}`,
    `Skipped documents: ${result.skippedDocumentIds.length}`,
  ].join("\n");
}

function formatAbandonResult(result: DreamAbandonResult): string {
  return [`Abandoned dream batch: ${result.batchId}`, "Cursor advanced: no"].join("\n");
}

function targetLabel(target: "local" | "remote"): string {
  return target === "remote" ? "Remote" : "Local";
}

function completionTargetHint(batch: DreamBatch): string {
  return batch.target === "remote" ? "--target-url <url>" : `--root ${JSON.stringify(batch.root)}`;
}
