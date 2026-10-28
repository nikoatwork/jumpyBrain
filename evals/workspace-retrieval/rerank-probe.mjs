// Explicit opt-in QMD model/runtime cost probe. Invoke with the run's offline guard.
import { readFile, writeFile } from 'node:fs/promises';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
const [packetFile, model, output, count = '20', repeats = '3'] = process.argv.slice(2);
const launcher = await realpath(process.env.JUMPYBRAIN_QMD_BIN ?? '/opt/homebrew/bin/qmd');
let qmdRoot = path.dirname(launcher);
while (true) {
  try { if (JSON.parse(await readFile(path.join(qmdRoot, 'package.json'), 'utf8')).name === '@tobilu/qmd') break; } catch {}
  const parent = path.dirname(qmdRoot); if (parent === qmdRoot) throw new Error('Cannot find provisioned QMD'); qmdRoot = parent;
}
const { LlamaCpp } = await import(pathToFileURL(path.join(qmdRoot, 'dist/llm.js')));
const packet = JSON.parse(await readFile(packetFile, 'utf8'));
const documents = packet.experiment.pool.slice(0, Number(count)).map(row => ({ file: row.file, text: row.text }));
assert.ok(documents.length >= 20);
const llm = new LlamaCpp({ rerankModel: model });
const observations = [];
try {
  for (let i = 0; i < Number(repeats); i++) {
    const start = performance.now();
    const result = await llm.rerank(packet.recall.query, documents);
    assert.notEqual(result.model, 'fallback');
    observations.push({ state: i ? 'model-warm' : 'model-cold-os-cache-unspecified', ms: performance.now() - start, candidates: documents.length, model: result.model, rssBytes: process.memoryUsage().rss, order: result.results.map(r => r.file) });
  }
} finally { await llm.dispose(); }
await writeFile(output, JSON.stringify({ gpu: process.env.QMD_LLAMA_GPU ?? 'auto', observations }, null, 2));
console.log(JSON.stringify(observations.map(({ order, ...row }) => row)));
