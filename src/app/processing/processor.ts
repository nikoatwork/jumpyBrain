import { stampMemoryActor } from "../../core/contribution.js";
import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { hashMemoryDocumentContent, listCanonicalMemoryMarkdownFiles, normalizeRelative, parseFrontmatter, readCanonicalMemoryDocumentById, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { metadataDate } from "../../core/canonical/metadata-date.js";
import { assertCompatibleMemoryRoot, DERIVED_DIR } from "../../core/memory-root/index.js";
import type { Frontmatter, ProcessMemoryOptions, ProcessMemoryResult, ProcessMode, ProcessingLintScope } from "../../types.js";
import { searchQmdIndex } from "../../adapters/qmd/index.js";
import { renderMarkdownDocument, slug } from "../../core/writing/markdown-file.js";
import { generateMemoryDocumentId, isValidMemoryDocumentId, MEMORY_CONFIDENCE } from "../../core/writing/metadata.js";
import { writeUniqueMarkdownFile } from "../writing/filesystem.js";
import { updateMemoryDocument } from "../local-memory/index.js";
import { ensureMemoryIds } from "./ensure-ids.js";
import { distinctiveTokens, headingTitle, isPrimarySource, sourceExcerpt, topicMatches, type SourceDocument } from "./evidence.js";
import { lintDocuments, renderLintReport } from "./lint.js";

const PROCESS_MODES = ["lint", "synthesize", "ensure-ids"] as const satisfies readonly ProcessMode[];
export async function processMemory(rootArg: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const mode = normalizeProcessMode(options.mode);
  if (options.apply !== true) throw new Error("jumpybrain process mutates memory/support state. Re-run with --apply to continue.");
  if (mode === "synthesize") return synthesizeMemory(root, options);
  if (mode === "ensure-ids") return ensureMemoryIds(root);
  return lintMemory(root, options);
}
function normalizeProcessMode(value: string): ProcessMode {
  if ((PROCESS_MODES as readonly string[]).includes(value)) return value as ProcessMode;
  throw new Error(`Invalid --mode '${value}'. Use one of: ${PROCESS_MODES.join(", ")}.`);
}

async function synthesizeMemory(root: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const topic = options.topic?.trim();
  if (!topic) throw new Error("--topic is required for process --mode synthesize.");
  if (!distinctiveTokens(topic).length) throw new Error("--topic must contain a distinctive topical token.");
  const limit = positiveLimit(options.limit, 8);
  const sinceTime = parseSince(options.since);
  const relative = `pages/${slug(topic, "page")}.md`;
  const pageFile = path.join(root, relative);
  // Snapshot BEFORE retrieval: concurrent edits during source discovery must not be overwritten.
  await assertSafeDestination(root, pageFile);
  const existing = await readExistingPage(pageFile);
  if (options.ifMatch !== undefined && (!existing || hashMemoryDocumentContent(existing.content) !== options.ifMatch)) {
    throw new Error("Synthesis destination content hash is stale; re-read before retrying.");
  }
  if (existing) {
    const fm = existing.frontmatter;
    if (fm.source !== "jumpybrain-process" || fm.dream === true || fm.confidence === MEMORY_CONFIDENCE.userReviewed || fm.type !== "page" || fm.topic !== topic) {
      throw new Error(`Refusing to overwrite unowned, human/dream, or different-topic page ${relative}. Choose another topic or edit it explicitly.`);
    }
    if (!isValidMemoryDocumentId(fm.id)) throw new Error(`Existing process page ${relative} needs a valid ID; run ensure-ids explicitly first.`);
    const opened = await readCanonicalMemoryDocumentById(root, String(fm.id));
    if (opened.file !== relative || opened.contentHash !== hashMemoryDocumentContent(existing.content)) throw new Error("Synthesis destination changed during preflight.");
  }
  const documents = await readSourceDocuments(root);
  // QMD can nominate only canonical sources that pass the same scope checks as
  // direct selection. Filter before either path spends the source limit.
  const eligible = documents.filter(document => document.relativePath !== relative
    && isPrimarySource(document) && withinSince(document, sinceTime)
    && Boolean(sourceExcerpt(document, topic))).sort(sourceOrder);
  const terms = distinctiveTokens(topic);
  const direct = eligible.filter(document => topicMatches(document, terms)).slice(0, limit);
  const sources = await expandSourcesWithQmd(root, eligible, direct, { topic, limit });
  const excerpts = sources.flatMap(source => { const excerpt = sourceExcerpt(source, topic); return excerpt ? [{ source, excerpt }] : []; });
  if (!excerpts.length) throw new Error(`No source passages found for topic ${JSON.stringify(topic)} within the requested bounds.`);
  const body = renderPageBody(topic, excerpts);
  await assertSafeDestination(root, pageFile);
  const latest = await readExistingPage(pageFile);
  if (latest?.content !== existing?.content) throw new Error("Synthesis destination changed after preflight; retry without concurrent writers.");
  if (existing && existing.body.trim() === body.trim()) {
    return { root, mode: "synthesize", applied: false, topic, files: [], modifiedCount: 0,
      summary: [`Extractive source map ${relative} is unchanged; no write or index update needed.`] };
  }
  const now = new Date().toISOString();
  const metadata: Frontmatter = existing ? { ...existing.frontmatter, updated_at: now } : {
    id: generateMemoryDocumentId(), type: "page", title: topic, topic,
    source: "jumpybrain-process", created_at: now, updated_at: now,
    confidence: MEMORY_CONFIDENCE.agentDrafted, tags: distinctiveTokens(topic).slice(0, 8),
  };
  const markdown = stampMemoryActor(renderMarkdownDocument(Object.entries(metadata), body), { kind: "agent", name: "jumpyBrain processing" }, !existing);
  let written = pageFile;
  if (existing) {
    await updateMemoryDocument(root, String(metadata.id), markdown, { ifMatch: hashMemoryDocumentContent(existing.content), updatedAt: now, actor: { kind: "agent", name: "jumpyBrain processing" } });
  } else {
    // Approved exclusive-create seam: even a last-moment collision never overwrites another page.
    written = await writeUniqueMarkdownFile(path.dirname(pageFile), path.basename(pageFile, ".md"), markdown);
  }
  return { root, mode: "synthesize", applied: true, topic, files: [normalizeRelative(root, written)], modifiedCount: 1,
    summary: [`Wrote extractive source map ${normalizeRelative(root, written)} from ${excerpts.length} source memories; no semantic reconciliation was performed.`,
      "Run jumpybrain index before expecting recall to see applied processing changes."] };
}

async function lintMemory(root: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const documents = await readSourceDocuments(root);
  const topic = options.topic?.trim() || undefined;
  const limit = positiveLimit(options.limit, 100);
  const sinceTime = parseSince(options.since);
  const eligible = selectLintSources(documents, { topic, sinceTime });
  const scoped = eligible.slice(0, limit);
  const issues = lintDocuments(scoped, documents, document => documentTime(document.frontmatter));
  const now = new Date().toISOString();
  const runId = `${now.replace(/[:.]/g, "-")}-${randomUUID()}`;
  const scope: ProcessingLintScope = { total: documents.length, eligible: eligible.length, inspected: scoped.length,
    candidateDocuments: documents.filter(isPrimarySource).length, topic, since: options.since,
    sinceTime: sinceTime === undefined ? undefined : new Date(sinceTime).toISOString(), limit };
  const reportDir = path.join(root, DERIVED_DIR, "reports");
  await assertSafeDestination(root, path.join(reportDir, "report.md"));
  const markdown = renderLintReport({ runId, generatedAt: now, scope, issues });
  const reportFile = await writeUniqueMarkdownFile(reportDir, `lint-${runId}-${slug(topic ?? "all", "all")}`, markdown);
  const relative = normalizeRelative(root, reportFile);
  return { root, mode: "lint", applied: true, topic, files: [relative], runId, issueCount: issues.length, issues, scope,
    summary: [`Wrote lint report ${relative} with ${issues.length} finding${issues.length === 1 ? "" : "s"}.`] };
}

async function readSourceDocuments(root: string): Promise<SourceDocument[]> {
  return Promise.all((await listCanonicalMemoryMarkdownFiles(root)).map(async absolutePath => {
    const content = await readFile(absolutePath, "utf8");
    const parsed = parseFrontmatter(content);
    return { absolutePath, relativePath: normalizeRelative(root, absolutePath), content, body: parsed.body,
      frontmatter: parsed.frontmatter, bodyStartLine: parsed.bodyStartLine };
  }));
}
async function readExistingPage(file: string) {
  try { const content = await readFile(file, "utf8"); return { content, ...parseFrontmatter(content) }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}
/** No symlink/special/hardlink destination; root itself has already been realpathed. */
async function assertSafeDestination(root: string, file: string): Promise<void> {
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe processing destination.");
  let current = root;
  const parts = relative.split(path.sep);
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]!);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) {
        throw new Error("Unsafe processing destination: symlink, special file, or hardlink.");
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  }
}

async function expandSourcesWithQmd(root: string, eligible: SourceDocument[], initial: SourceDocument[], options: { topic: string; limit: number }): Promise<SourceDocument[]> {
  if (initial.length >= options.limit) return initial;
  const byPath = new Map(eligible.map(document => [document.relativePath, document]));
  const selected = new Map(initial.map(document => [document.relativePath, document]));
  try {
    const results = await searchQmdIndex(root, options.topic, Math.max(options.limit * 2, 12), { depth: "deep" });
    for (const result of results) {
      const document = byPath.get(result.provenance.file);
      if (!document) continue;
      selected.set(document.relativePath, document);
      if (selected.size >= options.limit) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Memory index not found")) throw error;
  }
  return [...selected.values()].sort(sourceOrder).slice(0, options.limit);
}
function selectLintSources(documents: SourceDocument[], options: { topic?: string; sinceTime?: number }): SourceDocument[] {
  const terms = distinctiveTokens(options.topic ?? "");
  return documents.filter(document => withinSince(document, options.sinceTime))
    .filter(document => terms.length === 0 || topicMatches(document, terms))
    .sort(sourceOrder);
}
function withinSince(document: SourceDocument, sinceTime?: number): boolean {
  return sinceTime === undefined || (documentTime(document.frontmatter) ?? -Infinity) >= sinceTime;
}
function sourceOrder(a: SourceDocument, b: SourceDocument): number {
  return (documentTime(b.frontmatter) ?? 0) - (documentTime(a.frontmatter) ?? 0) || a.relativePath.localeCompare(b.relativePath);
}
function renderPageBody(topic: string, excerpts: Array<{ source: SourceDocument; excerpt: NonNullable<ReturnType<typeof sourceExcerpt>> }>): string {
  const link = (source: SourceDocument) => `../${source.relativePath.split("/").map(component =>
    encodeURIComponent(component).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join("/")}`;
  return [
    `# ${topic}`, "",
    "This is a deterministic extractive source map, not reviewed synthesis or current truth. Excerpts may omit context; follow original sources before resolving questions or reconciling claims.", "",
    "## Source excerpts",
    ...excerpts.flatMap(({ source, excerpt }) => [
      `### ${String(source.frontmatter.title ?? headingTitle(source.body) ?? source.relativePath)}`, "",
      `> ${excerpt.snippet.replace(/\n/g, "\n> ")}`, "",
      `[Original source](${link(source)}) — lines ${excerpt.lineStart}-${excerpt.lineEnd}.`,
      ...sourceMetadata(source), "",
    ]),
    "## Source memories",
    ...excerpts.map(({ source }) => `- [${source.relativePath}](${link(source)})`), "",
    "## Maintenance",
    "- Generated by `jumpybrain process --mode synthesize --apply`; unchanged excerpts and cited metadata produce no write.",
    "- Source metadata recency (updated_at, otherwise created_at, otherwise date) bounds selection when --since is supplied; missing/invalid selected dates are excluded. Dates are not inferred event chronology. Original evidence remains canonical.",
  ].join("\n");
}
/** Keep metadata provenance outside the quote: these are not asserted body claims. */
function sourceMetadata(source: SourceDocument): string[] {
  const code = (value: unknown) => {
    const text = JSON.stringify(value);
    const fence = "`".repeat((text.match(/`+/g) ?? []).reduce((longest, run) => Math.max(longest, run.length), 0) + 1);
    return `${fence} ${text} ${fence}`;
  };
  const fields = (keys: string[]) => keys.filter(key => Object.hasOwn(source.frontmatter, key))
    .map(key => `${key}: ${code(source.frontmatter[key])}`).join("; ");
  const dates = fields(["date", "created_at", "createdAt", "updated_at"]);
  const qualifications = fields(["confidence", "review", "conflicts_with", "supersedes"]);
  return [
    `Source dates (verbatim metadata, not inferred event times): ${dates || "undated"}.`,
    ...(qualifications ? [`Source qualifications/relationships (unreconciled): ${qualifications}.`] : []),
  ];
}
function documentTime(metadata: Frontmatter): number | undefined {
  const value = metadata.updated_at ?? metadata.created_at ?? metadata.date;
  const valid = metadataDate(value);
  return valid === undefined ? undefined : Date.parse(valid);
}
function parseSince(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const relative = /^(\d+)([dw])$/.exec(value.trim());
  if (relative) {
    const resolved = Date.now() - Number(relative[1]) * (relative[2] === "w" ? 7 : 1) * 86400000;
    if (Number.isFinite(new Date(resolved).getTime())) return resolved;
  }
  const absolute = metadataDate(value.trim());
  if (absolute !== undefined) return Date.parse(absolute);
  throw new Error(`Invalid --since '${value}'. Use an ISO date, Nd, or Nw.`);
}
function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error("--limit must be a positive integer.");
  return value;
}
