import { readFile, writeFile } from "node:fs/promises";
import { listCanonicalMemoryMarkdownFiles, normalizeRelative } from "../../core/canonical/markdown-store.js";
import { stampMissingMemoryDocumentId } from "../../core/writing/document-id-stamping.js";
import { generateMemoryDocumentId } from "../../core/writing/metadata.js";
import type { ProcessMemoryResult } from "../../types.js";

export async function ensureMemoryIds(root: string): Promise<ProcessMemoryResult> {
  const markdownFiles = await listCanonicalMemoryMarkdownFiles(root);
  const now = new Date().toISOString();
  const files: string[] = [];

  for (const file of markdownFiles) {
    const content = await readFile(file, "utf8");
    const stamped = stampMissingMemoryDocumentId(content, { id: generateMemoryDocumentId(), updatedAt: now });
    if (!stamped.modified) continue;
    await writeFile(file, stamped.content, "utf8");
    files.push(normalizeRelative(root, file));
  }

  files.sort((a, b) => a.localeCompare(b));
  return {
    root,
    mode: "ensure-ids",
    applied: true,
    files,
    modifiedCount: files.length,
    summary: [`Modified count: ${files.length}.`, "Stamped missing IDs only in canonical memory buckets."],
  };
}
