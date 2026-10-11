/** Strict observational retrieval. No lock acquisition, recovery, CLI, cache or models. */
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databasePath, derivedRoot, manifestPath, QMD_COLLECTION, QMD_DREAM_COLLECTION, resolveQmdSdk } from "./qmd-cli.js";
import { checkExecution, MemoryExecutionError, readExecution, runQmdChild, withQmdOperation } from "./qmd-execution.js";

const messages = {
  read_only_busy: "Read-only memory retrieval refused: an index lock exists. Wait for indexing to finish; have maintenance inspect an abandoned lock.",
  read_only_pending: "Read-only memory retrieval refused: index publication is pending. Run authorized index recovery outside read-only mode, then retry.",
  read_only_wal: "Read-only memory retrieval refused: SQLite has a nonempty WAL. Stop writers and have authorized maintenance checkpoint and close the index, then retry.",
  read_only_missing: "Read-only memory retrieval requires an existing published index with a generation. Run an explicit authorized index outside read-only mode first.",
  read_only_generation: "Read-only memory retrieval refused: database and published generations do not match. Run authorized index recovery or rebuild outside read-only mode, then retry.",
  read_only_changed: "Read-only memory retrieval discarded: index or publication state changed during retrieval. Wait for indexing to finish and retry.",
  read_only_invalid: "Read-only memory retrieval cannot read the index safely. Stop operations and have authorized maintenance inspect or rebuild the derived index outside read-only mode.",
  read_only_sdk: "Read-only memory retrieval requires the CLI and SDK from @tobilu/qmd@2.8.3. Install that package or check JUMPYBRAIN_QMD_BIN.",
  read_only_arguments: "Read-only QMD supports only collection-scoped lexical search with --json, -n and -c; semantic/model queries are not supported.",
} as const;
export type ReadOnlyQmdCode = keyof typeof messages;
export class ReadOnlyQmdError extends Error {
  constructor(readonly code: ReadOnlyQmdCode) { super(messages[code]); this.name = "ReadOnlyQmdError"; }
}
export function isReadOnlyQmdCode(code: unknown): code is ReadOnlyQmdCode {
  return typeof code === "string" && Object.hasOwn(messages, code);
}

export interface ReadOnlyGeneration { generation: string; signature: string }
async function fileState(file: string, required = false): Promise<string | undefined> {
  try {
    const info = await readExecution(lstat(file, { bigint: true }));
    if (!info.isFile()) throw new ReadOnlyQmdError("read_only_invalid");
    return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.mode].join(":");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (required) throw new ReadOnlyQmdError("read_only_missing");
      return undefined;
    }
    throw error;
  }
}
async function assertAbsent(file: string, code: ReadOnlyQmdCode): Promise<void> {
  try { await readExecution(lstat(file)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new ReadOnlyQmdError(code);
}
/** Worker and orchestration share the same non-mutating publication/WAL gate. */
export async function observeReadOnlyQmdGeneration(root: string): Promise<ReadOnlyGeneration> {
  checkExecution();
  try {
    await assertAbsent(path.join(derivedRoot(root), "index.lock"), "read_only_busy");
    await assertAbsent(path.join(derivedRoot(root), "index-pending.json"), "read_only_pending");
    const db = databasePath(root);
    const wal = await fileState(`${db}-wal`);
    if (wal && wal.split(":")[2] !== "0") throw new ReadOnlyQmdError("read_only_wal");
    const shm = await fileState(`${db}-shm`);
    const dbState = await fileState(db, true);
    const manifestState = await fileState(manifestPath(root), true);
    const bytes = await readExecution(readFile(manifestPath(root)));
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
      || typeof manifest.generation !== "string" || !manifest.generation.trim()) throw new ReadOnlyQmdError("read_only_missing");
    // Reject changes even within this observation, not just across the operation.
    if (manifestState !== await fileState(manifestPath(root), true) || dbState !== await fileState(db, true)
      || wal !== await fileState(`${db}-wal`) || shm !== await fileState(`${db}-shm`)) throw new ReadOnlyQmdError("read_only_changed");
    await assertAbsent(path.join(derivedRoot(root), "index.lock"), "read_only_busy");
    await assertAbsent(path.join(derivedRoot(root), "index-pending.json"), "read_only_pending");
    return { generation: manifest.generation, signature: JSON.stringify([dbState, manifestState, wal, shm,
      createHash("sha256").update(bytes).digest("hex")]) };
  } catch (error) {
    if (error instanceof ReadOnlyQmdError || error instanceof MemoryExecutionError) throw error;
    throw new ReadOnlyQmdError("read_only_invalid");
  }
}
export function assertSameReadOnlyQmdGeneration(before: ReadOnlyGeneration, after: ReadOnlyGeneration): void {
  if (before.generation !== after.generation || before.signature !== after.signature) throw new ReadOnlyQmdError("read_only_changed");
}
function sdkPath(): string {
  try { return resolveQmdSdk(); } catch { throw new ReadOnlyQmdError("read_only_sdk"); }
}
async function readOnlyWorker(root: string, generation: string, request: Record<string, unknown>): Promise<{ rows?: unknown[] }> {
  const result = await runQmdChild(process.execPath, [fileURLToPath(new URL("./qmd-worker.js", import.meta.url))], {
    cwd: root, input: JSON.stringify({ ...request, sdkPath: sdkPath(), root, dbPath: databasePath(root), generation }),
    maxBytes: 20 * 1024 * 1024, acceptNonzero: true,
    // URI support must be enabled BEFORE better-sqlite3's native library loads.
    env: { ...process.env, SQLITE_USE_URI: "1" },
  });
  let payload;
  try { payload = JSON.parse(result.stdout.trim()); } catch { throw new ReadOnlyQmdError("read_only_invalid"); }
  if (payload?.error) throw new ReadOnlyQmdError(isReadOnlyQmdCode(payload.error.code) ? payload.error.code : "read_only_invalid");
  if (result.exitCode !== 0 || !payload || payload.generation !== generation
    || (request.action === "read-only-query" && !Array.isArray(payload.rows))) throw new ReadOnlyQmdError("read_only_invalid");
  return payload;
}
/** Validates across ALL discovery, query, snippet and ranking calls supplied by the caller.
 * This is a before/after change detector, NOT a cross-process reader snapshot.
 * It deliberately does not acquire/reap the existing index lock.
 */
export async function withReadOnlyQmdGeneration<T>(root: string, operation: () => Promise<T>): Promise<T> {
  root = path.resolve(root);
  return withQmdOperation(root, "search", {}, async () => {
    const before = await observeReadOnlyQmdGeneration(root);
    await readOnlyWorker(root, before.generation, { action: "read-only-generation" });
    assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
    try { return await operation(); }
    finally {
      assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
      await readOnlyWorker(root, before.generation, { action: "read-only-generation" });
      assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
    }
  });
}
export async function runReadOnlyQmd(root: string, args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  root = path.resolve(root);
  return withQmdOperation(root, "search", {}, async () => {
    if (args[0] !== "search" || typeof args[1] !== "string") throw new ReadOnlyQmdError("read_only_arguments");
    const query = args[1];
    let json = false, limit = 10, collection: string = QMD_COLLECTION;
    const seen = new Set<string>();
    for (let i = 2; i < args.length; i++) {
      const flag = args[i];
      if (seen.has(flag)) throw new ReadOnlyQmdError("read_only_arguments");
      seen.add(flag);
      if (flag === "--json") json = true;
      else if (flag === "-n") {
        const value = args[++i];
        if (!value || !/^\d+$/.test(value)) throw new ReadOnlyQmdError("read_only_arguments");
        limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 160) throw new ReadOnlyQmdError("read_only_arguments");
      } else if (flag === "-c") {
        collection = args[++i];
        if (collection !== QMD_COLLECTION && collection !== QMD_DREAM_COLLECTION) throw new ReadOnlyQmdError("read_only_arguments");
      } else throw new ReadOnlyQmdError("read_only_arguments");
    }
    if (!json) throw new ReadOnlyQmdError("read_only_arguments");
    const before = await observeReadOnlyQmdGeneration(root);
    const { rows } = await readOnlyWorker(root, before.generation, { action: "read-only-query", query, limit, collection });
    assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
    return { stdout: `${JSON.stringify(rows)}\n`, stderr: "", exitCode: 0 };
  });
}
