// One sequential, frozen, model-active comparison; no GUI/personal roots/downloads.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, cp, readFile, writeFile, open, realpath } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { createCorpus, fingerprintTree, hashFile } from './desktop-ram-fixtures.mjs';
const repo = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({ options: { output: { type: 'string' }, model: { type: 'string' }, 'stop-at': { type: 'string' }, resume: { type: 'boolean' } } });
assert.equal(process.platform, 'darwin'); assert.ok(values.output && values.model && values['stop-at']);
const stopAt = Date.parse(values['stop-at']), output = path.resolve(values.output);
assert.ok(Number.isFinite(stopAt) && stopAt > Date.now() + 45 * 60000, 'Reserve both finite runs and cleanup inside the shared budget.');
if (!values.resume) await mkdir(output); // Never overwrite another experiment.
const runtime = path.join(output, 'runtime'), driver = path.join(output, 'driver.mjs'), sampler = path.join(output, 'sample-tree');
let identity, snapshot;
const model = await realpath(values.model), modelHash = (await hashFile(model)).sha256;
if (values.resume) {
  identity = JSON.parse(await readFile(path.join(output, 'identity.json'), 'utf8'));
  assert.equal(identity.experimentStopAt, new Date(stopAt).toISOString()); assert.equal(identity.modelHash, modelHash);
  snapshot = await fingerprintTree(runtime); assert.equal(snapshot.sha256, identity.runtime.sha256);
  assert.equal((await hashFile(driver)).sha256, identity.driver.sha256); assert.equal((await hashFile(sampler)).sha256, identity.sampler.sha256);
  assert.equal(JSON.parse(await readFile(path.join(output, 'automatic/result.json'), 'utf8')).ok, true);
  try { await access(path.join(output, 'two')); throw new Error('Candidate already exists; refusing to repeat the comparison.'); } catch(error) { if(error.code !== 'ENOENT') throw error; }
} else {
  await mkdir(runtime);
  for (const name of ['dist','src','package.json']) await cp(path.join(repo, name), path.join(runtime, name), { recursive: true });
  await cp(new URL('./fixtures/ram-index-only.mjs', import.meta.url), driver);
  execFileSync('clang', ['-O2','-Wall','-Wextra', path.join(repo, 'deep-dives/desktop-ram/sample-tree.c'), '-o', sampler]);
  snapshot = await fingerprintTree(runtime);
  identity = { at: new Date().toISOString(), runtime: snapshot, driver: await hashFile(driver), sampler: await hashFile(sampler), modelHash,
    node: process.version, platform: process.platform, arch: os.arch(), cpu: os.cpus()[0].model, ramBytes: os.totalmem(),
    os: execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(), deadlineMs: 900000, count: 10000,
    experimentStopAt: new Date(stopAt).toISOString(), control: 'QMD automatic contexts', candidate: 'QMD_EMBED_PARALLELISM=2' };
  await writeFile(path.join(output, 'identity.json'), JSON.stringify(identity, null, 2));
}
const results = [];
let active, monitor;
const stop = () => active?.kill('SIGTERM'); process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  let corpusHash;
  if (values.resume) {
    const control = path.join(output, 'automatic'), packet = JSON.parse(await readFile(path.join(control, 'result.json'), 'utf8'));
    const rows = (await readFile(path.join(control, 'samples.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.at(-1).processes.length, 0);
    const samples = rows.filter(row => row.complete && row.timeMs >= packet.start && row.timeMs <= packet.end);
    corpusHash = JSON.parse(await readFile(path.join(control, 'corpus.json'), 'utf8')).markdownSha256;
    results.push({ variant: 'automatic', ok: true, exit: { code: null, note: 'Parent collector missed stream-finish after completed index; saved result and complete process drainage verified before manual continuation.' },
      ms: packet.end - packet.start, samples: samples.length, incompleteSamples: rows.filter(row => !row.complete).length,
      peakPhysicalBytes: Math.max(...samples.map(row => row.physical)), peakRssBytes: Math.max(...samples.map(row => row.rss)), result: packet.result });
    await writeFile(path.join(output, 'summary.json'), JSON.stringify({ identity, corpusHash, results }, null, 2));
  }
  for (const variant of values.resume ? ['two'] : ['automatic','two']) {
    assert.ok(Date.now() + 930000 + 15 * 60000 < stopAt, 'Do not start a run that cannot fit with cleanup.');
    const run = path.join(output, variant); await mkdir(run);
    const root = path.join(run, 'brain'), corpus = await createCorpus(root, 10000);
    if (!corpusHash) corpusHash = corpus.markdownSha256; else assert.equal(corpus.markdownSha256, corpusHash);
    await writeFile(path.join(run, 'corpus.json'), JSON.stringify(corpus));
    const config = path.join(run, 'config.json'), result = path.join(run, 'result.json');
    await writeFile(config, JSON.stringify({ runtime, root, model, modelHash, timeoutMs: 900000, result }));
    const env = { ...process.env }; delete env.QMD_EMBED_PARALLELISM;
    if (variant === 'two') env.QMD_EMBED_PARALLELISM = '2';
    const log = await open(path.join(run, 'stderr.log'), 'wx', 0o600);
    active = spawn(process.execPath, [driver, config], { env, stdio: ['ignore','ignore',log.fd] });
    const processExit = new Promise((resolve, reject) => { active.once('error', reject); active.once('exit', (code, signal) => resolve({ code, signal })); });
    monitor = spawn(sampler, [String(active.pid), '100'], { stdio: ['ignore','pipe','pipe'] });
    const trace = createWriteStream(path.join(run, 'samples.jsonl'), { flags: 'wx', mode: 0o600 }); monitor.stdout.pipe(trace);
    let monitorError = ''; monitor.stderr.on('data', b => monitorError += b);
    const monitorExit = new Promise(resolve => monitor.once('exit', code => resolve(code)));
    const watchdog = setTimeout(stop, 930000);
    console.log(variant + ': indexing frozen 10,000-note corpus');
    const exited = await processExit; await writeFile(path.join(run, 'exit.json'), JSON.stringify(exited)); clearTimeout(watchdog); active = undefined;
    const monitorCode = await monitorExit; monitor = undefined;
    if (!trace.writableFinished) await new Promise(resolve => trace.on('finish', resolve)); await log.close();
    assert.equal(monitorCode, 0, monitorError);
    const packet = JSON.parse(await readFile(result, 'utf8'));
    const allSamples = (await readFile(path.join(run, 'samples.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(allSamples.at(-1).processes.length, 0, 'Every observed owned process must drain.');
    const samples = allSamples.filter(row => row.timeMs >= packet.start && row.timeMs <= packet.end && row.complete);
    assert.ok(samples.length, 'Complete process-tree samples required.');
    const summary = { variant, ok: packet.ok, exit: exited, ms: packet.end - packet.start, samples: samples.length,
      incompleteSamples: allSamples.filter(row => !row.complete).length,
      peakPhysicalBytes: Math.max(...samples.map(row => row.physical)), peakRssBytes: Math.max(...samples.map(row => row.rss)),
      observedProcesses: [...new Set(allSamples.flatMap(row => row.processes.map(p => p.pid)))],
      result: packet.result, code: packet.code, message: packet.message };
    results.push(summary); await writeFile(path.join(output, 'summary.json'), JSON.stringify({ identity, corpusHash, results }, null, 2));
    console.log(variant + ': ' + (packet.ok ? 'complete' : 'failed') + ', ' + summary.ms + ' ms');
    assert.equal(exited.code, 0, 'Failed run stops the experiment; inspect retained evidence.'); assert.equal(packet.ok, true);
    assert.equal(packet.result.readiness.embedding, 'complete'); assert.equal(packet.result.documents, 10000);
  }
  assert.equal((await fingerprintTree(runtime)).sha256, snapshot.sha256, 'Frozen runtime changed.');
  assert.equal((await hashFile(model)).sha256, modelHash, 'Model bytes changed.');
  assert.equal(results[0].result.work.embedded, results[1].result.work.embedded);
  console.log('Pair complete; identical chunk counts, complete semantic readiness and owned process drainage verified.');
} finally { active?.kill('SIGTERM'); monitor?.kill('SIGTERM'); process.off('SIGINT', stop); process.off('SIGTERM', stop); }
