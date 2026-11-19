import { stopRootBackend } from "../dist/app/backend-host/index.js";
import { existsSync } from "node:fs";
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { parseArgs } from '../dist/cli/args.js';

const execute = promisify(execFile), cliPath = path.resolve('dist/cli.js');
const hash = 'sha256:' + '0'.repeat(64);
const cli = (args, env = {}) => execute(process.execPath, [cliPath, ...args], { env: { ...process.env, ...env }, maxBuffer: 8 * 1024 * 1024 });
const scene = labels => ({ type: 'excalidraw', version: 2, source: 'test', appState: {}, files: {},
  elements: [{ id: 'box', type: 'rectangle' }, ...labels.map((text, i) => ({ id: 't' + i, type: 'text', text })), { id: 'old', type: 'text', text: 'Deleted label', isDeleted: true }] });

test('drawings parsing is strict and needs a hash and file for updates', () => {
  for (const args of [
    [], ['open'], ['list', '--drawing', 'x'], ['show'], ['show', '--drawing'], ['list', '--json=true'],
    ['show', '--drawing', 'a', '--drawing', 'b'], ['update', '--drawing', 'x', '--file', 'f'],
    ['update', '--drawing', 'x', '--if-match', '1', '--file', 'f'], ['update', '--drawing', 'x', '--if-match', hash],
    ['list', '--root', 'a', '--target-url', 'http://example.test'], ['show', '--drawing', 'x', 'extra'],
  ].slice(1)) assert.throws(() => parseArgs(['drawings', ...args]), undefined, args.join(' '));
  assert.equal(parseArgs(['drawings', 'show', '--drawing', 'Plan.excalidraw']).drawing, 'Plan');
  assert.equal(parseArgs(['drawings', 'list']).help, undefined);
});

test('drawings help and root usage advertise the namespace', async () => {
  assert.match((await cli(['drawings', '--help'])).stdout, /update: --drawing <name> --if-match <hash> --file/);
  assert.match((await cli(['--help'])).stdout, /drawings/);
});

for (const remote of [false, true]) test(`drawings list/show/update and tree ${remote ? 'through hosted transport' : 'on a local root'}`, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-drawings-cli-')); await initializeMemoryRoot(root);
  let server; if (remote) server = await startJumpyBrainHttpServer({ root, apiKeys: ['fixture'], host: '127.0.0.1', port: 0, autoIndex: false });
  t.after(async () => { await server?.close(); if (existsSync(path.join(root, '.jumpybrain/backend/owner.json'))) await stopRootBackend(root); await rm(root, { recursive: true, force: true }); });
  const target = remote ? ['--target-url', server.url] : ['--root', root];
  const env = { JUMPYBRAIN_API_KEY: 'fixture' };
  const json = async (...args) => JSON.parse((await cli([...args, ...target, '--json'], env)).stdout);

  assert.deepEqual((await json('drawings', 'list')).drawings, []);
  await mkdir(path.join(root, 'drawings'));
  await writeFile(path.join(root, 'drawings/Auth flow.excalidraw'), JSON.stringify(scene(['Login', 'Token refresh'])));
  await writeFile(path.join(root, 'drawings/notes.txt'), 'ignored');
  await mkdir(path.join(root, 'drawings/Folder.excalidraw')); // unsupported entry: counted as skipped

  const listed = await json('drawings', 'list');
  assert.deepEqual(listed.drawings.map(d => d.name), ['Auth flow']);
  const text = (await cli(['drawings', 'show', '--drawing', 'Auth flow.excalidraw', ...target], env)).stdout;
  assert.match(text, /Elements: 3 \(rectangle 1, text 2\)/);
  assert.match(text, /- Token refresh/); assert.doesNotMatch(text, /Deleted label/);

  const shown = await json('drawings', 'show', '--drawing', 'Auth flow');
  assert.match(shown.contentHash, /^sha256:/); assert.equal(shown.scene.elements.length, 4);
  assert.equal(JSON.stringify(shown).includes(remote ? root : 'no such marker'), false);

  // A saved show --json packet is accepted as update input.
  shown.scene.elements.push({ id: 'new', type: 'text', text: 'Logout' });
  const file = path.join(root, 'edited.json'); await writeFile(file, JSON.stringify(shown));
  const saved = await json('drawings', 'update', '--drawing', 'Auth flow', '--if-match', shown.contentHash, '--file', file);
  assert.notEqual(saved.contentHash, shown.contentHash);
  const onDisk = JSON.parse(await readFile(path.join(root, 'drawings/Auth flow.excalidraw'), 'utf8'));
  assert.equal(onDisk.elements.at(-1).text, 'Logout'); assert.equal(onDisk.type, 'excalidraw');

  await assert.rejects(cli(['drawings', 'update', '--drawing', 'Auth flow', '--if-match', shown.contentHash, '--file', file, ...target, '--json'], env),
    error => JSON.parse(error.stdout).error.code === 'drawing_conflict');
  await assert.rejects(cli(['drawings', 'show', '--drawing', 'Missing', ...target, '--json'], env),
    error => JSON.parse(error.stdout).error.code === 'drawing_missing');

  const tree = await json('tree');
  assert.deepEqual(tree.drawings, { count: 1, skipped: 1, names: ['Auth flow'] });
  assert.match((await cli(['tree', ...target], env)).stdout, /drawings\/ \(1 Excalidraw file, not indexed, 1 skipped\)\n└── Auth flow\.excalidraw/);
});

test('protected remote drawing reads pass policy but updates fail before credentials and input files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'jb-drawings-policy-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const config = path.join(directory, 'policy.json');
  await writeFile(config, JSON.stringify({ schemaVersion: 1, remoteTargets: [{ origin: 'https://example.test', access: 'read-only' }] }));
  const env = { JUMPYBRAIN_CLI_CONFIG: config, JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_ENV_FILE: path.join(directory, 'missing.env') };
  await assert.rejects(cli(['drawings', 'update', '--target-url', 'https://example.test', '--drawing', 'x', '--if-match', hash, '--file', '/does/not/exist'], env),
    error => /JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/.test(error.stderr) && !/ENOENT|No access key for/.test(error.stderr));
  await assert.rejects(cli(['drawings', 'list', '--target-url', 'https://example.test'], env), error => /No access key for/.test(error.stderr));
});
