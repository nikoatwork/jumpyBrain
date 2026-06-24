import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeRelative, parseFrontmatter, readMarkdownDocuments, resolveMemoryRoot } from "../canonical/markdown-store.js";
import { assertCompatibleMemoryRoot, DERIVED_DIR } from "../setup/index.js";
import type { Frontmatter, MarkdownDocument, ProcessMemoryOptions, ProcessMemoryResult, ProcessMode } from "../types.js";
import { searchQmdIndex } from "../qmd/index.js";
import { renderMarkdownDocument, slug } from "../writing/markdown-file.js";
import { MEMORY_CONFIDENCE } from "../writing/metadata.js";

interface SourceDocument extends MarkdownDocument {
  content: string;
  body: string;
}

const PROCESS_MODES = ["lint", "synthesize"] as const satisfies readonly ProcessMode[];

export async function processMemory(rootArg: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const mode = normalizeProcessMode(options.mode);
  if (!options.apply) throw new Error("jumpybrain process mutates memory/support state. Re-run with --apply to continue.");

  if (mode === "synthesize") return synthesizeMemory(root, options);
  return lintMemory(root, options);
}

function normalizeProcessMode(value: string): ProcessMode {
  if ((PROCESS_MODES as readonly string[]).includes(value)) return value as ProcessMode;
  throw new Error(`Invalid --mode '${value}'. Use one of: ${PROCESS_MODES.join(", ")}.`);
}

async function synthesizeMemory(root: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const topic = options.topic?.trim();
  if (!topic) throw new Error("--topic is required for process --mode synthesize.");

  const limit = positiveLimit(options.limit, 8);
  const documents = await readSourceDocuments(root);
  const directSources = selectSources(documents, { topic, since: options.since, limit, includePages: false });
  const sources = await expandSourcesWithQmd(root, documents, directSources, { topic, limit, includePages: false });
  if (sources.length === 0) throw new Error(`No source memories found for topic ${JSON.stringify(topic)}.`);

  const now = new Date().toISOString();
  const pagesDir = path.join(root, "pages");
  await mkdir(pagesDir, { recursive: true });
  const pageFile = path.join(pagesDir, `${slug(topic, "page")}.md`);
  const existing = await readExistingPage(pageFile);
  const markdown = renderMarkdownDocument([
    ["type", "page"],
    ["title", topic],
    ["topic", topic],
    ["source", "jumpybrain-process"],
    ["created_at", String(existing.frontmatter.created_at ?? now)],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.agentDrafted],
    ["tags", topicTags(topic)],
  ], renderPageBody(topic, sources));

  await writeFile(pageFile, markdown, "utf8");
  const relative = normalizeRelative(root, pageFile);
  return {
    root,
    mode: "synthesize",
    applied: true,
    topic,
    files: [relative],
    summary: [
      `Updated topical page ${relative} from ${sources.length} source memor${sources.length === 1 ? "y" : "ies"}.`,
      "Run jumpybrain index before expecting recall to see applied processing changes.",
    ],
  };
}

async function lintMemory(root: string, options: ProcessMemoryOptions): Promise<ProcessMemoryResult> {
  const documents = await readSourceDocuments(root);
  const scoped = selectSources(documents, {
    topic: options.topic?.trim(),
    since: options.since,
    limit: positiveLimit(options.limit, 100),
    includePages: true,
  });
  const findings = lintDocuments(scoped, documents);
  const now = new Date().toISOString();
  const reportDir = path.join(root, DERIVED_DIR, "reports");
  await mkdir(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, `lint-${now.slice(0, 10)}-${slug(options.topic ?? "all", "all")}.md`);
  const markdown = renderLintReport({ topic: options.topic?.trim(), generatedAt: now, findings });
  await writeFile(reportFile, markdown, "utf8");
  const relative = normalizeRelative(root, reportFile);
  return {
    root,
    mode: "lint",
    applied: true,
    topic: options.topic?.trim() || undefined,
    files: [relative],
    summary: [`Wrote lint report ${relative} with ${findings.length} finding${findings.length === 1 ? "" : "s"}.`],
  };
}

async function readSourceDocuments(root: string): Promise<SourceDocument[]> {
  const documents = await readMarkdownDocuments(root);
  return Promise.all(documents.map(async (document) => {
    const content = await readFile(document.absolutePath, "utf8");
    return { ...document, content, body: parseFrontmatter(content).body };
  }));
}

async function readExistingPage(file: string): Promise<{ frontmatter: Frontmatter }> {
  if (!existsSync(file)) return { frontmatter: {} };
  const parsed = parseFrontmatter(await readFile(file, "utf8"));
  return { frontmatter: parsed.frontmatter };
}

async function expandSourcesWithQmd(
  root: string,
  documents: SourceDocument[],
  initial: SourceDocument[],
  options: { topic: string; limit: number; includePages: boolean },
): Promise<SourceDocument[]> {
  const byPath = new Map(documents.map((document) => [document.relativePath, document]));
  const selected = new Map(initial.map((document) => [document.relativePath, document]));

  try {
    const results = await searchQmdIndex(root, options.topic, Math.max(options.limit * 2, 12), { depth: "deep" });
    for (const result of results) {
      const document = byPath.get(result.provenance.file);
      if (!document) continue;
      if (!options.includePages && isPage(document)) continue;
      selected.set(document.relativePath, document);
      if (selected.size >= options.limit) break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Memory index not found")) throw error;
  }

  return [...selected.values()]
    .sort((a, b) => (documentTime(b.frontmatter) ?? 0) - (documentTime(a.frontmatter) ?? 0) || a.relativePath.localeCompare(b.relativePath))
    .slice(0, options.limit);
}

function selectSources(documents: SourceDocument[], options: { topic?: string; since?: string; limit: number; includePages: boolean }): SourceDocument[] {
  const sinceTime = parseSince(options.since);
  const topicTokens = tokenize(options.topic ?? "");
  return documents
    .filter((document) => options.includePages || !isPage(document))
    .filter((document) => !sinceTime || (documentTime(document.frontmatter) ?? 0) >= sinceTime)
    .filter((document) => topicTokens.length === 0 || topicMatches(document, topicTokens))
    .sort((a, b) => (documentTime(b.frontmatter) ?? 0) - (documentTime(a.frontmatter) ?? 0) || a.relativePath.localeCompare(b.relativePath))
    .slice(0, options.limit);
}

function topicMatches(document: SourceDocument, topicTokens: string[]): boolean {
  const haystack = [document.relativePath, ...Object.values(document.frontmatter).flat().map(String), document.body].join(" ").toLowerCase();
  return topicTokens.every((token) => haystack.includes(token));
}

function isPage(document: SourceDocument): boolean {
  return document.relativePath.startsWith("pages/") || String(document.frontmatter.type ?? "").toLowerCase() === "page";
}

function renderPageBody(topic: string, sources: SourceDocument[]): string {
  const bullets = sources.map((source) => `- ${sourceSummary(source)}`);
  const sourceLines = sources.map((source) => {
    const title = String(source.frontmatter.title ?? headingTitle(source.body) ?? source.relativePath);
    const type = String(source.frontmatter.type ?? "memory");
    return `- \`${source.relativePath}\` — ${title} (${type})`;
  });

  return [
    `# ${topic}`,
    "",
    "This topical page was synthesized by `jumpybrain process --mode synthesize --apply` from canonical Markdown memory.",
    "",
    "## Current understanding",
    ...bullets,
    "",
    "## Source memories",
    ...sourceLines,
    "",
    "## Maintenance",
    "- Re-run `jumpybrain process --mode synthesize --apply` when new durable memory changes this topic.",
  ].join("\n");
}

function sourceSummary(source: SourceDocument): string {
  const title = String(source.frontmatter.title ?? headingTitle(source.body) ?? source.relativePath);
  const text = firstUsefulLine(source.body, title);
  return `**${title}**: ${text} [source: \`${source.relativePath}\`]`;
}

function firstUsefulLine(body: string, fallback: string): string {
  const line = body
    .split(/\r?\n/)
    .map((value) => value.trim().replace(/^[-*]\s+/, ""))
    .find((value) => value && !value.startsWith("#") && !value.startsWith("---"));
  return truncate(line ?? fallback, 240);
}

function headingTitle(body: string): string | undefined {
  const heading = body.split(/\r?\n/).find((line) => /^#\s+/.test(line.trim()));
  return heading?.replace(/^#\s+/, "").trim();
}

function lintDocuments(scoped: SourceDocument[], allDocuments: SourceDocument[]): string[] {
  const findings: string[] = [];
  const pages = scoped.filter(isPage);
  for (const page of pages) {
    if (!/##\s+Source memories/i.test(page.body) && !/\[source:\s*`[^`]+`\]/i.test(page.body)) {
      findings.push(`Page \`${page.relativePath}\` is missing an explicit Source memories section or source references.`);
    }

    const pageTime = documentTime(page.frontmatter) ?? 0;
    const tokens = tokenize(String(page.frontmatter.topic ?? page.frontmatter.title ?? headingTitle(page.body) ?? ""));
    const newerSources = allDocuments
      .filter((document) => !isPage(document))
      .filter((document) => (documentTime(document.frontmatter) ?? 0) > pageTime)
      .filter((document) => tokens.length > 0 && topicMatches(document, tokens));
    if (newerSources.length > 0) {
      findings.push(`Page \`${page.relativePath}\` may be stale: ${newerSources.length} newer related source memor${newerSources.length === 1 ? "y" : "ies"} found.`);
    }
  }

  const byTitle = new Map<string, SourceDocument[]>();
  for (const document of scoped) {
    const type = String(document.frontmatter.type ?? "").toLowerCase();
    if (type !== "finding" && type !== "decision") continue;
    const title = String(document.frontmatter.title ?? headingTitle(document.body) ?? "").trim().toLowerCase();
    if (!title) continue;
    const normalized = title.replace(/[^a-z0-9]+/g, " ").trim();
    byTitle.set(normalized, [...(byTitle.get(normalized) ?? []), document]);
  }
  for (const [title, documents] of byTitle) {
    if (documents.length > 1) findings.push(`Possible duplicate ${title}: ${documents.map((document) => `\`${document.relativePath}\``).join(", ")}.`);
  }

  findings.push(...declaredConflictFindings(scoped, allDocuments));
  findings.push(...answeredOpenQuestionFindings(scoped, allDocuments));

  if (findings.length === 0) findings.push("No deterministic lint findings found.");
  return findings;
}

function declaredConflictFindings(scoped: SourceDocument[], allDocuments: SourceDocument[]): string[] {
  const knownPaths = new Set(allDocuments.map((document) => document.relativePath));
  const findings: string[] = [];
  for (const document of scoped) {
    for (const target of conflictTargets(document.frontmatter.conflicts_with)) {
      const existence = knownPaths.has(target) ? "declares a conflict with" : "declares a conflict with missing target";
      findings.push(`Conflict: \`${document.relativePath}\` ${existence} \`${target}\`.`);
    }
  }
  return findings;
}

function conflictTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function answeredOpenQuestionFindings(scoped: SourceDocument[], allDocuments: SourceDocument[]): string[] {
  const findings: string[] = [];
  for (const document of scoped) {
    for (const question of openQuestions(document.body)) {
      const answer = allDocuments.find((candidate) => candidate.relativePath !== document.relativePath && appearsToAnswer(question, candidate));
      if (answer) findings.push(`Open question in \`${document.relativePath}\` may be answered by \`${answer.relativePath}\`: ${question}`);
    }
  }
  return findings;
}

function openQuestions(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const questions: string[] = [];
  let inOpenQuestions = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s+/.test(line)) {
      inOpenQuestions = /^##\s+Open Questions\s*$/i.test(line);
      continue;
    }
    if (!inOpenQuestions) continue;
    const bullet = line.replace(/^[-*]\s+/, "").trim();
    if (bullet && bullet !== "None captured." && bullet.includes("?")) questions.push(bullet);
  }
  return questions;
}

function appearsToAnswer(question: string, candidate: SourceDocument): boolean {
  const cues = ["answer", "answered", "decided", "decision", "resolved", "closed"];
  const haystack = [candidate.relativePath, ...Object.values(candidate.frontmatter).flat().map(String), candidate.body].join(" ").toLowerCase();
  if (!cues.some((cue) => new RegExp(`\\b${cue}\\b`, "i").test(haystack))) return false;
  const questionTokens = tokenize(question).filter((token) => !QUESTION_STOPWORDS.has(token));
  if (questionTokens.length === 0) return false;
  const matches = questionTokens.filter((token) => haystack.includes(token)).length;
  return matches >= Math.min(3, questionTokens.length);
}

const QUESTION_STOPWORDS = new Set(["what", "when", "where", "which", "should", "could", "would", "about", "with", "from", "this", "that", "have", "will"]);

function renderLintReport(options: { topic?: string; generatedAt: string; findings: string[] }): string {
  return [
    `# Memory lint report${options.topic ? `: ${options.topic}` : ""}`,
    "",
    `Generated at: ${options.generatedAt}`,
    "",
    "## Findings",
    ...options.findings.map((finding) => `- ${finding}`),
    "",
    "## Notes",
    "- This V1 lint pass uses deterministic checks only; agent-assisted semantic checks can be added behind the process seam later.",
  ].join("\n");
}

function documentTime(metadata: Frontmatter): number | undefined {
  const value = metadata.updated_at ?? metadata.created_at ?? metadata.date;
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSince(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const relative = /^(\d+)([dw])$/.exec(trimmed);
  if (relative) {
    const amount = Number(relative[1]);
    const days = relative[2] === "w" ? amount * 7 : amount;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }
  const absolute = Date.parse(trimmed);
  if (Number.isFinite(absolute)) return absolute;
  throw new Error(`Invalid --since '${value}'. Use an ISO date, Nd, or Nw.`);
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) throw new Error("--limit must be a positive integer.");
  return value;
}

function topicTags(topic: string): string[] {
  return tokenize(topic).slice(0, 8);
}

function tokenize(value: string): string[] {
  return [...new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
