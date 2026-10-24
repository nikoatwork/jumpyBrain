#!/usr/bin/env node
// Opt-in real CLI/QMD onboarding. All installs, skills and notes are disposable.
// Serve this candidate's bootstrap over loopback; never substitute a moving release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'jb-onboarding-install-')));
const home = path.join(temporary, 'Home with spaces \' $&');
const workspace = path.join(temporary, 'First project');
const scratch = path.join(temporary, 'bootstrap scratch');
await Promise.all([mkdir(workspace), mkdir(scratch)]);
const root = path.join(workspace, 'memory');
const installRoot = path.join(home, '.jumpybrain');
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^(JUMPYBRAIN_|QMD_|XDG_)/.test(key)) delete env[key];
Object.assign(env, { HOME: home, TMPDIR: scratch, XDG_CACHE_HOME: path.join(temporary, 'cache'),
  NODE_DISABLE_COMPILE_CACHE: '1', NODE_COMPILE_CACHE: path.join(temporary, 'node-cache'),
  JUMPYBRAIN_QMD_BIN: process.env.JUMPYBRAIN_QMD_BIN || 'qmd' });
const steps = [], requests = [];
const files = new Set(['install.sh', 'scripts/public-install.mjs', 'scripts/qmd-install-check.mjs',
  'scripts/remote-target-origin.mjs', 'scripts/macos-companion.mjs',
  'integrations/macos-companion/update.py', 'integrations/macos-companion/lifecycle.py']);
const server = http.createServer(async (request, response) => {
  const file = new URL(request.url, 'http://localhost').pathname.slice(1);
  if (!files.has(file)) { response.writeHead(404).end(); return; }
  try { const bytes = await readFile(path.join(repo, file)); requests.push(file); response.end(bytes); }
  catch { response.writeHead(500).end(); }
});
function run(label, command, args, { input, success = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workspace, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.stdout.on('data', bytes => { stdout += bytes; });
    child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try { if (success) assert.equal(code, 0, `${label}\n${stderr}\n${stdout}`);
        steps.push({ name: label, exitCode: code }); resolve({ stdout, stderr, code }); }
      catch (error) { reject(error); }
    });
    child.stdin.end(input);
  });
}
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  env.JUMPYBRAIN_RAW_BASE = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = path.join(temporary, 'downloaded-install.sh');
  const bootstrapBytes = Buffer.from(await (await fetch(env.JUMPYBRAIN_RAW_BASE + '/install.sh')).arrayBuffer());
  await writeFile(bootstrap, bootstrapBytes);
  const args = [bootstrap, '--source', repo, '--home', home, '--install-root', installRoot,
    '--scope', 'project', '--cwd', workspace, '--integrations', 'all', '--skip-qmd-install'];
  const preview = await run('downloaded bootstrap dry-run', 'sh', [...args, '--dry-run']);
  assert.match(preview.stdout, /No changes made/);
  assert.equal(existsSync(installRoot), false);
  assert.equal(existsSync(root), false);
  assert.deepEqual(await readdir(scratch), []);
  const installed = await run('downloaded bootstrap real source install/build', 'sh', args);
  assert.match(installed.stdout, /Local text search is ready/);
  assert.deepEqual(await readdir(scratch), []);
  for (const file of files) assert.ok(requests.includes(file), `bootstrap did not download ${file}`);
  const cli = path.join(installRoot, 'bin/jumpybrain');
  const doctor = JSON.parse((await run('installed strict required health checks', cli, ['doctor', '--root', root, '--check', '--json'])).stdout);
  assert.equal(doctor.ok, true, 'provision exact QMD CLI + SDK before running this smoke');
  const skillPath = path.join(workspace, '.claude/skills/jumpybrain-memory/SKILL.md');
  const skill = await readFile(skillPath, 'utf8');
  const saved = JSON.parse((await run('first authorized project decision', cli,
    ['remember', '--root', root, '--type', 'decision', '--title', 'Synthetic onboarding event', '--json'],
    { input: 'The synthetic community event is on 18 November. Its year is unknown.\n' })).stdout);
  assert.equal(saved.saved, true);
  const note = path.join(root, saved.file), noteBytes = await readFile(note);
  const recalled = JSON.parse((await run('fresh-process recall', cli,
    ['recall', '--root', root, '--query', 'community event', '--compact'])).stdout);
  const passage = recalled.passages.find(row => row.text.includes('18 November'));
  assert.match(passage?.text || '', /year is unknown/);
  const source = JSON.parse((await run('guarded source expansion', cli, ['expand', '--root', root,
    '--id', passage.expansion.id, '--if-match', passage.expansion.expectedContentHash,
    '--start-line', String(passage.startLine), '--end-line', String(passage.endLine)])).stdout);
  assert.match(source.text, /18 November.*year is unknown/s);
  await run('managed update preserves brain and integration', cli, ['update', '--install-root', installRoot]);
  assert.deepEqual(await readFile(note), noteBytes);
  assert.equal(await readFile(skillPath, 'utf8'), skill);
  const uninstall = path.join(repo, 'scripts/public-uninstall.mjs');
  const removalArgs = [uninstall, '--install-root', installRoot, '--home', home];
  const removalPreview = await run('uninstall deletion preview is truthful and nonmutating', process.execPath,
    [...removalArgs, '--dry-run', '--delete-memory']);
  assert.match(removalPreview.stdout, /dry run complete\. No changes made/);
  assert.match(removalPreview.stdout, /Would delete memory:/);
  assert.doesNotMatch(removalPreview.stdout, /^Removed:|^Memory deleted:/m);
  assert.deepEqual(await readFile(note), noteBytes);
  assert.equal(existsSync(cli), true);
  await run('ordinary uninstall preserves canonical memory', process.execPath, removalArgs);
  assert.equal(existsSync(cli), false);
  assert.equal(existsSync(skillPath), false);
  assert.deepEqual(await readFile(note), noteBytes);
  console.log(JSON.stringify({ ok: true, node: process.version, platform: process.platform + '/' + process.arch,
    bootstrapSha256: createHash('sha256').update(bootstrapBytes).digest('hex'), downloadedFiles: [...new Set(requests)], steps,
    limits: ['Candidate bootstrap served over real loopback HTTP, not GitHub TLS',
      'Existing Node/npm/Git/QMD; not a clean machine', 'No actual agent-model conversation'] }, null, 2));
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
