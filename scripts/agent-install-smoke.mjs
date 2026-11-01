#!/usr/bin/env node
// Real packaged CLI/engine checks in disposable homes; release transport is a
// deterministic fixture serving the exact local distribution, never a publication.
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const repo = fileURLToPath(new URL('..', import.meta.url));
const withApp = process.argv.includes('--with-app');
const temporary = await realpath(await mkdtemp(path.join(process.platform === 'darwin' ? '/tmp' : os.tmpdir(), 'jb-smoke-')));
const home = path.join(temporary, 'home');
await (await import('node:fs/promises')).mkdir(home);
const metadata = JSON.parse(await readFile(path.join(repo, '.local-pack/latest.json'), 'utf8'));
const archive = await readFile(metadata.tarballPath);
const digest = 'sha256:' + createHash('sha256').update(archive).digest('hex');
const url = `https://github.com/nikoatwork/jumpyBrain/releases/download/v${metadata.version}/jumpybrain-${metadata.version}.tgz`;
const preload = path.join(temporary, 'release-fixture.mjs');
const release = { id: 1, tag_name: `v${metadata.version}`, published_at: '2026-11-01T00:00:00Z', prerelease: true, assets: [{ id: 2, name: `jumpybrain-${metadata.version}.tgz`, state: 'uploaded', digest, size: archive.length, browser_download_url: url }] };
await writeFile(preload, `import {readFile} from 'node:fs/promises';const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://api.github.com/repos/nikoatwork/jumpyBrain/releases?'))return new Response(${JSON.stringify(JSON.stringify([release]))});if(String(url)===${JSON.stringify(url)})return new Response(await readFile(${JSON.stringify(metadata.tarballPath)}));return original(url,options);};`);
const node = process.env.JUMPYBRAIN_SMOKE_NODE || process.execPath;
const env = { ...process.env, HOME: home, CFFIXED_USER_HOME: home, PATH: `${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`, JUMPYBRAIN_QMD_BIN: '', JUMPYBRAIN_INSTALL_SOURCE: '', NODE_OPTIONS: `--import=${preload}` };
delete env.JUMPYBRAIN_INSTALL_SOURCE; delete env.ELECTRON_RUN_AS_NODE;
const install = [path.join(repo, 'scripts/public-install.mjs'), '--home', home, '--install-root', path.join(home, '.jumpybrain'), '--integrations', 'all', '--json'];
let appPid;
async function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd: temporary, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Disposable installation timed out.')); }, 600000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`Fixture command failed (${code}): ${stderr}\n${stdout}`)); });
    child.stdin.end(input);
  });
}
try {
  console.log('Installing the exact packed release with a private engine and all integrations…');
  const first = JSON.parse(await run(node, install));
  assert.equal(first.release.digest, digest); assert.equal(first.checks.doctor, true); assert.equal(first.checks.recall, true);
  assert.equal(first.integrations.length, 3);
  assert.match(first.engine, /\/engines\/qmd-/);
  const saved = JSON.parse(await run(first.cliPath, ['remember', '--root', first.memoryRoot, '--type', 'note', '--title', 'Installer canary', '--json'], 'The installer canary remembers violet marshmallows.\n'));
  await run(first.cliPath, ['index', '--root', first.memoryRoot]);
  const recalled = JSON.parse(await run(first.cliPath, ['recall', '--root', first.memoryRoot, '--query', 'violet marshmallows', '--limit', '2', '--json']));
  assert.ok(recalled.results.length > 0, 'real indexed content is retrievable');
  const canonical = path.join(first.memoryRoot, saved.file);
  const before = await readFile(canonical);
  console.log('Checking repeat installation and canonical preservation…');
  const repeat = JSON.parse(await run(node, install));
  assert.equal(repeat.checks.recall, true); assert.deepEqual(await readFile(canonical), before);
  if (withApp) {
    const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port; await new Promise(resolve => server.close(resolve));
    console.log('Adding and launching Desktop against the same root…');
    const desktop = JSON.parse(await run(node, [...install, '--with-app', '--app-port', String(port)]));
    assert.equal(desktop.checks.desktop, true); assert.deepEqual(await readFile(canonical), before);
    const { bundledHost, desktopControl } = await import('../integrations/electron/desktop-host.mjs');
    const { readControlKey } = await import('../integrations/electron/host.mjs');
    const config = await bundledHost(path.join(desktop.appPath, 'Contents/Resources'));
    const state = await desktopControl({ ...config, key: await readControlKey(config.supportDirectory) }, 'state');
    assert.equal(state.profiles.find(p => p.id === state.activeId)?.root, first.memoryRoot);
    // Locate only our exact app executable for cleanup, never a name-based kill.
    const { execFileSync } = await import('node:child_process');
    const executable = path.join(desktop.appPath, 'Contents/MacOS/jumpyBrain');
    const row = execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' }).split('\n').find(line => line.trim().replace(/^\d+\s+/, '') === executable);
    appPid = row ? Number(row.trim().match(/^\d+/)[0]) : undefined;
  }
  console.log(JSON.stringify({ ok: true, version: metadata.version, digest, privateEngine: true, integrations: 3, actualRecall: true, repeatPreservedNotes: true, desktop: withApp, home, node }, null, 2));
} finally {
  const executable = path.join(home, 'Applications/jumpyBrain.app/Contents/MacOS/jumpyBrain');
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,comm='], { encoding: 'utf8' }).split('\n');
  for (const row of rows.filter(line => line.trim().replace(/^\d+\s+/, '') === executable)) {
    const pid = Number(row.trim().match(/^\d+/)[0]);
    try { process.kill(pid, 'SIGTERM'); } catch {}
  }
  // Keep failed fixtures for precise inspection; successful runs may be removed explicitly.
  await writeFile(path.join(temporary, 'fixture-info.json'), JSON.stringify({ home, version: metadata.version, digest }));
  console.log('Disposable fixture retained at ' + temporary);
}
