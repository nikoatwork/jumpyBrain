import type { MemoryOverviewOptions, MemoryOverviewResult } from "../types.js";
import { numberArg, type ParsedCliArgs } from "./args.js";

export function overviewOptionsFromArgs(args: ParsedCliArgs): MemoryOverviewOptions {
  return {
    showFiles: Boolean(args["show-files"] || args.showFiles),
    connections: Boolean(args.connections),
    limit: numberArg(args, "limit", 10),
  };
}

export function formatMemoryOverview(result: MemoryOverviewResult, options: MemoryOverviewOptions = {}): string {
  const lines: string[] = [];
  lines.push(`Memory root: ${result.root}`);
  const schema = result.schemaVersion ? `schema v${result.schemaVersion}` : "schema unknown";
  const indexState = result.index.present ? (result.index.stale ? "index stale" : "index fresh") : "index missing";
  lines.push(`State: ${result.initialized ? "initialized" : "uninitialized"}, ${schema}, ${indexState}, ${result.index.indexedDocuments} indexed / ${result.documents} canonical docs`);
  lines.push("");
  lines.push(`all memory (${result.documents} docs)`);

  const buckets = result.buckets;
  if (buckets.length === 0) {
    lines.push("└── (empty)");
  } else {
    buckets.forEach((bucket, index) => {
      const branch = index === buckets.length - 1 ? "└──" : "├──";
      lines.push(`${branch} ${bucket.bucket}/ (${bucket.count} docs${bucket.newest ? `, newest ${bucket.newest.slice(0, 10)}` : ""})`);
    });
  }

  if (options.showFiles && result.files && result.files.length > 0) {
    lines.push("");
    lines.push(`Files (showing ${result.files.length})`);
    for (const file of result.files) {
      const title = file.title ? ` — ${file.title}` : "";
      const tags = file.tags.length > 0 ? ` #${file.tags.join(" #")}` : "";
      lines.push(`- ${file.file}${title}${tags}${file.indexed ? "" : " (unindexed)"}`);
    }
  }

  if (result.tags.length > 0) {
    lines.push("");
    lines.push(`Top tags: ${result.tags.slice(0, 8).map((tag) => `${tag.name}(${tag.count})`).join(", ")}`);
  }

  if (options.connections && result.connections) {
    const connections = result.connections;
    lines.push("");
    lines.push(`Connections: ${connections.nodes} nodes, ${connections.edgeCount} explicit Markdown/wiki-link edges (${connections.markdownLinks} Markdown, ${connections.wikiLinks} wiki), ${connections.orphans} orphans`);
    if (connections.unresolvedLinks > 0) lines.push(`Unresolved links: ${connections.unresolvedLinks}`);
    if (connections.topHubs.length > 0) {
      lines.push(`Top hubs: ${connections.topHubs.map((hub) => `${hub.file} (${hub.degree})`).join(", ")}`);
    }
  }

  lines.push("");
  const indexDetails = result.index.qmdCollection
    ? `Index: qmd collection ${result.index.qmdCollection}, stale=${result.index.stale}, lastIndexedAt=${result.index.generatedAt ?? "unknown"}`
    : `Index: ${result.index.present ? "present" : "missing"}, stale=${result.index.stale}`;
  lines.push(indexDetails);

  if (result.warnings.length > 0) {
    lines.push(`Warnings: ${result.warnings.join(" ")}`);
  }

  if (!options.showFiles) {
    lines.push("Tip: add --show-files to list memory files; use show/read by id for full Markdown content.");
  }

  return lines.join("\n");
}
