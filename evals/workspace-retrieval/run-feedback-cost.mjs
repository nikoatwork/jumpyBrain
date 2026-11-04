#!/usr/bin/env node
// Optional, separately gated operating-cost follow-up. Never reads gold or quality packets.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const self = fileURLToPath(import.meta.url), here = path.dirname(self), repo = path.resolve(here, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const writeNew = (file, value) => writeFile(file, typeof value === 'string' ? value : json(value), { flag: 'wx' });
export const REPRESENTATIVE_FREEZE = Object.freeze({
  frozenAt: '2026-11-03T21:40:57.635Z',
  selection: 'Public queries only; codepoint-sort IDs, take first three affected cases with distinct scenarios, then first old protected+constrained, old navigation, and old temporal controls, excluding affected/duplicates. No score, quality packet, rubric or model output selected these IDs.',
  eligibility: [
    ['ashcombe-lowercase-hyphen', 'c35c23b1fd627cf8368ef4f3d713a0e4137a09b8ebfb085eb93d037d4e5cbb18', 'affected'],
    ['bellwether-natural-hyphen', 'bb1e50085741952e154cdc810ac8bed90912ebf3a152c73a5f7d98e8fa7deb1c', 'affected'],
    ['cedar-discovery', 'ae5d9e5926c56d3e86c0e34eac6ed1d12fcfa7cec4eeab698b08b34d53dd039c', 'affected'],
    ['bellwether-explicit-exclusion', 'ec9f4fe7367d55ffd0cd7c4980b2e07b4b150dc981cb438cd12d1ec4bbb9b705', 'control'],
    ['cedar-navigation', 'fd6ea9387aa7e6078b429f2360c145ef18f92987cb77f6d7f3a9d4b51e3c5925', 'control'],
    ['cedar-historical', '67f34f6a88b4dd330cc69bb2a7808af09d97b8d74f118726fb7f1678b8540937', 'control'],
  ],
  'vector-only': [
    ['ashcombe-contraction', '0906de28d8dfcf25b685b882acbeef3fef1f4b6cefe7e9f1c2093350d2f18cee', 'affected'],
    ['belltower-current', 'cc6b1c951485b121aafc3f1a3608775e67e10b6631a410973900be02829d67d1', 'affected'],
    ['bellwether-late-authority', 'bfa91aad1cd625067e7ad56dbf9e3af457e6e38fe57c634c9d948ae314eb17cb', 'affected'],
    ['bellwether-explicit-exclusion', 'ec9f4fe7367d55ffd0cd7c4980b2e07b4b150dc981cb438cd12d1ec4bbb9b705', 'control'],
    ['cedar-navigation', 'fd6ea9387aa7e6078b429f2360c145ef18f92987cb77f6d7f3a9d4b51e3c5925', 'control'],
    ['cedar-historical', '67f34f6a88b4dd330cc69bb2a7808af09d97b8d74f118726fb7f1678b8540937', 'control'],
  ],
});
function safeRelative(value) {
  assert.ok(typeof value === 'string' && value.length && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'), `Unsafe frozen relative path: ${value}`); return value;
}
async function hashFile(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
async function describe(file, base) {
  const info = await lstat(file); assert.ok(info.isFile() && !info.isSymbolicLink(), `Expected regular file: ${file}`);
  return { path: path.relative(base, file).split(path.sep).join('/'), bytes: info.size, sha256: await hashFile(file) };
}
async function tree(root, prefix = '', skipDependencies = false) {
  const files = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (skipDependencies && entry.name === 'node_modules') continue;
    const relative = path.posix.join(prefix, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Provisioned artifact symlink requires explicit inspection: ${path.join(root, relative)}`);
    if (entry.isDirectory()) files.push(...await tree(root, relative, skipDependencies));
    else files.push(await describe(path.join(root, relative), root));
  }
  return files;
}
async function verifyFiles(root, files) {
  for (const entry of files) {
    const actual = await describe(path.join(root, safeRelative(entry.path)), root);
    assert.equal(actual.bytes, entry.bytes, `Frozen size changed: ${path.join(root, entry.path)}`);
    assert.equal(actual.sha256, entry.sha256, `Frozen bytes changed: ${path.join(root, entry.path)}`);
  }
}
function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}
export function costSchedule() {
  const calls = [];
  for (let queryIndex = 0; queryIndex < 6; queryIndex++) for (const arm of queryIndex % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) calls.push({ phase: 'warmup', queryIndex, arm });
  for (let pair = 0; pair < 20; pair++) for (const arm of pair % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) calls.push({ phase: 'measured', pair, queryIndex: pair % 6, arm });
  return calls;
}
export function summarizeCosts(rows) {
  const measured = rows.filter(row => row.phase === 'measured');
  const baseline = measured.filter(row => row.arm === 'baseline'), candidate = measured.filter(row => row.arm === 'candidate');
  const paired = Array.from({ length: 20 }, (_, pair) => ({ pair, baseline: baseline.find(row => row.pair === pair), candidate: candidate.find(row => row.pair === pair) }));
  const warmup = rows.filter(row => row.phase === 'warmup');
  const completeWarmup = warmup.length === 12 && ['baseline', 'candidate'].every(arm => Array.from({ length: 6 }, (_, index) => index).every(index => warmup.filter(row => row.arm === arm && row.queryIndex === index).length === 1));
  const complete = rows.length === 52 && completeWarmup && baseline.length === 20 && candidate.length === 20 && paired.every(pair => pair.baseline && pair.candidate && pair.baseline.queryIndex === pair.pair % 6 && pair.candidate.queryIndex === pair.pair % 6)
    && rows.every(row => row.ok && Number.isFinite(row.operationMs) && row.operationMs > 0 && Number.isFinite(row.peakTreeKiB) && row.peakTreeKiB > 0 && row.rssSampleCount >= 2 && !row.rssSamplingFailed);
  const baseP95 = percentile(baseline.filter(row => row.ok).map(row => row.operationMs), .95), candidateP95 = percentile(candidate.filter(row => row.ok).map(row => row.operationMs), .95);
  const maxBase = baseline.length ? Math.max(...baseline.map(row => row.peakTreeKiB ?? 0)) : null, maxCandidate = candidate.length ? Math.max(...candidate.map(row => row.peakTreeKiB ?? 0)) : null;
  const pairedIncreases = paired.filter(pair => pair.baseline && pair.candidate).map(pair => (pair.candidate.peakTreeKiB - pair.baseline.peakTreeKiB) / 1024);
  const maxPairedIncreaseMiB = pairedIncreases.length ? Math.max(...pairedIncreases) : null;
  const gates = { completeSuccessfulWarmupAndTwentyPairs: complete,
    p95LatencyIncreaseAtMostTenPercent: complete && baseP95 > 0 && candidateP95 <= baseP95 * 1.10,
    maximumPairedSampledCpuTreeIncreaseAtMostFiftyMiB: complete && maxPairedIncreaseMiB <= 50,
    peakOfPeaksSampledCpuTreeIncreaseAtMostFiftyMiB: complete && (maxCandidate - maxBase) / 1024 <= 50 };
  return { measuredPairs: 20, measuredCalls: measured.length, baselineCalls: baseline.length, candidateCalls: candidate.length,
    baselineP95Ms: baseP95, candidateP95Ms: candidateP95, p95LatencyIncreaseFraction: baseP95 > 0 ? candidateP95 / baseP95 - 1 : null,
    baselineMaxSampledTreeMiB: maxBase === null ? null : maxBase / 1024, candidateMaxSampledTreeMiB: maxCandidate === null ? null : maxCandidate / 1024,
    peakOfPeaksIncreaseMiB: maxBase === null || maxCandidate === null ? null : (maxCandidate - maxBase) / 1024, maximumPairedIncreaseMiB: maxPairedIncreaseMiB,
    gates, operatingGatesPass: Object.values(gates).every(Boolean) };
}
function requireReadiness(readiness) {
  assert.ok(readiness?.freshness === 'fresh' && readiness.embedding === 'complete' && readiness.modes?.includes('semantic'), 'Fresh complete semantic readiness is required; no repair/index is allowed');
}
function failedWarnings(warnings = []) { return warnings.filter(warning => /failed|fallback|index_not_fresh|semantic_coverage_incomplete|source_changed/.test(warning)); }

// One persistent runtime worker per arm; QMD itself still launches its normal query children.
async function workerMain(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const summaryBytes = await readFile(path.join(config.qualityRunRoot, 'SUMMARY.json'));
  const freezeBytes = await readFile(path.join(config.qualityRunRoot, 'FREEZE.json'));
  assert.equal(sha(summaryBytes), config.qualitySummarySha256, 'Worker quality eligibility report changed');
  assert.equal(sha(freezeBytes), config.qualityFreezeSha256, 'Worker quality freeze changed');
  const summary = JSON.parse(summaryBytes), quality = JSON.parse(freezeBytes);
  assert.equal(summary.freezeSha256, config.qualityFreezeSha256);
  assert.equal(summary.comparisons?.[config.selectedArm]?.eligibleForSeparateQuietCostChecks, true, 'Worker is not eligible for operating checks');
  const guard = quality.generated.find(file => file.path === 'offline-guard.mjs'); assert.ok(guard, 'Worker requires the original offline guard');
  await verifyFiles(config.qualityRunRoot, [guard]);
  assert.equal(process.env.NODE_OPTIONS, `--import=${pathToFileURL(path.join(config.qualityRunRoot, guard.path)).href}`, 'Worker requires the frozen no-download/no-native-build preload');
  const runtime = await import(pathToFileURL(path.join(config.runtime, 'dist/runtime/index.js')));
  const initialStatus = await runtime.memoryRootStatus(config.root); requireReadiness(initialStatus.readiness);
  let active, closing = false, graceful = false;
  const send = message => { if (process.connected) process.send(message); };
  const abort = () => active?.abort();
  process.on('SIGTERM', () => { closing = true; abort(); if (!active) process.exit(1); });
  process.on('disconnect', () => { closing = true; abort(); if (!active) process.exit(graceful ? 0 : 1); });
  process.on('message', async message => {
    if (message.action === 'abort') { abort(); return; }
    if (message.action === 'shutdown') { if (active) { abort(); return; } graceful = true; process.send({ id: message.id, result: { closed: true } }, () => process.disconnect()); return; }
    if (active) { send({ id: message.id, error: { name: 'WorkerBusy', message: 'Concurrent cost requests are forbidden.' } }); return; }
    if (message.action === 'status') {
      try { const result = await runtime.memoryRootStatus(config.root); requireReadiness(result.readiness); send({ id: message.id, result }); }
      catch (error) { send({ id: message.id, error: { name: error.name, code: error.code, message: error.message } }); }
      return;
    }
    if (message.action !== 'recall') { send({ id: message.id, error: { name: 'InvalidCommand', message: 'Unknown worker command.' } }); return; }
    active = new AbortController();
    const start = performance.now();
    let operationMs;
    try {
      const query = message.query;
      const options = { depth: query.depth, ...(query.temporal ? { temporal: query.temporal } : {}), refresh: false, maxBytes: 8192 };
      const packet = await runtime.compactSearchMemory(config.root, query.query, 5, { ...options, signal: active.signal });
      operationMs = performance.now() - start;
      requireReadiness(packet.readiness);
      const failures = failedWarnings(packet.retrieval?.warnings);
      assert.equal(failures.length, 0, `Failed/degraded branch: ${failures.join(', ')}`);
      const wire = runtime.serializeCompactRecall(packet); assert.ok(Buffer.byteLength(wire) <= 8192, 'Compact byte bound exceeded');
      send({ id: message.id, result: { ok: true, operationMs, wire, readiness: packet.readiness, retrieval: packet.retrieval,
        request: { operation: 'recall', query: query.query, limit: 5, ...options }, pid: process.pid } });
    } catch (error) { send({ id: message.id, result: { ok: false, operationMs: operationMs ?? performance.now() - start, error: { name: error.name, code: error.code, message: error.message }, pid: process.pid } }); }
    finally { active = undefined; if (closing) process.exit(1); }
  });
  send({ ready: true, pid: process.pid, status: initialStatus });
}
function processSample(rootPid, started) {
  const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
  if (ps.status !== 0) return { elapsedMs: performance.now() - started, error: ps.error?.message ?? `ps exit ${ps.status}` };
  const all = ps.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
  const pids = new Set([rootPid]); let changed = true;
  while (changed) { changed = false; for (const [pid, parent] of all) if (pids.has(parent) && !pids.has(pid)) { pids.add(pid); changed = true; } }
  const processes = all.filter(([pid]) => pids.has(pid)).map(([pid, ppid, rssKiB]) => ({ pid, ppid, rssKiB }));
  return { elapsedMs: performance.now() - started, processes, treeKiB: processes.reduce((n, row) => n + row.rssKiB, 0) };
}
function startWorker(config, logfile, env) {
  const log = createWriteStream(logfile, { flags: 'wx' });
  const child = spawn(process.execPath, [self, '--worker-config', config], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  const pending = new Map(); let serial = 0, readyResolve, readyReject;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const readyTimer = setTimeout(() => { readyReject(new Error('Runtime worker readiness timed out')); child.kill('SIGTERM'); }, 30_000);
  child.on('message', message => {
    if (message.ready) { clearTimeout(readyTimer); readyResolve(message); return; }
    if (message.fatal) { clearTimeout(readyTimer); readyReject(new Error(message.fatal)); return; }
    const item = pending.get(message.id); if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    if (message.error) item.reject(Object.assign(new Error(message.error.message), message.error)); else item.resolve(message.result);
  });
  const failed = error => { clearTimeout(readyTimer); readyReject(error); for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); } pending.clear(); };
  child.once('error', failed);
  child.once('close', (code, signal) => { failed(new Error(`Worker closed (${code}, ${signal})`)); log.end(); });
  return { child, ready, rpc(action, extra = {}) {
    return new Promise((resolve, reject) => {
      if (!child.connected) { reject(new Error('Worker IPC is unavailable')); return; }
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); if (child.connected) child.send({ action: 'abort' }, () => {}); reject(new Error('Worker response timed out after 90 seconds')); }, 90_000);
      pending.set(id, { resolve, reject, timer });
      child.send({ id, action, ...extra }, error => { if (error && pending.has(id)) { clearTimeout(timer); pending.delete(id); reject(error); } });
    });
  }, async close() {
    if (child.connected) await this.rpc('shutdown').catch(() => child.kill('SIGTERM'));
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(); }, 2000); child.once('close', () => { clearTimeout(timer); resolve(); }); });
    }
  } };
}
async function packageRoot(name, fromRoot, optional = false) {
  try {
    let directory = path.dirname(createRequire(path.join(fromRoot, 'package.json')).resolve(name));
    while (true) {
      try { if (JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).name === name) return await realpath(directory); } catch {}
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
  } catch {}
  let ancestor = fromRoot;
  while (true) {
    const directory = path.join(ancestor, 'node_modules', name);
    try { if (JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).name === name) return await realpath(directory); } catch {}
    const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
  }
  if (optional) return null;
  throw new Error(`Provisioned dependency missing: ${name}`);
}
async function nativeIdentity(qmdRoot) {
  const packages = [], seen = new Set(), queue = ['node-llama-cpp', 'better-sqlite3', 'sqlite-vec'];
  const qmd = JSON.parse(await readFile(path.join(qmdRoot, 'package.json'), 'utf8'));
  const optionalNames = Object.keys(qmd.optionalDependencies ?? {});
  for (const name of [...queue, ...optionalNames]) {
    if (seen.has(name)) continue; seen.add(name);
    const root = await packageRoot(name, qmdRoot, !queue.includes(name)); if (!root) continue;
    const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const files = await tree(root, '', true); packages.push({ name, version: metadata.version, root, files, digest: sha(JSON.stringify(files)) });
    if (name === 'node-llama-cpp') for (const dependency of Object.keys(metadata.optionalDependencies ?? {})) if (!seen.has(dependency)) {
      const optionalRoot = await packageRoot(dependency, root, true); seen.add(dependency); if (!optionalRoot) continue;
      const pkg = JSON.parse(await readFile(path.join(optionalRoot, 'package.json'), 'utf8')), artifacts = await tree(optionalRoot, '', true);
      packages.push({ name: dependency, version: pkg.version, root: optionalRoot, files: artifacts, digest: sha(JSON.stringify(artifacts)) });
    }
  }
  return packages;
}
async function rootIdentity(config, fixtureFiles, listMarkdownFiles, modelHash) {
  const root = config.root, canonical = [];
  for (const file of await listMarkdownFiles(root)) canonical.push(await describe(file, root));
  canonical.sort((a, b) => a.path < b.path ? -1 : 1);
  assert.deepEqual(canonical, fixtureFiles, `Canonical bytes/membership differ from the original fixture: ${root}`);
  const indexFile = path.join(root, '.jumpybrain/index.json'), manifest = JSON.parse(await readFile(indexFile, 'utf8'));
  assert.equal(manifest.root, root, 'Existing index belongs to another root');
  assert.ok(manifest.sourceRoot === undefined || manifest.sourceRoot === root, 'Operating sample requires the original canonical root, not an alternate indexRoot');
  assert.equal(manifest.policy?.mode, 'semantic', 'Existing index is not semantic');
  assert.equal(manifest.policy?.model, config.model, 'Existing index model path differs from the original provisioned model');
  assert.equal(manifest.embedding?.state, 'complete', 'Existing embeddings are incomplete');
  assert.equal(manifest.embedding?.modelHash, modelHash, 'Existing index model hash changed');
  assert.ok(manifest.generation && manifest.sources, 'Existing committed index generation/source signatures are required');
  assert.deepEqual(manifest.sources.map(source => source.file).sort(), fixtureFiles.map(file => file.path).sort(), 'Indexed canonical membership changed');
  const stable = [await describe(indexFile, root), await describe(path.join(root, 'jumpybrain.json'), root)];
  stable.push(...await tree(path.join(root, '.jumpybrain/qmd-config')).then(files => files.map(file => ({ ...file, path: `.jumpybrain/qmd-config/${file.path}` }))));
  const database = [];
  for (const suffix of ['', '-wal', '-shm']) {
    const file = path.join(root, `.jumpybrain/qmd-cache/qmd/index.sqlite${suffix}`);
    try { database.push(await describe(file, root)); } catch (error) { if (suffix === '' || error.code !== 'ENOENT') throw error; }
  }
  return { root, generation: manifest.generation, generatedAt: manifest.generatedAt, canonicalDigest: sha(JSON.stringify(canonical)), stable, database,
    originalIndexOutput: await describe(config.indexOutput, path.dirname(config.indexOutput)) };
}

let activeOutput;
async function main() {
  const { values } = parseArgs({ options: { help: { type: 'boolean' }, 'run-root': { type: 'string' }, arm: { type: 'string' }, output: { type: 'string' },
    'quiet-confirmed': { type: 'boolean', default: false }, 'worker-config': { type: 'string' } } });
  if (values.help) {
    console.log('Usage: node evals/workspace-retrieval/run-feedback-cost.mjs --run-root <quality run> --arm eligibility|vector-only --output <NEW ignored directory> --quiet-confirmed\nRequires original SUMMARY eligibility and explicit parent confirmation of no concurrent heavy owned work. Uses existing indexes; never builds, repairs or downloads.'); return;
  }
  if (values['worker-config']) { await workerMain(values['worker-config']); return; }
  assert.ok(values['run-root'] && values.output && ['eligibility', 'vector-only'].includes(values.arm), 'Required --run-root, --arm eligibility|vector-only and --output');
  const output = path.resolve(values.output), runRoot = await realpath(values['run-root']);
  assert.ok([path.join(repo, '.local-pack'), path.join(here, '.runs')].some(root => output.startsWith(root + path.sep)), 'Output must be a new ignored directory under .local-pack/ or evals/workspace-retrieval/.runs/');
  await mkdir(path.dirname(output), { recursive: true }); await mkdir(output, { recursive: false }); activeOutput = output;
  const freezeBytes = await readFile(path.join(runRoot, 'FREEZE.json')), quality = JSON.parse(freezeBytes);
  const summaryBytes = await readFile(path.join(runRoot, 'SUMMARY.json')), summary = JSON.parse(summaryBytes);
  assert.equal(summary.freezeSha256, sha(freezeBytes), 'Original quality SUMMARY does not match its freeze');
  assert.equal(summary.comparisons?.[values.arm]?.eligibleForSeparateQuietCostChecks, true, 'Original quality SUMMARY does not permit separate quiet cost checks for this arm');
  assert.equal(values['quiet-confirmed'], true, 'Parent must confirm no concurrent heavy owned work with --quiet-confirmed; the script cannot infer quietness');
  const generated = new Map(quality.generated.map(file => [file.path, file]));
  const queryEntry = generated.get('fixture/queries.json'); assert.ok(queryEntry, 'Missing original public-query freeze'); await verifyFiles(runRoot, [queryEntry]);
  const publicQueries = JSON.parse(await readFile(path.join(runRoot, queryEntry.path), 'utf8')), byId = new Map(publicQueries.map(query => [query.id, query]));
  assert.equal(byId.size, publicQueries.length, 'Duplicate public query IDs');
  const selected = REPRESENTATIVE_FREEZE[values.arm].map(([id, querySha256, role]) => {
    const query = byId.get(id); assert.ok(query, `Frozen representative missing: ${id}`); assert.equal(sha(JSON.stringify(query)), querySha256, `Frozen representative changed: ${id}`);
    assert.equal(quality.slices[values.arm].includes(id), role === 'affected', `Representative affected/control membership changed: ${id}`);
    return { id, querySha256, role, query };
  });
  const fixtureEntries = quality.generated.filter(file => file.path.startsWith('fixture/corpus/')); await verifyFiles(runRoot, fixtureEntries);
  const fixtureFiles = fixtureEntries.map(file => ({ ...file, path: file.path.slice('fixture/corpus/'.length) })).sort((a, b) => a.path < b.path ? -1 : 1);
  const configs = {}, configEntries = [];
  for (const [label, arm] of [['baseline', 'baseline'], ['candidate', values.arm]]) {
    const name = arm === 'baseline' ? 'semantic-baseline-1' : `semantic-${arm}-1`, relative = `${name}/execute-config.json`;
    assert.ok(quality.plannedRuns.some(run => run.name === name && run.arm === arm && run.mode === 'semantic'), 'Required completed semantic run is not frozen');
    const entry = generated.get(relative); assert.ok(entry, `Missing original execute config: ${relative}`); configEntries.push(entry); await verifyFiles(runRoot, [entry]);
    const config = JSON.parse(await readFile(path.join(runRoot, relative), 'utf8'));
    assert.equal(config.arm, 'baseline'); assert.equal(config.mode, 'semantic'); assert.equal(config.model, quality.model.path);
    assert.equal(path.resolve(config.repo), path.resolve(quality.runtimes[arm].root));
    assert.equal(path.resolve(config.root), path.join(runRoot, name, 'memory')); assert.equal(path.resolve(config.corpus), path.join(runRoot, 'fixture/corpus'));
    assert.equal(path.resolve(config.queries), path.join(runRoot, 'fixture/queries.json'));
    const execution = JSON.parse(await readFile(path.join(runRoot, name, 'execution.json'), 'utf8')); assert.equal(execution.code, 0, 'Original semantic run did not finish successfully');
    configs[label] = { ...config, runtimeArm: arm, runName: name };
  }
  const guardEntry = generated.get('offline-guard.mjs'); assert.ok(guardEntry, 'Original provisioned-model/no-build preload is missing'); await verifyFiles(runRoot, [guardEntry]);
  const immutable = async () => {
    assert.equal(await hashFile(path.join(runRoot, 'FREEZE.json')), sha(freezeBytes), 'Original quality freeze changed');
    assert.equal(await hashFile(path.join(runRoot, 'SUMMARY.json')), sha(summaryBytes), 'Original quality eligibility report changed');
    await verifyFiles(runRoot, [queryEntry, guardEntry, ...fixtureEntries, ...configEntries]);
    for (const arm of ['baseline', values.arm]) await verifyFiles(quality.runtimes[arm].root, quality.runtimes[arm].files);
    await verifyFiles(quality.qmd.root, quality.qmd.files);
    assert.equal((await stat(quality.model.path)).size, quality.model.bytes, 'Provisioned model size changed');
    assert.equal(await hashFile(quality.model.path), quality.model.sha256, 'Provisioned model hash changed');
  };
  await immutable();
  const native = await nativeIdentity(quality.qmd.root);
  const { listMarkdownFiles } = await import(pathToFileURL(path.join(configs.baseline.repo, 'dist/core/canonical/markdown-store.js')));
  const before = {};
  for (const [label, config] of Object.entries(configs)) before[label] = await rootIdentity(config, fixtureFiles, listMarkdownFiles, quality.model.sha256);
  const nodeBinary = { path: process.execPath, bytes: (await stat(process.execPath)).size, sha256: await hashFile(process.execPath) };
  const workerConfigs = {};
  for (const [label, config] of Object.entries(configs)) {
    workerConfigs[label] = path.join(output, `${label}-worker.json`); await writeNew(workerConfigs[label], { runtime: config.repo, root: config.root, qualityRunRoot: runRoot, selectedArm: values.arm, qualitySummarySha256: sha(summaryBytes), qualityFreezeSha256: sha(freezeBytes) });
  }
  const schedule = costSchedule();
  const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), qualityRunRoot: runRoot, selectedArm: values.arm, qualityFreezeSha256: sha(freezeBytes), qualitySummarySha256: sha(summaryBytes),
    originalQualityGate: true, quietness: { parentConfirmedNoConcurrentHeavyOwnedWork: true, confirmedBy: '--quiet-confirmed invocation; not automatically measured or independently proven' },
    representatives: { frozenAt: REPRESENTATIVE_FREEZE.frozenAt, selection: REPRESENTATIVE_FREEZE.selection, cases: selected }, schedule,
    scriptSha256: await hashFile(self), node: { version: process.version, ...nodeBinary }, originalRuntimeDigests: { baseline: quality.runtimes.baseline.digest, candidate: quality.runtimes[values.arm].digest },
    qmd: quality.qmd, model: quality.model, nativePackages: native, indexesBefore: before,
    workerConfigs: await Promise.all(Object.values(workerConfigs).map(file => describe(file, output))), guard: guardEntry,
    hardware: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    observation: { rssIntervalMs: 100, root: 'active persistent runtime worker plus its current CPU descendants; excludes harness, idle other worker, ps and GPU allocations',
      latency: 'worker monotonic duration of compactSearchMemory; excludes import, bootstrap/status, IPC and serialization',
      cache: 'Existing quality indexes reused; no OS cache flush. Each worker warms all six once. QMD subprocess/model residency is not persistent or proven warm.',
      nativeBuilds: 'Original frozen offline guard inherited via NODE_OPTIONS; existing absolute provisioned model only, ensureLlama(false).',
      derivedState: 'Canonical/config/generation bytes must stay unchanged; ordinary nonrepairing QMD query caches/SQLite/WAL bytes may change and are recorded.' },
    operatingThresholds: { p95LatencyIncreaseFraction: 0.10, maximumPairedSampledCpuRssIncreaseMiB: 50, maximumPeakOfPeaksCpuRssIncreaseMiB: 50 },
    environment: { QMD_SOURCE_MODE: '0', GGML_METAL_NO_RESIDENCY: '1', searchTimeoutMsOverride: process.env.JUMPYBRAIN_SEARCH_TIMEOUT_MS ?? null },
    limits: ['Twenty pairs across six predeclared queries is a small local operating sample, not a throughput or Linux/VPS concurrency test.',
      '100 ms CPU RSS sampling can miss short-lived or orphaned descendants and peaks; GPU/device allocations and the harness/idle worker are excluded.',
      'No cold-start, fully resident-model, OS-cache-control or automatically established quietness claim.',
      'Native artifacts are additionally frozen for this cost run; the original quality freeze did not hash every transitive native artifact.',
      'This phase never reads gold or original quality packets and does not replace parent source adjudication or production lifecycle/transport checks.'] };
  await writeNew(path.join(output, 'FREEZE.json'), manifest);
  console.log(`Cost freeze ready: ${values.arm}; ${selected.map(row => row.id).join(', ')}. Parent-confirmed quiet window.`);
  const env = { ...process.env, JUMPYBRAIN_QMD_BIN: quality.qmd.binary, QMD_EMBED_MODEL: '', JUMPYBRAIN_QMD_EMBED: '', QMD_SOURCE_MODE: '0', GGML_METAL_NO_RESIDENCY: '1',
    NODE_OPTIONS: `--import=${pathToFileURL(path.join(runRoot, guardEntry.path)).href}` };
  const workers = {}, rows = [], statuses = { before: {}, after: {} };
  let runFailure;
  try {
    for (const label of ['baseline', 'candidate']) { workers[label] = startWorker(workerConfigs[label], path.join(output, `${label}-worker.log`), env); statuses.before[label] = await workers[label].ready; }
    for (const [index, call] of schedule.entries()) {
      const worker = workers[call.arm], query = selected[call.queryIndex], started = performance.now(), samples = [];
      const sample = () => samples.push(processSample(worker.child.pid, started)); sample();
      const sampler = setInterval(sample, 100);
      let result;
      try { result = await worker.rpc('recall', { query: query.query }); }
      catch (error) { result = { ok: false, operationMs: null, error: { name: error.name, message: error.message } }; }
      finally { clearInterval(sampler); sample(); }
      const failedSampling = samples.some(row => row.error || !row.processes?.some(process => process.pid === worker.child.pid));
      const row = { ordinal: index, ...call, queryId: query.id, role: query.role, workerPid: worker.child.pid, ok: result.ok === true, operationMs: result.operationMs,
        peakTreeKiB: samples.filter(row => Number.isFinite(row.treeKiB)).reduce((peak, row) => Math.max(peak, row.treeKiB), 0), rssSampleCount: samples.length, rssSamplingFailed: failedSampling,
        responseBytes: result.wire ? Buffer.byteLength(result.wire) : null, responseSha256: result.wire ? sha(result.wire) : null, readiness: result.readiness, retrieval: result.retrieval, error: result.error,
        artifact: `call-${String(index).padStart(2, '0')}.json` };
      await writeNew(path.join(output, row.artifact), { ...row, request: result.request, wire: result.wire, samples }); rows.push(row);
    }
    for (const label of ['baseline', 'candidate']) statuses.after[label] = await workers[label].rpc('status');
  } catch (error) { runFailure = { name: error.name, message: error.message }; }
  finally { for (const worker of Object.values(workers)) await worker.close().catch(() => {}); }
  for (const [index, call] of schedule.entries()) if (index >= rows.length) {
    const row = { ordinal: index, ...call, queryId: selected[call.queryIndex].id, role: selected[call.queryIndex].role, ok: false,
      operationMs: null, peakTreeKiB: null, rssSampleCount: 0, rssSamplingFailed: true,
      error: { name: 'NotExecuted', message: runFailure?.message ?? 'Planned call did not execute' }, artifact: `call-${String(index).padStart(2, '0')}.json` };
    await writeNew(path.join(output, row.artifact), row); rows.push(row);
  }
  const after = {}, verificationFailures = [];
  try {
    await immutable();
    for (const pkg of native) await verifyFiles(pkg.root, pkg.files);
    assert.equal(await hashFile(process.execPath), nodeBinary.sha256, 'Node executable changed');
    assert.equal(await hashFile(self), manifest.scriptSha256, 'Cost script changed');
    for (const [label, config] of Object.entries(configs)) {
      after[label] = await rootIdentity(config, fixtureFiles, listMarkdownFiles, quality.model.sha256);
      assert.equal(after[label].generation, before[label].generation, 'Index generation changed; no reindex is allowed');
      assert.deepEqual(after[label].stable, before[label].stable, 'Root indexing/config/QMD config bytes changed');
      assert.deepEqual(after[label].originalIndexOutput, before[label].originalIndexOutput, 'Original quality index-output artifact changed');
      requireReadiness(statuses.after[label]?.readiness);
    }
  } catch (error) { verificationFailures.push({ name: error.name, message: error.message }); }
  const costs = summarizeCosts(rows);
  const report = { schemaVersion: 1, freezeSha256: await hashFile(path.join(output, 'FREEZE.json')), selectedArm: values.arm, runFailure, verificationFailures,
    status: !runFailure && verificationFailures.length === 0 && costs.operatingGatesPass ? 'passed' : 'failed', costs, rows, readiness: statuses, indexesBefore: before, indexesAfter: after,
    quietness: manifest.quietness, limits: manifest.limits, interpretation: 'Operating-cost evidence only. No production adoption, installation, release or independently judged answer-quality claim.' };
  await writeNew(path.join(output, 'REPORT.json'), report);
  await writeNew(path.join(output, 'REPORT.md'), ['# Feedback semantic operating cost', '', `Arm: ${values.arm}; status: **${report.status}**. Original quality eligibility gate was true.`, '',
    `Six cases frozen at ${REPRESENTATIVE_FREEZE.frozenAt}: ${selected.map(row => row.id).join(', ')}.`, '',
    `Measured calls: ${costs.measuredCalls}; baseline p95 ${costs.baselineP95Ms} ms; candidate p95 ${costs.candidateP95Ms} ms.`,
    `Maximum paired sampled CPU tree RSS increase: ${costs.maximumPairedIncreaseMiB} MiB; peak-of-peaks increase: ${costs.peakOfPeaksIncreaseMiB} MiB.`, '',
    `All operating thresholds pass: ${costs.operatingGatesPass}; post-run identity/readiness failures: ${verificationFailures.length}; harness failure: ${runFailure?.message ?? 'none'}.`, '',
    'Quietness is the parent’s explicit confirmation, not an automatic finding. Warmups, every measured call, all errors and RSS samples remain in call artifacts. No GPU or cold-start claim. This report does not authorize production adoption.', '',
    ...manifest.limits.map(limit => `- ${limit}`), ''].join('\n'));
  console.log(`Operating report: ${report.status}; ${path.join(output, 'REPORT.json')}`);
  if (report.status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === self) main().catch(async error => {
  if (process.send) { process.send({ fatal: error.message }); process.exitCode = 1; return; }
  console.error(`Feedback cost harness blocked: ${error.message}`);
  if (activeOutput) await writeNew(path.join(activeOutput, 'BLOCKED.json'), { status: 'blocked', error: error.message, createdAt: new Date().toISOString() }).catch(() => {});
  process.exitCode = 1;
});
