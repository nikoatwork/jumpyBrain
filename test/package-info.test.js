import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, copyFile, writeFile, rm, cp, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('running runtime retains its version after package replacement; new runtime sees replacement', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-build-identity-'));
  try {
    const modulePath = path.join(root, 'dist/adapters/package-info/index.js');
    await mkdir(path.dirname(modulePath), { recursive: true });
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', version: '0.0.1' }));
    await copyFile(new URL('../dist/adapters/package-info/index.js', import.meta.url), modulePath);
    const first = await import(pathToFileURL(modulePath).href);
    assert.equal(await first.packageVersion(), '0.0.1');
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', version: '0.0.2' }));
    assert.equal(await first.packageVersion(), '0.0.1');
    const replacement = await import(pathToFileURL(modulePath).href + '?replacement');
    assert.equal(await replacement.packageVersion(), '0.0.2');
    assert.equal(await first.packageVersion(), '0.0.1');
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('hosted health keeps the executing identity when its package is replaced in place', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jumpybrain-health-identity-'));
  let server;
  try {
    await cp(new URL('../dist', import.meta.url), path.join(root, 'dist'), { recursive: true });
    await symlink(new URL('../node_modules', import.meta.url).pathname, path.join(root, 'node_modules'));
    const manifest = path.join(root, 'package.json');
    await writeFile(manifest, JSON.stringify({ type: 'module', version: '0.0.1' }));
    const host = await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href);
    server = await host.startJumpyBrainHttpServer({ root: path.join(root, 'brain'), apiKeys: ['fixture'], port: 0, autoIndex: false });
    assert.equal((await (await fetch(server.url + '/health')).json()).version, '0.0.1');
    await writeFile(manifest, JSON.stringify({ type: 'module', version: '0.0.2' }));
    assert.equal((await (await fetch(server.url + '/health')).json()).version, '0.0.1');
  } finally { await server?.close(); await rm(root, { recursive: true, force: true }); }
});
