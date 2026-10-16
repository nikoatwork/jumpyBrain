import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { hashMigrationBytes, migrationPathKey } from "../../core/migration/index.js";

export class MigrationError extends Error {}
export function fail(message: string): never { throw new MigrationError(message); }
export function missing(error: unknown): boolean { return (error as NodeJS.ErrnoException)?.code === "ENOENT"; }
export async function statIfPresent(file: string) {
  try { return await lstat(file); } catch (error) { if (missing(error)) return undefined; throw error; }
}

/** Reject symlinks in EVERY existing component, including ancestors outside the root. */
export async function safePath(file: string): Promise<void> {
  const absolute = path.resolve(file);
  const parsed = path.parse(absolute);
  const parts = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  if (process.platform === "win32" && parts.some(part => part.includes(":"))) fail("Windows alternate data stream paths are not supported for migration.");
  let current = parsed.root;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    const names = await readdir(current);
    if (names.some(name => name !== part && migrationPathKey(name) === migrationPathKey(part))) fail("Normalized/case-folded destination or source path collision.");
    current = path.join(current, part);
    const stat = await statIfPresent(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) fail("Symlink path components are not supported for migration.");
    if (index < parts.length - 1 && !stat.isDirectory()) fail("Migration path has a non-directory ancestor.");
    if (!stat.isDirectory() && !stat.isFile()) fail("Unsupported special file in migration path.");
  }
}

export interface Snapshot {
  bytes: Buffer;
  hash: string;
  mode: number;
  dev: number;
  ino: number;
  mtimeMs: number;
}
export async function snapshot(file: string): Promise<Snapshot | undefined> {
  await safePath(file);
  const before = await statIfPresent(file);
  if (!before) return undefined;
  if (!before.isFile() || before.nlink !== 1) fail("Migration requires regular, non-hardlinked files.");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.nlink !== 1) fail("File changed during migration preflight; retry.");
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail("File changed during migration preflight; retry.");
    return { bytes, hash: hashMigrationBytes(bytes), mode: stat.mode & 0o777, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs };
  } finally { await handle.close(); }
}
export async function assertSnapshot(file: string, expected: Snapshot | undefined): Promise<void> {
  const current = await snapshot(file);
  if ((!expected) !== (!current) || (expected && current && (expected.hash !== current.hash || expected.dev !== current.dev || expected.ino !== current.ino || expected.mtimeMs !== current.mtimeMs))) fail("Destination or source changed after preflight; retry without concurrent writers.");
}
export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(migrationPathKey(parent), migrationPathKey(child));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
