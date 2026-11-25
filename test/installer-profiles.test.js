// Install profiles and the smart-search add-on: flag mapping, the recorded
// choice, never prompting without a terminal, and add/remove on reruns. Runs in
// disposable homes with a fake CLI that records what the installer asks of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { installFakeQmd } from './fake-qmd-helper.js';
import { applyProfileFlags, askSmartSearch, describePlan, effectiveProfile, formatPlan, PROFILE_NAMES, promptChoices, recordedProfile, shouldPrompt, smartSearchModelPath, SMART_SEARCH_MODEL } from '../scripts/install-profiles.mjs';

const repo = new URL('..', import.meta.url).pathname;
const options = (flags = {}, provided = []) => ({ integrations: 'auto', provided: new Set(provided), ...flags });

test('profiles map onto the existing mode flags; contradictions stop with a reason', () => {
  assert.deepEqual(PROFILE_NAMES, ['personal', 'mac-app', 'remote', 'browse']);
  assert.equal(applyProfileFlags(options({ profile: 'mac-app' })).withApp, true);
  assert.equal(applyProfileFlags(options({ profile: 'remote' })).remoteOnly, true);
  const personal = applyProfileFlags(options({ profile: 'personal' }));
  assert.equal(Boolean(personal.withApp || personal.remoteOnly), false);
  // Older flags alone keep working and imply their profile.
  assert.equal(effectiveProfile(applyProfileFlags(options({ withApp: true }))), 'mac-app');
  assert.equal(effectiveProfile(applyProfileFlags(options({ remoteOnly: true }))), 'remote');
  assert.equal(effectiveProfile(applyProfileFlags(options())), 'personal');
  assert.equal(applyProfileFlags(options({ profile: 'mac-app', smartSearch: true })).smartSearch, true);
  for (const [flags, message] of [
    [{ profile: 'team' }, /--profile must be one of personal, mac-app, remote, browse/],
    [{ profile: 'remote', withApp: true }, /needs a local brain/],
    [{ profile: 'mac-app', remoteOnly: true }, /cannot be combined with --remote-only/],
    [{ profile: 'personal', withApp: true }, /--profile mac-app/],
    [{ profile: 'remote', smartSearch: true }, /no local brain/],
    [{ remoteOnly: true, smartSearch: true }, /no local brain/],
    [{ profile: 'browse', withApp: true }, /installs nothing/],
  ]) assert.throws(() => applyProfileFlags(options(flags)), message, JSON.stringify(flags));
});

test('recorded profiles win; older manifests get the profile their mode implies', () => {
  assert.equal(recordedProfile(null), undefined);
  assert.equal(recordedProfile({ profile: 'mac-app', remoteOnly: false }), 'mac-app');
  assert.equal(recordedProfile({ remoteOnly: true }), 'remote');
  assert.equal(recordedProfile({ remoteOnly: false }, { appInstalled: true }), 'mac-app');
  assert.equal(recordedProfile({}), 'personal');
  // A plain rerun keeps the record; --with-app on a personal install moves it to mac-app.
  assert.equal(effectiveProfile(options(), 'mac-app'), 'mac-app');
  assert.equal(effectiveProfile(options({ withApp: true }), 'personal'), 'mac-app');
  assert.equal(effectiveProfile(options({ profile: 'personal' }), 'mac-app'), 'personal');
});

test('only a person at a terminal is asked; Enter accepts the defaults', async () => {
  for (const flags of [{ stdinIsTTY: false }, { stdinIsTTY: undefined }, { stdinIsTTY: true, json: true }, { stdinIsTTY: true, yes: true }, { stdinIsTTY: true, dryRun: true }]) assert.equal(shouldPrompt(flags), false, JSON.stringify(flags));
  assert.equal(shouldPrompt({ stdinIsTTY: true }), true);
  const answers = (...values) => { const queue = [...values]; const asked = []; return { ask: async question => { asked.push(question); return queue.shift() ?? ''; }, asked }; };
  const quiet = { write: () => {} };
  let script = answers('', '');
  assert.deepEqual(await promptChoices(script.ask, quiet), { profile: 'personal', smartSearch: false });
  script = answers('9', '2', 'y');
  assert.deepEqual(await promptChoices(script.ask, quiet), { profile: 'mac-app', smartSearch: true });
  assert.equal(script.asked.length, 3, 'an invalid answer is asked again');
  script = answers('3');
  assert.deepEqual(await promptChoices(script.ask, quiet), { profile: 'remote', smartSearch: false });
  assert.equal(script.asked.length, 1, 'no smart-search question without a local brain');
  assert.equal(await askSmartSearch(answers('').ask, { current: true, ...quiet }), true, 'Enter keeps it on');
  assert.equal(await askSmartSearch(answers('n').ask, { current: true, ...quiet }), false);
  let shown = ''; await promptChoices(answers('', '').ask, { write: text => { shown += text; } });
  assert.match(shown, /Personal memory for my agents \(default\)/);
  assert.match(shown, /334 MB language model/);
  assert.match(shown, /None of your notes are sent anywhere/);
});

test('the plan is outcome first with the technical details underneath', () => {
  const plan = describePlan({ profile: 'personal', smartSearch: true, smartSearchAction: 'add' });
  assert.deepEqual([plan.profile, plan.addOns.smartSearch, plan.smartSearch.action, plan.smartSearch.downloadBytes], ['personal', true, 'add', SMART_SEARCH_MODEL.bytes]);
  const text = formatPlan(plan);
  assert.match(text, /^Plan: Personal memory for my agents\n {2}Your agents remember/);
  assert.match(text, /Installs: /); assert.match(text, /Network: /);
  assert.match(text, /Smart search: turning on/);
  assert.equal(describePlan({ profile: 'remote' }).smartSearch.available, false);
  assert.equal(smartSearchModelPath('/h', {}), `/h/.jumpybrain/models/${SMART_SEARCH_MODEL.sha256}.gguf`);
});

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-install-profiles-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), source = path.join(base, 'source'), root = path.join(home, '.jumpybrain'), calls = path.join(base, 'cli-calls.log');
  await mkdir(home); await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: '0.0.1' }));
  // A fake CLI: records each call, and applies the index policy flags to the brain like the real one
  // (the policy is saved before indexing, so FIXTURE_FAIL=semantic leaves it saved and fails).
  await writeFile(path.join(source, 'dist/cli.js'), `const fs=require('node:fs');const path=require('node:path');const args=process.argv.slice(2);const root=args[args.indexOf('--root')+1];
fs.appendFileSync(${JSON.stringify(calls)}, args.join(' ')+'\\n');
if(args[0]==='init'&&!fs.existsSync(path.join(root,'jumpybrain.json'))){fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'jumpybrain.json'),JSON.stringify({canonical:'markdown',memoryDirs:['notes']}));}
if(args[0]==='index'&&process.env.FIXTURE_FAIL==='index')process.exit(1);
if(args[0]==='index'&&(args.includes('--setup-semantic')||args.includes('--lexical'))){if(process.env.FIXTURE_FAIL==='download'&&args.includes('--setup-semantic'))process.exit(1);if(process.env.FIXTURE_FAIL==='kill'&&args.includes('--setup-semantic')){process.kill(process.ppid,'SIGKILL');process.exit(1);}const file=path.join(root,'jumpybrain.json');const config=JSON.parse(fs.readFileSync(file,'utf8'));config.indexing=args.includes('--setup-semantic')?{mode:'semantic',modelId:'sha256:${SMART_SEARCH_MODEL.sha256}'}:{mode:'lexical'};fs.writeFileSync(file,JSON.stringify(config));if(process.env.FIXTURE_FAIL==='semantic'&&args.includes('--setup-semantic'))process.exit(1);process.exit(0);}
console.log(JSON.stringify(args[0]==='doctor'?{ok:true}:{retrieval:{status:'complete'},results:[]}));`);
  const { bin } = await installFakeQmd(base); await writeFile(bin, '#!/bin/sh\necho "qmd 2.8.3"\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, JUMPYBRAIN_QMD_BIN: bin };
  for (const key of ['JUMPYBRAIN_INSTALL_SOURCE', 'JUMPYBRAIN_INSTALL_REF', 'JUMPYBRAIN_MODEL_DIRECTORY', 'JUMPYBRAIN_BOOTSTRAP_DIR']) delete env[key];
  // spawnSync gives the installer a pipe, never a terminal: like an agent or `curl | bash`.
  const install = (extra = [], moreEnv = {}) => {
    const result = spawnSync(process.execPath, [path.join(repo, 'scripts/public-install.mjs'), '--source', source, '--home', home, '--skip-build', '--integrations', 'none', ...extra], { env: { ...env, ...moreEnv }, encoding: 'utf8', timeout: 60000 });
    let report = null; try { report = JSON.parse(result.stdout); } catch {}
    return { ...result, report };
  };
  const manifest = async () => JSON.parse(await readFile(path.join(root, 'install-manifest.json'), 'utf8'));
  const smartCalls = async () => existsSync(calls) ? (await readFile(calls, 'utf8')).split('\n').filter(line => /--setup-semantic|--lexical/.test(line)) : [];
  const policy = async () => JSON.parse(await readFile(path.join(root, 'memory/jumpybrain.json'), 'utf8')).indexing?.mode ?? 'lexical';
  return { home, root, install, manifest, smartCalls, policy, memory: path.join(root, 'memory') };
}

test('without a terminal the installer never asks: defaults are recorded, smart search stays off', async t => {
  const f = await fixture(t);
  const text = f.install();
  assert.equal(text.status, 0, text.stderr);
  assert.doesNotMatch(text.stdout + text.stderr, /What do you want jumpyBrain for\?|\[y\/N\]/);
  assert.match(text.stdout, /Plan: Personal memory for my agents/);
  assert.match(text.stdout, /Keyword search is ready\./);
  assert.match(text.stdout, /Smart search is off\..*jumpybrain smart-search on/);
  const manifest = await f.manifest();
  assert.deepEqual([manifest.profile, manifest.addOns], ['personal', { smartSearch: false }]);
  assert.deepEqual(await f.smartCalls(), []);
});

test('a dry run shows the chosen plan and the model download, and writes nothing', async t => {
  const f = await fixture(t);
  const dry = f.install(['--profile', 'personal', '--smart-search', '--dry-run', '--json']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual([dry.report.state, dry.report.profile, dry.report.plan.profile, dry.report.plan.smartSearch.action], ['planned', 'personal', 'personal', 'add']);
  const model = dry.report.filesystem.changes.find(item => item.role === 'smart-search-model');
  assert.deepEqual([model.path, model.action], [smartSearchModelPath(f.home, {}), 'create']);
  assert.ok(dry.report.filesystem.network.some(item => item.host === 'huggingface.co'));
  assert.equal(existsSync(f.root), false);
  const browse = f.install(['--profile', 'browse', '--json']);
  assert.equal(browse.status, 0, browse.stderr);
  assert.deepEqual([browse.report.state, browse.report.profile], ['not_needed', 'browse']);
  assert.deepEqual(browse.report.plan, describePlan({ profile: 'browse', smartSearch: false }));
  assert.match(browse.stderr, /nothing to install/i);
  assert.equal(existsSync(f.root), false);
  const conflict = f.install(['--profile', 'remote', '--smart-search', '--json']);
  assert.equal(conflict.status, 1);
  assert.match(conflict.stderr, /no local brain/);
});

test('smart search chosen at install is turned on and recorded; reruns keep, remove or re-add it', async t => {
  const f = await fixture(t);
  const installed = f.install(['--smart-search', '--json']);
  assert.equal(installed.status, 0, installed.stderr);
  assert.deepEqual([installed.report.state, installed.report.smartSearch.state], ['ready', 'on']);
  assert.deepEqual(await f.smartCalls(), [`index --root ${f.memory} --setup-semantic --download-model`]);
  assert.deepEqual((await f.manifest()).addOns, { smartSearch: true });

  // A plain rerun (an update) keeps the profile and the add-on without asking or downloading again.
  const kept = f.install(['--json']);
  assert.equal(kept.status, 0, kept.stderr);
  assert.deepEqual([kept.report.profile, kept.report.smartSearch.state], ['personal', 'on']);
  assert.equal((await f.smartCalls()).length, 1);
  assert.deepEqual([(await f.manifest()).profile, (await f.manifest()).addOns.smartSearch], ['personal', true]);

  // Removing it switches the brain back and frees only the pinned model file in a real model directory.
  const model = smartSearchModelPath(f.home, {}), other = path.join(path.dirname(model), 'user-selected.gguf');
  await mkdir(path.dirname(model), { recursive: true }); await writeFile(model, 'model'); await writeFile(other, 'keep');
  const removed = f.install(['--no-smart-search', '--json']);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(removed.report.plan.smartSearch.action, 'remove');
  assert.equal((await f.smartCalls()).at(-1), `index --root ${f.memory} --lexical`);
  assert.deepEqual([(await f.manifest()).addOns.smartSearch, await f.policy(), existsSync(model), existsSync(other)], [false, 'lexical', false, true]);

  // A brain on a custom model path keeps the preset file: it is not that brain's managed model.
  await writeFile(model, 'model');
  const config = path.join(f.memory, 'jumpybrain.json');
  await writeFile(config, JSON.stringify({ ...JSON.parse(await readFile(config, 'utf8')), indexing: { mode: 'semantic', model: '/absolute/custom.gguf' } }));
  const custom = f.install(['--no-smart-search', '--json']);
  assert.equal(custom.status, 0, custom.stderr);
  assert.deepEqual([await f.policy(), existsSync(model)], ['lexical', true]);

  // A failed download leaves keyword search installed and names the retry.
  const failed = f.install(['--smart-search', '--json'], { FIXTURE_FAIL: 'download' });
  assert.equal(failed.status, 0, failed.stderr);
  assert.deepEqual([failed.report.state, failed.report.smartSearch.state], ['pending_user_action', 'failed']);
  assert.ok(failed.report.remainingActions.some(item => /index --root .* --setup-semantic --download-model/.test(item)));
  assert.deepEqual([(await f.manifest()).addOns.smartSearch, (await f.manifest()).state], [false, 'ready']);

  // An index that fails after the policy was saved is put back to keyword search, and recorded as such.
  const unindexed = f.install(['--smart-search', '--json'], { FIXTURE_FAIL: 'semantic' });
  assert.equal(unindexed.status, 0, unindexed.stderr);
  assert.equal(unindexed.report.smartSearch.state, 'failed');
  assert.deepEqual([await f.policy(), (await f.manifest()).addOns.smartSearch], ['lexical', false]);
});

test('retrying an interrupted first install keeps the smart search choice', async t => {
  const f = await fixture(t);
  const interrupted = f.install(['--smart-search', '--json'], { FIXTURE_FAIL: 'index' });
  assert.equal(interrupted.status, 1);
  assert.deepEqual([(await f.manifest()).state, (await f.manifest()).addOns], ['installing', { smartSearch: true }]);
  // A hard stop while the model downloads leaves the request pending, not a ready install without it.
  const killed = f.install(['--json'], { FIXTURE_FAIL: 'kill' });
  assert.notEqual(killed.status, 0);
  assert.deepEqual([(await f.manifest()).state, (await f.manifest()).addOns], ['installing', { smartSearch: true }]);
  const retry = f.install(['--json']);
  assert.equal(retry.status, 0, retry.stderr);
  assert.deepEqual([retry.report.plan.smartSearch.action, retry.report.smartSearch.state, await f.policy()], ['add', 'on', 'semantic']);
  assert.deepEqual([(await f.manifest()).state, (await f.manifest()).addOns.smartSearch], ['ready', true]);
});

test('an opt-out on a resumed install switches a brain that already saved smart search back to keyword search', async t => {
  const f = await fixture(t);
  assert.notEqual(f.install(['--smart-search', '--json'], { FIXTURE_FAIL: 'kill' }).status, 0);
  // Simulate the policy having been saved before the stop.
  const config = path.join(f.memory, 'jumpybrain.json');
  await writeFile(config, JSON.stringify({ ...JSON.parse(await readFile(config, 'utf8')), indexing: { mode: 'semantic', modelId: `sha256:${SMART_SEARCH_MODEL.sha256}` } }));
  const model = smartSearchModelPath(f.home, {}); await mkdir(path.dirname(model), { recursive: true }); await writeFile(model, 'model');
  const optOut = f.install(['--no-smart-search', '--json']);
  assert.equal(optOut.status, 0, optOut.stderr);
  assert.equal(optOut.report.filesystem.changes.find(item => item.role === 'smart-search-model').path, model);
  assert.deepEqual([await f.policy(), (await f.manifest()).addOns.smartSearch, (await f.manifest()).state, existsSync(model)], ['lexical', false, 'ready', false], JSON.stringify(optOut.report.smartSearch));
});

test('a remote-only installation keeps its mode and says why it cannot switch', async t => {
  const f = await fixture(t);
  const remote = f.install(['--profile', 'remote', '--json'], { JUMPYBRAIN_QMD_BIN: '/absent/qmd' });
  assert.equal(remote.status, 0, remote.stderr);
  assert.deepEqual([remote.report.profile, (await f.manifest()).profile, (await f.manifest()).remoteOnly], ['remote', 'remote', true]);
  for (const flags of [['--profile', 'personal'], ['--profile', 'mac-app'], ['--smart-search']]) {
    const refused = f.install([...flags, '--json'], { JUMPYBRAIN_QMD_BIN: '/absent/qmd' });
    assert.equal(refused.status, 1, flags.join(' '));
    assert.match(refused.report.error, /remote-only|team brain/);
    assert.match(refused.report.error, /Nothing was changed/);
  }
  const rerun = f.install([], { JUMPYBRAIN_QMD_BIN: '/absent/qmd' });
  assert.equal(rerun.status, 0, rerun.stderr);
  assert.match(rerun.stdout, /remote-only\); that mode stays fixed/);
});

test('jumpybrain update reruns the installer with --yes and keeps the recorded profile and add-on', async t => {
  const f = await fixture(t);
  assert.equal(f.install(['--smart-search']).status, 0);
  const { installerUpdatePlan } = await import('../dist/cli/update.js');
  const plan = await installerUpdatePlan({ _: ['update'], home: f.home, 'install-root': f.root });
  assert.ok(plan.installerArgs.includes('--yes'));
  const updated = spawnSync(process.execPath, [plan.installerScript, ...plan.installerArgs, '--json'], { env: { ...process.env, HOME: f.home, JUMPYBRAIN_QMD_BIN: (await f.manifest()).qmd }, encoding: 'utf8', timeout: 60000 });
  assert.equal(updated.status, 0, updated.stderr);
  const report = JSON.parse(updated.stdout);
  assert.deepEqual([report.profile, report.smartSearch.state], ['personal', 'on']);
  assert.deepEqual([(await f.manifest()).profile, (await f.manifest()).addOns.smartSearch], ['personal', true]);
});

test('the bootstrap downloads nothing for --profile browse and skips local-only helpers for --profile remote', async t => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'jb-install-profiles-shell-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const home = path.join(base, 'home'), raw = path.join(base, 'raw'), source = path.join(base, 'source');
  await mkdir(home); await mkdir(path.join(source, 'dist'), { recursive: true });
  await writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'jumpybrain', version: '0.0.1' }));
  await writeFile(path.join(source, 'dist/cli.js'), 'console.log("0.0.1")');
  const helpers = (await readFile(path.join(repo, 'install.sh'), 'utf8')).match(/^HELPERS='([^']+)'/m)[1].split(' ');
  assert.ok(helpers.includes('scripts/install-profiles.mjs'), 'install.sh downloads the profile helper');
  for (const name of helpers) { await mkdir(path.dirname(path.join(raw, name)), { recursive: true }); await writeFile(path.join(raw, name), await readFile(path.join(repo, name))); }
  const env = { ...process.env, HOME: home, PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, JUMPYBRAIN_QMD_BIN: '/absent/qmd' };
  for (const key of ['JUMPYBRAIN_INSTALL_SOURCE', 'JUMPYBRAIN_INSTALL_REF', 'JUMPYBRAIN_BOOTSTRAP_DIR']) delete env[key];
  const bootstrap = (args, rawBase = `file://${raw}`) => spawnSync('sh', [path.join(repo, 'install.sh'), '--home', home, '--json', ...args], { cwd: base, encoding: 'utf8', env: { ...env, JUMPYBRAIN_RAW_BASE: rawBase } });
  const browse = bootstrap(['--profile', 'browse'], 'http://127.0.0.1:9/never-contacted');
  assert.equal(browse.status, 0, browse.stderr);
  assert.deepEqual([JSON.parse(browse.stdout).state, JSON.parse(browse.stdout).profile], ['not_needed', 'browse']);
  assert.deepEqual(JSON.parse(browse.stdout).plan, describePlan({ profile: 'browse', smartSearch: false }), 'the shell fast path reports the same plan as the installer');
  assert.match(browse.stderr, /There is nothing to install/);
  assert.equal(bootstrap(['--profile', 'browse', '--with-app']).status, 1);
  const remote = bootstrap(['--profile', 'remote', '--dry-run', '--source', source, '--skip-build']);
  assert.equal(remote.status, 0, remote.stderr);
  assert.deepEqual([JSON.parse(remote.stdout).state, JSON.parse(remote.stdout).profile, JSON.parse(remote.stdout).remoteOnly], ['planned', 'remote', true]);
});
