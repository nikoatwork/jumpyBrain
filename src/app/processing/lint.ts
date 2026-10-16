import { buildCanonicalLinkTargetLookup, extractCanonicalLinks, resolveCanonicalLinkTarget } from "../../core/canonical/links.js";
import type { ProcessingLintIssue, ProcessingLintScope } from "../../types.js";
import { ANSWER_CUE, UNRESOLVED, distinctiveTokens, evidenceParagraphs, headingTitle, isPage, isPrimarySource, tokens, topicMatches, type SourceDocument } from "./evidence.js";

export function lintDocuments(scoped: SourceDocument[], all: SourceDocument[], documentTime: (document: SourceDocument) => number | undefined): ProcessingLintIssue[] {
  const issues: ProcessingLintIssue[] = [];
  const lookup = buildCanonicalLinkTargetLookup(all);
  for (const page of scoped.filter(isPage)) {
    const references = extractCanonicalLinks(page.body);
    const contextTargets = new Set<string>();
    const supportTargets = new Set<string>();
    let context = false;
    for (const section of page.body.split(/(?=^#{1,6}\s)/m)) {
      const heading = section.match(/^#{1,6}\s+([^\n]+)/)?.[1];
      if (heading) context = /^(?:related(?:\s+memories)?|context|background|see also|continuity)\b/i.test(heading);
      for (const ref of extractCanonicalLinks(section, page.body)) (context ? contextTargets : supportTargets).add(ref.target);
    }
    const valid = references.filter(ref => resolveCanonicalLinkTarget(page.relativePath, ref.target, ref.kind, lookup));
    if (!references.length) issues.push({ code: "PAGE_SOURCES_ABSENT", severity: "warning", file: page.relativePath,
      message: `Page \`${page.relativePath}\` has no canonical source references.`,
      rationale: "No resolvable-form canonical Markdown/wiki references were supplied; a heading alone is not provenance.", evidence: [] });
    for (const ref of references) {
      if (resolveCanonicalLinkTarget(page.relativePath, ref.target, ref.kind, lookup)) continue;
      issues.push({ code: "PAGE_SOURCE_BROKEN", severity: "warning", file: page.relativePath,
        message: `Page \`${page.relativePath}\` has a broken or ambiguous reference: \`${ref.target}\`.`,
        rationale: "Canonical target resolution found no unique source document.", evidence: [{ file: page.relativePath, text: ref.target, target: ref.target }] });
    }
    if (valid.length && valid.every(ref => contextTargets.has(ref.target) && !supportTargets.has(ref.target))) {
      issues.push({ code: "PAGE_CONTEXT_ONLY", severity: "warning", file: page.relativePath,
        message: `Page \`${page.relativePath}\` links only context, not explicit claim support.`,
        rationale: "Existing links appear only under context/related/background headings. Link validity alone does not establish entailment.",
        evidence: valid.map(ref => ({ file: page.relativePath, text: ref.target, target: ref.target })) });
    }
    const terms = distinctiveTokens(String(page.frontmatter.topic ?? page.frontmatter.title ?? headingTitle(page.body) ?? ""));
    const newer = all.filter(doc => isPrimarySource(doc) && (documentTime(doc) ?? 0) > (documentTime(page) ?? 0) && terms.length && topicMatches(doc, terms));
    if (newer.length) issues.push({ code: "PAGE_MAY_BE_STALE", severity: "info", file: page.relativePath,
      message: `Page \`${page.relativePath}\` may be stale: ${newer.length} newer related source memor${newer.length === 1 ? "y" : "ies"} found.`,
      rationale: "Newer metadata timestamps and exact topical tokens warrant review; they do not prove a changed conclusion.",
      evidence: newer.map(doc => ({ file: doc.relativePath, text: String(doc.frontmatter.updated_at ?? doc.frontmatter.created_at ?? doc.frontmatter.date) })) });
  }
  const byTitle = new Map<string, SourceDocument[]>();
  for (const doc of scoped) {
    if (!["finding", "decision"].includes(String(doc.frontmatter.type))) continue;
    const title = String(doc.frontmatter.title ?? headingTitle(doc.body) ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), doc]);
  }
  for (const [title, docs] of byTitle) if (docs.length > 1) issues.push({ code: "POSSIBLE_DUPLICATE", severity: "info", file: docs[0]!.relativePath,
    message: `Possible duplicate ${title}: ${docs.map(doc => `\`${doc.relativePath}\``).join(", ")}.`,
    rationale: "Titles normalize identically; content may still differ legitimately.", evidence: docs.map(doc => ({ file: doc.relativePath, text: title })) });
  for (const doc of scoped) {
    const declared = doc.frontmatter.conflicts_with;
    const targets = Array.isArray(declared) ? declared : typeof declared === "string" && declared.trim() ? [declared.trim()] : [];
    for (const target of targets) {
      const found = resolveCanonicalLinkTarget(doc.relativePath, target, "markdown-link", lookup);
      issues.push({ code: found ? "DECLARED_CONFLICT" : "CONFLICT_TARGET_MISSING", severity: "warning", file: doc.relativePath,
        message: `Conflict: \`${doc.relativePath}\` declares a conflict with${found ? "" : " missing target"} \`${target}\`.`,
        rationale: "Explicit conflicts_with metadata requires human review, not automatic reconciliation.", evidence: [{ file: doc.relativePath, text: target, target }] });
    }
  }
  issues.push(...questionCandidates(scoped, all));
  return issues;
}

function questionCandidates(scoped: SourceDocument[], all: SourceDocument[]): ProcessingLintIssue[] {
  const issues: ProcessingLintIssue[] = [];
  const candidates = all.filter(isPrimarySource).map(doc => ({ doc, paragraphs: evidenceParagraphs(doc) }));
  for (const doc of scoped) {
    let inQuestions = false;
    for (const line of doc.body.split(/\r?\n/)) {
      if (/^##\s/.test(line)) { inQuestions = /^##\s+Open Questions\s*$/i.test(line); continue; }
      if (!inQuestions || !line.includes("?")) continue;
      const question = line.replace(/^\s*[-*]\s+/, "").trim();
      const terms = distinctiveTokens(question);
      if (terms.length < 3) continue;
      const matches: Array<{ issue: ProcessingLintIssue; score: number }> = [];
      for (const { doc: candidate, paragraphs } of candidates) {
        if (candidate.relativePath === doc.relativePath) continue;
        for (let index = 0; index < paragraphs.length; index++) {
          const paragraph = paragraphs[index]!;
          if (paragraph.text.length > 1000 || !ANSWER_CUE.test(paragraph.text) || UNRESOLVED.test(paragraph.text)) continue;
          // A following status caveat must not disappear at a paragraph boundary.
          const next = paragraphs[index + 1];
          if (next && next.lineStart <= paragraph.lineEnd + 2 && UNRESOLVED.test(next.text)) continue;
          const words = new Set(tokens(paragraph.text));
          const matched = terms.filter(term => words.has(term));
          if (matched.length < Math.max(3, Math.ceil(terms.length * 0.6))) continue;
          matches.push({ score: matched.length, issue: { code: "QUESTION_ANSWER_CANDIDATE", severity: "info", file: doc.relativePath,
            message: `Review candidate for open question in \`${doc.relativePath}\` from \`${candidate.relativePath}\`: ${question}`,
            rationale: `Same bounded paragraph contains an answer/decision cue and ${matched.length}/${terms.length} distinctive exact tokens (${matched.join(", ")}). Lexical evidence is not semantic resolution; keep the question open until reviewed.`,
            evidence: [{ file: candidate.relativePath, ...paragraph, matchedTokens: matched }] } });
        }
      }
      matches.sort((a, b) => b.score - a.score || a.issue.evidence[0]!.file.localeCompare(b.issue.evidence[0]!.file));
      issues.push(...matches.slice(0, 3).map(match => match.issue));
    }
  }
  return issues;
}

export function renderLintReport(options: { runId: string; generatedAt: string; scope: ProcessingLintScope; issues: ProcessingLintIssue[] }): string {
  const { scope, issues } = options;
  return [
    `# Memory lint report${scope.topic ? `: ${scope.topic}` : ""}`, "",
    `Run: ${options.runId}`, `Generated at: ${options.generatedAt}`,
    `Scope: inspected ${scope.inspected}/${scope.eligible} eligible, ${scope.total} total; candidate corpus ${scope.candidateDocuments}.`,
    `Bounds: topic=${JSON.stringify(scope.topic ?? null)}, since=${JSON.stringify(scope.since ?? null)}, sinceTime=${JSON.stringify(scope.sinceTime ?? null)}, limit=${scope.limit}.`,
    `Issue count: ${issues.length}`, "", "## Findings",
    ...(issues.length ? issues.flatMap(issue => [
      `- [${issue.code}; ${issue.severity}] ${issue.message}`, `  - Rationale: ${issue.rationale}`,
      ...issue.evidence.map(evidence => `  - Evidence: \`${evidence.file}\`${evidence.lineStart ? `:${evidence.lineStart}-${evidence.lineEnd}` : ""} — ${evidence.text.replace(/\n/g, " ")}`),
    ]) : ["No deterministic lint findings found."]),
    "", "## Notes",
    "- Canonical links identify provenance, not claim entailment. Context-only links are not sufficient claim support.",
    "- Answer candidates are bounded lexical suggestions (at most three per question), never automatic resolution. No candidate means abstention, not proof the question is unanswered.",
    "- Topic/since/limit bound inspected documents; comparisons and candidate search use the full canonical corpus. No question is changed or closed.",
  ].join("\n");
}
