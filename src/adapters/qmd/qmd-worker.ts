/** Isolated, version-pinned QMD writer. stdin -> one final JSON response on stdout. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { MarkdownDocument } from "../../types.js";

export interface WorkerPolicy {
  mode: "lexical" | "semantic";
  model?: string;
  modelHash?: string;
}
export interface WorkerIndexRequest {
  action?: "index";
  sdkPath: string;
  root: string;
  dbPath: string;
  sourceRoot: string;
  documents: Array<MarkdownDocument & { content: string }>;
  manifest: Record<string, unknown>;
  policy: WorkerPolicy;
  rebuild?: boolean;
  ownerPid?: number;
}
export interface WorkerManifestRequest {
  action: "manifest";
  sdkPath: string;
  dbPath: string;
}
export type WorkerRequest = WorkerIndexRequest | WorkerManifestRequest;

export interface WorkerWork {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  /** Number of embedding chunks written, not document or dream-copy count. */
  embedded: number;
}
interface EmbeddingState {
  state: "complete" | "disabled";
  model?: string;
  modelHash?: string;
  fingerprint?: string;
  hashes?: number;
  chunks?: number;
  emptyHashes?: number;
  pending?: number;
}
type Manifest = Record<string, unknown> & { embedding?: EmbeddingState; policy?: WorkerPolicy };
type Row = Record<string, unknown>;
interface Database {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: unknown[]): Row | undefined;
    all(...params: unknown[]): Row[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
}
interface Llm {
  dispose(): Promise<void>;
  resolveModel(uri: string): Promise<string>;
  ensureLlama(allowBuild?: boolean): Promise<unknown>;
}
interface InternalStore {
  db: Database;
  llm: Llm;
  insertContent(hash: string, content: string, createdAt: string): void;
  insertDocument(collection: string, file: string, title: string, hash: string, createdAt: string, modifiedAt: string): void;
  findActiveDocument(collection: string, file: string): { id: number; hash: string; title: string } | null;
  updateDocument(id: number, title: string, hash: string, modifiedAt: string): void;
  updateDocumentTitle(id: number, title: string, modifiedAt: string): void;
  deactivateDocument(collection: string, file: string): void;
  getActiveDocumentPaths(collection: string): string[];
  clearAllEmbeddings(): void;
}
interface SdkStore { internal: InternalStore; close(): Promise<void> }
interface StoreModule {
  upsertStoreCollection(db: Database, name: string, config: { path: string; pattern: string }): void;
  getEmbeddingFingerprint(model: string): string;
  getHashesForEmbedding(db: Database, model: string): Array<{ hash: string; body: string }>;
  generateEmbeddings(store: InternalStore, options: { model: string; chunkStrategy: "regex" }): Promise<{
    chunksEmbedded: number; errors: number; failures?: unknown[];
  }>;
}

const COLLECTION = "jumpybrain";
const DREAMS = "jumpybrain-dreams";
const BUSY_TIMEOUT_MS = 5_000;
let stage = "input";

function requireCondition(condition: unknown): asserts condition {
  if (!condition) throw new Error("worker invariant failed");
}
function tableExists(db: Database, name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
}
function committedManifest(db: Database): Manifest | null {
  if (!tableExists(db, "jb_generation")) return null;
  const row = db.prepare("SELECT manifest FROM jb_generation WHERE id = 1").get();
  if (!row) return null;
  const manifest: unknown = JSON.parse(String(row.manifest));
  requireCondition(manifest && typeof manifest === "object" && !Array.isArray(manifest));
  return manifest as Manifest;
}
async function fileHash(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
async function validateSdk(sdkPath: string): Promise<void> {
  stage = "sdk-version";
  requireCondition(typeof sdkPath === "string" && path.isAbsolute(sdkPath));
  requireCondition(path.basename(sdkPath) === "index.js" && path.basename(path.dirname(sdkPath)) === "dist");
  const pkg = JSON.parse(await readFile(path.resolve(sdkPath, "../../package.json"), "utf8"));
  requireCondition(pkg.name === "@tobilu/qmd" && pkg.version === "2.8.3");
}

/** Does not initialize QMD schemas, instantiate models, or create a missing database. */
async function recoverManifest(request: WorkerManifestRequest): Promise<{ manifest: Manifest | null }> {
  stage = "manifest";
  try { await stat(request.dbPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { manifest: null };
    throw error;
  }
  const Database = createRequire(request.sdkPath)("better-sqlite3") as new (
    file: string, options: { readonly: boolean; fileMustExist: boolean; timeout: number },
  ) => Database;
  const db = new Database(request.dbPath, { readonly: true, fileMustExist: true, timeout: BUSY_TIMEOUT_MS });
  try { return { manifest: committedManifest(db) }; }
  finally { db.close(); }
}

function validateDocuments(request: WorkerIndexRequest): void {
  requireCondition(Array.isArray(request.documents));
  requireCondition(request.rebuild === undefined || typeof request.rebuild === "boolean");
  requireCondition(request.manifest && typeof request.manifest === "object" && !Array.isArray(request.manifest));
  requireCondition(request.policy?.mode === "lexical" || request.policy?.mode === "semantic");
  requireCondition(typeof request.root === "string" && path.isAbsolute(request.root));
  requireCondition(typeof request.sourceRoot === "string" && path.isAbsolute(request.sourceRoot));
  const paths = new Set<string>();
  for (const doc of request.documents) {
    requireCondition(typeof doc.content === "string" && typeof doc.relativePath === "string");
    const file = doc.relativePath;
    requireCondition(file && !file.includes("\\") && !file.includes("\0") && !path.posix.isAbsolute(file));
    requireCondition(file.split("/").every(part => part && part !== "." && part !== ".."));
    requireCondition(!paths.has(file));
    requireCondition(doc.frontmatter && typeof doc.frontmatter === "object");
    paths.add(file);
  }
}

function ingest(request: WorkerIndexRequest, store: InternalStore, api: StoreModule): WorkerWork {
  const work: WorkerWork = { added: 0, updated: 0, unchanged: 0, removed: 0, embedded: 0 };
  const now = new Date().toISOString();
  const prepared = request.documents.map(doc => ({
    doc,
    hash: createHash("sha256").update(doc.content).digest("hex"),
    title: typeof doc.frontmatter.title === "string" && doc.frontmatter.title.trim()
      ? doc.frontmatter.title.trim() : path.posix.basename(doc.relativePath, ".md").replace(/[-_]/g, " "),
  }));
  // Identical content in ordinary/dream rows shares content and embeddings. No file copies.
  for (const collection of [COLLECTION, DREAMS]) {
    api.upsertStoreCollection(store.db, collection, { path: request.sourceRoot, pattern: "**/*.md" });
    const desired = new Set<string>();
    for (const { doc, hash, title } of prepared) {
      if (collection === DREAMS && doc.frontmatter.dream !== true) continue;
      desired.add(doc.relativePath);
      const old = store.findActiveDocument(collection, doc.relativePath);
      let change: "added" | "updated" | "unchanged";
      if (!old || old.hash !== hash) {
        // Preserve exact supplied bytes, including empty and whitespace-only documents.
        store.insertContent(hash, doc.content, now);
        if (old) store.updateDocument(old.id, title, hash, now);
        else store.insertDocument(collection, doc.relativePath, title, hash, now, now);
        change = old ? "updated" : "added";
      } else if (old.title !== title) {
        store.updateDocumentTitle(old.id, title, now);
        change = "updated";
      } else change = "unchanged";
      if (collection === COLLECTION) work[change]++;
    }
    for (const file of store.getActiveDocumentPaths(collection)) {
      if (!desired.has(file)) {
        store.deactivateDocument(collection, file);
        if (collection === COLLECTION) work.removed++;
      }
    }
  }
  return work;
}

/** QMD's health check trusts metadata and counts blank docs as pending. Check both tables. */
function verifyCoverage(db: Database, api: StoreModule, model: string): Omit<EmbeddingState, "state"> {
  const fingerprint = api.getEmbeddingFingerprint(model);
  requireCondition(api.getHashesForEmbedding(db, model).every(doc => !doc.body.trim()));
  const docs = db.prepare(`SELECT DISTINCT d.hash, c.doc FROM documents d
    JOIN content c ON c.hash = d.hash WHERE d.active = 1`).all();
  const nonblank = new Set(docs.filter(row => String(row.doc).trim()).map(row => String(row.hash)));
  const metadata = db.prepare(`SELECT hash, seq, pos, model, embed_fingerprint, total_chunks
    FROM content_vectors ORDER BY hash, seq`).all();
  // Never JOIN sqlite-vec virtual tables: QMD documents that those joins can hang.
  const actual = tableExists(db, "vectors_vec")
    ? new Set(db.prepare("SELECT hash_seq FROM vectors_vec").all().map(row => String(row.hash_seq)))
    : new Set<string>();
  const expected = new Set(metadata.map(row => `${row.hash}_${row.seq}`));
  requireCondition(actual.size === expected.size && [...expected].every(key => actual.has(key)));
  const groups = new Map<string, Row[]>();
  for (const row of metadata) {
    if (!nonblank.has(String(row.hash))) continue;
    const group = groups.get(String(row.hash)) ?? [];
    group.push(row);
    groups.set(String(row.hash), group);
  }
  let chunks = 0;
  for (const hash of nonblank) {
    const rows = groups.get(hash);
    requireCondition(rows?.length);
    for (const [seq, row] of rows.entries()) {
      requireCondition(row.seq === seq && row.total_chunks === rows.length);
      requireCondition(row.model === model && row.embed_fingerprint === fingerprint);
      requireCondition(Number.isInteger(row.pos) && Number(row.pos) >= 0);
    }
    chunks += rows.length;
  }
  return { fingerprint, hashes: nonblank.size, chunks, emptyHashes: docs.length - nonblank.size, pending: 0 };
}

async function index(request: WorkerIndexRequest): Promise<{ manifest: Manifest; work: WorkerWork }> {
  stage = "input";
  validateDocuments(request);
  const policy = { ...request.policy };
  if (policy.mode === "semantic") {
    stage = "model";
    requireCondition(typeof policy.model === "string" && path.isAbsolute(policy.model));
    requireCondition((await stat(policy.model)).isFile());
    // Check before QMD's model resolver can delete a bad file or attempt any download.
    const stream = createReadStream(policy.model, { start: 0, end: 3 });
    let magic = "";
    for await (const part of stream) magic += part.toString("ascii");
    requireCondition(magic === "GGUF");
    const hash = await fileHash(policy.model);
    requireCondition(!policy.modelHash || policy.modelHash.toLowerCase() === hash);
    policy.modelHash = hash;
  }
  process.env.QMD_SQLITE_BUSY_TIMEOUT = String(BUSY_TIMEOUT_MS);
  // Same workaround as QMD's Node launcher, before native model libraries are imported.
  if (process.platform === "darwin") process.env.GGML_METAL_NO_RESIDENCY = "1";
  stage = "open";
  const sdk = await import(pathToFileURL(request.sdkPath).href) as {
    createStore(options: { dbPath: string }): Promise<SdkStore>;
  };
  const api = await import(pathToFileURL(path.join(path.dirname(request.sdkPath), "store.js")).href) as StoreModule;
  // No inline config: SDK config synchronization would mutate collections outside our transaction.
  const sdkStore = await sdk.createStore({ dbPath: request.dbPath });
  const store = sdkStore.internal;
  const db = store.db;
  let transaction = false;
  let llm: Llm | undefined;
  let resetSingleton: (() => void) | undefined;
  try {
    db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA synchronous = FULL`);
    stage = "transaction";
    db.exec("BEGIN IMMEDIATE");
    transaction = true;
    db.exec("CREATE TABLE IF NOT EXISTS jb_generation (id INTEGER PRIMARY KEY CHECK (id = 1), manifest TEXT NOT NULL)");
    const previous = committedManifest(db);
    stage = "compatibility";
    const previousHash = previous?.embedding?.modelHash
      ?? (previous?.policy?.mode === "semantic" ? previous.policy.modelHash : undefined);
    const vectorCount = Number(db.prepare("SELECT COUNT(*) AS count FROM content_vectors").get()?.count);
    if (policy.mode === "semantic" && !request.rebuild) {
      requireCondition(!previousHash || previousHash === policy.modelHash);
      // Never silently adopt legacy/unknown model vectors by pathname alone.
      requireCondition(vectorCount === 0 || !!previousHash);
    }
    requireCondition(!db.prepare("SELECT 1 FROM documents WHERE active = 1 AND collection NOT IN (?, ?) LIMIT 1")
      .get(COLLECTION, DREAMS));
    if (request.rebuild) {
      stage = "rebuild";
      store.clearAllEmbeddings();
      // Re-ingest the exact canonical snapshot, not just vectors. Otherwise
      // unchanged hashes skip insert/update and leave missing FTS/content intact.
      // QMD 2.8.3 delete triggers remove associated FTS rows; the explicit FTS
      // clear also removes orphan rows. All of this rolls back with the vectors.
      db.exec("DELETE FROM documents");
      db.exec("DELETE FROM content");
      db.exec("DELETE FROM documents_fts");
      db.exec("DELETE FROM llm_cache");
    }
    stage = "ingest";
    const work = ingest(request, store, api);
    let embedding: EmbeddingState = {
      state: "disabled",
      // Retain identity across an intentional semantic -> lexical -> semantic transition.
      ...(request.rebuild ? {} : {
        model: previous?.embedding?.model,
        modelHash: previousHash,
        fingerprint: previous?.embedding?.fingerprint,
      }),
    };
    if (policy.mode === "semantic") {
      stage = "embed";
      const llmModule = await import(pathToFileURL(path.join(path.dirname(request.sdkPath), "llm.js")).href) as {
        LlamaCpp: new (options: { embedModel: string }) => Llm;
        setDefaultLlamaCpp(llm: Llm | null): void;
      };
      llm = new llmModule.LlamaCpp({ embedModel: policy.model! });
      // Enforce local-only resolution, including the global tokenizer used by chunkDocumentByTokens.
      llm.resolveModel = async (uri: string) => {
        requireCondition(uri === policy.model && (await stat(uri)).isFile());
        return uri;
      };
      const ensureLlama = llm.ensureLlama.bind(llm);
      // Also prohibit native-runtime downloads/source builds, not just model downloads.
      llm.ensureLlama = () => ensureLlama(false);
      store.llm = llm;
      llmModule.setDefaultLlamaCpp(llm);
      resetSingleton = () => llmModule.setDefaultLlamaCpp(null);
      const result = await api.generateEmbeddings(store, { model: policy.model!, chunkStrategy: "regex" });
      requireCondition(result.errors === 0 && !result.failures?.length);
      work.embedded = result.chunksEmbedded;
      stage = "coverage";
      embedding = { state: "complete", model: policy.model, modelHash: policy.modelHash,
        ...verifyCoverage(db, api, policy.model!) };
      // An externally replaced model must not be published under the initial digest.
      requireCondition(await fileHash(policy.model!) === policy.modelHash);
      stage = "model-close";
      await llm.dispose();
      llm = undefined;
      resetSingleton();
      resetSingleton = undefined;
    }
    stage = "commit";
    // An orphaned writer must not commit after its orchestration lock is reclaimed.
    if (request.ownerPid) process.kill(request.ownerPid, 0);
    const manifest: Manifest = { ...request.manifest, policy, embedding };
    db.prepare("INSERT INTO jb_generation (id, manifest) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET manifest = excluded.manifest")
      .run(JSON.stringify(manifest));
    db.exec("COMMIT");
    transaction = false;
    return { manifest, work };
  } finally {
    if (transaction) {
      try { db.exec("ROLLBACK"); } catch { /* Closing the connection also rolls back. */ }
    }
    resetSingleton?.();
    try { await llm?.dispose(); }
    finally { await sdkStore.close(); }
  }
}

async function main(): Promise<void> {
  // QMD/native libraries may log; their text is not part of the public error protocol.
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    const request = JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorkerRequest;
    requireCondition(request && typeof request === "object");
    requireCondition(typeof request.dbPath === "string" && path.isAbsolute(request.dbPath));
    requireCondition(request.action === undefined || request.action === "index" || request.action === "manifest");
    await validateSdk(request.sdkPath);
    const result = request.action === "manifest" ? await recoverManifest(request) : await index(request);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ error: { code: "qmd_worker_failed", stage,
      message: `QMD indexing worker failed during ${stage}.` } })}\n`);
    process.exitCode = 1;
  }
}

await main();
