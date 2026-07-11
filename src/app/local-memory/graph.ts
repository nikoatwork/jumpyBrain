import { readFile, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import {
  buildCanonicalLinkTargetLookup,
  extractCanonicalLinks,
  readMarkdownDocuments,
  resolveCanonicalLinkTarget,
  resolveMemoryRoot,
} from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot, memoryRootStatus, resolveIndexRoot } from "../../core/memory-root/index.js";
import { bucketFor, firstString, stringValue, tagsValue, tryLoadManifest } from "./document-fields.js";
import type {
  Frontmatter,
  MarkdownDocument,
  MemoryConnectionEdgeKind,
  MemoryGraphEdge,
  MemoryGraphNode,
  MemoryGraphOptions,
  MemoryGraphResult,
} from "../../types.js";

const DEFAULT_GRAPH_LIMIT = 500;
const DEFAULT_LOCAL_DEPTH = 1;
const SNIPPET_LENGTH = 160;

export async function graphMemory(rootArg: string, options: MemoryGraphOptions = {}): Promise<MemoryGraphResult> {
  const root = await resolveMemoryRoot(rootArg);
  const status = await memoryRootStatus(root);
  if (status.compatible) await assertCompatibleMemoryRoot(root);
  const sourceRoot = status.compatible ? await resolveIndexRoot(root) : root;
  const documents = status.compatible ? await readMarkdownDocuments(sourceRoot) : [];
  const manifest = await tryLoadManifest(root);
  const indexedFiles = new Set(manifest?.documents.map((document) => document.relativePath) ?? []);
  const normalizedOptions = normalizeGraphOptions(options);

  const built = await buildGraph(documents, indexedFiles, normalizedOptions.includeUnresolved);
  const filtered = filterGraph(built.nodes, built.edges, normalizedOptions);

  return {
    root,
    canonical: "markdown",
    initialized: status.initialized,
    compatible: status.compatible,
    nodes: filtered.nodes,
    edges: filtered.edges,
    stats: graphStats(documents.length, filtered.nodes, filtered.edges),
    warnings: graphWarnings(status.compatible, documents.length, built.nodes.length, filtered.nodes.length, normalizedOptions.limit, Boolean(manifest)),
    options: normalizedOptions,
  };
}

interface NormalizedGraphOptions extends Required<Pick<MemoryGraphOptions, "depth" | "includeUnresolved" | "includeOrphans" | "limit">>, Omit<MemoryGraphOptions, "depth" | "includeUnresolved" | "includeOrphans" | "limit"> {
  edgeTypes?: MemoryConnectionEdgeKind[];
  tags?: string[];
}

async function buildGraph(documents: MarkdownDocument[], indexedFiles: Set<string>, includeUnresolved: boolean): Promise<{ nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] }> {
  const lookup = buildCanonicalLinkTargetLookup(documents);
  const nodeMap = new Map<string, MemoryGraphNode>();
  const edgeCounts = new Map<string, MemoryGraphEdge>();

  for (const document of documents) {
    const content = await readFile(document.absolutePath, "utf8");
    const fileStat = await stat(document.absolutePath).catch(() => undefined);
    nodeMap.set(document.relativePath, documentNode(document, content, fileStat, indexedFiles.has(document.relativePath)));
    for (const reference of extractCanonicalLinks(content)) {
      const target = resolveCanonicalLinkTarget(document.relativePath, reference.target, reference.kind, lookup);
      if (target === document.relativePath) continue;
      const targetId = target ?? unresolvedNodeId(reference.target);
      if (!target && !includeUnresolved) continue;
      if (!target && !nodeMap.has(targetId)) nodeMap.set(targetId, unresolvedNode(reference.target, targetId));
      const key = `${document.relativePath}\0${targetId}\0${reference.kind}`;
      const existing = edgeCounts.get(key);
      if (existing) existing.count += 1;
      else edgeCounts.set(key, {
        id: edgeId(document.relativePath, targetId, reference.kind),
        source: document.relativePath,
        target: targetId,
        kind: reference.kind,
        count: 1,
        resolved: Boolean(target),
        ...(target ? {} : { rawTarget: reference.target }),
      });
    }
  }

  const edges = [...edgeCounts.values()].sort(compareEdges);
  const nodes = applyDegrees([...nodeMap.values()].sort(compareNodes), edges);
  return { nodes, edges };
}

function documentNode(document: MarkdownDocument, content: string, fileStat: Stats | undefined, indexed: boolean): MemoryGraphNode {
  const frontmatter = document.frontmatter;
  return {
    id: document.relativePath,
    nodeKind: "document",
    exists: true,
    indexed,
    file: document.relativePath,
    documentId: stringValue(frontmatter.id),
    title: titleFor(document.relativePath, frontmatter),
    bucket: bucketFor(document.relativePath),
    type: stringValue(frontmatter.type) ?? bucketType(document.relativePath),
    tags: tagsValue(frontmatter),
    createdAt: firstString(frontmatter.created_at, frontmatter.createdAt, frontmatter.date),
    updatedAt: firstString(frontmatter.updated_at, frontmatter.updatedAt) ?? fileStat?.mtime.toISOString(),
    snippet: snippetFor(content, document.bodyStartLine),
    degree: 0,
    inDegree: 0,
    outDegree: 0,
  };
}

function unresolvedNode(rawTarget: string, id: string): MemoryGraphNode {
  return {
    id,
    nodeKind: "unresolved",
    exists: false,
    title: rawTarget,
    tags: [],
    degree: 0,
    inDegree: 0,
    outDegree: 0,
  };
}

function filterGraph(nodes: MemoryGraphNode[], edges: MemoryGraphEdge[], options: NormalizedGraphOptions): { nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] } {
  const edgeTypes = new Set(options.edgeTypes ?? ["markdown-link", "wiki-link"]);
  let nodeIds = new Set(nodes.map((node) => node.id));
  let filteredEdges = edges.filter((edge) => edgeTypes.has(edge.kind));

  if (!options.includeUnresolved) {
    const unresolved = new Set(nodes.filter((node) => node.nodeKind === "unresolved").map((node) => node.id));
    nodeIds = new Set([...nodeIds].filter((id) => !unresolved.has(id)));
    filteredEdges = filteredEdges.filter((edge) => !unresolved.has(edge.source) && !unresolved.has(edge.target));
  }

  nodeIds = new Set([...nodeIds].filter((id) => nodeMatchesFilters(nodes.find((node) => node.id === id)!, options)));
  filteredEdges = filteredEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));

  if (options.focus) {
    const focus = resolveFocus(options.focus, nodes, nodeIds);
    if (focus) {
      nodeIds = localGraphNodeIds(focus, filteredEdges, options.depth);
      filteredEdges = filteredEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    } else {
      nodeIds = new Set();
      filteredEdges = [];
    }
  }

  if (!options.includeOrphans) {
    const connected = new Set(filteredEdges.flatMap((edge) => [edge.source, edge.target]));
    nodeIds = new Set([...nodeIds].filter((id) => connected.has(id)));
    filteredEdges = filteredEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  }

  let filteredNodes = applyDegrees(nodes.filter((node) => nodeIds.has(node.id)).sort(compareNodes), filteredEdges);
  if (filteredNodes.length > options.limit) {
    const keep = new Set(filteredNodes.slice(0, options.limit).map((node) => node.id));
    filteredNodes = filteredNodes.filter((node) => keep.has(node.id));
    filteredEdges = filteredEdges.filter((edge) => keep.has(edge.source) && keep.has(edge.target));
    filteredNodes = applyDegrees(filteredNodes, filteredEdges);
  }

  return { nodes: filteredNodes, edges: filteredEdges.sort(compareEdges) };
}

function nodeMatchesFilters(node: MemoryGraphNode, options: NormalizedGraphOptions): boolean {
  if (options.path && node.file && !node.file.startsWith(options.path.replace(/^\/+/, ""))) return false;
  if (options.path && !node.file) return false;
  if (options.type && node.type !== options.type) return false;
  if (options.tags && options.tags.length > 0 && !options.tags.every((tag) => node.tags.includes(tag))) return false;
  if (options.query) {
    const query = options.query.toLowerCase();
    const haystack = [node.title, node.file, node.type, node.bucket, ...node.tags].filter(Boolean).join("\n").toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function resolveFocus(focus: string, nodes: MemoryGraphNode[], allowedIds: Set<string>): string | undefined {
  const normalized = normalizeFocus(focus);
  const matches = nodes.filter((node) => allowedIds.has(node.id) && (
    normalizeFocus(node.id) === normalized
    || normalizeFocus(node.file ?? "") === normalized
    || normalizeFocus(node.title) === normalized
    || normalizeFocus((node.file ?? "").replace(/\.md$/i, "")) === normalized
    || normalizeFocus(path.posix.basename((node.file ?? "").replace(/\.md$/i, ""))) === normalized
  ));
  return matches.length === 1 ? matches[0]?.id : undefined;
}

function localGraphNodeIds(focus: string, edges: MemoryGraphEdge[], depth: number): Set<string> {
  const neighbors = new Map<string, Set<string>>();
  for (const edge of edges) {
    const source = neighbors.get(edge.source) ?? new Set<string>();
    source.add(edge.target);
    neighbors.set(edge.source, source);
    const target = neighbors.get(edge.target) ?? new Set<string>();
    target.add(edge.source);
    neighbors.set(edge.target, target);
  }

  const seen = new Set([focus]);
  const queue: { id: string; distance: number }[] = [{ id: focus, distance: 0 }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.distance >= depth) continue;
    for (const next of neighbors.get(current.id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, distance: current.distance + 1 });
    }
  }
  return seen;
}

function applyDegrees(nodes: MemoryGraphNode[], edges: MemoryGraphEdge[]): MemoryGraphNode[] {
  const degree = new Map(nodes.map((node) => [node.id, { in: 0, out: 0, neighbors: new Set<string>() }]));
  for (const edge of edges) {
    const source = degree.get(edge.source);
    const target = degree.get(edge.target);
    if (source && target) {
      source.out += edge.count;
      source.neighbors.add(edge.target);
      target.in += edge.count;
      target.neighbors.add(edge.source);
    }
  }
  return nodes.map((node) => {
    const value = degree.get(node.id);
    return { ...node, inDegree: value?.in ?? 0, outDegree: value?.out ?? 0, degree: value?.neighbors.size ?? 0 };
  });
}

function graphStats(documentCount: number, nodes: MemoryGraphNode[], edges: MemoryGraphEdge[]) {
  const documentNodes = nodes.filter((node) => node.nodeKind === "document");
  return {
    documents: documentCount,
    nodes: nodes.length,
    edges: edges.length,
    markdownLinks: edges.filter((edge) => edge.kind === "markdown-link").length,
    wikiLinks: edges.filter((edge) => edge.kind === "wiki-link").length,
    unresolvedLinks: nodes.filter((node) => node.nodeKind === "unresolved").length,
    orphans: documentNodes.filter((node) => node.degree === 0).length,
  };
}

function graphWarnings(compatible: boolean, documentCount: number, builtNodes: number, returnedNodes: number, limit: number, hasManifest: boolean): string[] {
  const warnings: string[] = [];
  if (!compatible) warnings.push("Memory root is not compatible with this jumpyBrain CLI.");
  if (!hasManifest) warnings.push("Memory index manifest is missing; graph indexed flags may be false until `jumpybrain index` runs.");
  if (documentCount === 0) warnings.push("No Markdown memory documents found.");
  if (builtNodes > limit && returnedNodes === limit) warnings.push(`Graph response was limited to ${limit} nodes.`);
  return warnings;
}

function normalizeGraphOptions(options: MemoryGraphOptions): NormalizedGraphOptions {
  return {
    ...options,
    focus: trimOptional(options.focus),
    type: trimOptional(options.type),
    path: trimOptional(options.path),
    query: trimOptional(options.query),
    tags: normalizeList(options.tags),
    edgeTypes: normalizeEdgeTypes(options.edgeTypes),
    depth: positiveInteger(options.depth, DEFAULT_LOCAL_DEPTH),
    includeUnresolved: options.includeUnresolved ?? true,
    includeOrphans: options.includeOrphans ?? true,
    limit: positiveInteger(options.limit, DEFAULT_GRAPH_LIMIT),
  };
}

function normalizeEdgeTypes(edgeTypes: MemoryConnectionEdgeKind[] | undefined): MemoryConnectionEdgeKind[] | undefined {
  if (!edgeTypes || edgeTypes.length === 0) return undefined;
  const allowed = new Set<MemoryConnectionEdgeKind>(["markdown-link", "wiki-link"]);
  return [...new Set(edgeTypes.filter((edgeType) => allowed.has(edgeType)))];
}

function normalizeList(values: string[] | undefined): string[] | undefined {
  const normalized = values?.map((value) => value.trim()).filter(Boolean);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

function titleFor(relativePath: string, frontmatter: Frontmatter): string {
  return stringValue(frontmatter.title) ?? path.posix.basename(relativePath, ".md");
}

function bucketType(relativePath: string): string | undefined {
  const bucket = bucketFor(relativePath);
  return bucket.endsWith("s") ? bucket.slice(0, -1) : bucket;
}

function snippetFor(content: string, bodyStartLine: number): string | undefined {
  const lines = content.split(/\r?\n/).slice(Math.max(0, bodyStartLine - 1));
  const text = lines
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH - 1)}…` : text;
}

function unresolvedNodeId(target: string): string {
  return `unresolved:${target.trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function edgeId(source: string, target: string, kind: MemoryConnectionEdgeKind): string {
  return `${kind}:${source}->${target}`;
}

function normalizeFocus(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.md$/i, "").toLowerCase();
}

function compareNodes(a: MemoryGraphNode, b: MemoryGraphNode): number {
  return kindRank(a.nodeKind) - kindRank(b.nodeKind) || a.id.localeCompare(b.id);
}

function kindRank(kind: string): number {
  return kind === "document" ? 0 : 1;
}

function compareEdges(a: MemoryGraphEdge, b: MemoryGraphEdge): number {
  return a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.kind.localeCompare(b.kind);
}
