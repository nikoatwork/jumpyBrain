// Seed an installed API v1 package without recompiling its frozen cache with today's host.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const baseline = fileURLToPath(new URL('./fixtures/extensions-v1/', import.meta.url));
export const v1Revision = '11111111-1111-4111-8111-111111111111';
export async function seedV1Extension(directory, source) {
  await cp(path.join(baseline, 'source'), source, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(source, 'jumpybrain-extension.json'), 'utf8'));
  const cache = path.join(directory, 'cache', manifest.id, v1Revision);
  await mkdir(cache, { recursive: true });
  for (const name of ['main.mjs', 'ui.js']) await cp(path.join(baseline, 'cache', name + '.txt'), path.join(cache, name));
  await mkdir(path.join(directory, 'state'), { recursive: true });
  const registry = { version: 1, entries: [{ manifest, source, enabled: true, prepared: { revision: v1Revision } }] };
  const disabledSource = source + '-disabled';
  await cp(path.join(baseline, 'source'), disabledSource, { recursive: true });
  const disabledManifest = { ...manifest, id: 'v1-disabled' };
  await writeFile(path.join(disabledSource, 'jumpybrain-extension.json'), JSON.stringify(disabledManifest));
  registry.entries.push({ manifest: disabledManifest, source: disabledSource, enabled: false });
  for (const file of ['registry.json', 'registry.backup.json']) await writeFile(path.join(directory, file), JSON.stringify(registry));
  await writeFile(path.join(directory, 'state/v1-contract.json'), JSON.stringify({ kept: { from: 'v1' } }));
  return ['registry.json', 'registry.backup.json', 'state/v1-contract.json', `cache/v1-contract/${v1Revision}/main.mjs`, `cache/v1-contract/${v1Revision}/ui.js`].map(file => path.join(directory, file));
}
export function v1Context() {
  return { signal: new AbortController().signal, scope: { generation: 1, brainId: 'compatibility-brain', tabId: 'compatibility-tab' }, document: { id: 'v1-note', title: 'Version one' }, allowWrites: false,
    memory: { search: async () => ({ results: [{ id: 'v1-note', title: 'Version one', snippet: 'Evidence' }] }), read: async id => ({ id, content: 'Canonical v1', hash: 'v1-hash' }), create: async () => ({ saved: true }), update: async () => ({ saved: true }) } };
}
