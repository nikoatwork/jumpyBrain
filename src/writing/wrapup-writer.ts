import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../canonical/markdown-store.js";
import type { MemoryWriteResult } from "../types.js";
import { renderMarkdownDocument, slug, writeUniqueMarkdownFile } from "./markdown-file.js";
import { MEMORY_CONFIDENCE, MEMORY_REVIEW } from "./metadata.js";

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
  const storedBody = [`# ${title}`, "", sourceBody, ""].join("\n");
  const markdown = renderMarkdownDocument([
    ["type", "session"],
    ["title", title],
    ["source", "jumpybrain-wrapup"],
    ["created_at", now],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.agentDrafted],
    ["review", MEMORY_REVIEW.userReviewRecommended],
    ["tags", draft.tags ?? []],
    ["recall_topic", draft.recallTopic],
  ], storedBody);

  const writtenAbsolute = await writeUniqueMarkdownFile(dir, `${now.slice(0, 10)}-${slug(title, "session-wrapup")}`, markdown);

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

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
