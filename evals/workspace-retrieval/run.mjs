#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { getEncoding } from 'js-tiktoken';
import { scoreEvidence, scoreSearch, summarize, normalize } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const { values } = parseArgs({ options: { modes: { type: 'string', default: 'lexical' }, model: { type: 'string' },
  repeats: { type: 'string', default: '2' }, name: { type: 'string' } } });
const modes = values.modes.split(',');
assert.ok(modes.every(mode => ['lexical', 'semantic'].includes(mode)) && new Set(modes).size === modes.length);
const repeats = Number(values.repeats);
assert.ok(Number.isSafeInteger(repeats) && repeats >= 1 && repeats <= 5);
if (modes.includes('semantic')) assert.ok(values.model && path.isAbsolute(values.model) && (await stat(values.model)).isFile(), 'Semantic runs require --model /absolute/provisioned.gguf; no downloads.');
const name = values.name ?? new Date().toISOString().replace(/[:.]/g, '-');
assert.match(name, /^[a-zA-Z0-9_-]+$/);
const output = path.join(here, '.runs', name);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fileHash(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }
async function tree(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.sort((a,b) => a.name.localeCompare(b.name)).map(async entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? tree(file) : [{ path: path.relative(repo, file), bytes: (await stat(file)).size, sha256: await fileHash(file) }];
  }))).flat();
}
const qmdBin = await realpath(process.env.JUMPYBRAIN_QMD_BIN ?? '/opt/homebrew/bin/qmd');
let qmdRoot = path.dirname(qmdBin);
while (true) {
  try { if (JSON.parse(await readFile(path.join(qmdRoot, 'package.json'), 'utf8')).name === '@tobilu/qmd') break; } catch {}
  const parent = path.dirname(qmdRoot); if (parent === qmdRoot) throw new Error('Cannot locate provisioned QMD package.'); qmdRoot = parent;
}
const qmd = JSON.parse(await readFile(path.join(qmdRoot, 'package.json'), 'utf8'));
assert.equal(qmd.version, '2.8.3');
const inputFiles = [...await tree(path.join(here, 'corpus')), ...await tree(path.join(here, 'gold'))];
for (const file of ['queries.json', 'scenarios.mjs', 'build-corpus.mjs', 'run.mjs', 'execute.mjs', 'score.mjs', 'PROTOCOL.md', 'package.json', 'package-lock.json']) {
  inputFiles.push({ path: path.relative(repo, path.join(here, file)), bytes: (await stat(path.join(here, file))).size, sha256: await fileHash(path.join(here, file)) });
}
const product = [...await tree(path.join(repo, 'src')), ...await tree(path.join(repo, 'dist'))];
const manifest = { protocol: 'workspace-v1', createdAt: new Date().toISOString(), sourceCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim(),
  sourceUnchanged: !spawnSync('git', ['diff', '--', 'src'], { cwd: repo, encoding: 'utf8' }).stdout.trim(),
  inputDigest: digest(JSON.stringify(inputFiles)), productDigest: digest(JSON.stringify(product)), inputs: inputFiles, product,
  node: process.version, os: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
  qmd: { version: qmd.version, launcherSha256: await fileHash(qmdBin), codeDigest: digest(JSON.stringify(await tree(path.join(qmdRoot, 'dist')))) },
  model: values.model ? { name: path.basename(values.model), bytes: (await stat(values.model)).size, sha256: await fileHash(values.model) } : null,
  tokenizer: { package: 'js-tiktoken', version: '1.0.21', encoding: 'cl100k_base' }, modes, repeats };
await writeFile(path.join(output, 'FREEZE.json'), JSON.stringify(manifest, null, 2) + '\n');

// Prevent hidden model downloads and native source builds in every QMD child.
const guard = path.join(output, 'offline-guard.mjs');
await writeFile(guard, `import http from 'node:http'; import https from 'node:https'; import { syncBuiltinESMExports } from 'node:module'; import { stat } from 'node:fs/promises'; import path from 'node:path';
const denied=()=>{throw new Error('Workspace eval forbids network downloads');}; globalThis.fetch=denied; http.request=http.get=https.request=https.get=denied; syncBuiltinESMExports();
const {LlamaCpp}=await import(${JSON.stringify(pathToFileURL(path.join(qmdRoot, 'dist/llm.js')).href)});
LlamaCpp.prototype.resolveModel=async function(uri){if(!path.isAbsolute(uri)||!(await stat(uri)).isFile())throw new Error('Provisioned absolute model required');return uri;};
const ensure=LlamaCpp.prototype.ensureLlama; LlamaCpp.prototype.ensureLlama=function(){return ensure.call(this,false);};\n`);

const queries = JSON.parse(await readFile(path.join(here, 'queries.json'), 'utf8'));
const gold = new Map(JSON.parse(await readFile(path.join(here, 'gold/rubric.json'), 'utf8')).map(row => [row.id, row]));
assert.equal(queries.length, 80);
const sources = new Map();
for (const file of await tree(path.join(here, 'corpus'))) {
  const full = path.join(repo, file.path);
  sources.set(path.relative(path.join(here, 'corpus'), full), { content: await readFile(full, 'utf8'), hash: `sha256:${file.sha256}` });
}
for (const rubric of gold.values()) for (const unit of rubric.units) for (const alt of unit.alternatives) {
  assert.ok(sources.has(alt.file));
  for (const phrase of alt.required) assert.ok(normalize(sources.get(alt.file).content).includes(normalize(phrase)), `${rubric.id}: absent gold clause`);
}
const { excerptMatchesSource } = await import(pathToFileURL(path.join(repo, 'dist/core/retrieval-policy/compact.js')));
const encoding = getEncoding('cl100k_base');
const reports = [];
for (const mode of modes) for (let repeat = 1; repeat <= repeats; repeat++) {
  const dir = path.join(output, `${mode}-${repeat}`), root = path.join(dir, 'memory'), packets = path.join(dir, 'packets');
  await mkdir(packets, { recursive: true });
  const config = { repo, root, packets, corpus: path.join(here, 'corpus'), queries: path.join(here, 'queries.json'),
    mode, model: mode === 'semantic' ? values.model : undefined, indexOutput: path.join(dir, 'index.json') };
  const configPath = path.join(dir, 'config.json');
  await writeFile(configPath, JSON.stringify(config));
  const log = [], rss = { samples: 0, peakTreeKiB: 0 };
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(here, 'execute.mjs'), configPath], { cwd: repo, env: { ...process.env,
      JUMPYBRAIN_QMD_BIN: qmdBin, QMD_EMBED_MODEL: '', JUMPYBRAIN_QMD_EMBED: '', QMD_SOURCE_MODE: '0', GGML_METAL_NO_RESIDENCY: '1',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import=${pathToFileURL(guard).href}`.trim() }, stdio: ['ignore', 'pipe', 'pipe'] });
    const sample = () => {
      const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
      if (ps.status !== 0) return;
      const rows = ps.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
      const pids = new Set([child.pid]);
      for (let pass = 0; pass < 12; pass++) for (const [pid, parent] of rows) if (pids.has(parent)) pids.add(pid);
      rss.peakTreeKiB = Math.max(rss.peakTreeKiB, rows.filter(([pid]) => pids.has(pid)).reduce((sum, row) => sum + row[2], 0)); rss.samples++;
    };
    const sampler = setInterval(sample, 500);
    child.stdout.on('data', data => { process.stdout.write(data); log.push(data.toString()); });
    child.stderr.on('data', data => log.push(data.toString()));
    child.on('error', error => { clearInterval(sampler); reject(error); });
    child.on('close', code => { clearInterval(sampler); writeFile(path.join(dir, 'run.log'), log.join('')).then(() => code === 0 ? resolve() : reject(new Error(`${mode} run failed (${code}); see ${dir}/run.log`))); });
  });
  const records = [];
  for (const q of queries) {
    const packet = JSON.parse(await readFile(path.join(packets, `${q.id}.json`), 'utf8'));
    const rubric = gold.get(q.id);
    const recalled = packet.recall.passages.map(p => { const source = sources.get(p.filePath); return { file: p.filePath, text: p.text,
      verified: !!source && excerptMatchesSource(p.text, p.startLine, p.endLine, source.content) && (!p.expansion.available || p.expansion.expectedContentHash === source.hash) }; });
    const expanded = packet.expansions.filter(p => p.kind === 'expansion').map(p => { const source = sources.get(p.filePath); return { file: p.filePath, text: p.text,
      verified: !!source && source.hash === p.contentHash && source.content.split(/(?<=\n)/u).slice(p.startLine - 1, p.endLine).join('') === p.text }; });
    const initial = scoreEvidence(rubric.units, recalled), final = scoreEvidence(rubric.units, [...recalled, ...expanded]);
    const wire = packet.wires.join(''), requests = packet.requests.join('');
    records.push({ id: q.id, journey: q.journey, split: q.split, answerability: rubric.answerability,
      search: scoreSearch(rubric.relevant, packet.search.results), initial, final,
      diagnosis: final.every(u => u.covered) ? 'required_spans_covered_not_answer_judged' : rubric.relevant.some(file => !packet.search.results.some(r => r.provenance.file === file)) ? 'required_file_not_in_search10' : 'file_discovered_but_evidence_not_fully_shown',
      recallFiles: [...new Set(recalled.map(p => p.file))], expandedFiles: expanded.map(p => p.file),
      provenanceFailures: [...recalled, ...expanded].filter(p => !p.verified).length,
      retrieval: packet.recall.retrieval, timing: packet.timing,
      cost: { tokens: encoding.encode(wire).length + encoding.encode(requests).length, responseTokens: encoding.encode(wire).length, requestTokens: encoding.encode(requests).length,
        bytes: Buffer.byteLength(wire) + Buffer.byteLength(requests), responseBytes: Buffer.byteLength(wire), expansions: packet.expansions.length } });
  }
  const report = { mode, repeat, overall: summarize(records), development: summarize(records.filter(r => r.split === 'development')),
    reserved: summarize(records.filter(r => r.split === 'reserved')), navigation: summarize(records.filter(r => r.journey === 'navigation')),
    byJourney: Object.fromEntries([...new Set(queries.map(q => q.journey))].map(j => [j, summarize(records.filter(r => r.journey === j))])),
    index: JSON.parse(await readFile(config.indexOutput, 'utf8')), observedProcessTree: rss, records };
  await writeFile(path.join(dir, 'scores.json'), JSON.stringify(report, null, 2) + '\n');
  reports.push(report);
  console.log(JSON.stringify({ mode, repeat, score: report.overall }));
}
for (const file of [...inputFiles, ...product]) assert.equal(await fileHash(path.join(repo, file.path)), file.sha256, `Frozen input changed: ${file.path}`);
const comparisons = modes.map(mode => {
  const runs = reports.filter(r => r.mode === mode);
  const stable = rows => JSON.stringify(rows.map(({ timing, ...row }) => row));
  return { mode, repeats: runs.length, deterministicScoresAndCosts: runs.every(r => stable(r.records) === stable(runs[0].records)) };
});
await writeFile(path.join(output, 'REPORT.json'), JSON.stringify({ freezeSha256: await fileHash(path.join(output, 'FREEZE.json')), manifest, comparisons, reports,
  limits: ['Authored synthetic scenario templates; same-author questions and rubric.', 'Required-span diagnostics are not independently judged entailment or answer accuracy.',
    'No answering agent, browser usability study, Linux/VPS load test or cross-vendor comparison.', 'RSS is sampled at 500 ms; includes CPU process descendants, not GPU allocation; timing includes observation overhead.'] }, null, 2) + '\n');
console.log(`Report: ${path.join(output, 'REPORT.json')}`);
