import { randomUUID } from "node:crypto";
import { link, lstat, mkdir, open, unlink } from "node:fs/promises";
import path from "node:path";

type DirectoryIdentity = { file: string; dev: number; ino: number };

// Callers resolve their memory root first. Do not silently realpath a bucket or
// report directory: that would bless an escaping symlink as a new destination.
async function safeDirectories(dir: string): Promise<DirectoryIdentity[]> {
  const absolute = path.resolve(dir);
  let current = path.parse(absolute).root;
  const directories: DirectoryIdentity[] = [];
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe Markdown destination directory: symlink or special file.");
    directories.push({ file: current, dev: stat.dev, ino: stat.ino });
  }
  return directories;
}

async function recheckDirectories(directories: DirectoryIdentity[]): Promise<void> {
  for (const directory of directories) {
    const stat = await lstat(directory.file);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== directory.dev || stat.ino !== directory.ino) {
      throw new Error("Unsafe Markdown destination directory: changed during write.");
    }
  }
}

export async function writeUniqueMarkdownFile(dir: string, baseName: string, markdown: string): Promise<string> {
  if (!baseName || baseName === "." || baseName === ".." || /[/\\]/.test(baseName)) {
    throw new Error("Markdown base name must be a single filename component.");
  }
  const directories = await safeDirectories(dir);
  const candidates = [
    path.join(dir, `${baseName}.md`),
    ...Array.from({ length: 20 }, (_, index) => path.join(dir, `${baseName}-${Date.now()}-${index + 1}.md`)),
  ];
  const temporary = path.join(dir, `.${baseName}.${process.pid}.${randomUUID()}.tmp`);
  let handle;
  let staged = false;
  try {
    handle = await open(temporary, "wx");
    staged = true;
    await handle.writeFile(markdown, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;

    let lastError: unknown;
    for (const candidate of candidates) {
      await recheckDirectories(directories);
      try {
        // Same-directory hardlink publishes all fsynced bytes in one exclusive
        // operation. Never fall back to copy/write or overwrite-capable rename.
        await link(temporary, candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        lastError = error;
        continue;
      }
      await unlink(temporary);
      staged = false;
      await fsyncDirectoryBestEffort(dir);
      return candidate;
    }
    throw lastError instanceof Error ? lastError : new Error("Unable to create unique Markdown file.");
  } finally {
    if (handle) await handle.close().catch(() => undefined);
    if (staged) await unlink(temporary).catch(() => undefined);
  }
}

async function fsyncDirectoryBestEffort(dir: string): Promise<void> {
  let handle;
  try {
    handle = await open(dir, "r");
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some platforms; file fsync is required.
  } finally {
    if (handle) await handle.close().catch(() => undefined);
  }
}
