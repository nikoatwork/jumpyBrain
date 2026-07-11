import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { generateMemoryDocumentId, MEMORY_CONFIDENCE, MEMORY_REVIEW, renderMarkdownDocument, slug, validateWrapupBody, VALID_MEMORY_TYPES, wrapupValidationMessage, type WrapupValidation } from "../../core/writing/index.js";
import type { MemoryNoteDraft, MemoryNoteType, MemoryWriteResult } from "../../types.js";
import { writeUniqueMarkdownFile } from "./filesystem.js";

const VALID_TYPES = new Set<MemoryNoteType>(VALID_MEMORY_TYPES);

export interface WrapupDraft {
  title: string;
  body: string;
  tags?: string[];
  recallTopic?: string;
}

export interface WrapupWriteResult extends MemoryWriteResult {
  title: string;
  recallTopic?: string;
  body: string;
  validation: WrapupValidation;
}

export async function rememberMemory(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const type = normalizeType(options.type);
  const title = options.title?.trim() || "Untitled memory";
  const body = options.body.trim();
  if (!body) throw new Error("Memory body is empty. Pipe Markdown content on stdin.");
  const id = generateMemoryDocumentId();
  const now = new Date().toISOString();
  const dir = path.join(root, directoryForType(type));
  const markdown = renderMarkdownDocument([
    ["id", id],
    ["type", type],
    ["title", title],
    ["source", "jumpybrain-remember"],
    ["created_at", now],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.userReviewed],
    ["tags", options.tags ?? []],
  ], [`# ${title}`, "", body].join("\n"));

  const writtenAbsolute = await writeUniqueMarkdownFile(dir, `${now.slice(0, 10)}-${slug(title, "untitled")}`, markdown);
  return { id, file: normalizeRelative(root, writtenAbsolute) };
}

export async function writeSessionWrapup(rootArg: string, draft: WrapupDraft): Promise<WrapupWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const title = draft.title?.trim() || "Session wrapup";
  const sourceBody = draft.body.trim();
  const validation = validateWrapupBody(sourceBody);
  if (!validation.valid) {
    throw new Error(wrapupValidationMessage(validation));
  }

  const id = generateMemoryDocumentId();
  const now = new Date().toISOString();
  const dir = path.join(root, "sessions");
  const storedBody = [`# ${title}`, "", sourceBody, ""].join("\n");
  const markdown = renderMarkdownDocument([
    ["id", id],
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
    id,
    file: normalizeRelative(root, writtenAbsolute),
    title,
    recallTopic: draft.recallTopic,
    body: storedBody.trimEnd(),
    validation,
  };
}

function normalizeType(value: string): MemoryNoteType {
  if (VALID_TYPES.has(value as MemoryNoteType)) return value as MemoryNoteType;
  throw new Error(`Invalid --type '${value}'. Use one of: ${[...VALID_TYPES].join(", ")}.`);
}

function directoryForType(type: MemoryNoteType): string {
  if (type === "note") return "notes";
  return `${type}s`;
}
