// Disposable benchmark child; never imported by production.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const runtime = await import(pathToFileURL(path.join(config.runtime, 'dist/runtime/index.js')));
const controller = new AbortController();
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => controller.abort());
const start = Date.now();
try {
  const result = await runtime.indexMemory(config.root, { signal: controller.signal, timeoutMs: config.timeoutMs,
    indexing: { mode: 'semantic', model: config.model, modelHash: config.modelHash } });
  await writeFile(config.result, JSON.stringify({ ok: true, start, end: Date.now(), result }));
} catch (error) {
  await writeFile(config.result, JSON.stringify({ ok: false, start, end: Date.now(), code: error.code, message: error.message }));
  process.exitCode = 1;
}
