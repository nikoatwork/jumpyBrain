import { checkExecution, isExecutionControlError, MemoryExecutionError, runQmdChild } from "./qmd-execution.js";
import { randomUUID } from "node:crypto";
import { existsSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IndexMemoryOptions, IndexingPolicy, MarkdownDocument, RetrievalReadiness } from "../../types.js";
import type { QmdManifest } from "./qmd-driver.js";
import { databasePath, derivedRoot, manifestPath, resolveQmdSdk } from "./qmd-cli.js";
import type { WorkerWork } from "./qmd-worker.js";

const failurePath = (root: string) => path.join(derivedRoot(root), "index-failure.json");
const pendingPath = (root: string) => path.join(derivedRoot(root), "index-pending.json");

export async function recordQmdFailure(root: string): Promise<void> {
  await atomicJson(failurePath(root), { code: "index_failed", at: new Date().toISOString() });
}

export async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

/** One bounded, cross-process exclusion seam for publication and multi-call reads. */
export async function withQmdLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  await mkdir(derivedRoot(root), { recursive: true });
  const lock = path.join(derivedRoot(root), "index.lock");
  const deadline = Date.now() + 5_000;
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  while (true) {
    checkExecution();
    try {
      const fd = openSync(lock, "wx", 0o600);
      try { writeFileSync(fd, owner); } finally { closeSync(fd); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const observed = readFileSync(lock, "utf8");
        let record;
        try { record = JSON.parse(observed); } catch { /* Interrupted initial lock write. */ }
        const pid = typeof record === "number" ? record : record?.pid;
        const token = typeof record?.token === "string" && /^[a-f0-9-]{36}$/.test(record.token)
          ? record.token : String(statSync(lock).birthtimeMs).replace(/[^0-9]/g, "");
        let abandoned = false;
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); }
          catch (error) { abandoned = (error as NodeJS.ErrnoException).code === "ESRCH"; }
        } else abandoned = Date.now() - statSync(lock).mtimeMs > 30_000;
        if (abandoned) {
          // An immutable, per-owner reap claim elects exactly one reclaimer. Leaving
          // this tiny tombstone prevents a delayed reclaimer unlinking a new owner.
          const claim = `${lock}.reaped-${token}`;
          try {
            const fd = openSync(claim, "wx", 0o600);
            closeSync(fd);
            if (readFileSync(lock, "utf8") === observed) unlinkSync(lock);
            continue;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; }
      if (Date.now() >= deadline) throw new MemoryExecutionError("execution_overloaded");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await operation(); }
  finally {
    try { if (readFileSync(lock, "utf8") === owner) unlinkSync(lock); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

async function worker(request: Record<string, unknown>): Promise<{ manifest: QmdManifest | null; work?: WorkerWork }> {
  let result;
  try { result = await runQmdChild(process.execPath, [fileURLToPath(new URL("./qmd-worker.js", import.meta.url))], {
    input: JSON.stringify({ ...request, ownerPid: process.pid }), maxBytes: 64 * 1024 * 1024, acceptNonzero: true,
    command: request.action === "manifest" ? "query" : "index",
    env: { ...process.env, QMD_SQLITE_BUSY_TIMEOUT: "5000" },
  }); } catch (error) {
    if (isExecutionControlError(error) || error instanceof MemoryExecutionError) throw error;
    throw new MemoryExecutionError("execution_failed");
  }
  let payload;
  try { payload = JSON.parse(result.stdout.trim().split("\n").at(-1) ?? ""); } catch { /* Safe fixed diagnostics below. */ }
  if (result.exitCode !== 0 || payload?.error || !payload || !("manifest" in payload)) {
    const stage = payload?.error?.stage;
    const safeStage = typeof stage === "string" && /^[a-z-]{1,24}$/.test(stage) ? stage : "execution";
    throw new Error(`QMD indexing failed during ${safeStage}; previous committed index retained. Check policy/model and retry index (use --rebuild for model changes).`);
  }
  return payload;
}

/** Must run under the root lock. Replays commit-before-publication after interruption. */
export async function recoverQmdPublication(root: string): Promise<void> {
  if (!existsSync(pendingPath(root))) return;
  const { manifest } = await worker({ action: "manifest", sdkPath: resolveQmdSdk(), dbPath: databasePath(root) });
  if (manifest) {
    await publishConfiguration(root, manifest);
    await atomicJson(manifestPath(root), manifest);
  }
  if (!existsSync(failurePath(root))) await atomicJson(failurePath(root), { code: "interrupted_update", at: new Date().toISOString() });
  await rm(pendingPath(root), { force: true });
}

async function publishConfiguration(root: string, manifest: QmdManifest): Promise<void> {
  const configDir = path.join(derivedRoot(root), "qmd-config");
  await mkdir(configDir, { recursive: true });
  // JSON is valid YAML; never inherit an unrelated ancestor .qmd or model config.
  await atomicJson(path.join(configDir, "index.yml"), {
    collections: Object.fromEntries(["jumpybrain", "jumpybrain-dreams"].map(name => [name, { path: manifest.sourceRoot ?? root, pattern: "**/*.md" }])),
    models: manifest.policy?.mode === "semantic" ? { embed: manifest.policy.model } : {},
  });
}

export async function updateQmdGeneration(root: string, documents: Array<MarkdownDocument & { content: string }>, manifest: QmdManifest, policy: IndexingPolicy, options: IndexMemoryOptions): Promise<{ manifest: QmdManifest; work: WorkerWork }> {
  await recoverQmdPublication(root);
  checkExecution();
  const sdkPath = resolveQmdSdk();
  await mkdir(path.dirname(databasePath(root)), { recursive: true });
  await mkdir(path.join(derivedRoot(root), "qmd-home"), { recursive: true });
  checkExecution();
  await atomicJson(pendingPath(root), { generation: manifest.generation });
  // On failure leave pending: recovery checks the actual commit, never assumes rollback.
  // The driver records all indexing failures (including input/policy errors) in one place.
  const result = await worker({ sdkPath, root, dbPath: databasePath(root), sourceRoot: manifest.sourceRoot ?? root, documents, manifest, policy, rebuild: options.rebuild });
  checkExecution();
  if (!result.manifest || !result.work) throw new Error("QMD indexing returned no committed generation.");
  await publishConfiguration(root, result.manifest);
  await atomicJson(manifestPath(root), result.manifest);
  await rm(pendingPath(root), { force: true });
  await rm(failurePath(root), { force: true });
  // Remove obsolete copy-only machinery after successful migration.
  await rm(path.join(derivedRoot(root), "qmd-dreams"), { recursive: true, force: true });
  return { manifest: result.manifest, work: result.work };
}

/** App maintenance may replay publication, but observational reads cannot mix generations. */
export async function recoverQmdIndex(root: string): Promise<void> {
  if (existsSync(pendingPath(root))) await withQmdLock(root, () => recoverQmdPublication(root));
}

export function assertQmdPublished(root: string): void {
  if (existsSync(pendingPath(root))) throw new Error("Memory index publication is pending; local reads can retry without --no-refresh. Hosted reads must wait for maintenance or authorized index recovery.");
}

export async function qmdReadiness(root: string, manifest?: QmdManifest, stale?: boolean): Promise<RetrievalReadiness> {
  let lastFailure: RetrievalReadiness["lastFailure"];
  try {
    const raw = JSON.parse(await readFile(failurePath(root), "utf8"));
    if (["index_failed", "interrupted_update"].includes(raw.code) && typeof raw.at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw.at)) lastFailure = { code: raw.code, at: raw.at };
  } catch { /* Missing/corrupt derived diagnostics never expose raw content. */ }
  const missing = !manifest || !existsSync(databasePath(root));
  const pending = existsSync(pendingPath(root));
  let semantic = !missing && manifest.embedding?.state === "complete" && manifest.policy?.mode === "semantic";
  if (semantic) {
    try {
      const current = await stat(manifest!.policy!.model!);
      semantic = current.isFile() && !!manifest!.modelStat && current.size === manifest!.modelStat.size && current.mtimeMs === manifest!.modelStat.mtimeMs
        && (manifest!.modelStat.ctimeMs === undefined || current.ctimeMs === manifest!.modelStat.ctimeMs);
    } catch { semantic = false; }
  }
  return {
    freshness: missing ? "missing" : pending || stale ? "stale" : stale === false ? "fresh" : "unknown",
    modes: missing ? [] : semantic ? ["lexical", "semantic"] : ["lexical"],
    embedding: manifest?.policy?.mode === "lexical" ? "disabled" : semantic ? "complete" : manifest?.policy?.mode === "semantic" ? "incomplete" : "unknown",
    ...(lastFailure ? { lastFailure } : {}),
  };
}
