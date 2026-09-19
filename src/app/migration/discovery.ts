import { readdir } from "node:fs/promises";
import path from "node:path";
import { migrationPathKey, mapLogseqPath } from "../../core/migration/index.js";
import { fail, safePath, snapshot, statIfPresent, type Snapshot } from "./filesystem.js";

export interface SourceDocument { sourcePath: string; body: Buffer; snapshot: Snapshot }
export interface Discovery { documents: SourceDocument[]; warnings: string[] }

export async function discoverLogseq(source: string): Promise<Discovery> {
  await safePath(source);
  if (!(await statIfPresent(source))?.isDirectory()) fail("Logseq source must be an existing directory.");
  const rootEntries = await readdir(source, { withFileTypes: true });
  if (rootEntries.some(entry => /(?:\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$)|^(?:db|database)$/i.test(entry.name))) fail("Unsupported Logseq database graph or Markdown mirror; use a classic file graph.");
  const logseq = path.join(source, "logseq");
  const logseqStat = await statIfPresent(logseq);
  if (logseqStat?.isSymbolicLink()) fail("Symlinked Logseq configuration cannot be validated.");
  if (logseqStat?.isDirectory()) {
    const entries = await readdir(logseq, { withFileTypes: true });
    if (entries.some(entry => /(?:\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm))?$)|^(?:db|database)$/i.test(entry.name))) fail("Unsupported Logseq database graph or Markdown mirror; use a classic file graph.");
    const configPath = path.join(logseq, "config.edn");
    const configStat = await statIfPresent(configPath);
    if (configStat && configStat.size > 1024 * 1024) fail("Logseq configuration is too large to validate safely.");
    const config = await snapshot(configPath);
    if (config) {
      // This is deliberately conservative, not a general EDN evaluator. Never execute reader forms.
      const text = config.bytes.toString("utf8").replace(/;[^\r\n]*/g, "");
      if (/#=|#_[\s\S]*:(?:pages|journals)-directory|:(?:graph\/db\?|db-graph\?|logseq\.db[^\s]*)\s+true/.test(text)) fail("Unsupported or ambiguous Logseq database/custom configuration mode.");
      for (const [key, defaultValue] of [["pages-directory", "pages"], ["journals-directory", "journals"]]) {
        const pattern = new RegExp(`:${key}\\s+([^\\r\\n,}]+)`, "g");
        for (const match of text.matchAll(pattern)) {
          // Accept only an explicit default string. Reject custom directories instead of silently losing documents.
          if (!match[1]!.trim().startsWith(`"${defaultValue}"`) || !/^"[^"\\]*"(?:\s|$)/.test(match[1]!.trim())) fail("Custom Logseq page/journal directories are not supported; use default pages/ and journals/.");
        }
      }
      if (/:file\/format\s+:(?:org|org-mode)\b/.test(text)) fail("Unsupported Logseq Org-mode graph; only classic Markdown graphs are supported.");
    }
  }
  const documents: SourceDocument[] = [];
  const seen = new Set<string>();
  const ignored = { assets: 0, config: 0, backups: 0, other: 0, symlinks: 0 };
  async function countIgnored(directory: string, category: "assets" | "config" | "backups" | "other"): Promise<void> {
    await safePath(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) { ignored.symlinks++; continue; }
      const nextCategory = category === "config" && entry.name === "bak" ? "backups" : category;
      if (entry.isDirectory()) await countIgnored(path.join(directory, entry.name), nextCategory);
      else ignored[nextCategory]++;
    }
  }
  async function walk(directory: string, relative: string): Promise<void> {
    await safePath(directory);
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name), sourcePath = `${relative}/${entry.name}`;
      if (entry.name.startsWith(".")) {
        if (entry.isSymbolicLink()) ignored.symlinks++;
        else if (entry.isDirectory()) await countIgnored(absolute, "other");
        else ignored.other++;
        continue;
      }
      if (entry.isSymbolicLink()) fail("Symlinks inside active Logseq pages/journals are not supported.");
      if (entry.isDirectory()) { await walk(absolute, sourcePath); continue; }
      if (!entry.isFile()) fail("Unsupported special file inside active Logseq pages/journals.");
      if (!/\.md$/i.test(entry.name)) { ignored.other++; continue; }
      const mapped = mapLogseqPath(sourcePath);
      const key = migrationPathKey(mapped.outputPath);
      if (seen.has(key)) fail("Normalized/case-folded source mapping collision.");
      seen.add(key);
      const state = await snapshot(absolute);
      if (!state) fail("Source changed during discovery; retry.");
      documents.push({ sourcePath, body: state.bytes, snapshot: state });
    }
  }
  let buckets = 0;
  for (const entry of rootEntries) {
    const absolute = path.join(source, entry.name);
    if (entry.name === "pages" || entry.name === "journals") {
      if (!entry.isDirectory() || entry.isSymbolicLink()) fail("Logseq pages/journals must be regular directories, not symlinks.");
      buckets++;
      await walk(absolute, entry.name);
    } else if (entry.isSymbolicLink()) ignored.symlinks++;
    else if (entry.isDirectory()) await countIgnored(absolute, entry.name === "assets" ? "assets" : entry.name === "logseq" ? "config" : "other");
    else ignored.other++;
  }
  if (!buckets) fail("Not a supported classic Logseq graph: pages/ or journals/ is required (database mirrors are unsupported).");
  documents.sort((a, b) => a.sourcePath < b.sourcePath ? -1 : a.sourcePath > b.sourcePath ? 1 : 0);
  return { documents, warnings: [`Omitted files (bodies not read): assets=${ignored.assets}, config/support=${ignored.config}, backups=${ignored.backups}, other=${ignored.other}; skipped symlinks=${ignored.symlinks}. Configuration is read only for mode validation.`] };
}
