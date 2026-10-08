import { listCanonicalMemoryMarkdownFiles, normalizedDocumentTitle, readMarkdownDocument, resolveMemoryRoot } from "../../core/canonical/index.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import type { RemoteMemoryNoteDraft } from "../writing/remote-writer.js";

/** Keep untrusted quick-capture fields intact until app validation. */
export interface ServerMemoryNoteDraft extends Omit<RemoteMemoryNoteDraft, "type" | "title" | "body"> {
  type: unknown;
  title?: unknown;
  body: unknown;
}

/** Called only for a new idempotent write, inside the HTTP server's write queue. */
export async function prepareServerNote(rootArg: string, draft: ServerMemoryNoteDraft, dailyDate: unknown): Promise<RemoteMemoryNoteDraft> {
  if (typeof draft.type !== "string" || typeof draft.body !== "string" || (draft.title !== undefined && typeof draft.title !== "string")) {
    throw new Error("Memory type, body, and any title must be strings.");
  }
  if (dailyDate === undefined) return { ...draft, type: draft.type, body: draft.body, title: draft.title ?? "" };

  if (typeof dailyDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dailyDate) || dailyDate.startsWith("0000-")) {
    throw new Error("dailyDate must be a real YYYY-MM-DD calendar date.");
  }
  const timestamp = Date.parse(`${dailyDate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== dailyDate) {
    throw new Error("dailyDate must be a real YYYY-MM-DD calendar date.");
  }
  if (draft.type !== "note" || draft.body.trim() !== "" || draft.title !== undefined) {
    throw new Error("dailyDate requires type note, a blank body, and no explicit title.");
  }

  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const pattern = new RegExp(`^${dailyDate}_note_(\\d+)$`);
  let highest = 0n;
  for (const file of await listCanonicalMemoryMarkdownFiles(root)) {
    const { frontmatter } = await readMarkdownDocument(root, file);
    // Share rename/title-lookup normalization, including ID-less files.
    const title = normalizedDocumentTitle(frontmatter.title);
    const match = pattern.exec(title);
    if (match) {
      const number = BigInt(match[1]!);
      if (number > highest) highest = number;
    }
  }
  // BigInt avoids rounding into an occupied suffix for unusually large imported titles.
  return { ...draft, type: "note", body: draft.body, title: `${dailyDate}_note_${highest + 1n}` };
}
