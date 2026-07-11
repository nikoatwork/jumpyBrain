import { readFile } from "node:fs/promises";
import { buildCanonicalLinkTargetLookup, extractCanonicalLinks, readMarkdownDocuments, resolveCanonicalLinkTarget, resolveMemoryRoot } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot, memoryRootStatus, resolveIndexRoot } from "../../core/memory-root/index.js";
import { bucketFor, firstString, stringValue, tagsValue, tryLoadManifest } from "./document-fields.js";
import type {
  MarkdownDocument,
  MemoryConnectionEdge,
  MemoryConnectionSummary,
  MemoryOverviewBucketSummary,
  MemoryOverviewCount,
  MemoryOverviewDocumentSummary,
  MemoryOverviewIndexState,
  MemoryOverviewOptions,
  MemoryOverviewResult,
} from "../../types.js";

const DEFAULT_LIMIT = 10;

export async function overviewMemory(rootArg: string, options: MemoryOverviewOptions = {}): Promise<MemoryOverviewResult> {
  const root = await resolveMemoryRoot(rootArg);
  const status = await memoryRootStatus(root);
  if (status.compatible) await assertCompatibleMemoryRoot(root);
  const sourceRoot = status.compatible ? await resolveIndexRoot(root) : root;
  const documents = status.compatible ? await readMarkdownDocuments(sourceRoot) : [];
  const manifest = await tryLoadManifest(root);
  const indexedFiles = new Set(manifest?.documents.map((document) => document.relativePath) ?? []);
  const summaries = documents.map((document) => summarizeDocument(document, indexedFiles));
  const warnings = overviewWarnings({ compatible: status.compatible, documents, manifest, indexedFiles });
  const index = overviewIndexState(documents, manifest, indexedFiles);
  const timestamps = summaries.flatMap((summary) => [summary.updatedAt, summary.createdAt]).filter(isIsoLike).sort();
  const limit = normalizeLimit(options.limit);

  return {
    root,
    canonical: "markdown",
    initialized: status.initialized,
    compatible: status.compatible,
    configFile: status.configFile,
    schemaVersion: status.schemaVersion,
    documents: documents.length,
    buckets: bucketSummaries(summaries),
    types: countBy(summaries.map((summary) => summary.type).filter(isNonEmptyString)),
    tags: countBy(summaries.flatMap((summary) => summary.tags)),
    oldest: timestamps[0],
    newest: timestamps.at(-1),
    ...(options.showFiles ? { files: summaries.slice(0, limit) } : {}),
    index,
    warnings,
    ...(options.connections ? { connections: await connectionSummary(sourceRoot, documents) } : {}),
  };
}

function summarizeDocument(document: MarkdownDocument, indexedFiles: Set<string>): MemoryOverviewDocumentSummary {
  const frontmatter = document.frontmatter;
  return {
    file: document.relativePath,
    bucket: bucketFor(document.relativePath),
    title: stringValue(frontmatter.title),
    type: stringValue(frontmatter.type),
    tags: tagsValue(frontmatter),
    createdAt: firstString(frontmatter.created_at, frontmatter.createdAt, frontmatter.date),
    updatedAt: firstString(frontmatter.updated_at, frontmatter.updatedAt),
    indexed: indexedFiles.has(document.relativePath),
  };
}

function bucketSummaries(files: MemoryOverviewDocumentSummary[]): MemoryOverviewBucketSummary[] {
  const byBucket = new Map<string, MemoryOverviewDocumentSummary[]>();
  for (const file of files) {
    const bucket = byBucket.get(file.bucket) ?? [];
    bucket.push(file);
    byBucket.set(file.bucket, bucket);
  }

  return [...byBucket.entries()]
    .map(([bucket, bucketFiles]) => {
      const timestamps = bucketFiles.flatMap((file) => [file.updatedAt, file.createdAt]).filter(isIsoLike).sort();
      return {
        bucket,
        count: bucketFiles.length,
        oldest: timestamps[0],
        newest: timestamps.at(-1),
      };
    })
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function overviewIndexState(documents: MarkdownDocument[], manifest: Awaited<ReturnType<typeof tryLoadManifest>>, indexedFiles: Set<string>): MemoryOverviewIndexState {
  const unindexedDocuments = documents.filter((document) => !indexedFiles.has(document.relativePath)).length;
  return {
    present: Boolean(manifest),
    stale: !manifest || unindexedDocuments > 0 || (manifest.documents.length !== documents.length),
    indexedDocuments: manifest?.documents.length ?? 0,
    generatedAt: manifest?.generatedAt,
    qmdCollection: manifest?.qmdCollection,
    unindexedDocuments,
  };
}

function overviewWarnings(options: {
  compatible: boolean;
  documents: MarkdownDocument[];
  manifest: Awaited<ReturnType<typeof tryLoadManifest>>;
  indexedFiles: Set<string>;
}): string[] {
  const warnings: string[] = [];
  if (!options.compatible) warnings.push("Memory root is not compatible with this jumpyBrain CLI.");
  if (!options.manifest) warnings.push("Memory index manifest is missing; run `jumpybrain index`.");
  if (options.documents.length === 0) warnings.push("No canonical Markdown memory documents found.");
  const unindexed = options.documents.filter((document) => !options.indexedFiles.has(document.relativePath)).length;
  if (options.manifest && unindexed > 0) warnings.push(`${unindexed} canonical Markdown document${unindexed === 1 ? " is" : "s are"} not in the latest index manifest; run \`jumpybrain index\`.`);
  if (options.manifest && options.manifest.documents.length > options.documents.length) warnings.push("Index manifest references more documents than the canonical Markdown scan found; run `jumpybrain index`.");
  return warnings;
}

async function connectionSummary(root: string, documents: MarkdownDocument[]): Promise<MemoryConnectionSummary> {
  const lookup = buildCanonicalLinkTargetLookup(documents);
  const edgeCounts = new Map<string, MemoryConnectionEdge>();
  let unresolvedLinks = 0;

  for (const document of documents) {
    const content = await readFile(document.absolutePath, "utf8");
    for (const reference of extractCanonicalLinks(content)) {
      const target = resolveCanonicalLinkTarget(document.relativePath, reference.target, reference.kind, lookup);
      if (!target || target === document.relativePath) {
        unresolvedLinks += target ? 0 : 1;
        continue;
      }
      const key = `${document.relativePath}\0${target}\0${reference.kind}`;
      const existing = edgeCounts.get(key);
      if (existing) existing.count += 1;
      else edgeCounts.set(key, { source: document.relativePath, target, kind: reference.kind, count: 1 });
    }
  }

  const edges = [...edgeCounts.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.kind.localeCompare(b.kind));
  const degree = new Map(documents.map((document) => [document.relativePath, 0]));
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sourceNeighbors = neighbors.get(edge.source) ?? new Set<string>();
    sourceNeighbors.add(edge.target);
    neighbors.set(edge.source, sourceNeighbors);
    const targetNeighbors = neighbors.get(edge.target) ?? new Set<string>();
    targetNeighbors.add(edge.source);
    neighbors.set(edge.target, targetNeighbors);
  }
  for (const [file, fileNeighbors] of neighbors) degree.set(file, fileNeighbors.size);

  const topHubs = [...degree.entries()]
    .filter(([, value]) => value > 0)
    .map(([file, value]) => ({ file, degree: value }))
    .sort((a, b) => b.degree - a.degree || a.file.localeCompare(b.file))
    .slice(0, 5);

  return {
    nodes: documents.length,
    edgeCount: edges.length,
    markdownLinks: edges.filter((edge) => edge.kind === "markdown-link").length,
    wikiLinks: edges.filter((edge) => edge.kind === "wiki-link").length,
    unresolvedLinks,
    orphans: [...degree.values()].filter((value) => value === 0).length,
    topHubs,
    edges,
  };
}

function countBy(values: string[]): MemoryOverviewCount[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function isIsoLike(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function normalizeLimit(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : DEFAULT_LIMIT;
}
