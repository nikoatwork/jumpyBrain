// Child-only publication fault probes, never installed into application runtime.
import fs from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const [root, id, mode, proposalFile] = process.argv.slice(2);
const hold = async (stage, extra = {}) => {
  await new Promise((resolve) => process.send({ stage, ...extra,
    ...(globalThis.__m1PublisherSourceSha256 ? { publisherSourceSha256: globalThis.__m1PublisherSourceSha256 } : {}) }, resolve));
  setInterval(() => {}, 1000);
  await new Promise(() => {});
};
if (['before-rename', 'after-rename', 'rename-failure'].includes(mode)) {
  globalThis.__m1PublicationBoundary = async (stage) => {
    if (mode === stage) await hold(stage);
    if (mode === 'rename-failure' && stage === 'before-rename') throw Object.assign(new Error('Injected publication I/O failure'), { code: 'ENOSPC' });
  };
  const target = fileURLToPath(new URL('../../../dist/core/canonical/markdown-store.js', import.meta.url));
  registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.startsWith('file:') && fileURLToPath(url) === target) {
      const source = result.source.toString();
      const needle = 'await rename(tempFile, file);';
      if (source.split(needle).length !== 2) throw new Error('Guarded real-publisher instrumentation no longer matches exactly once.');
      const sourceSha256 = createHash('sha256').update(source).digest('hex');
      globalThis.__m1PublisherSourceSha256 = sourceSha256;
      return { ...result, source: source.replace(needle, 'await globalThis.__m1PublicationBoundary("before-rename");\n' + needle + '\nawait globalThis.__m1PublicationBoundary("after-rename");') };
    }
    return result;
  } });
}
const { readMemoryDocument, updateMemoryDocument } = await import('../../../dist/runtime/index.js');
const original = await readMemoryDocument(root, id);
if (mode === 'before-call') await hold('before-call');
try {
  const result = await updateMemoryDocument(root, id, await fs.readFile(proposalFile, 'utf8'), {
    ifMatch: original.contentHash, updatedAt: '2026-11-01T12:00:00.000Z',
  });
  if (mode === 'after-call') await hold('after-call', { publishedHash: result.newContentHash });
  await hold('receipt', { saved: true, contentHash: result.newContentHash });
} catch (error) { await hold('failure', { code: error.code, message: error.message }); }
