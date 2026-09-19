import { randomUUID } from "node:crypto";
import { link, mkdir, open, readdir, rename, rmdir, unlink, chmod } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MEMORY_DIRS, initializeMemoryRoot } from "../../core/memory-root/index.js";
import { hashMigrationBytes } from "../../core/migration/index.js";
import { assertSnapshot, fail, safePath, snapshot, statIfPresent, type Snapshot } from "./filesystem.js";

export type LogseqMigrationStep = "before-init" | "after-init" | "after-write" | "after-delete" | "after-manifest";
/** Test-only/internal seam; never exported through runtime. Throw to simulate a failure. */
export interface LogseqMigrationHooks {
  onStep?: (step: LogseqMigrationStep, detail: { writes: number; deletes: number }) => void | Promise<void>;
}
export interface Mutation { relative: string; before?: Snapshot; after?: Buffer; manifest?: boolean }
interface Operation extends Mutation { backup?: string; temp?: string; installed?: Snapshot; completed?: boolean }
interface MadeDirectory { path: string; dev: number; ino: number }
export const transactionPath = (root: string): string => `${root}.logseq-migration-transaction`;

async function durableWrite(file: string, bytes: Buffer, exclusive = false): Promise<void> {
  const handle = await open(file, exclusive ? "wx" : "w", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
async function syncDirectory(directory: string): Promise<void> {
  try { const handle = await open(directory, "r"); try { await handle.sync(); } finally { await handle.close(); } } catch { /* Directory fsync is not portable. */ }
}
async function removePrivateTree(directory: string): Promise<void> {
  // Do not follow links, even in our private transaction directory.
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) await removePrivateTree(target);
    else await unlink(target);
  }
  await rmdir(directory);
}

export async function applyTransaction(input: {
  root: string;
  mutations: Mutation[];
  initialize: boolean;
  configBefore?: Snapshot;
  ignoreBefore?: Snapshot;
  hooks?: LogseqMigrationHooks;
  revalidate: () => Promise<void>;
}): Promise<void> {
  const { root, hooks } = input;
  const lock = transactionPath(root);
  const madeDirectories: MadeDirectory[] = [];
  const operations: Operation[] = [];
  let acquired = false, writes = 0, deletes = 0;
  let status = "preparing";
  async function persist(): Promise<void> {
    const receipt = {
      version: 1, kind: "jumpybrain-logseq-transaction", status, rootName: path.basename(root),
      // Recovery uses relative mappings only; backups contain private canonical bytes and are mode 0600.
      directories: madeDirectories.map(dir => ({ relative: path.relative(path.dirname(root), dir.path), dev: dir.dev, ino: dir.ino })),
      operations: operations.map(op => ({ relative: op.relative, backup: op.backup,
        beforeHash: op.before?.hash ?? null, afterHash: op.after ? hashMigrationBytes(op.after) : null,
        beforeMode: op.before?.mode, temp: op.temp ? path.relative(root, op.temp) : undefined, completed: !!op.completed })),
    };
    const temp = path.join(lock, "receipt.next.json");
    await durableWrite(temp, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`));
    await rename(temp, path.join(lock, "receipt.json"));
    await syncDirectory(lock);
  }
  async function ensureDirectory(directory: string): Promise<void> {
    await safePath(directory);
    const existing = await statIfPresent(directory);
    if (existing) { if (!existing.isDirectory()) fail("Destination directory is occupied by a file."); return; }
    await ensureDirectory(path.dirname(directory));
    // Persist each created directory; a crash in this small window may leave an empty directory.
    await mkdir(directory, { mode: 0o700 });
    const stat = (await statIfPresent(directory))!;
    madeDirectories.push({ path: directory, dev: stat.dev, ino: stat.ino });
    if (acquired) await persist();
  }
  async function mutate(mutation: Mutation, notify = true): Promise<void> {
    const target = path.join(root, mutation.relative);
    await ensureDirectory(path.dirname(target));
    await assertSnapshot(target, mutation.before);
    const op: Operation = { ...mutation };
    if (op.before) {
      op.backup = `backup-${operations.length}`;
      await durableWrite(path.join(lock, op.backup), op.before.bytes, true);
    }
    if (op.after) op.temp = path.join(path.dirname(target), `.logseq-${randomUUID()}.tmp`);
    operations.push(op);
    await persist();
    if (op.after) {
      await durableWrite(op.temp!, op.after, true);
      await chmod(op.temp!, op.before?.mode ?? 0o600);
      // Recheck after staging, immediately before atomic publication. No portable filesystem CAS exists.
      await assertSnapshot(target, op.before);
      if (op.before) await rename(op.temp!, target);
      else { await link(op.temp!, target); await unlink(op.temp!); }
      const installed = await snapshot(target);
      if (!installed || installed.hash !== hashMigrationBytes(op.after)) fail("Destination changed during atomic publication; recovery must preserve concurrent edits.");
      op.installed = installed;
      op.temp = undefined;
    } else {
      await assertSnapshot(target, op.before);
      await unlink(target);
    }
    op.completed = true;
    await syncDirectory(path.dirname(target));
    await persist();
    if (notify) {
      if (op.manifest) await hooks?.onStep?.("after-manifest", { writes, deletes });
      else if (op.after) { writes++; await hooks?.onStep?.("after-write", { writes, deletes }); }
      else { deletes++; await hooks?.onStep?.("after-delete", { writes, deletes }); }
    }
  }
  async function rollback(): Promise<void> {
    status = "rolling-back";
    await persist();
    for (const op of [...operations].reverse()) {
      const target = path.join(root, op.relative);
      const current = await snapshot(target);
      const originalStillPresent = (!current && !op.before) || (current && op.before && current.hash === op.before.hash && current.ino === op.before.ino && current.dev === op.before.dev);
      if (!originalStillPresent) {
        const expected = op.after ? hashMigrationBytes(op.after) : undefined;
        if (current?.hash !== expected || (op.installed && current && (current.ino !== op.installed.ino || current.dev !== op.installed.dev || current.mtimeMs !== op.installed.mtimeMs))) fail("Rollback stopped to preserve a concurrent edit; retained transaction requires manual recovery.");
        if (op.before) {
          const temporary = path.join(path.dirname(target), `.logseq-${randomUUID()}.tmp`);
          await durableWrite(temporary, op.before.bytes, true);
          await chmod(temporary, op.before.mode);
          await assertSnapshot(target, current);
          if (current) await rename(temporary, target);
          else { await link(temporary, target); await unlink(temporary); }
        } else if (current) { await assertSnapshot(target, current); await unlink(target); }
      }
      if (op.temp && await statIfPresent(op.temp)) await unlink(op.temp);
      await syncDirectory(path.dirname(target));
    }
    // rmdir (not recursive rm) prevents removal of unrelated concurrent creations.
    for (const dir of [...madeDirectories].reverse()) {
      if (dir.path === path.dirname(lock) || lock.startsWith(`${dir.path}${path.sep}`)) continue;
      await safePath(dir.path);
      const current = await statIfPresent(dir.path);
      if (!current) continue;
      if (current.dev !== dir.dev || current.ino !== dir.ino) fail("Rollback directory changed; retained transaction requires manual recovery.");
      await rmdir(dir.path);
    }
    status = "rolled-back";
    await persist();
  }
  try {
    await safePath(lock);
    await ensureDirectory(path.dirname(lock));
    try { await mkdir(lock, { mode: 0o700 }); } catch { fail("Logseq migration transaction already exists or cannot be acquired; inspect retained recovery data before retrying."); }
    acquired = true;
    await persist();
    await input.revalidate();
    if (input.initialize) {
      await hooks?.onStep?.("before-init", { writes, deletes });
      const stage = path.join(lock, "initial-root");
      await mkdir(stage, { mode: 0o700 });
      if (input.ignoreBefore) await durableWrite(path.join(stage, ".gitignore"), input.ignoreBefore.bytes, true);
      // Use normal memory-root setup, but stage its output so all publication is transactional.
      await initializeMemoryRoot(stage);
      await ensureDirectory(root);
      for (const dir of DEFAULT_MEMORY_DIRS) await ensureDirectory(path.join(root, dir));
      await mutate({ relative: "jumpybrain.json", before: input.configBefore, after: (await snapshot(path.join(stage, "jumpybrain.json")))!.bytes }, false);
      const ignore = (await snapshot(path.join(stage, ".gitignore")))!;
      if (ignore.hash !== input.ignoreBefore?.hash) await mutate({ relative: ".gitignore", before: input.ignoreBefore, after: ignore.bytes }, false);
      await hooks?.onStep?.("after-init", { writes, deletes });
    }
    status = "applying";
    await persist();
    for (const mutation of input.mutations) {
      if (mutation.manifest) {
        for (const op of operations) if (op.completed) await assertSnapshot(path.join(root, op.relative), op.installed);
      }
      await mutate(mutation);
    }
    for (const op of operations) if (op.completed) await assertSnapshot(path.join(root, op.relative), op.installed);
    status = "committed";
    await persist();
  } catch {
    if (acquired) {
      try { await rollback(); } catch {
        fail("Migration failed; rollback could not safely complete. Transaction recovery data was retained next to the destination; stop writers and follow migration recovery instructions.");
      }
      try { await removePrivateTree(lock); } catch { fail("Migration rolled back, but transaction cleanup needs manual recovery."); }
    }
    // These ancestors had to exist before the sibling lock could be created.
    for (const dir of [...madeDirectories].reverse()) {
      const current = await statIfPresent(dir.path);
      if (current && current.dev === dir.dev && current.ino === dir.ino) {
        try { await rmdir(dir.path); } catch { /* Never remove unrelated concurrent files. */ }
      }
    }
    fail("Migration failed and was rolled back; no source files were written. Check destination permissions or concurrent writers before retrying.");
  }
  try { await removePrivateTree(lock); await syncDirectory(path.dirname(lock)); } catch {
    fail("Migration committed, but transaction cleanup failed. Retained receipt marks the committed state; do not repeat until recovery cleanup is complete.");
  }
}
