/** Isolated, immutable vector reader. No QMD store/model initialization or writes. */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { databasePath } from "./qmd-cli.js";
import { assertSameReadOnlyQmdGeneration, observeReadOnlyQmdGeneration } from "./qmd-read-only.js";
import { meanDocumentVector, SEMANTIC_LINK_POLICY, strongSemanticLinks, type DocumentVector } from "../../core/retrieval-policy/semantic-links.js";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const { root, sdkPath, generation, files } = request;
  if (!path.isAbsolute(root) || !path.isAbsolute(sdkPath) || !Array.isArray(files)
    || files.length > SEMANTIC_LINK_POLICY.maxDocuments || files.some(file => typeof file !== "string")) throw new Error();
  const pkg = JSON.parse(await readFile(path.resolve(sdkPath, "../../package.json"), "utf8"));
  if (pkg.name !== "@tobilu/qmd" || pkg.version !== "2.8.3") throw new Error();
  const before = await observeReadOnlyQmdGeneration(root);
  if (before.generation !== generation) throw new Error();
  process.env.SQLITE_USE_URI = "1";
  const require = createRequire(sdkPath);
  const Database = require("better-sqlite3");
  const uri = pathToFileURL(databasePath(root));
  uri.search = "?mode=ro&immutable=1";
  const db = new Database(uri.href, { readonly: true, fileMustExist: true, timeout: 1000 });
  try {
    const manifest = JSON.parse(db.prepare("SELECT manifest FROM jb_generation WHERE id = 1").get()?.manifest ?? "null");
    if (manifest?.generation !== generation || manifest?.embedding?.state !== "complete" || manifest?.policy?.mode !== "semantic") throw new Error();
    require("sqlite-vec").load(db);
    const document = db.prepare("SELECT hash FROM documents WHERE collection = 'jumpybrain' AND path = ? AND active = 1");
    const metadata = db.prepare("SELECT seq, total_chunks, model, embed_fingerprint FROM content_vectors WHERE hash = ? ORDER BY seq LIMIT ?");
    const embedding = db.prepare("SELECT embedding FROM vectors_vec WHERE hash_seq = ?");
    const vectors: DocumentVector[] = [];
    let readChunks = 0;
    for (const file of files) {
      const row = document.get(file);
      if (!row) continue;
      const rows = metadata.all(row.hash, SEMANTIC_LINK_POLICY.maxChunksPerDocument + 1);
      if (!rows.length || rows.length > SEMANTIC_LINK_POLICY.maxChunksPerDocument) continue;
      if (rows.some((part: { seq: number; total_chunks: number; model: string; embed_fingerprint: string }, seq: number) =>
        part.seq !== seq || part.total_chunks !== rows.length || part.model !== manifest.policy.model || part.embed_fingerprint !== manifest.embedding.fingerprint)) throw new Error();
      if (readChunks + rows.length > SEMANTIC_LINK_POLICY.maxChunks) break;
      const parts: Float32Array[] = [];
      for (const part of rows) {
        const bytes = embedding.get(`${row.hash}_${part.seq}`)?.embedding as Buffer | undefined;
        if (!bytes || bytes.byteLength % 4 || bytes.byteLength > SEMANTIC_LINK_POLICY.maxDimensions * 4) throw new Error();
        // Native buffers need not have a 4-byte-aligned backing offset.
        const copy = Uint8Array.from(bytes);
        parts.push(new Float32Array(copy.buffer));
      }
      readChunks += rows.length;
      const vector = meanDocumentVector(parts);
      if (vector) vectors.push({ file, vector });
    }
    const edges = strongSemanticLinks(vectors);
    assertSameReadOnlyQmdGeneration(before, await observeReadOnlyQmdGeneration(root));
    process.stdout.write(JSON.stringify({ generation, edges, comparedDocuments: vectors.length }));
  } finally { db.close(); }
}
try { await main(); }
catch { process.stdout.write(JSON.stringify({ error: "semantic_graph_unavailable" })); process.exitCode = 1; }
