import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export const CANONICAL_MEMORY_BUCKETS = ["notes", "findings", "decisions", "preferences", "sessions", "pages"] as const;
export const CANONICAL_IGNORED_DIRS = new Set([".git", ".obsidian", ".trash", ".jumpybrain", ".qmd", "node_modules", "dist", "build", "logs", "reports"]);
export const CANONICAL_IGNORED_FILE_PATTERNS = [/gold/i, /answer_session_ids/i];

/** Explorer writes must stay visible to ordinary canonical discovery. */
export function validateCanonicalExplorerPath(value: unknown, file = false): asserts value is string {
  if (typeof value !== "string" || value.length > 4096 || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) throw new Error("Invalid canonical path.");
  const parts = value.split("/");
  if (!(CANONICAL_MEMORY_BUCKETS as readonly string[]).includes(parts[0]!) || parts.some(part => !part || part.startsWith(".") || part.trim() !== part || CANONICAL_IGNORED_DIRS.has(part))
    || CANONICAL_IGNORED_FILE_PATTERNS.some(pattern => pattern.test(value)) || (file && (parts.length < 2 || !value.toLowerCase().endsWith(".md")))) throw new Error("Invalid canonical path.");
}

/** Capture and recheck directory identities; never follow a symlink ancestor. */
export async function canonicalDirectoryIdentity(root: string, relative: string): Promise<string> {
  validateCanonicalExplorerPath(relative);
  let current = root;
  const identities: string[] = [];
  for (const part of ["", ...relative.split("/")]) {
    current = path.join(current, part);
    const entry = await lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Unsafe canonical directory.");
    identities.push(`${entry.dev}:${entry.ino}`);
  }
  if (await realpath(current) !== current) throw new Error("Changed canonical directory.");
  return identities.join("/");
}

export async function listCanonicalMemoryFolders(root: string, signal?: AbortSignal): Promise<string[]> {
  const folders: string[] = [];
  async function visit(relative: string) {
    signal?.throwIfAborted();
    try { validateCanonicalExplorerPath(relative); } catch { return; }
    const absolute = path.join(root, relative);
    let entry;
    try { entry = await lstat(absolute); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    if (!entry.isDirectory() || entry.isSymbolicLink()) return;
    await canonicalDirectoryIdentity(root, relative);
    folders.push(relative);
    for (const child of await readdir(absolute, { withFileTypes: true })) if (child.isDirectory() && !child.isSymbolicLink()) await visit(`${relative}/${child.name}`);
  }
  for (const bucket of CANONICAL_MEMORY_BUCKETS) await visit(bucket);
  return folders.sort();
}

/** One literal folder name, no recursive creation or replacement of existing entries. */
export async function createCanonicalMemoryFolder(root: string, relative: string): Promise<void> {
  validateCanonicalExplorerPath(relative);
  const parent = path.posix.dirname(relative);
  const before = await canonicalDirectoryIdentity(root, parent);
  if (await canonicalDirectoryIdentity(root, parent) !== before) throw new Error("Changed canonical directory.");
  await mkdir(path.join(root, relative));
}
