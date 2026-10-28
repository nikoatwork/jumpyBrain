// This process receives corpus paths and public queries, never the scoring rubric.
import { readFile, writeFile, cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { chooseExpansions } from './score.mjs';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { installExperiment } = await import('./experiment-hooks.mjs');
const experiment = await installExperiment(config);
const runtime = await import(pathToFileURL(path.join(config.repo, 'dist/runtime/index.js')));
const { serializeExpansion } = await import(pathToFileURL(path.join(config.repo, 'dist/core/canonical/expansion.js')));
await mkdir(config.root, { recursive: true });
await cp(config.corpus, config.root, { recursive: true });
await runtime.initializeMemoryRoot(config.root);
const timed = async fn => { const start = performance.now(); const value = await fn(); return { value, ms: performance.now() - start }; };
const initialIndex = await timed(() => runtime.indexMemory(config.root, { indexing: config.model ? { mode: 'semantic', model: config.model } : { mode: 'lexical' } }));
if (initialIndex.value.readiness.freshness !== 'fresh' || !initialIndex.value.readiness.modes.includes(config.mode)) throw new Error('Requested backend mode is not fresh and available.');
const projection = await experiment.index();
const noOpIndex = await timed(() => runtime.indexMemory(config.root));
await writeFile(config.indexOutput, JSON.stringify({ initialIndex, noOpIndex, projection,
  databaseBytes: (await stat(path.join(config.root, '.jumpybrain/qmd-cache/qmd/index.sqlite'))).size }));
const queries = JSON.parse(await readFile(config.queries, 'utf8'));
for (const [n, q] of queries.entries()) {
  const options = { depth: q.depth, ...(q.temporal ? { temporal: q.temporal } : {}), refresh: false };
  const search = await timed(() => runtime.searchMemory(config.root, q.query, 10, options));
  const start = performance.now();
  const recall = await timed(() => runtime.compactSearchMemory(config.root, q.query, 5, { ...options, maxBytes: 8192 }));
  const wires = [runtime.serializeCompactRecall(recall.value)];
  const requests = [JSON.stringify({ operation: 'recall', query: q.query, limit: 5, ...options, maxBytes: 8192 }) + '\n'];
  const expansions = [];
  for (const request of chooseExpansions(recall.value)) {
    requests.push(JSON.stringify({ operation: 'expand', ...request }) + '\n');
    try {
      const packet = await runtime.expandMemoryDocument(config.root, request);
      expansions.push(packet);
      wires.push(serializeExpansion(packet));
    } catch (error) {
      const failure = { error: error.code ?? error.name, message: error.message };
      expansions.push(failure);
      wires.push(JSON.stringify(failure) + '\n');
    }
  }
  if (wires.some(wire => Buffer.byteLength(wire) > 8192) || wires.reduce((n, wire) => n + Buffer.byteLength(wire), 0) > 32768) throw new Error('Response byte budget violated.');
  await writeFile(path.join(config.packets, `${q.id}.json`), JSON.stringify({ id: q.id, search: search.value, experiment: experiment.diagnostics(), recall: recall.value, expansions, wires, requests,
    timing: { searchMs: search.ms, recallMs: recall.ms, interactionMs: performance.now() - start } }, null, 2));
  console.log(`${config.mode} ${n + 1}/${queries.length} ${q.id}`);
}

await experiment.dispose();
