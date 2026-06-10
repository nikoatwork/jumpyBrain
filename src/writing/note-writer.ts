import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeRelative, resolveMemoryRoot } from "../canonical/markdown-store.js";
import type { MemoryNoteDraft, MemoryNoteType, MemoryWriteResult } from "../types.js";

const VALID_TYPES = new Set<MemoryNoteType>(["note", "session", "finding", "decision", "preference"]);

export async function writeMemoryNote(rootArg: string, options: MemoryNoteDraft): Promise<MemoryWriteResult> {
  const root = await resolveMemoryRoot(rootArg);
  const type = normalizeType(options.type);
  const title = options.title?.trim() || "Untitled memory";
  const now = new Date().toISOString();
  const dir = path.join(root, directoryForType(type));
  await mkdir(dir, { recursive: true });

  const filename = `${now.slice(0, 10)}-${slug(title)}.md`;
  const absolute = path.join(dir, filename);

  const markdown = [
    "---",
    `type: ${JSON.stringify(type)}`,
    `title: ${JSON.stringify(title)}`,
    `source: ${JSON.stringify("jumpybrain-note")}`,
    `created_at: ${JSON.stringify(now)}`,
    `updated_at: ${JSON.stringify(now)}`,
    `confidence: ${JSON.stringify("user-reviewed")}`,
    `tags: ${JSON.stringify(options.tags ?? [])}`,
    "---",
    "",
    `# ${title}`,
    "",
    options.body.trim(),
    "",
  ].join("\n");

  const writtenAbsolute = await writeNewFile(absolute, markdown, dir, now, title);
  return { file: normalizeRelative(root, writtenAbsolute) };
}

async function writeNewFile(absolute: string, markdown: string, dir: string, now: string, title: string): Promise<string> {
  try {
    await writeFile(absolute, markdown, { encoding: "utf8", flag: "wx" });
    return absolute;
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException;
    if (fileError.code !== "EEXIST") throw error;
    const retry = path.join(dir, `${now.slice(0, 10)}-${slug(title)}-${Date.now()}.md`);
    await writeFile(retry, markdown, { encoding: "utf8", flag: "wx" });
    return retry;
  }
}

function normalizeType(value: string): MemoryNoteType {
  if (VALID_TYPES.has(value as MemoryNoteType)) return value as MemoryNoteType;
  throw new Error(`Invalid --type '${value}'. Use one of: ${[...VALID_TYPES].join(", ")}.`);
}

function directoryForType(type: MemoryNoteType): string {
  if (type === "note") return "notes";
  return `${type}s`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}
