import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../canonical/markdown-store.js";
import type { MemoryWriteResult } from "../types.js";

export const WRAPUP_REQUIRED_SECTIONS = [
  "Findings",
  "Decisions",
  "Conflicts / Corrections",
  "Open Questions",
] as const;

export type WrapupRequiredSection = typeof WRAPUP_REQUIRED_SECTIONS[number];

export interface WrapupDraft {
  title: string;
  body: string;
  tags?: string[];
  recallTopic?: string;
}

export interface WrapupValidation {
  valid: boolean;
  missingSections: string[];
  emptySections: string[];
}

export interface WrapupWriteResult extends MemoryWriteResult {
  title: string;
  recallTopic?: string;
  body: string;
  validation: WrapupValidation;
}

export async function writeSessionWrapup(rootArg: string, draft: WrapupDraft): Promise<WrapupWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  const title = draft.title?.trim() || "Session wrapup";
  const sourceBody = draft.body.trim();
  const validation = validateWrapupBody(sourceBody);
  if (!validation.valid) {
    throw new Error(wrapupValidationMessage(validation));
  }

  const now = new Date().toISOString();
  const dir = path.join(root, "sessions");
  await mkdir(dir, { recursive: true });

  const storedBody = [`# ${title}`, "", sourceBody, ""].join("\n");
  const markdown = renderWrapupMarkdown({
    title,
    now,
    tags: draft.tags ?? [],
    recallTopic: draft.recallTopic,
    body: storedBody,
  });

  const absolute = path.join(dir, `${now.slice(0, 10)}-${slug(title)}.md`);
  const writtenAbsolute = await writeNewFile(absolute, markdown, dir, now, title);

  return {
    file: normalizeRelative(root, writtenAbsolute),
    title,
    recallTopic: draft.recallTopic,
    body: storedBody.trimEnd(),
    validation,
  };
}

export function validateWrapupBody(body: string): WrapupValidation {
  const sectionMatches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => ({
    title: normalizeHeading(match[1] ?? ""),
    index: match.index ?? 0,
  }));

  const missingSections = WRAPUP_REQUIRED_SECTIONS.filter((required) => !sectionMatches.some((match) => match.title === normalizeHeading(required)));
  const emptySections = WRAPUP_REQUIRED_SECTIONS.filter((required) => {
    const matchIndex = sectionMatches.findIndex((match) => match.title === normalizeHeading(required));
    if (matchIndex === -1) return false;
    const start = sectionMatches[matchIndex].index;
    const next = sectionMatches[matchIndex + 1]?.index ?? body.length;
    const sectionText = body.slice(start, next).split(/\r?\n/).slice(1).join("\n").trim();
    return sectionText.length === 0;
  });

  return {
    valid: missingSections.length === 0 && emptySections.length === 0,
    missingSections,
    emptySections,
  };
}

function wrapupValidationMessage(validation: WrapupValidation): string {
  const parts = ["Invalid wrapup Markdown."];
  if (validation.missingSections.length > 0) {
    parts.push(`Missing required sections: ${validation.missingSections.map((section) => `## ${section}`).join(", ")}.`);
  }
  if (validation.emptySections.length > 0) {
    parts.push(`Empty required sections: ${validation.emptySections.map((section) => `## ${section}`).join(", ")}. Use '- None captured.' when intentionally empty.`);
  }
  return parts.join(" ");
}

function renderWrapupMarkdown(options: { title: string; now: string; tags: string[]; recallTopic?: string; body: string }): string {
  const frontmatter = [
    "---",
    `type: ${JSON.stringify("session")}`,
    `title: ${JSON.stringify(options.title)}`,
    `source: ${JSON.stringify("jumpybrain-wrapup")}`,
    `created_at: ${JSON.stringify(options.now)}`,
    `updated_at: ${JSON.stringify(options.now)}`,
    `confidence: ${JSON.stringify("agent-drafted")}`,
    `review: ${JSON.stringify("user-review-recommended")}`,
    `tags: ${JSON.stringify(options.tags)}`,
  ];
  if (options.recallTopic) frontmatter.push(`recall_topic: ${JSON.stringify(options.recallTopic)}`);
  frontmatter.push("---", "", options.body.trimEnd(), "");
  return frontmatter.join("\n");
}

async function writeNewFile(absolute: string, markdown: string, dir: string, now: string, title: string): Promise<string> {
  const base = `${now.slice(0, 10)}-${slug(title)}`;
  const candidates = [absolute, ...Array.from({ length: 20 }, (_, index) => path.join(dir, `${base}-${Date.now()}-${index + 1}.md`))];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      await writeFile(candidate, markdown, { encoding: "utf8", flag: "wx" });
      return candidate;
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException;
      if (fileError.code !== "EEXIST") throw error;
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to create unique wrapup file.");
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "session-wrapup";
}
