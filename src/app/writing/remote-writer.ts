import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { generateMemoryDocumentId, MEMORY_CONFIDENCE, MEMORY_REVIEW, renderMarkdownDocument, slug, validateWrapupBody, type WrapupValidation } from "../../core/writing/index.js";
import type { MemoryNoteType } from "../../types.js";
import { writeUniqueMarkdownFile } from "./filesystem.js";

export type RemoteMemoryNoteType = "note" | "finding" | "decision" | "preference";

export interface RemoteMemoryNoteDraft {
  type: string;
  title: string;
  body: string;
  tags?: string[];
}

export interface RemoteWrapupDraft {
  title: string;
  body: string;
  tags?: string[];
  recallTopic?: string;
}

export interface RemoteMemoryWriteResult {
  id: string;
  file: string;
  type: MemoryNoteType;
  title: string;
}

export interface RemoteWrapupWriteResult extends RemoteMemoryWriteResult {
  type: "session";
  recallTopic?: string;
  validation: WrapupValidation;
}

const VALID_REMOTE_NOTE_TYPES = new Set<RemoteMemoryNoteType>(["note", "finding", "decision", "preference"]);

export async function writeRemoteMemoryNote(rootArg: string, draft: RemoteMemoryNoteDraft): Promise<RemoteMemoryWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const type = normalizeRemoteNoteType(draft.type);
  const title = draft.title?.trim() || "Untitled memory";
  const body = draft.body.trim();
  if (!body) throw new Error("Memory body is empty.");

  const id = generateMemoryDocumentId();
  const now = new Date().toISOString();
  const markdown = renderMarkdownDocument([
    ["id", id],
    ["type", type],
    ["title", title],
    ["source", "jumpybrain-remote"],
    ["created_at", now],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.userReviewed],
    ["tags", draft.tags ?? []],
  ], [`# ${title}`, "", body].join("\n"));

  const dir = path.join(root, directoryForType(type));
  const writtenAbsolute = await writeUniqueMarkdownFile(dir, remoteBaseName(now, title, id), markdown);
  return { id, file: normalizeRelative(root, writtenAbsolute), type, title };
}

export async function writeRemoteSessionWrapup(rootArg: string, draft: RemoteWrapupDraft): Promise<RemoteWrapupWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const title = draft.title?.trim() || "Session wrapup";
  const sourceBody = draft.body.trim();
  const validation = validateWrapupBody(sourceBody);
  if (!validation.valid) {
    throw new Error("Invalid wrapup Markdown.");
  }

  const id = generateMemoryDocumentId();
  const now = new Date().toISOString();
  const storedBody = [`# ${title}`, "", sourceBody, ""].join("\n");
  const markdown = renderMarkdownDocument([
    ["id", id],
    ["type", "session"],
    ["title", title],
    ["source", "jumpybrain-remote"],
    ["created_at", now],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.agentDrafted],
    ["review", MEMORY_REVIEW.userReviewRecommended],
    ["tags", draft.tags ?? []],
    ["recall_topic", draft.recallTopic],
  ], storedBody);

  const writtenAbsolute = await writeUniqueMarkdownFile(path.join(root, "sessions"), remoteBaseName(now, title, id), markdown);
  return {
    id,
    file: normalizeRelative(root, writtenAbsolute),
    type: "session",
    title,
    recallTopic: draft.recallTopic,
    validation,
  };
}

function normalizeRemoteNoteType(value: string): RemoteMemoryNoteType {
  if (VALID_REMOTE_NOTE_TYPES.has(value as RemoteMemoryNoteType)) return value as RemoteMemoryNoteType;
  throw new Error(`Invalid remote memory type '${value}'. Use one of: ${[...VALID_REMOTE_NOTE_TYPES].join(", ")}.`);
}

function directoryForType(type: RemoteMemoryNoteType): string {
  if (type === "note") return "notes";
  return `${type}s`;
}

function remoteBaseName(now: string, title: string, id: string): string {
  const shortId = id.replace(/^mem_/, "").slice(0, 8);
  return `${now.slice(0, 10)}-${slug(title, "untitled")}-${shortId}`;
}
