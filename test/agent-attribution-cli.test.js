import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot, readMemoryDocument } from '../dist/runtime/index.js';
import { stopRootBackend } from '../dist/app/backend-host/index.js';

test('an explicitly named agent retains creator and latest editor across CLI remember/update/live stream', { timeout: 20000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jb-attribution-cli-'));
  await initializeMemoryRoot(root);
  const env = { ...process.env, JUMPYBRAIN_CLIENT_NAME: 'Fixture agent', JUMPYBRAIN_IDENTITY_FILE: path.join(root, 'no-owner-config'), JUMPYBRAIN_QMD_BIN: path.join(root, 'missing-qmd') };
  const run = (args, input = '') => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args, '--root', root, '--json'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    child.on('error', reject); child.on('close', code => {
      if (code) reject(new Error(stderr)); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
    }); child.stdin.end(input);
  });
  try {
    const saved = await run(['remember', '--type', 'note', '--title', 'Named agent', '--actor', 'agent'], 'Initial body');
    let doc = await readMemoryDocument(root, saved.id);
    assert.equal(doc.frontmatter.creator_name, 'Fixture agent');
    assert.deepEqual(doc.recognition.editor, { kind: 'agent', name: 'Fixture agent' });
    await run(['update', '--id', saved.id, '--if-match', doc.contentHash, '--actor', 'agent'], doc.content.replace('Initial body', 'Updated body'));
    await run(['collaborate', 'stream', '--id', saved.id, '--client-id', 'transport-client-is-not-declared-identity'], ' Streamed tail');
    doc = await readMemoryDocument(root, saved.id);
    assert.equal(doc.frontmatter.creator_name, 'Fixture agent');
    assert.deepEqual(doc.recognition.editor, { kind: 'agent', name: 'Fixture agent' });
    assert.equal(doc.frontmatter.last_editor_id, undefined);
    await writeFile(path.join(root, doc.file), doc.content.replace('Streamed tail', 'External edit'));
    assert.equal((await readMemoryDocument(root, saved.id)).recognition.editor, undefined);
  } finally { await stopRootBackend(root).catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
