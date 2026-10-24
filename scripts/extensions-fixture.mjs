// Disposable production gateway + real canonical/lexical memory + local example packages.
// Never touches the installed app, Keychain, personal memory or default extension registry.
import { cp, mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, indexMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { installExtension, setExtensionEnabled } from '../dist/app/extensions/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
export const fixtureIds = ['1', '2', '3'].map(n => `mem_a0000000-0000-4000-8000-00000000000${n}`);

export async function createExtensionsFixture({ examples = true } = {}) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-extensions-')));
  let gateway, remote;
  const directory = path.join(temporary, 'support');
  const extensions = path.join(directory, 'extensions');
  const root = path.join(temporary, 'memory');
  const otherRoot = path.join(temporary, 'other');
  const key = randomBytes(32).toString('hex');
  const remoteKey = randomBytes(32).toString('hex');
  const cleanup = async () => { await gateway?.close(); await remote?.close(); await rm(temporary, { recursive: true, force: true }); };
  try {
    await mkdir(directory, { mode: 0o700 });
    await writeFile(path.join(directory, 'api-key'), key, { mode: 0o600 });
    for (const brain of [root, otherRoot]) {
      await initializeMemoryRoot(brain);
      const titles = ['Telescope calibration', 'Telescope calibration checklist', 'Garden planning'];
      for (let i = 0; i < fixtureIds.length; i++) await writeFile(path.join(brain, `notes/fixture-${i}.md`),
        `---\nid: ${fixtureIds[i]}\ntype: note\ntitle: ${titles[i]}\ncreated_at: 2026-10-24T09:00:00.000Z\n---\n\n${i < 2 ? 'Telescope calibration records and sensor alignment.' : 'Garden planning and seasonal watering.'}\n`);
      await indexMemory(brain, { mode: 'lexical' });
    }
    const packages = [];
    if (examples) for (const entry of await readdir(path.join(repo, 'examples/extensions'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const source = path.join(temporary, 'packages', entry.name);
      await cp(path.join(repo, 'examples/extensions', entry.name), source, { recursive: true });
      const manifest = JSON.parse(await readFile(path.join(source, 'jumpybrain-extension.json'), 'utf8'));
      await installExtension({ directory: extensions, source });
      await setExtensionEnabled({ directory: extensions, id: manifest.id, enabled: true });
      packages.push(manifest);
    }
    const keys = new Map();
    const credentials = { get: async ref => keys.get(ref) ?? null, set: async (ref, value) => { keys.set(ref, value); }, delete: async ref => { keys.delete(ref); }, selectFolder: async () => otherRoot };
    remote = await startJumpyBrainHttpServer({ root: otherRoot, apiKeys: [remoteKey], port: 0, autoIndex: false });
    gateway = await startCompanionGateway({ runtimeRoot: repo, directory, initialRoot: root, port: 0, controlKey: key, credentials,
      localFactory: options => startJumpyBrainHttpServer({ ...options, autoIndex: false }), switchTimeoutMs: 5000 });
    await gateway.store.save({ kind: 'local', name: 'Other local fixture', root: otherRoot }, gateway.store.snapshot().revision);
    await gateway.store.save({ kind: 'remote', name: 'Read-only remote fixture', url: remote.url, key: remoteKey, allowWrites: false }, gateway.store.snapshot().revision);
    const profiles = gateway.store.snapshot().profiles;
    const info = { url: gateway.url, key, root, otherRoot, directory, extensions, temporary, ids: fixtureIds, packages, activeId: gateway.store.snapshot().activeId,
      otherId: profiles.find(profile => profile.root === otherRoot)?.id, remoteId: profiles.find(profile => profile.kind === 'remote')?.id };
    return { ...info, gateway, remote, close: cleanup };
  } catch (error) { await cleanup(); throw error; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const fixture = await createExtensionsFixture();
  const output = path.resolve('.local-pack/extensions-qa'); await mkdir(output, { recursive: true });
  const { gateway, remote, close, ...info } = fixture;
  await writeFile(path.join(output, 'fixture.json'), JSON.stringify(info, null, 2), { mode: 0o600 });
  console.log(`Disposable extension preview ready at ${fixture.url}; private fixture data: ${path.join(output, 'fixture.json')}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await close(); process.exit(0); });
}
