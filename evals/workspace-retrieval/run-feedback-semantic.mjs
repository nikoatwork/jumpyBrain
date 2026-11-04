#!/usr/bin/env node
// Parent-run quality comparison only. Gold is parsed solely by --score-config.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { finished } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chooseExpansions, normalize, percentile, scoreEvidence, scoreSearch, summarize } from './score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const self = fileURLToPath(import.meta.url);
const suites = ['', 'augmentation', 'confirmation', 'confirmation-extra', 'discovery-confirmation', 'boundary-confirmation', 'constraint-range', 'feedback-semantic'];
const expectedSource = {
  baseline: '83b1573f0dd38988c64ec51fedc15bffaebc905978d130d905c81daa2916caeb',
  eligibility: 'fe0dc8235abdde0b74cfb40ffe00197ccd3e6a7782398b69677814ee87009399',
  'vector-only': '1aa2f516c7c3803bb62cf8e3fccf5db58217ab315beebf5506bf6da1476d1f36',
};
const digest = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const writeNew = (file, value) => writeFile(file, typeof value === 'string' ? value : json(value), { flag: 'wx' });
async function hashFile(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
async function describe(file, relativeTo) {
  const info = await lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Expected regular frozen input: ${file}`);
  return { path: path.relative(relativeTo, file).split(path.sep).join('/'), bytes: info.size, sha256: await hashFile(file) };
}
async function tree(directory, relativeTo = directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const full = path.join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Symlink cannot be frozen as a fixture: ${full}`);
    if (entry.isDirectory()) result.push(...await tree(full, relativeTo));
    else result.push(await describe(full, relativeTo));
  }
  return result;
}
function safeRelative(value) {
  assert.ok(typeof value === 'string' && value.length && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'), `Unsafe relative input: ${value}`);
  return value;
}
function unique(rows, key, label) {
  const found = new Set();
  for (const row of rows) { const value = key(row); assert.ok(!found.has(value), `Duplicate ${label}: ${value}`); found.add(value); }
  return found;
}
async function packageAt(specifier, from = import.meta.url) {
  let directory = path.dirname(createRequire(from).resolve(specifier));
  while (true) {
    try {
      const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      if (metadata.name === specifier) return { root: directory, metadata };
    } catch {}
    const parent = path.dirname(directory); assert.notEqual(parent, directory, `Cannot identify installed package: ${specifier}`); directory = parent;
  }
}
async function verifyEntries(root, files) {
  for (const file of files) {
    const full = path.join(root, safeRelative(file.path));
    assert.equal((await stat(full)).size, file.bytes, `Frozen size changed: ${full}`);
    assert.equal(await hashFile(full), file.sha256, `Frozen bytes changed: ${full}`);
  }
}
function classifier(source, name) {
  const match = source.match(new RegExp(`export function ${name}\\(value\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Frozen classifier export missing: ${name}`);
  return match[0].replace(/^export /, '');
}
async function loadClassifiers(roots) {
  const baseline = await readFile(path.join(roots.baseline, 'dist/adapters/qmd/qmd-query.js'), 'utf8');
  const eligibility = await readFile(path.join(roots.eligibility, 'dist/adapters/qmd/qmd-query.js'), 'utf8');
  return new Function(`${classifier(baseline, 'hasQueryConstraints')}\n${classifier(eligibility, 'hasSemanticQueryConstraints')}\nreturn {hasQueryConstraints, hasSemanticQueryConstraints};`)();
}

// Pure exported comparisons permit synthetic contract checks without fixture/model access.
export function compareRecords(before, after, affectedIds) {
  const current = new Map(after.map(row => [row.id, row]));
  assert.equal(current.size, before.length, 'Comparison case count mismatch');
  const gained = [], lost = [], unitGains = [], unitLosses = [], changed = [];
  for (const a of before) {
    const b = current.get(a.id); assert.ok(b, `Missing comparison case: ${a.id}`);
    assert.equal(a.final.length, b.final.length, `Unit count changed: ${a.id}`);
    const aFull = a.final.every(unit => unit.covered), bFull = b.final.every(unit => unit.covered);
    const identity = { id: a.id, fresh: a.fresh, protected: a.protected, journey: a.journey };
    if (!aFull && bFull) gained.push(identity);
    if (aFull && !bFull) lost.push(identity);
    a.final.forEach((unit, index) => {
      assert.equal(unit.label, b.final[index].label, `Unit identity changed: ${a.id}/${index}`);
      const item = { ...identity, unitIndex: index, label: unit.label };
      if (!unit.covered && b.final[index].covered) unitGains.push(item);
      if (unit.covered && !b.final[index].covered) unitLosses.push(item);
    });
    if (JSON.stringify(a.initial) !== JSON.stringify(b.initial) || JSON.stringify(a.final) !== JSON.stringify(b.final)
      || JSON.stringify(a.recallFiles) !== JSON.stringify(b.recallFiles) || JSON.stringify(a.expandedFiles) !== JSON.stringify(b.expandedFiles)) changed.push(identity);
  }
  const affected = new Set(affectedIds);
  const slice = rows => rows.filter(row => affected.has(row.id));
  const rate = rows => rows.length ? rows.filter(row => row.final.every(unit => unit.covered)).length / rows.length : null;
  const beforeAffected = slice(before), afterAffected = slice(after);
  const baselineTokens = before.reduce((n, row) => n + row.cost.tokens, 0), candidateTokens = after.reduce((n, row) => n + row.cost.tokens, 0);
  const delta = beforeAffected.length ? 100 * (rate(afterAffected) - rate(beforeAffected)) : null;
  const freshGains = gained.filter(row => row.fresh).length;
  const executionComplete = [...before, ...after].every(row => !row.executionFailure && row.protocolFailures.length === 0);
  const gates = {
    freshCompleteCaseGainAtLeastTwo: freshGains >= 2,
    affectedCompleteCaseGainAtLeastFivePercentagePoints: delta !== null && delta >= 5 - 1e-10,
    zeroCompleteCaseLosses: lost.length === 0,
    zeroSourceSpecificUnitLosses: unitLosses.length === 0,
    zeroProvenanceFailures: [...before, ...after].every(row => row.provenanceFailures === 0),
    zeroProtocolOrMissingPacketFailures: executionComplete,
    fullInteractionTokensIncreaseAtMostFivePercent: baselineTokens > 0 && candidateTokens <= baselineTokens * 1.05,
  };
  return { affectedCases: beforeAffected.length, affectedCompleteCaseRateBefore: rate(beforeAffected), affectedCompleteCaseRateAfter: rate(afterAffected),
    affectedCompleteCaseGainPercentagePoints: delta, freshCompleteCaseGains: freshGains, gained, lost, unitGains, unitLosses, changed,
    baselineTokens, candidateTokens, tokenIncreaseFraction: baselineTokens ? candidateTokens / baselineTokens - 1 : null,
    gates, packetQualityAndContextGatesPass: Object.values(gates).every(Boolean) };
}
function stableRecords(records) { return JSON.stringify(records.map(({ timing, ...record }) => record)); }
function summarizeMeasured(records) {
  const result = summarize(records);
  for (const key of ['searchMs', 'recallMs', 'interactionMs']) {
    const values = records.map(row => row.timing[key]).filter(Number.isFinite);
    result[key] = { p50: percentile(values, .5), p95: percentile(values, .95), measuredCases: values.length };
  }
  result.executionFailedCases = records.filter(row => row.executionFailure).length;
  result.protocolFailedCases = records.filter(row => row.protocolFailures.length > 0).length;
  return result;
}
function groupedReport(records, slices) {
  return { overall: summarizeMeasured(records), old: summarizeMeasured(records.filter(row => !row.fresh)), fresh: summarizeMeasured(records.filter(row => row.fresh)),
    protected: summarizeMeasured(records.filter(row => row.protected)), affected: Object.fromEntries(Object.entries(slices).map(([name, ids]) => {
      const selected = new Set(ids), rows = records.filter(row => selected.has(row.id));
      return [name, { ...summarizeMeasured(rows), old: summarizeMeasured(rows.filter(row => !row.fresh)), fresh: summarizeMeasured(rows.filter(row => row.fresh)) }];
    })), byJourney: Object.fromEntries([...new Set(records.map(row => row.journey))].map(journey => [journey, summarizeMeasured(records.filter(row => row.journey === journey))])) };
}

async function scoreConfiguration(configPath) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const queries = JSON.parse(await readFile(config.queries, 'utf8'));
  const gold = new Map();
  for (const file of config.rubrics) for (const row of JSON.parse(await readFile(file, 'utf8'))) {
    assert.ok(!gold.has(row.id), `Duplicate rubric case: ${row.id}`); gold.set(row.id, row);
  }
  assert.equal(gold.size, queries.length, 'Query/rubric count mismatch');
  for (const query of queries) assert.ok(gold.has(query.id), `Missing rubric: ${query.id}`);
  const sources = new Map();
  for (const file of await tree(config.corpus)) sources.set(file.path, { content: await readFile(path.join(config.corpus, file.path), 'utf8'), hash: `sha256:${file.sha256}` });
  for (const rubric of gold.values()) {
    assert.ok(Array.isArray(rubric.units) && rubric.units.length > 0, `Empty rubric units: ${rubric.id}`);
    assert.ok(Array.isArray(rubric.relevant) && rubric.relevant.length > 0, `Empty relevant sources: ${rubric.id}`);
    for (const file of rubric.relevant) assert.ok(sources.has(file), `Unknown relevant source: ${rubric.id}/${file}`);
    for (const unit of rubric.units) for (const alternative of unit.alternatives) {
      assert.ok(sources.has(alternative.file), `Unknown unit source: ${rubric.id}/${alternative.file}`);
      assert.ok(alternative.required.length > 0, `Empty unit alternative: ${rubric.id}`);
      for (const clause of alternative.required) assert.ok(normalize(sources.get(alternative.file).content).includes(normalize(clause)), `Absent source-specific rubric clause: ${rubric.id}/${unit.label}`);
    }
  }
  if (config.validateOnly) {
    await writeNew(config.result, { status: 'validated', cases: queries.length, units: [...gold.values()].reduce((n, row) => n + row.units.length, 0) });
    return;
  }
  const { getEncoding } = await import('js-tiktoken');
  const encoding = getEncoding('cl100k_base');
  const { excerptMatchesSource } = await import(pathToFileURL(path.join(config.runtimeRoot, 'dist/core/retrieval-policy/compact.js')));
  const records = [];
  const fresh = new Set(config.freshIds);
  for (const q of queries) {
    const rubric = gold.get(q.id), file = path.join(config.packets, `${q.id}.json`);
    let packet;
    try { packet = JSON.parse(await readFile(file, 'utf8')); }
    catch (error) {
      const uncovered = rubric.units.map(unit => ({ label: unit.label, covered: false }));
      records.push({ id: q.id, fresh: fresh.has(q.id), protected: q.protected === true, journey: q.journey, split: q.split, scenario: q.scenario,
        answerability: rubric.answerability, search: { rank: null, success5: false, success10: false, reciprocalRank: 0, requiredFileCoverage10: 0 },
        initial: uncovered, final: uncovered, diagnosis: 'execution_failed_or_missing_packet', executionFailure: error.code ?? error.name,
        protocolFailures: ['missing_or_invalid_packet'], recallFiles: [], expandedFiles: [], candidateCoverage: null, provenanceFailures: 0,
        retrieval: { status: 'failed', warnings: ['eval_missing_packet'] }, timing: { searchMs: null, recallMs: null, interactionMs: null },
        cost: { tokens: 0, responseTokens: 0, requestTokens: 0, bytes: 0, responseBytes: 0, expansions: 0 } });
      continue;
    }
    const failures = [];
    if (packet.id !== q.id) failures.push('packet_case_mismatch');
    const options = { depth: q.depth, ...(q.temporal ? { temporal: q.temporal } : {}), refresh: false };
    const chosen = chooseExpansions(packet.recall);
    const expectedRequests = [JSON.stringify({ operation: 'recall', query: q.query, limit: 5, ...options, maxBytes: 8192 }) + '\n',
      ...chosen.map(request => JSON.stringify({ operation: 'expand', ...request }) + '\n')];
    if (JSON.stringify(packet.requests) !== JSON.stringify(expectedRequests)) failures.push('fixed_request_or_first_three_read_policy_changed');
    if (packet.expansions.length !== chosen.length || packet.expansions.length > 3 || packet.wires.length !== packet.expansions.length + 1) failures.push('response_or_read_count_changed');
    if (packet.wires.some(wire => Buffer.byteLength(wire) > 8192) || packet.wires.reduce((n, wire) => n + Buffer.byteLength(wire), 0) > 32768) failures.push('response_byte_budget');
    const recalled = packet.recall.passages.flatMap(p => [p, ...(p.context ?? []).map(span => ({ ...p, ...span, context: undefined }))]).map(p => {
      const source = sources.get(p.filePath);
      return { file: p.filePath, text: p.text, verified: !!source && excerptMatchesSource(p.text, p.startLine, p.endLine, source.content)
        && (!p.expansion?.available || p.expansion.expectedContentHash === source.hash) };
    });
    const expanded = packet.expansions.filter(p => p.kind === 'expansion').map(p => {
      const source = sources.get(p.filePath);
      return { file: p.filePath, text: p.text, verified: !!source && source.hash === p.contentHash
        && source.content.split(/(?<=\n)/u).slice(p.startLine - 1, p.endLine).join('') === p.text };
    });
    const initial = scoreEvidence(rubric.units, recalled), final = scoreEvidence(rubric.units, [...recalled, ...expanded]);
    const wire = packet.wires.join(''), requests = packet.requests.join('');
    const candidateCoverage = diagnostic => diagnostic ? {
      rawBefore: diagnostic.rawCandidateCount, rawAfter: diagnostic.rawCandidateCountAfter, groupedCount: diagnostic.groupedCount,
      rawFilesBefore: diagnostic.rawFilesBefore ?? [], rawFilesAfter: diagnostic.rawFilesAfter ?? [], groupedFiles: diagnostic.groupedFiles ?? [],
      requiredBefore: rubric.relevant.filter(file => diagnostic.rawFilesBefore?.includes(file)),
      requiredAfter: rubric.relevant.filter(file => diagnostic.rawFilesAfter?.includes(file)),
      requiredGrouped: rubric.relevant.filter(file => diagnostic.groupedFiles?.includes(file)),
      missingAfter: rubric.relevant.filter(file => !diagnostic.rawFilesAfter?.includes(file)),
    } : null;
    const responseTokens = encoding.encode(wire).length, requestTokens = encoding.encode(requests).length;
    records.push({ id: q.id, fresh: fresh.has(q.id), protected: q.protected === true, journey: q.journey, split: q.split, scenario: q.scenario,
      answerability: rubric.answerability, search: scoreSearch(rubric.relevant, packet.search.results), initial, final,
      sourceSpecificUnits: rubric.units.map((unit, index) => ({ index, label: unit.label, allowedSources: [...new Set(unit.alternatives.map(alt => alt.file))], initialCovered: initial[index].covered, finalCovered: final[index].covered })),
      diagnosis: final.every(unit => unit.covered) ? 'required_spans_covered_not_answer_judged'
        : rubric.relevant.some(file => !packet.search.results.some(result => result.provenance.file === file)) ? 'required_file_not_in_search10' : 'file_discovered_but_evidence_not_fully_shown',
      executionFailure: null, protocolFailures: failures, recallFiles: [...new Set(recalled.map(p => p.file))], expandedFiles: expanded.map(p => p.file),
      candidateCoverage: { search: candidateCoverage(packet.searchDiagnostics), recall: candidateCoverage(packet.recallDiagnostics) },
      provenanceFailures: [...recalled, ...expanded].filter(p => !p.verified).length, retrieval: packet.recall.retrieval, timing: packet.timing,
      cost: { tokens: responseTokens + requestTokens, responseTokens, requestTokens, bytes: Buffer.byteLength(wire) + Buffer.byteLength(requests), responseBytes: Buffer.byteLength(wire), expansions: packet.expansions.length } });
  }
  await writeNew(config.result, { ...groupedReport(records, config.slices), records });
}

async function runChild(script, args, logPath, env, observe = false) {
  const started = Date.now(), log = createWriteStream(logPath, { flags: 'wx' });
  const rss = { samples: 0, peakTreeKiB: 0, intervalMs: 500, qualification: 'Diagnostic CPU descendant RSS only; no quiet-window adoption claim; no GPU allocation.' };
  let result;
  await new Promise(resolve => {
    const child = spawn(process.execPath, [script, ...args], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    const sample = () => {
      const ps = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], { encoding: 'utf8' });
      if (ps.status !== 0) return;
      const rows = ps.stdout.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number));
      const pids = new Set([child.pid]);
      for (let pass = 0; pass < 12; pass++) for (const [pid, parent] of rows) if (pids.has(parent)) pids.add(pid);
      rss.peakTreeKiB = Math.max(rss.peakTreeKiB, rows.filter(([pid]) => pids.has(pid)).reduce((n, row) => n + row[2], 0)); rss.samples++;
    };
    const sampler = observe ? setInterval(sample, 500) : undefined;
    child.once('error', error => { if (sampler) clearInterval(sampler); result = { code: null, signal: null, error: error.message }; resolve(); });
    child.once('close', (code, signal) => { if (sampler) clearInterval(sampler); result ??= { code, signal, error: null }; resolve(); });
  });
  log.end(); await finished(log);
  return { ...result, elapsedMs: Date.now() - started, observedProcessTree: observe ? rss : undefined };
}

let activeOutput;
async function main() {
  const { values } = parseArgs({ options: { help: { type: 'boolean' }, output: { type: 'string' }, model: { type: 'string' }, baseline: { type: 'string' }, eligibility: { type: 'string' }, 'vector-only': { type: 'string' }, lexical: { type: 'boolean', default: false }, 'score-config': { type: 'string' } } });
  if (values.help) {
    console.log('Usage: node evals/workspace-retrieval/run-feedback-semantic.mjs --output <new .local-pack/ or evals/workspace-retrieval/.runs/ directory> --model /absolute/provisioned.gguf --baseline <built runtime root> --eligibility <built runtime root> --vector-only <built runtime root> [--lexical]\nRuns semantic baseline twice, independent A and B once; --lexical adds baseline/A controls. Never builds or downloads.');
    return;
  }
  if (values['score-config']) { await scoreConfiguration(values['score-config']); return; }
  for (const key of ['output', 'model', 'baseline', 'eligibility', 'vector-only']) assert.ok(values[key], `Required --${key}`);
  assert.ok(path.isAbsolute(values.model), 'Model must be an already-provisioned absolute file');
  const model = await realpath(values.model); assert.ok((await stat(model)).isFile(), 'Model must be a regular file');
  const output = path.resolve(values.output);
  const allowedRoots = [path.join(repo, '.local-pack'), path.join(here, '.runs')];
  assert.ok(allowedRoots.some(root => output.startsWith(root + path.sep)), 'Output must be a new directory under ignored .local-pack/ or evals/workspace-retrieval/.runs/');
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output, { recursive: false }); activeOutput = output;
  const roots = Object.fromEntries(await Promise.all(['baseline', 'eligibility', 'vector-only'].map(async arm => [arm, await realpath(values[arm])])));
  assert.equal(new Set(Object.values(roots)).size, 3, 'Each arm requires an independent built snapshot');
  const runtimes = {};
  for (const [arm, root] of Object.entries(roots)) {
    const sourceHash = await hashFile(path.join(root, 'src/adapters/qmd/qmd-query.ts'));
    assert.equal(sourceHash, expectedSource[arm], `Runtime ${arm} does not contain the frozen independent candidate`);
    const files = [...await tree(path.join(root, 'src'), root), ...await tree(path.join(root, 'dist'), root)];
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) files.push(await describe(path.join(root, file), root));
    runtimes[arm] = { root, sourceHash, digest: digest(JSON.stringify(files)), files };
  }
  const allowedDifferences = new Set(['src/adapters/qmd/qmd-query.ts', 'dist/adapters/qmd/qmd-query.js', 'dist/adapters/qmd/qmd-query.d.ts']);
  for (const arm of ['eligibility', 'vector-only']) {
    const a = new Map(runtimes.baseline.files.map(file => [file.path, file.sha256])), b = new Map(runtimes[arm].files.map(file => [file.path, file.sha256]));
    const changes = [...new Set([...a.keys(), ...b.keys()])].filter(file => a.get(file) !== b.get(file));
    assert.ok(changes.every(file => allowedDifferences.has(file)), `Non-candidate runtime differences in ${arm}: ${changes.filter(file => !allowedDifferences.has(file)).join(', ')}`);
    runtimes[arm].differentFiles = changes;
  }
  const qmdBinary = await realpath(process.env.JUMPYBRAIN_QMD_BIN ?? '/opt/homebrew/bin/qmd');
  let qmdRoot = path.dirname(qmdBinary), qmdPackage;
  while (true) {
    try { const pkg = JSON.parse(await readFile(path.join(qmdRoot, 'package.json'), 'utf8')); if (pkg.name === '@tobilu/qmd') { qmdPackage = pkg; break; } } catch {}
    const parent = path.dirname(qmdRoot); assert.notEqual(parent, qmdRoot, 'Cannot locate provisioned QMD package'); qmdRoot = parent;
  }
  assert.equal(qmdPackage.version, '2.8.3', 'Pinned QMD 2.8.3 is required');
  const qmdFiles = [...await tree(path.join(qmdRoot, 'dist'), qmdRoot), await describe(path.join(qmdRoot, 'package.json'), qmdRoot), await describe(qmdBinary, qmdRoot)];
  const qmd = { root: qmdRoot, binary: qmdBinary, version: qmdPackage.version, files: qmdFiles, digest: digest(JSON.stringify(qmdFiles)) };
  const tokenizerPackage = await packageAt('js-tiktoken');
  assert.equal(tokenizerPackage.metadata.version, '1.0.21', 'Pinned js-tiktoken@1.0.21 is required');
  const tokenizerFiles = await tree(tokenizerPackage.root);
  const tokenizer = { package: 'js-tiktoken', version: tokenizerPackage.metadata.version, encoding: 'cl100k_base', root: tokenizerPackage.root,
    files: tokenizerFiles, digest: digest(JSON.stringify(tokenizerFiles)) };
  const inputFiles = [], corpusFiles = [], queries = [], freshIds = [], rubricPaths = [], counts = [];
  const corpusDir = path.join(output, 'fixture/corpus'); await mkdir(corpusDir, { recursive: true });
  for (const suite of suites) {
    const base = path.join(here, suite), sourceCorpus = path.join(base, 'corpus');
    const files = await tree(sourceCorpus), publicQueries = JSON.parse(await readFile(path.join(base, 'queries.json'), 'utf8'));
    assert.ok(files.every(file => file.path.endsWith('.md')), `Only canonical Markdown belongs in indexed corpus: ${suite || 'original'}`);
    for (const file of files) corpusFiles.push({ ...file, suite: suite || 'original', source: path.join(sourceCorpus, file.path) });
    queries.push(...publicQueries);
    if (suite === 'feedback-semantic') freshIds.push(...publicQueries.map(query => query.id));
    counts.push({ suite: suite || 'original', pages: files.length, cases: publicQueries.length });
    inputFiles.push(...await tree(sourceCorpus, repo), await describe(path.join(base, 'queries.json'), repo));
    const rubric = path.join(base, suite ? 'rubric.json' : 'gold/rubric.json'); rubricPaths.push(rubric); inputFiles.push(await describe(rubric, repo));
  }
  unique(corpusFiles, file => file.path, 'corpus path'); unique(queries, query => query.id, 'query ID');
  for (const query of queries) assert.ok(typeof query.query === 'string' && /^[a-zA-Z0-9_-]+$/.test(query.id), `Invalid public query/schema ID: ${query.id}`);
  const actualCounts = { oldPages: counts.slice(0, -1).reduce((n, row) => n + row.pages, 0), oldCases: queries.length - freshIds.length, freshPages: counts.at(-1).pages, freshCases: freshIds.length };
  assert.deepEqual(actualCounts, { oldPages: 248, oldCases: 168, freshPages: 30, freshCases: 18 }, 'Unexpected workload; retain the mismatch rather than silently redefining the frozen suite');
  const authorPath = path.join(here, 'feedback-semantic/AUTHOR-FREEZE.json');
  const author = JSON.parse(await readFile(authorPath, 'utf8'));
  assert.ok(Array.isArray(author.files) && author.files.length > 0, 'Missing author file freeze');
  assert.equal(author.digest, 'fc1369a770e06d9d8180a8dcf57d0519311a5422ce02202e2d25350f755ed32b', 'Author freeze was replaced; retain this as a blocker instead of re-freezing fresh inputs');
  unique(author.files, file => file.path, 'author freeze path');
  const authorSorted = [...author.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const authorDigest = digest(authorSorted.map(file => `${file.sha256}  ${file.path}\n`).join(''));
  assert.equal(authorDigest, author.digest, 'Author freeze aggregate mismatch; do not regenerate or redefine the author freeze');
  await verifyEntries(path.dirname(authorPath), author.files);
  inputFiles.push(await describe(authorPath, repo));
  for (const file of author.files) inputFiles.push(await describe(path.join(path.dirname(authorPath), safeRelative(file.path)), repo));
  // Corpus copies and public queries are the only files offered to execute.mjs.
  for (const file of corpusFiles) {
    const destination = path.join(corpusDir, safeRelative(file.path)); await mkdir(path.dirname(destination), { recursive: true });
    await cp(file.source, destination, { force: false, errorOnExist: true });
  }
  const queryPath = path.join(output, 'fixture/queries.json'); await writeNew(queryPath, queries);
  const { parseFrontmatter } = await import(pathToFileURL(path.join(roots.baseline, 'dist/core/frontmatter.js')));
  const { isValidMemoryDocumentId } = await import(pathToFileURL(path.join(roots.baseline, 'dist/core/document-id.js')));
  const documentIds = new Set();
  for (const file of corpusFiles) {
    const { frontmatter } = parseFrontmatter(await readFile(file.source, 'utf8'));
    assert.ok(isValidMemoryDocumentId(frontmatter.id), `Invalid canonical document ID: ${file.source}`);
    assert.ok(!documentIds.has(frontmatter.id), `Duplicate canonical document ID: ${frontmatter.id}`); documentIds.add(frontmatter.id);
  }
  const classifiers = await loadClassifiers(roots);
  const slices = {
    eligibility: queries.filter(query => classifiers.hasQueryConstraints(query.query) && !classifiers.hasSemanticQueryConstraints(query.query)).map(query => query.id),
    'vector-only': queries.filter(query => !classifiers.hasQueryConstraints(query.query) && ['orientation', 'rationale', 'current', 'current-state', 'multi-source'].includes(query.journey)).map(query => query.id),
  };
  const sliceDefinitions = { eligibility: 'Frozen baseline hasQueryConstraints=true and candidate A hasSemanticQueryConstraints=false, using public query text only.',
    'vector-only': 'Frozen baseline hasQueryConstraints=false and journey in orientation/rationale/current/current-state/multi-source; no score/rubric selects membership.' };
  const guard = path.join(output, 'offline-guard.mjs');
  await writeNew(guard, `import http from 'node:http'; import https from 'node:https'; import {syncBuiltinESMExports} from 'node:module'; import {stat} from 'node:fs/promises'; import path from 'node:path';\nconst denied=()=>{throw new Error('Feedback semantic eval forbids network downloads');}; globalThis.fetch=denied; http.request=http.get=https.request=https.get=denied; syncBuiltinESMExports();\nconst {LlamaCpp}=await import(${JSON.stringify(pathToFileURL(path.join(qmdRoot, 'dist/llm.js')).href)});\nLlamaCpp.prototype.resolveModel=async function(uri){if(!path.isAbsolute(uri)||uri!==${JSON.stringify(model)}||!(await stat(uri)).isFile())throw new Error('Only the explicitly provisioned model is permitted');return uri;};\nconst ensure=LlamaCpp.prototype.ensureLlama; LlamaCpp.prototype.ensureLlama=function(){return ensure.call(this,false);};\n`);
  const planned = [{ name: 'semantic-baseline-1', arm: 'baseline', mode: 'semantic' }, { name: 'semantic-baseline-2', arm: 'baseline', mode: 'semantic' },
    { name: 'semantic-eligibility-1', arm: 'eligibility', mode: 'semantic' }, { name: 'semantic-vector-only-1', arm: 'vector-only', mode: 'semantic' }];
  if (values.lexical) planned.push({ name: 'lexical-baseline-1', arm: 'baseline', mode: 'lexical' }, { name: 'lexical-eligibility-1', arm: 'eligibility', mode: 'lexical' });
  const scorerCommon = { queries: queryPath, corpus: corpusDir, rubrics: rubricPaths, freshIds, slices, runtimeRoot: roots.baseline };
  const preflight = path.join(output, 'score-preflight-config.json');
  await writeNew(preflight, { ...scorerCommon, validateOnly: true, result: path.join(output, 'score-preflight.json') });
  for (const run of planned) {
    run.directory = path.join(output, run.name); await mkdir(path.join(run.directory, 'packets'), { recursive: true });
    run.executeConfig = path.join(run.directory, 'execute-config.json'); run.scoreConfig = path.join(run.directory, 'score-config.json'); run.scores = path.join(run.directory, 'scores.json');
    await writeNew(run.executeConfig, { repo: roots[run.arm], root: path.join(run.directory, 'memory'), packets: path.join(run.directory, 'packets'), corpus: corpusDir,
      queries: queryPath, arm: 'baseline', qmdRoot, mode: run.mode, ...(run.mode === 'semantic' ? { model } : {}), indexOutput: path.join(run.directory, 'index.json') });
    await writeNew(run.scoreConfig, { ...scorerCommon, packets: path.join(run.directory, 'packets'), result: run.scores });
  }
  for (const entry of await readdir(here, { withFileTypes: true })) if (entry.isFile() && (entry.name.endsWith('.mjs') || ['PROTOCOL.md', 'DISCOVERY-EXPERIMENT.md', 'FEEDBACK-SEMANTIC-POLICY.md', 'package.json', 'package-lock.json'].includes(entry.name))) inputFiles.push(await describe(path.join(here, entry.name), repo));
  const deduplicatedInputs = [...new Map(inputFiles.map(file => [file.path, file])).values()].sort((a, b) => a.path < b.path ? -1 : 1);
  const generated = [];
  for (const file of [queryPath, guard, preflight, ...planned.flatMap(run => [run.executeConfig, run.scoreConfig])]) generated.push(await describe(file, output));
  generated.push(...await tree(corpusDir, output));
  const manifest = { schemaVersion: 1, protocol: 'feedback-semantic-independent-v1', createdAt: new Date().toISOString(), status: 'pre-run frozen; no quality outputs exist yet',
    counts, actualCounts, corpusPages: corpusFiles.length, queryCases: queries.length, freshIds, slices, sliceDefinitions, plannedRuns: planned.map(({ name, arm, mode }) => ({ name, arm, mode })),
    authorFreeze: { path: path.relative(repo, authorPath), sha256: await hashFile(authorPath), declaredDigest: author.digest, files: author.files },
    inputs: deduplicatedInputs, inputDigest: digest(JSON.stringify(deduplicatedInputs)), runtimes, qmd, model: { path: model, bytes: (await stat(model)).size, sha256: await hashFile(model) }, generated,
    tokenizer, node: process.version,
    hardware: { platform: process.platform, arch: process.arch, release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() },
    gates: { minimumFreshCompleteCaseGains: 2, minimumAffectedGainPercentagePoints: 5, maximumCompleteCaseLosses: 0, maximumSourceSpecificUnitLosses: 0, maximumProvenanceOrBudgetFailures: 0,
      maximumFullInteractionTokenIncreaseFraction: 0.05, quietWindowP95IncreaseFraction: 0.10, quietWindowCpuRssIncreaseMiB: 50, quietOperatingGateExecuted: false },
    limits: ['Required-span evidence diagnostics are not independently judged supported answers or autonomous abstention.', 'Candidate admission does not establish displayed source-specific evidence.',
      'Baseline repeat excludes timing only; content or token nondeterminism remains visible.', 'Timing and sampled CPU descendant RSS are unqualified quality-run observations, not quiet-window cost acceptance.',
      'Existing executor hooks expose merged candidate files, not distinct raw lexical/vector QMD result lists.', 'No lifecycle/transport parity, GUI, Linux/VPS concurrency or publication is performed by this harness.'] };
  const freezePath = path.join(output, 'FREEZE.json');
  await writeNew(freezePath, manifest);
  console.log(`Frozen ${manifest.corpusPages} pages / ${manifest.queryCases} cases; ${freshIds.length} fresh. ${freezePath}`);
  // First child spawn occurs only after every input/runtime/model/config identity is frozen.
  const scoringEnv = { ...process.env, NODE_OPTIONS: '' };
  const checked = await runChild(self, ['--score-config', preflight], path.join(output, 'score-preflight.log'), scoringEnv);
  assert.equal(checked.code, 0, `Scorer preflight failed; see ${output}/score-preflight.log`);
  const env = { ...process.env, JUMPYBRAIN_QMD_BIN: qmdBinary, QMD_EMBED_MODEL: '', JUMPYBRAIN_QMD_EMBED: '', QMD_SOURCE_MODE: '0', GGML_METAL_NO_RESIDENCY: '1',
    NODE_OPTIONS: `--import=${pathToFileURL(guard).href}` };
  const reports = [];
  for (const run of planned) {
    console.log(`Running ${run.name} (clean root; diagnostic timing/RSS only)`);
    const execution = await runChild(path.join(here, 'execute.mjs'), [run.executeConfig], path.join(run.directory, 'run.log'), env, true);
    await writeNew(path.join(run.directory, 'execution.json'), execution);
    const scoring = await runChild(self, ['--score-config', run.scoreConfig], path.join(run.directory, 'score.log'), scoringEnv);
    assert.equal(scoring.code, 0, `Scorer failed; see ${run.directory}/score.log`);
    const report = JSON.parse(await readFile(run.scores, 'utf8'));
    let index = null; try { index = JSON.parse(await readFile(path.join(run.directory, 'index.json'), 'utf8')); } catch {}
    reports.push({ name: run.name, arm: run.arm, mode: run.mode, execution, index, ...report });
    console.log(`${run.name}: ${report.overall.finalAllRequiredSpans}/${report.overall.cases} complete; ${report.overall.interactionTokens} full-interaction tokens; exit ${execution.code}`);
  }
  for (const runtime of Object.values(runtimes)) await verifyEntries(runtime.root, runtime.files);
  await verifyEntries(repo, deduplicatedInputs); await verifyEntries(qmdRoot, qmdFiles); await verifyEntries(tokenizer.root, tokenizer.files); await verifyEntries(output, generated);
  assert.equal(await hashFile(model), manifest.model.sha256, 'Frozen model bytes changed');
  await verifyEntries(path.dirname(authorPath), author.files);
  const baseline = reports.find(run => run.name === 'semantic-baseline-1'), repeat = reports.find(run => run.name === 'semantic-baseline-2');
  const deterministic = baseline.execution.code === 0 && repeat.execution.code === 0 && stableRecords(baseline.records) === stableRecords(repeat.records);
  const repeatChanged = baseline.records.filter((row, index) => stableRecords([row]) !== stableRecords([repeat.records[index]])).map(row => row.id);
  const comparisons = {};
  for (const arm of ['eligibility', 'vector-only']) {
    const candidate = reports.find(run => run.arm === arm && run.mode === 'semantic');
    const comparison = compareRecords(baseline.records, candidate.records, slices[arm]);
    comparisons[arm] = { ...comparison, baselineRepeatDeterministic: deterministic,
      sourceAdjudicationRequired: [...new Set([...comparison.changed.filter(row => row.fresh), ...comparison.lost, ...comparison.unitLosses].map(row => row.id))],
      eligibleForSeparateQuietCostChecks: comparison.packetQualityAndContextGatesPass && deterministic && candidate.execution.code === 0,
      adoption: 'not_decided; parent source adjudication, quiet costs and production parity remain separate' };
  }
  let lexicalComparison = null;
  if (values.lexical) {
    const a = reports.find(run => run.name === 'lexical-baseline-1'), b = reports.find(run => run.name === 'lexical-eligibility-1');
    lexicalComparison = { deterministicNonTimingIdentity: a.execution.code === 0 && b.execution.code === 0 && stableRecords(a.records) === stableRecords(b.records),
      comparison: compareRecords(a.records, b.records, slices.eligibility) };
  }
  const compactRuns = reports.map(({ records, ...run }) => ({ ...run, scores: path.relative(output, planned.find(item => item.name === run.name).scores) }));
  const summary = { schemaVersion: 1, freezeSha256: await hashFile(freezePath), counts: actualCounts, baselineRepeat: { deterministicNonTimingScoresAndCosts: deterministic, changedCases: repeatChanged },
    comparisons, lexicalComparison, runs: compactRuns, limits: manifest.limits, quietOperatingGateExecuted: false, adoptionDecision: 'not_made' };
  await writeNew(path.join(output, 'SUMMARY.json'), summary);
  const percent = value => value === null ? 'n/a' : `${(100 * value).toFixed(2)}%`;
  const lines = ['# Feedback semantic quality comparison', '', `Frozen ${manifest.corpusPages} Markdown pages / ${manifest.queryCases} cases (${freshIds.length} fresh); QMD ${qmd.version}; ${process.version}.`,
    '', `Baseline repeat non-timing scores/costs identical: **${deterministic}**. Changed cases: ${repeatChanged.join(', ') || 'none'}.`, '',
    '| Run | Complete cases | Old complete | Fresh complete | Full tokens | Provenance failures | Exit |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...reports.map(run => `| ${run.name} | ${run.overall.finalAllRequiredSpans}/${run.overall.cases} | ${run.old.finalAllRequiredSpans}/${run.old.cases} | ${run.fresh.finalAllRequiredSpans}/${run.fresh.cases} | ${run.overall.interactionTokens} | ${run.overall.provenanceFailures} | ${run.execution.code} |`), '',
    '| Candidate | Fresh complete gains | Complete losses | Source-unit losses | Affected gain (pp) | Token increase | Packet gates |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...Object.entries(comparisons).map(([arm, result]) => `| ${arm} | ${result.freshCompleteCaseGains} | ${result.lost.length} | ${result.unitLosses.length} | ${result.affectedCompleteCaseGainPercentagePoints?.toFixed(2) ?? 'n/a'} | ${percent(result.tokenIncreaseFraction)} | ${result.packetQualityAndContextGatesPass} |`), '',
    ...Object.entries(comparisons).flatMap(([arm, result]) => [`${arm}: complete gains ${result.gained.map(row => row.id).join(', ') || 'none'}; complete losses ${result.lost.map(row => row.id).join(', ') || 'none'}; source-unit losses ${result.unitLosses.map(row => `${row.id}/${row.unitIndex}`).join(', ') || 'none'}.`, '']),
    'Candidate admission and required-span evidence are separate. Full per-case scores, source-specific units, request/response token counts, pool diagnostics and failures are in each run’s scores.json; original packets, errors and logs are retained. Source-check every changed fresh outcome and every loss before accepting mechanical scores.', '',
    'Timing and 500 ms sampled CPU descendant RSS are diagnostic observations only. Quiet paired latency/RSS acceptance has not run. No adoption claim is made; parent adjudication, operating costs and required production parity remain outstanding.', '',
    ...manifest.limits.map(limit => `- ${limit}`), ''];
  await writeNew(path.join(output, 'REPORT.md'), lines.join('\n'));
  console.log(`Summary: ${path.join(output, 'SUMMARY.json')}\nReport: ${path.join(output, 'REPORT.md')}`);
  if (reports.some(run => run.execution.code !== 0)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === self) main().catch(async error => {
  console.error(`Feedback semantic harness blocked: ${error.message}`);
  if (activeOutput) await writeNew(path.join(activeOutput, 'BLOCKED.json'), { status: 'blocked', error: error.message, createdAt: new Date().toISOString() }).catch(() => {});
  process.exitCode = 1;
});
