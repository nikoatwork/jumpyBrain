/**
 * Long-lived smart-search worker for ONE memory root, owned by the process that
 * runs searches. It keeps the pinned QMD 2.8.3 embedding model loaded between
 * queries and otherwise reproduces `qmd query <structured lines> --json -n N
 * --no-rerank -c <collection> --index index` (dist/cli/qmd.js querySearch +
 * outputResults) with the same exported SDK functions: per query it reopens the
 * store, syncs the published YAML config, runs `structuredSearch` and formats
 * rows exactly like the CLI's JSON output. Only the LlamaCpp instance (model,
 * contexts) survives between queries.
 *
 * Protocol: one JSON request per stdin line; one JSON response per line on fd 3
 * (stdout/stderr stay free for native library noise). EOF on stdin, or a
 * changed parent, ends the process, so it cannot outlive its owner.
 */
import { createWriteStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export interface WarmWorkerRequest {
  id: number;
  type: "warm" | "query";
  sdkPath: string;
  /** Absolute provisioned GGUF selected by the published manifest. */
  model: string;
  /** `query` only: the exact structured text `qmd query` would receive. */
  text?: string;
  limit?: number;
  collection?: string;
}
export type WarmWorkerResponse =
  | { id: number; ok: true; rows?: unknown[] }
  | { id: number; ok: false; error: { code: string; stage: string } };

interface Llm {
  embedModelName: string;
  resolveModel(uri: string): Promise<string>;
  ensureLlama(allowBuild?: boolean): Promise<unknown>;
  computeParallelism(perContextMB: number, reserveMB?: number): Promise<number>;
  isCpuOffloadForced(): boolean;
  embedBatch(texts: string[]): Promise<Array<{ embedding: number[] } | null>>;
  dispose(): Promise<void>;
}
interface Store { db: unknown; llm?: Llm; close(): void }
interface Sdk {
  store: {
    enableProductionMode(): void;
    getDefaultDbPath(indexName?: string): string;
    createStore(dbPath?: string): Store;
    syncConfigToDb(db: unknown, config: unknown): void;
    getIndexHealth(db: unknown, model?: string): unknown;
    structuredSearch(store: Store, searches: Search[], options: Record<string, unknown>): Promise<Result[]>;
    extractSnippet(body: string, query: string, maxLen: number, chunkPos?: number, chunkLen?: number, intent?: string): { line: number; snippet: string };
    buildVirtualPath(collection: string, file: string, indexName?: string): string;
  };
  collections: {
    setConfigIndexName(name: string): void;
    setConfigSource(source?: unknown): void;
    loadConfig(): { collections: Record<string, unknown>; models?: Record<string, string | undefined> } & Record<string, unknown>;
    saveConfig(config: unknown): void;
    getCollection(name: string): unknown;
  };
  llm: {
    LlamaCpp: new (options: { embedModel: string; generateModel: string; rerankModel: string }) => Llm;
    resolveModels(config?: Record<string, string | undefined>): { embed: string; generate: string; rerank: string };
    setDefaultLlamaCpp(llm: Llm | null): void;
    withLLMSession<T>(fn: () => Promise<T>, options?: Record<string, unknown>): Promise<T>;
    formatQueryForEmbedding(query: string, model?: string): string;
  };
}
interface Search { type: string; query: string; line: number }
interface Result {
  file: string; displayPath: string; title: string; body: string; bestChunk: string; bestChunkPos: number;
  score: number; context?: string | null; docid?: string;
}

let stage = "input";
let sdk: Sdk | undefined;
let sdkPath: string | undefined;
let llm: Llm | undefined;

function invariant(condition: unknown): asserts condition { if (!condition) throw new Error("warm worker invariant failed"); }

async function loadSdk(requested: string): Promise<Sdk> {
  if (sdk) { invariant(requested === sdkPath); return sdk; }
  stage = "sdk-version";
  invariant(typeof requested === "string" && path.isAbsolute(requested));
  invariant(path.basename(requested) === "index.js" && path.basename(path.dirname(requested)) === "dist");
  const pkg = JSON.parse(await readFile(path.resolve(requested, "../../package.json"), "utf8"));
  invariant(pkg.name === "@tobilu/qmd" && pkg.version === "2.8.3");
  stage = "sdk-load";
  const load = (file: string) => import(pathToFileURL(path.join(path.dirname(requested), file)).href);
  const loaded = { store: await load("store.js"), collections: await load("collections.js"), llm: await load("llm.js") } as Sdk;
  // Same process-wide setup as `qmd ... --index index` (cli/qmd.js parseCLI).
  loaded.store.enableProductionMode();
  loaded.collections.setConfigIndexName("index");
  loaded.collections.setConfigSource();
  sdk = loaded; sdkPath = requested;
  return loaded;
}

/** cli/qmd.js ensureModelsConfiguredForCli (it may persist resolved model names). */
function ensureModelsConfigured(api: Sdk): { embed: string; generate: string; rerank: string } {
  try {
    const config = api.collections.loadConfig();
    const models = api.llm.resolveModels(config.models);
    const current = config.models ?? {};
    if (current.embed !== models.embed || current.generate !== models.generate || current.rerank !== models.rerank) {
      api.collections.saveConfig({ ...config, models: { ...current, embed: models.embed, generate: models.generate, rerank: models.rerank } });
    }
    return models;
  } catch { return api.llm.resolveModels(); }
}

/** One LlamaCpp per worker. A different embedding model is a new worker, never a swap. */
async function warmLlm(api: Sdk, model: string, models: { embed: string; generate: string; rerank: string }): Promise<Llm> {
  stage = "model";
  invariant(path.isAbsolute(model) && models.embed === model);
  if (llm) { invariant(llm.embedModelName === model); return llm; }
  invariant(statSync(model).isFile());
  const created = new api.llm.LlamaCpp({ embedModel: models.embed, generateModel: models.generate, rerankModel: models.rerank });
  // Local-only like the indexing worker: no model download or native build.
  // The resolved path is the same file the CLI would resolve for this URI.
  created.resolveModel = async (uri: string) => {
    invariant(uri === model && statSync(uri).isFile());
    return uri;
  };
  const ensureLlama = created.ensureLlama.bind(created);
  created.ensureLlama = () => ensureLlama(false);
  // One query text is always embedded by the first context. On a GPU, QMD
  // creates every context with identical options (no thread count), so the
  // extra up-to-8 resident contexts would only cost memory. CPU contexts split
  // threads by context count, so CPU keeps QMD's own choice for exact parity.
  const parallelism = created.computeParallelism.bind(created);
  created.computeParallelism = async (perContextMB: number, reserveMB?: number) => {
    const contexts = await parallelism(perContextMB, reserveMB);
    const runtime = await created.ensureLlama() as { gpu?: unknown };
    return !created.isCpuOffloadForced() && runtime.gpu ? 1 : contexts;
  };
  llm = created;
  return created;
}

/** Verbatim port of QMD 2.8.3 cli/qmd.js parseStructuredQuery, which the package does not export. */
function parseStructuredQuery(query: string): { searches: Search[]; intent?: string } | null {
  const rawLines = query.split("\n").map((line, idx) => ({ raw: line, trimmed: line.trim(), number: idx + 1 }))
    .filter(line => line.trimmed.length > 0);
  if (rawLines.length === 0) return null;
  const prefixRe = /^(lex|vec|hyde):\s*/i;
  const expandRe = /^expand:\s*/i;
  const intentRe = /^intent:\s*/i;
  const typed: Search[] = [];
  let intent: string | undefined;
  for (const line of rawLines) {
    if (expandRe.test(line.trimmed)) {
      if (rawLines.length > 1) throw new Error(`Line ${line.number} starts with expand:, but query documents cannot mix expand with typed lines. Submit a single expand query instead.`);
      const text = line.trimmed.replace(expandRe, "").trim();
      if (!text) throw new Error("expand: query must include text.");
      return null;
    }
    if (intentRe.test(line.trimmed)) {
      if (intent !== undefined) throw new Error(`Line ${line.number}: only one intent: line is allowed per query document.`);
      const text = line.trimmed.replace(intentRe, "").trim();
      if (!text) throw new Error(`Line ${line.number}: intent: must include text.`);
      intent = text;
      continue;
    }
    const match = line.trimmed.match(prefixRe);
    if (match) {
      const type = match[1].toLowerCase();
      const text = line.trimmed.slice(match[0].length).trim();
      if (!text) throw new Error(`Line ${line.number} (${type}:) must include text.`);
      if (/\r|\n/.test(text)) throw new Error(`Line ${line.number} (${type}:) contains a newline. Keep each query on a single line.`);
      typed.push({ type, query: text, line: line.number });
      continue;
    }
    if (rawLines.length === 1) return null;
    throw new Error(`Line ${line.number} is missing a lex:/vec:/hyde:/intent: prefix. Each line in a query document must start with one.`);
  }
  if (intent && typed.length === 0) throw new Error("intent: cannot appear alone. Add at least one lex:, vec:, or hyde: line.");
  return typed.length > 0 ? { searches: typed, intent } : null;
}

async function warm(request: WarmWorkerRequest): Promise<void> {
  const api = await loadSdk(request.sdkPath);
  // Read-only config access: prewarming runs outside the root lock, so it must
  // never rewrite the published QMD config the way a locked query may.
  stage = "config";
  let configured: Record<string, string | undefined> | undefined;
  try { configured = api.collections.loadConfig().models; } catch { configured = undefined; }
  const models = { ...api.llm.resolveModels(configured), embed: request.model };
  const model = await warmLlm(api, request.model, models);
  stage = "warm";
  api.llm.setDefaultLlamaCpp(model);
  // Load runtime, model and embedding contexts; one fixed local embedding
  // compiles kernels. No note content, database or network is involved.
  const [embedded] = await api.llm.withLLMSession(() => model.embedBatch([api.llm.formatQueryForEmbedding("warm up", model.embedModelName)]),
    { maxDuration: 10 * 60 * 1000, name: "warmSmartSearch" });
  invariant(embedded?.embedding?.length);
}

/** cli/qmd.js getStore + resolveCollectionFilter + querySearch + outputResults(json). */
async function query(request: WarmWorkerRequest): Promise<unknown[]> {
  invariant(typeof request.text === "string" && Number.isSafeInteger(request.limit) && request.limit! >= 1);
  invariant(typeof request.collection === "string" && request.collection.length > 0);
  const api = await loadSdk(request.sdkPath);
  stage = "store";
  const store = api.store.createStore(api.store.getDefaultDbPath("index"));
  try {
    stage = "config";
    const models = ensureModelsConfigured(api);
    api.store.syncConfigToDb(store.db, api.collections.loadConfig());
    const model = await warmLlm(api, request.model, models);
    api.llm.setDefaultLlamaCpp(model);
    store.llm = model;
    stage = "collection";
    invariant(api.collections.getCollection(request.collection));
    // checkIndexHealth: the CLI only prints tips from it, but reads the same rows.
    stage = "health";
    api.store.getIndexHealth(store.db, models.embed);
    stage = "parse";
    const parsed = parseStructuredQuery(request.text!);
    // Plain text would mean query expansion with a generation model: never here.
    invariant(parsed);
    const intent = parsed.intent;
    stage = "search";
    const results = await api.llm.withLLMSession(() => api.store.structuredSearch(store, parsed.searches, {
      collections: [request.collection], limit: request.limit, minScore: 0, candidateLimit: undefined,
      skipRerank: true, explain: false, intent, chunkStrategy: undefined, hooks: {},
    }), { maxDuration: 10 * 60 * 1000, name: "querySearch" });
    stage = "format";
    if (results.length === 0) return [];
    const displayQuery = parsed.searches.find(s => s.type === "lex")?.query || parsed.searches.find(s => s.type === "vec")?.query || request.text!;
    // outputResults: minScore 0, limit = results.length, --json without --full/--line-numbers/--full-path/--explain.
    // The CLI passes its --intent flag here (unset), not the parsed intent line.
    return results.filter(row => row.score >= 0).map(row => {
      const docid = row.docid || undefined;
      const snippetInfo = api.store.extractSnippet(row.body, displayQuery, 300, row.bestChunkPos, row.bestChunk.length, undefined);
      const [collectionName, ...segments] = row.displayPath.split("/");
      const file = !collectionName || segments.length === 0 ? `qmd://${row.displayPath}` : api.store.buildVirtualPath(collectionName, segments.join("/"), undefined);
      return {
        ...(docid && { docid: `#${docid}` }),
        score: Math.round(row.score * 100) / 100,
        file,
        line: snippetInfo.line,
        title: row.title,
        ...(row.context && { context: row.context }),
        ...(snippetInfo.snippet && { snippet: snippetInfo.snippet }),
      };
    });
  } finally { store.close(); }
}

async function main(): Promise<void> {
  // QMD/native libraries may log; their text is never part of the protocol.
  console.log = () => {}; console.warn = () => {}; console.error = () => {}; console.info = () => {};
  const out = createWriteStream("", { fd: 3 });
  const parent = process.ppid;
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    // Bounded: a wedged native dispose must not keep the model resident.
    setTimeout(() => process.exit(0), 2000).unref();
    try { await llm?.dispose(); } catch { /* exiting */ }
    process.exit(0);
  };
  // Reparenting means the owner died without closing our stdin.
  setInterval(() => { if (process.ppid !== parent) void shutdown(); }, 1000).unref();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain = Promise.resolve();
  lines.on("line", line => {
    chain = chain.then(async () => {
      let id = -1;
      let response: WarmWorkerResponse;
      try {
        const request = JSON.parse(line) as WarmWorkerRequest;
        invariant(request && Number.isSafeInteger(request.id));
        id = request.id;
        stage = "input";
        invariant(request.type === "warm" || request.type === "query");
        if (request.type === "warm") { await warm(request); response = { id, ok: true }; }
        else response = { id, ok: true, rows: await query(request) };
      } catch {
        response = { id, ok: false, error: { code: "qmd_warm_failed", stage } };
      }
      await new Promise<void>(resolve => out.write(`${JSON.stringify(response)}\n`, () => resolve()));
    });
  });
  lines.on("close", () => { void chain.then(shutdown); });
}

await main();
