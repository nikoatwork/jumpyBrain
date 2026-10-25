import { readdir } from "node:fs/promises";
import path from "node:path";
import { mapObsidianPath, migrationPathKey, type ObsidianOmissions } from "../../core/migration/index.js";
import { fail, safePath, snapshot, statIfPresent } from "./filesystem.js";
import type { Discovery, SourceDocument } from "./discovery.js";

export async function discoverObsidian(source: string): Promise<Discovery & { omissions: ObsidianOmissions }> {
  await safePath(source);
  if (!(await statIfPresent(source))?.isDirectory()) fail("Obsidian source must be an existing directory.");
  const documents: SourceDocument[] = [], seen = new Set<string>();
  const omissions: ObsidianOmissions = { hidden: 0, nonMarkdown: 0, symlinks: 0 };
  async function walk(directory: string, relative: string, hidden = false): Promise<void> {
    await safePath(directory);
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const file = path.join(directory, entry.name), sourcePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) { omissions.symlinks++; continue; }
      const support = hidden || entry.name.startsWith(".");
      if (entry.isDirectory()) { await walk(file, sourcePath, support); continue; }
      if (support) { omissions.hidden++; continue; }
      if (!entry.isFile()) fail("Unsupported special file inside active Obsidian vault.");
      if (!/\.md$/i.test(entry.name)) { omissions.nonMarkdown++; continue; }
      const mapped = mapObsidianPath(sourcePath), key = migrationPathKey(mapped.outputPath);
      if (seen.has(key)) fail("Normalized/case-folded source mapping collision.");
      seen.add(key);
      const state = await snapshot(file);
      if (!state) fail("Source changed during discovery; retry.");
      documents.push({ sourcePath, body: state.bytes, snapshot: state });
    }
  }
  await walk(source, "");
  documents.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
  return { documents, omissions, warnings: [`Omitted files (bodies not read): hidden/config/trash=${omissions.hidden}, non-Markdown/attachments/Canvas/Bases=${omissions.nonMarkdown}; skipped symlinks=${omissions.symlinks}. No plugins or settings are evaluated.`] };
}
