#!/usr/bin/env node
// Developer-only lifecycle/evidence helper. Human UI work is intentionally absent.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';

const exec = promisify(execFile);
export const directory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(directory, '../..');
const runs = path.join(directory, '.runs');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const now = () => new Date().toISOString();
async function save(file, value) { await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
export async function updateLedger(root, change) {
  const lock = path.join(root, '.ledger.lock'), deadline = Date.now() + 5000;
  let handle;
  while (!handle) {
    try { handle = await fs.open(lock, 'wx', 0o600); }
    catch (error) { if (error.code !== 'EEXIST') throw error; if (Date.now() >= deadline) throw new Error('Ledger is busy; inspect its owner before retrying.'); await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  const temporary = path.join(root, '.ledger-' + randomUUID() + '.json');
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: now() }));
    const current = await json(path.join(root, 'ledger.json'));
    await change(current);
    await save(temporary, current); await fs.rename(temporary, path.join(root, 'ledger.json'));
    return current;
  } finally { await handle.close(); await fs.rm(temporary, { force: true }); await fs.unlink(lock); }
}
export function runPath(name, base = runs) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(name ?? '')) throw new Error('Use a unique 3–80 character run name (letters, numbers, _ and -).');
  return path.join(base, name);
}
export async function evidenceFile(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Evidence must be a relative path inside this run.');
  const filename = path.join(root, relative), real = await fs.realpath(filename), canonicalRoot = await fs.realpath(root);
  if (!real.startsWith(canonicalRoot + path.sep) || !(await fs.stat(real)).isFile()) throw new Error('Evidence must be a regular file inside this run.');
  return { file: relative, sha256: digest(await fs.readFile(real)), bytes: (await fs.stat(real)).size };
}
function flag(args, name) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
export function guardCommand(args, manifest, ledger) {
  if (!args.length || args.some(x => /^--(?:root|target-url|remote-url|api-key|directory)(?:=|$)/.test(x))) throw new Error('Target/credentials are bound by the run, never command arguments.');
  const command = args[0], sub = args[1], id = flag(args, '--id'), board = flag(args, '--board');
  const own = (kind, value) => ledger.records.some(x => x.kind === kind && x.id === value && !x.deleted);
  const read = ['status', 'show', 'search', 'recall'].includes(command) || command === 'board' && ['show', 'status', 'list'].includes(sub) || command === 'collaborate' && ['open', 'status'].includes(sub);
  const write = ['remember', 'update'].includes(command) || command === 'board' && ['create', 'update', 'add', 'remove'].includes(sub) || command === 'collaborate' && ['edit', 'undo', 'redo', 'cancel', 'finish'].includes(sub);
  if (!read && !write) throw new Error('Operation is not part of the bounded eval command set. Use lifecycle commands for streaming/cleanup.');
  if (write && !manifest.allowMutations) throw new Error('This target has no recorded synthetic-write authorization.');
  if (['show', 'update', 'collaborate'].includes(command) && !own('note', id)) throw new Error('Note must be in this run’s creation/adoption ledger.');
  if (command === 'board' && !['list', 'create'].includes(sub) && !own('board', board)) throw new Error('Board must be in this run’s ledger.');
  if (command === 'board' && flag(args, '--page') && !own('note', flag(args, '--page'))) throw new Error('Board pages must be run-owned notes.');
  if (command === 'board' && args.includes('--file')) throw new Error('Arbitrary board files are not accepted by the eval wrapper.');
  if (command === 'remember' && !flag(args, '--title')?.startsWith(manifest.prefix) || command === 'board' && sub === 'create' && !flag(args, '--name')?.startsWith(manifest.prefix)) throw new Error('Created titles must start with the run prefix.');
  if (['search', 'recall'].includes(command) && !(flag(args, '--query') ?? flag(args, '--topic') ?? '').includes(manifest.prefix.trim())) throw new Error('Eval queries must include the run prefix.');
  if ((command === 'update' || command === 'board' && ['update', 'add', 'remove'].includes(sub)) && !/^sha256:[a-f0-9]{64}$/.test(flag(args, '--if-match') ?? '')) throw new Error('A current verified hash is required.');
  return { read, write };
}
export function cleanupCheck(record, currentHash, references = null) {
  if (!record.verifiedHash || record.verifiedHash !== currentHash) throw new Error('Cleanup stopped: content changed since explicit verification.');
  if (references && (references.links !== 0 || references.relationships !== 0 || references.truncated)) throw new Error('Cleanup stopped: inbound references need review.');
}
async function configuration() {
  const config = { ...parseEnv(await fs.readFile(path.join(directory, '.env.local'), 'utf8')) };
  for (const key of ['JB_EVAL_NODE', 'JB_EVAL_CLI', 'JB_EVAL_APP']) if (!path.isAbsolute(config[key] ?? '')) throw new Error(`${key} must be an absolute installed path.`);
  return config;
}
async function secrets(config) {
  if (!config.JB_EVAL_REMOTE_ENV) return {};
  const parsed = parseEnv(await fs.readFile(config.JB_EVAL_REMOTE_ENV, 'utf8'));
  return parsed.JUMPYBRAIN_API_KEY ? { JUMPYBRAIN_API_KEY: parsed.JUMPYBRAIN_API_KEY } : {};
}
function sameBinding(m, c) {
  const local = m.target === 'local';
  return m.binding.selector === c[local ? 'JB_EVAL_LOCAL_ROOT' : 'JB_EVAL_VPS_URL'] && m.binding.profileId === c[local ? 'JB_EVAL_LOCAL_PROFILE' : 'JB_EVAL_VPS_PROFILE'] && m.cliPath === c.JB_EVAL_CLI && m.nodePath === c.JB_EVAL_NODE && m.appPath === c.JB_EVAL_APP;
}
async function loadRun(name) {
  const root = runPath(name), manifest = await json(path.join(root, 'manifest.json'));
  let config; try { config = await json(path.join(root, 'config.snapshot.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; config = await configuration(); }
  if (!sameBinding(manifest, config)) throw new Error('Private target/runtime configuration changed; create a new run.');
  return { root, manifest, config, ledger: await json(path.join(root, 'ledger.json')) };
}
async function inputHashes(base = directory) {
  const result = {};
  async function walk(folder) {
    for (const item of await fs.readdir(folder, { withFileTypes: true })) {
      if (item.name.startsWith('.') || item.name === 'reports') continue;
      const full = path.join(folder, item.name);
      if (item.isDirectory()) await walk(full); else if (item.isFile()) result[path.relative(base, full)] = digest(await fs.readFile(full));
    }
  }
  await walk(base); return Object.fromEntries(Object.entries(result).sort());
}
async function identities(c) {
  const result = {};
  for (const [name, filename] of Object.entries({ cli: c.JB_EVAL_CLI, app: path.join(c.JB_EVAL_APP, 'Contents/Resources/app.asar'), build: path.join(path.dirname(c.JB_EVAL_CLI), 'adapters/diagnostics/build-info.json') })) {
    result[name] = digest(await fs.readFile(filename));
  }
  const compiled = [];
  async function walk(folder, base = folder) {
    for (const item of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(folder, item.name);
      if (item.isDirectory()) await walk(full, base);
      else if (item.isFile()) compiled.push([path.relative(base, full), digest(await fs.readFile(full))]);
    }
  }
  await walk(path.dirname(c.JB_EVAL_CLI)); result.compiledRuntime = digest(JSON.stringify(compiled));
  for (const file of ['desktop.json', 'native/jumpyBrain Host.app/Contents/Resources/Configuration.json']) result[file] = digest(await fs.readFile(path.join(c.JB_EVAL_APP, 'Contents/Resources', file)));
  return result;
}
function scrub(text, secret) { return secret ? String(text).split(secret).join('[credential]') : String(text); }
async function execute(run, args, input, { internal = false } = {}) {
  if (!internal) guardCommand(args, run.manifest, run.ledger);
  const remote = run.manifest.target === 'vps', credential = remote ? await secrets(run.config) : {};
  if (remote && !credential.JUMPYBRAIN_API_KEY) throw new Error('Existing CLI remote credential is unavailable. Use request_secret with file delivery; never put it in chat.');
  const selector = [remote ? '--target-url' : '--root', run.manifest.binding.selector];
  const argv = [...args, ...selector, ...(args.includes('--json') ? [] : ['--json'])];
  const env = { ...process.env, ...credential, JUMPYBRAIN_CLIENT_ID: 'ux-' + run.manifest.run, JUMPYBRAIN_CLIENT_NAME: 'UX eval agent' };
  if (!remote) delete env.JUMPYBRAIN_API_KEY;
  if (run.config.JB_EVAL_QMD) env.JUMPYBRAIN_QMD_BIN = run.config.JB_EVAL_QMD;
  const receiptId = now().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const file = `cli/${receiptId}.json`, startedAt = now();
  let output;
  try { output = await new Promise(resolve => {
    const child = execFile(run.config.JB_EVAL_NODE, [run.manifest.cliPath, ...argv], { env, timeout: 90000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => resolve({ exitCode: error ? error.code ?? 1 : 0, stdout, stderr }));
    child.stdin.end(input ?? '');
  }); } catch { output = { exitCode: 1, stdout: '', stderr: 'Unable to start eval CLI.' }; }
  const receipt = { startedAt, finishedAt: now(), argv, ...output };
  receipt.stdout = scrub(receipt.stdout, credential.JUMPYBRAIN_API_KEY); receipt.stderr = scrub(receipt.stderr, credential.JUMPYBRAIN_API_KEY);
  await save(path.join(run.root, file), receipt);
  let packet; try { packet = JSON.parse(receipt.stdout); } catch { /* retained raw diagnostic */ }
  if (receipt.exitCode !== 0) throw new Error(`CLI failed; retained receipt ${file}: ${receipt.stderr.slice(0, 260)}`);
  if (!packet) throw new Error(`CLI returned non-JSON; inspect ${file}.`);
  return { packet, file };
}
async function observe(run, kind, id) {
  const result = await execute(run, kind === 'note' ? ['show', '--id', id] : ['board', 'show', '--board', id], undefined, { internal: true });
  const title = kind === 'note' ? result.packet.title : result.packet.board?.name;
  if (!title?.startsWith(run.manifest.prefix)) throw new Error('Run ownership title changed; inspect before continuing.');
  run.ledger = await updateLedger(run.root, current => {
    const record = current.records.find(x => x.kind === kind && x.id === id);
    if (record) { record.verifiedHash = result.packet.contentHash; record.lastVerification = result.file; }
  });
  return result;
}
async function mutation(run, args, input, key) {
  guardCommand(args, run.manifest, run.ledger);
  const creation = args[0] === 'remember' || args[0] === 'board' && args[1] === 'create';
  const intent = { nonce: randomUUID(), key, args, startedAt: now(), status: 'pending' };
  if (creation) run.ledger = await updateLedger(run.root, current => { current.intents.push(intent); });
  const result = await execute(run, args, input);
  if (creation) {
    const kind = args[0] === 'remember' ? 'note' : 'board';
    const id = kind === 'note' ? result.packet.id : result.packet.board?.id;
    if (!id) throw new Error(`Creation receipt lacks ID; inspect ${result.file}. Do not retry creation.`);
    run.ledger = await updateLedger(run.root, current => {
      const savedIntent = current.intents.find(x => x.nonce === intent.nonce);
      savedIntent.status = 'confirmed'; savedIntent.id = id;
      current.records.push({ kind, key: key ?? id, id, origin: 'cli', creationReceipt: result.file });
    });
    await observe(run, kind, id);
  }
  return result;
}
async function prepare(name, target) {
  if (!['local', 'vps'].includes(target)) throw new Error('Select --target local or vps.');
  const c = await configuration(), local = target === 'local';
  const selector = c[local ? 'JB_EVAL_LOCAL_ROOT' : 'JB_EVAL_VPS_URL'], profileId = c[local ? 'JB_EVAL_LOCAL_PROFILE' : 'JB_EVAL_VPS_PROFILE'];
  if (!selector || !profileId || local && !path.isAbsolute(selector)) throw new Error('Private target and app profile must be configured.');
  if (!local) { const u = new URL(selector); if (u.protocol !== 'https:' || u.origin !== selector || u.username || u.password) throw new Error('VPS target must be an HTTPS origin without credentials/path.'); }
  await fs.mkdir(runs, { recursive: true, mode: 0o700 });
  const root = runPath(name); await fs.mkdir(root, { mode: 0o700 });
  for (const folder of ['cli', 'ui', 'results']) await fs.mkdir(path.join(root, folder), { mode: 0o700 });
  const git = await exec('git', ['rev-parse', 'HEAD'], { cwd: repo });
  const dirty = await exec('git', ['status', '--porcelain'], { cwd: repo });
  const version = await exec(c.JB_EVAL_NODE, [c.JB_EVAL_CLI, '--version']);
  const allowMutations = Boolean(c.JB_EVAL_AUTHORIZATION) && (c.JB_EVAL_ALLOW_MUTATIONS ?? '').split(',').includes(target);
  const lane = allowMutations ? c[local ? 'JB_EVAL_LOCAL_LANE' : 'JB_EVAL_VPS_LANE'] ?? 'shared-synthetic' : 'observation';
  if (!['dedicated-synthetic', 'shared-synthetic', 'observation'].includes(lane)) throw new Error('Invalid eval lane.');
  const manifest = { schemaVersion: 1, run: name, prefix: `UX ${name} `, createdAt: now(), phase: 'pilot', target, lane, allowMutations, authorization: c.JB_EVAL_AUTHORIZATION ?? null,
    binding: { selector, profileId }, nodePath: c.JB_EVAL_NODE, cliPath: c.JB_EVAL_CLI, appPath: c.JB_EVAL_APP,
    cliVersion: version.stdout.trim(), hostedVersion: 'unknown', repository: { head: git.stdout.trim(), dirty: dirty.stdout.trim() },
    platform: { os: os.type(), release: os.release(), arch: os.arch(), node: process.version }, executor: { model: 'record before scoring', effort: 'record before scoring', tools: 'native computer use plus supported CLI' }, inputs: await inputHashes(), identities: await identities(c) };
  const ledger = { records: [], intents: [] }; await save(path.join(root, 'manifest.json'), manifest); await save(path.join(root, 'ledger.json'), ledger);
  await save(path.join(root, 'config.snapshot.json'), c);
  for (const file of Object.keys(manifest.inputs)) {
    const frozen = path.join(root, 'inputs', file); await fs.mkdir(path.dirname(frozen), { recursive: true, mode: 0o700 });
    await fs.copyFile(path.join(directory, file), frozen); await fs.chmod(frozen, 0o600);
    if (digest(await fs.readFile(frozen)) !== manifest.inputs[file]) throw new Error('Eval inputs changed while freezing preparation.');
  }
  manifest.frozenInputsDirectory = 'inputs'; manifest.inputsFrozenAt = now(); await save(path.join(root, 'manifest.json'), manifest);
  const preflight = await execute({ root, manifest, ledger, config: c }, ['status']);
  await save(path.join(root, 'preflight.json'), preflight.packet);
  console.log(JSON.stringify({ run: name, target, lane: manifest.lane, cliVersion: manifest.cliVersion, statusReceipt: preflight.file, evidenceDirectory: root }));
}
async function seed(run) {
  if (!run.manifest.allowMutations) throw new Error('Observation-only run: do not seed.');
  if (run.ledger.intents.length || run.ledger.records.length) throw new Error('Seeding is once-only. Inspect the ledger after any partial failure.');
  const fixture = await json(path.join(directory, 'fixtures/workshop.json'));
  for (const note of fixture.notes) await mutation(run, ['remember', '--type', 'note', '--title', run.manifest.prefix + note.title, '--actor', 'agent'], note.body, note.key);
  const board = await mutation(run, ['board', 'create', '--name', run.manifest.prefix + fixture.board.name, ...fixture.board.columns.flatMap(x => ['--column', x])], undefined, 'planning');
  await mutation(run, ['board', 'add', '--board', board.packet.board.id, '--page', run.ledger.records.find(x => x.key === 'brief').id, '--column', '1', '--if-match', board.packet.contentHash]);
  await observe(run, 'board', board.packet.board.id);
  console.log(JSON.stringify({ seeded: true, records: run.ledger.records.map(({ kind, key, id }) => ({ kind, key, id })), prefix: run.manifest.prefix }));
}
export async function validateResult(root, item) {
  if (!/^(J[1-5]|P[12])(?:-[a-z0-9-]+)?$/.test(item.checkpoint ?? '') || !Number.isInteger(item.attempt) || item.attempt < 1) throw new Error('Use a mission/probe checkpoint and positive attempt number.');
  if (!['pass', 'fail', 'blocked', 'unverified', 'not_run'].includes(item.outcome)) throw new Error('Invalid checkpoint outcome.');
  if (!Array.isArray(item.evidence) || !Array.isArray(item.assistance) || typeof item.observation !== 'string') throw new Error('Observation, assistance and evidence arrays are required.');
  const evidence = await Promise.all(item.evidence.map(x => evidenceFile(root, typeof x === 'string' ? x : x.file)));
  if (item.outcome === 'pass' && (!evidence.some(x => x.file.startsWith('ui/') && /\.(png|jpe?g)$/.test(x.file)) || !evidence.some(x => x.file.startsWith('cli/') && x.file.endsWith('.json')))) throw new Error('Pass needs native UI screenshot and supported CLI evidence; final-state evidence cannot prove an unseen transition.');
  for (const judgment of item.judgments ?? []) if (!['discoverability', 'feedback_clarity', 'navigation_continuity', 'writing_continuity', 'recovery_clarity'].includes(judgment.dimension) || ![0, 1, 2, 3, 'not_observed'].includes(judgment.rating) || !judgment.reason || !judgment.judgeRelationship) throw new Error('Judgments require an anchored dimension/rating, rationale and judge relationship.');
  return { ...item, recordedAt: now(), evidence };
}
async function record(run, file) {
  const item = await validateResult(run.root, await json(file));
  await fs.writeFile(path.join(run.root, 'results', `${item.checkpoint}-${item.attempt}.json`), JSON.stringify(item, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ recorded: item.checkpoint, attempt: item.attempt, outcome: item.outcome }));
}
async function producer(run) {
  if (!run.manifest.allowMutations) throw new Error('No synthetic-write authorization.');
  const draft = run.ledger.records.find(x => x.key === 'draft' && !x.deleted); if (!draft) throw new Error('Seeded draft required.');
  const session = { id: randomUUID(), startedAt: now(), status: 'running', controls: [], part: 0 };
  const file = path.join(run.root, 'producer.json');
  try { const old = await json(file); if (old.status === 'running') throw new Error('Producer already active.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await save(file, session);
  const control = path.join(run.root, 'control'); await fs.mkdir(control, { recursive: true, mode: 0o700 });
  const remote = run.manifest.target === 'vps', credential = remote ? await secrets(run.config) : {};
  const argv = [run.manifest.cliPath, 'collaborate', 'stream', '--id', draft.id, '--stream-id', session.id, remote ? '--target-url' : '--root', run.manifest.binding.selector, '--json'];
  const env = { ...process.env, ...credential, JUMPYBRAIN_CLIENT_ID: 'ux-' + run.manifest.run, JUMPYBRAIN_CLIENT_NAME: 'UX eval agent' };
  if (run.config.JB_EVAL_QMD) env.JUMPYBRAIN_QMD_BIN = run.config.JB_EVAL_QMD;
  const child = spawn(run.manifest.nodePath, argv, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => { /* exit/receipt below retains a cancelled or failed producer */ });
  let stdout = '', stderr = ''; child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
  const ended = new Promise(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)); });
  let done = false; void ended.then(() => { done = true; });
  const chunks = (await json(path.join(directory, 'fixtures/workshop.json'))).chunks;
  console.log(JSON.stringify({ producer: session.id, note: draft.id, controls: 'advance, finish, cancel', timeoutMinutes: 15 }));
  const deadline = Date.now() + 15 * 60000;
  while (!done && Date.now() < deadline) {
    for (const name of (await fs.readdir(control)).sort()) {
      const request = await json(path.join(control, name)); await fs.unlink(path.join(control, name));
      if (request.session !== session.id) continue;
      session.controls.push({ action: request.action, at: now() });
      if (request.action === 'advance') { const chunk = chunks[session.part++]; if (chunk) child.stdin.write(chunk); }
      if (request.action === 'finish') child.stdin.end();
      if (request.action === 'cancel') {
        await execute(run, ['collaborate', 'cancel', '--id', draft.id, '--stream-id', session.id]);
        session.cancelled = true; child.stdin.end();
      }
      await save(file, session);
    }
    if (!done) await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!done) { session.timedOut = true; child.kill('SIGTERM'); }
  const code = await ended;
  session.status = session.cancelled ? 'cancelled' : session.timedOut ? 'timed_out' : code === 0 ? 'finished' : 'failed'; session.finishedAt = now(); session.exitCode = code;
  const receipt = { startedAt: session.startedAt, finishedAt: session.finishedAt, argv: argv.slice(1), exitCode: code, stdout: scrub(stdout, credential.JUMPYBRAIN_API_KEY), stderr: scrub(stderr, credential.JUMPYBRAIN_API_KEY) };
  const receiptFile = `cli/producer-${session.id}.json`; await save(path.join(run.root, receiptFile), receipt); session.receipt = receiptFile;
  await save(file, session); await fs.copyFile(file, path.join(run.root, `producer-${session.id}.json`));
  await observe(run, 'note', draft.id); console.log(JSON.stringify({ producer: session.status, receipt: receiptFile }));
}
async function cleanup(run) {
  if (!run.manifest.allowMutations) throw new Error('No recorded cleanup authorization.');
  if (run.ledger.intents.some(x => x.status !== 'confirmed')) throw new Error('Unconfirmed creation intent requires reconciliation before cleanup.');
  try { if ((await json(path.join(run.root, 'producer.json'))).status === 'running') throw new Error('Finish/cancel producer first.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const record of [...run.ledger.records].sort((a, b) => (a.kind === 'board' ? 0 : 1) - (b.kind === 'board' ? 0 : 1))) {
    if (record.deleted) continue;
    const isBoard = record.kind === 'board';
    const current = await execute(run, isBoard ? ['board', 'show', '--board', record.id] : ['delete', '--id', record.id], undefined, { internal: true });
    cleanupCheck(record, current.packet.contentHash, isBoard ? null : current.packet.references);
    const result = await execute(run, isBoard ? ['board', 'delete', '--board', record.id, '--if-match', record.verifiedHash] : ['delete', '--id', record.id, '--apply', '--if-match', record.verifiedHash], undefined, { internal: true });
    if (!(isBoard ? result.packet.deleted : result.packet.removed)) throw new Error('Deletion unconfirmed; inspect receipt and do not retry automatically.');
    run.ledger = await updateLedger(run.root, current => { const saved = current.records.find(x => x.kind === record.kind && x.id === record.id); saved.deleted = true; saved.deletionReceipt = result.file; });
  }
  console.log(JSON.stringify({ cleaned: run.ledger.records.length, remaining: run.ledger.records.filter(x => !x.deleted).length }));
}
async function verify(run) {
  const problems = [];
  const frozenInputs = run.manifest.frozenInputsDirectory ? await inputHashes(path.join(run.root, run.manifest.frozenInputsDirectory)) : await inputHashes();
  if (JSON.stringify(run.manifest.inputs) !== JSON.stringify(frozenInputs)) problems.push('Frozen evaluation inputs changed or are missing.');
  const currentInputs = await inputHashes(), currentInputDifferences = Object.keys({ ...run.manifest.inputs, ...currentInputs }).filter(key => run.manifest.inputs[key] !== currentInputs[key]);
  if (JSON.stringify(run.manifest.identities) !== JSON.stringify(await identities(run.config))) problems.push('Installed artifact identity changed.');
  const coverage = {};
  for (const file of await fs.readdir(path.join(run.root, 'results'))) {
    const result = await json(path.join(run.root, 'results', file)); coverage[result.checkpoint] = result.outcome;
    for (const evidence of result.evidence) {
      try { if ((await evidenceFile(run.root, evidence.file)).sha256 !== evidence.sha256) problems.push('Changed evidence: ' + evidence.file); } catch { problems.push('Missing evidence: ' + evidence.file); }
    }
  }
  for (const checkpoint of ['J1', 'J2', 'J3', 'J4', 'J5', 'P1', 'P2']) if (!Object.keys(coverage).some(x => x === checkpoint || x.startsWith(checkpoint + '-'))) problems.push('No outcome recorded for ' + checkpoint);
  if (run.ledger.intents.some(x => x.status !== 'confirmed')) problems.push('Unconfirmed creation intent.');
  const result = { verifiedAt: now(), integrity: problems.length ? 'incomplete' : 'verified', problems, coverage, currentInputDifferences, remainingRecords: run.ledger.records.filter(x => !x.deleted).length };
  await save(path.join(run.root, 'verification.json'), result); console.log(JSON.stringify(result)); return result;
}
async function report(run) {
  const verification = await json(path.join(run.root, 'verification.json'));
  const clean = value => String(value).replaceAll(run.manifest.binding.selector, '[private target]').replaceAll(run.manifest.binding.profileId, '[private profile]').replaceAll(repo, '[checkout]').replace(/https?:\/\/[^\s)]+/g, '[private URL]').replace(/\/Users\/[^\s)]+/g, '[private path]').replaceAll('|', '\\|').replaceAll('\n', ' ');
  let text = `# Native workspace experience ${run.manifest.run}\n\nPhase: ${run.manifest.phase}. Target: ${run.manifest.target}; ${run.manifest.lane}. CLI: ${run.manifest.cliVersion}. Hosted release: ${run.manifest.hostedVersion}.\n\nExecutor: ${clean(JSON.stringify(run.manifest.executor))}. Product artifact identities and protocol/fixture hashes are retained in the private manifest.\n\nIntegrity: ${verification.integrity}. Remaining synthetic records: ${verification.remainingRecords}.\n\n| Checkpoint | Attempt | Outcome | Observation | Assistance |\n| --- | --- | --- | --- | --- |\n`;
  const judgments = [];
  for (const file of (await fs.readdir(path.join(run.root, 'results'))).sort()) {
    const item = await json(path.join(run.root, 'results', file));
    text += `| ${item.checkpoint} | ${item.attempt} | ${item.outcome} | ${clean(item.observation)} | ${clean(item.assistance.join('; ') || 'none recorded')} |\n`;
    for (const j of item.judgments ?? []) judgments.push(`${item.checkpoint}: ${j.dimension} ${j.rating} — ${clean(j.reason)} (${clean(j.judgeRelationship)}).`);
  }
  if (judgments.length) text += '\n' + judgments.join('\n\n') + '\n';
  if (verification.currentInputDifferences?.length) text += '\nCurrent checkout differs from the frozen executed inputs: ' + verification.currentInputDifferences.map(clean).join(', ') + '. Use the retained input snapshot and disclose corrections in comparisons.\n';
  text += '\nReview this draft for private content before committing. Raw evidence remains private; archive location/checksum and interpretation limits must accompany a reviewed report. Same-agent execution/judgment does not establish human usability.\n';
  await fs.writeFile(path.join(run.root, 'REPORT.md'), text, { mode: 0o600 }); console.log('Private draft report: ' + path.join(run.root, 'REPORT.md'));
}
async function main(argv) {
  const command = argv[0];
  if (!command || ['--help', 'help'].includes(command)) { console.log('Native experience eval (opt-in):\nprepare --target local|vps --run NAME\nseed|producer|advance|finish|cancel|cleanup|verify|report|archive --run NAME\ncli --run NAME [--input FILE] -- COMMAND FLAGS\nadopt --run NAME --kind note|board --id ID\nrecord --run NAME --file RESULT.json\nAll UI actions must use native computer use. Read RUN.md.'); return; }
  const name = flag(argv, '--run');
  if (command === 'prepare') return prepare(name, flag(argv, '--target'));
  const run = await loadRun(name);
  if (command === 'seed') return seed(run);
  if (command === 'cli') {
    const separator = argv.indexOf('--'); if (separator < 0) throw new Error('Use -- before the product command.');
    const args = argv.slice(separator + 1), inputFile = flag(argv.slice(0, separator), '--input');
    const input = inputFile ? await fs.readFile(inputFile, 'utf8') : undefined;
    const check = guardCommand(args, run.manifest, run.ledger);
    const result = check.write ? await mutation(run, args, input) : await execute(run, args);
    if (args[0] === 'show') await observe(run, 'note', flag(args, '--id'));
    if (args[0] === 'board' && args[1] === 'show') await observe(run, 'board', flag(args, '--board'));
    console.log(JSON.stringify(result)); return;
  }
  if (command === 'adopt') {
    if (!run.manifest.allowMutations) throw new Error('Observation-only run.');
    const kind = flag(argv, '--kind'), id = flag(argv, '--id'); if (!['note', 'board'].includes(kind) || !id) throw new Error('Use --kind note|board --id ID.');
    if (run.ledger.records.some(x => x.id === id)) throw new Error('Already in ledger.');
    const result = await observe(run, kind, id);
    run.ledger = await updateLedger(run.root, current => {
      if (current.records.some(x => x.id === id)) throw new Error('Already adopted concurrently.');
      current.records.push({ kind, id, key: 'ui-' + id, origin: 'native-ui', adoptionReceipt: result.file, verifiedHash: result.packet.contentHash, lastVerification: result.file });
    });
    console.log(JSON.stringify({ adopted: id })); return;
  }
  if (command === 'record') return record(run, flag(argv, '--file'));
  if (command === 'producer') return producer(run);
  if (['advance', 'finish', 'cancel'].includes(command)) {
    const session = await json(path.join(run.root, 'producer.json')); if (session.status !== 'running') throw new Error('No active producer.');
    await save(path.join(run.root, 'control', now().replaceAll(/[:.]/g, '-') + '-' + randomUUID() + '.json'), { session: session.id, action: command }); console.log(JSON.stringify({ queued: command })); return;
  }
  if (command === 'cleanup') return cleanup(run);
  if (command === 'verify') return verify(run);
  if (command === 'report') return report(run);
  if (command === 'archive') {
    const archive = path.join(runs, name + '.tar.gz');
    const handle = await fs.open(archive, 'wx', 0o600); await handle.close();
    await exec('tar', ['-czf', archive, '-C', runs, name], { maxBuffer: 1024 * 1024 });
    const sha256 = digest(await fs.readFile(archive)); await fs.writeFile(archive + '.sha256', sha256 + '\n', { mode: 0o600 }); console.log(JSON.stringify({ archive, sha256 })); return;
  }
  throw new Error('Unknown command; use --help.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
