import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../canonical/markdown-store.js";
import type { MemoryNoteDraft, MemoryNoteType, MemoryWriteResult } from "../types.js";
import { renderMarkdownDocument, slug, writeUniqueMarkdownFile } from "./markdown-file.js";
import { MEMORY_CONFIDENCE, VALID_MEMORY_TYPES } from "./metadata.js";

const VALID_TYPES = new Set<MemoryNoteType>(VALID_MEMORY_TYPES);

export async function writeMemoryNote(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  const type = normalizeType(options.type);
  const title = options.title?.trim() || "Untitled memory";
  const body = options.body.trim();
  if (!body) throw new Error("Memory note body is empty. Pipe Markdown content on stdin.");
  const now = new Date().toISOString();
  const dir = path.join(root, directoryForType(type));
  const markdown = renderMarkdownDocument([
    ["type", type],
    ["title", title],
    ["source", "jumpybrain-note"],
    ["created_at", now],
    ["updated_at", now],
    ["confidence", MEMORY_CONFIDENCE.userReviewed],
    ["tags", options.tags ?? []],
  ], [`# ${title}`, "", body].join("\n"));

  const writtenAbsolute = await writeUniqueMarkdownFile(dir, `${now.slice(0, 10)}-${slug(title, "untitled")}`, markdown);
  return { file: normalizeRelative(root, writtenAbsolute) };
}

function normalizeType(value: string): MemoryNoteType {
  if (VALID_TYPES.has(value as MemoryNoteType)) return value as MemoryNoteType;
  throw new Error(`Invalid --type '${value}'. Use one of: ${[...VALID_TYPES].join(", ")}.`);
}

function directoryForType(type: MemoryNoteType): string {
  if (type === "note") return "notes";
  return `${type}s`;
}
