import path from "node:path";
import { resolveMemoryRoot, normalizeRelative } from "../../core/canonical/markdown-store.js";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { generateMemoryDocumentId, renderMarkdownDocument } from "../../core/writing/index.js";
import { writeUniqueMarkdownFile } from "./filesystem.js";

/** Called only while creating a new local brain in desktop onboarding. */
export async function createFocusStarterPage(rootArg: string) {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const id = generateMemoryDocumentId(), now = new Date().toISOString();
  const boxes = (count: number) => Array.from({ length: count }, () => "- [ ] ").join("\n");
  const content = renderMarkdownDocument([
    ["id", id], ["type", "page"], ["title", "Today"], ["source", "desktop-starter"],
    ["created_at", now], ["updated_at", now], ["attention_at", null],
  ], ["Make a little room for what matters. These boxes are space, not a quota.", "",
    "## Main focus", "", "The thing you want to move forward. Give it the biggest slice of today.", "", boxes(10), "",
    "## Secondary focus", "", "Worth a little time, once the main thing has had its turn.", "", boxes(5), "",
    "## The rest", "", "Likely to ask for more attention than it deserves. Make it wait politely.", "", boxes(5), "",
    "Reuse this page tomorrow, or make it your own. Unpin or settle it when you want it out of the sidebar.", ""].join("\n"));
  const file = await writeUniqueMarkdownFile(path.join(root, "pages"), "today", content);
  return { id, title: "Today", file: normalizeRelative(root, file) };
}
