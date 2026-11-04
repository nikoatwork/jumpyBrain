#!/usr/bin/env node
// Additional post-freeze audit only. Never loads gold or changes quality scores.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chooseExpansions } from './score.mjs';

const self = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(self), '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
async function hashFile(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
function relative(value) {
  assert.ok(typeof value === 'string' && value.length && !path.isAbsolute(value) && !value.split(/[\\/]/).includes('..'), `Unsafe frozen relative path: ${value}`);
  return value;
}
async function verifyFile(root, entry) {
  assert.ok(entry && typeof entry.sha256 === 'string', 'Missing frozen file description');
  const file = path.join(root, relative(entry.path));
  const info = await lstat(file);
  assert.ok(info.isFile() && !info.isSymbolicLink(), `Frozen file is not a regular file: ${file}`);
  assert.equal(info.size, entry.bytes, `Frozen file size changed: ${file}`);
  assert.equal(await hashFile(file), entry.sha256, `Frozen file bytes changed: ${file}`);
}
async function pathsBelow(root, prefix = '') {
  const result = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    assert.ok(!entry.isSymbolicLink(), `Unexpected fixture symlink: ${entry.name}`);
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await pathsBelow(root, name));
    else { assert.ok(entry.isFile(), `Unexpected fixture object: ${name}`); result.push(name); }
  }
  return result;
}

/** Pure integrity check. sources maps canonical document ID to frozen source metadata. */
export function auditPacket(packet, query, sources, serializers) {
  const failures = [], reads = [];
  let readErrorCount = 0;
  const check = (condition, code, detail = {}) => { if (!condition) failures.push({ code, ...detail }); return !!condition; };
  const finish = () => ({ id: query.id, status: failures.length || readErrorCount ? 'failed' : 'passed', integrityPass: failures.length === 0,
    readErrorCount, failures, reads });
  if (!check(packet && typeof packet === 'object' && packet.recall && typeof packet.recall === 'object'
    && Array.isArray(packet.recall.passages) && Array.isArray(packet.expansions) && Array.isArray(packet.wires) && Array.isArray(packet.requests), 'invalid_packet_shape')) return finish();
  check(packet.id === query.id, 'packet_case_mismatch');
  check(packet.recall.version === 1 && packet.recall.kind === 'recall', 'invalid_recall_kind');
  check(packet.recall.query === query.query, 'recall_query_mismatch');
  check(packet.recall.depth === (query.depth ?? 'normal'), 'recall_depth_mismatch');
  check(packet.recall.maxBytes === 8192, 'recall_byte_bound_mismatch');
  try { check(packet.wires[0] === serializers.serializeCompactRecall(packet.recall), 'recall_wire_mismatch'); }
  catch (error) { failures.push({ code: 'recall_serialization_failed', message: error.message }); }
  const validPassages = packet.recall.passages.every(passage => passage && passage.expansion && typeof passage.expansion.available === 'boolean');
  if (!check(validPassages, 'invalid_recall_passage_shape')) return finish();
  for (const [index, passage] of packet.recall.passages.entries()) if (passage.expansion.available) {
    const source = sources.get(passage.expansion.id);
    check(!!source, 'unknown_recall_expansion_id', { passage: index });
    if (source) {
      check(passage.documentId === source.id, 'recall_document_id_mismatch', { passage: index });
      check(passage.pathBasis === 'canonical_root' && passage.filePath === source.file, 'recall_source_file_mismatch', { passage: index });
      check(passage.expansion.expectedContentHash === source.contentHash, 'recall_source_hash_mismatch', { passage: index });
      check(passage.expansion.startLine === passage.startLine && passage.expansion.endLine === passage.endLine, 'recall_handle_range_mismatch', { passage: index });
    }
  }
  let chosen;
  try { chosen = chooseExpansions(packet.recall); }
  catch (error) { failures.push({ code: 'read_selection_failed', message: error.message }); return finish(); }
  const options = { depth: query.depth, ...(query.temporal ? { temporal: query.temporal } : {}), refresh: false };
  const expectedRequests = [JSON.stringify({ operation: 'recall', query: query.query, limit: 5, ...options, maxBytes: 8192 }) + '\n',
    ...chosen.map(request => JSON.stringify({ operation: 'expand', ...request }) + '\n')];
  check(JSON.stringify(packet.requests) === JSON.stringify(expectedRequests), 'charged_request_sequence_mismatch');
  check(packet.expansions.length === chosen.length && chosen.length <= 3, 'selected_read_count_mismatch');
  check(packet.wires.length === chosen.length + 1, 'charged_response_count_mismatch');
  const stringWires = packet.wires.every(wire => typeof wire === 'string');
  check(stringWires, 'non_string_response_wire');
  if (stringWires) {
    check(packet.wires.every(wire => Buffer.byteLength(wire, 'utf8') <= 8192), 'response_byte_bound_exceeded');
    check(packet.wires.reduce((n, wire) => n + Buffer.byteLength(wire, 'utf8'), 0) <= 32768, 'interaction_response_byte_bound_exceeded');
  }
  for (const [index, request] of chosen.entries()) {
    const result = packet.expansions[index], wire = packet.wires[index + 1], source = sources.get(request.id);
    const before = failures.length;
    const checkRead = (condition, code) => check(condition, code, { read: index, requestedId: request.id });
    checkRead(!!source, 'unknown_selected_document_id');
    if (!result || typeof result !== 'object') {
      checkRead(false, 'selected_read_result_missing_or_invalid');
      reads.push({ index, requestedId: request.id, status: 'invalid', integrityPass: false }); continue;
    }
    if (result.kind !== 'expansion') {
      readErrorCount++;
      checkRead(Object.keys(result).sort().join(',') === 'error,message' && typeof result.error === 'string' && typeof result.message === 'string', 'invalid_executor_error_envelope');
      checkRead(wire === JSON.stringify({ error: result.error, message: result.message }) + '\n', 'error_wire_mismatch');
      reads.push({ index, requestedId: request.id, status: 'executor_error', error: result.error, integrityPass: failures.length === before });
      continue;
    }
    try { checkRead(wire === serializers.serializeExpansion(result), 'expansion_wire_mismatch'); }
    catch (error) { failures.push({ code: 'expansion_serialization_failed', read: index, message: error.message }); }
    checkRead(result.version === 1, 'invalid_expansion_version');
    checkRead(result.id === request.id, 'expansion_requested_id_mismatch');
    checkRead(result.contentHash === request.expectedContentHash, 'expansion_requested_hash_mismatch');
    checkRead(result.scope === 'lines', 'expansion_scope_mismatch');
    checkRead(result.maxBytes === request.maxBytes, 'expansion_requested_byte_bound_mismatch');
    checkRead(typeof wire === 'string' && Buffer.byteLength(wire, 'utf8') <= request.maxBytes, 'expansion_requested_byte_bound_exceeded');
    if (source) {
      const lines = source.lines ?? source.content.split(/(?<=\n)/u);
      const start = request.startLine ?? 1, end = request.endLine ?? lines.length;
      checkRead(result.filePath === source.file, 'expansion_canonical_file_mismatch');
      checkRead(result.contentHash === source.contentHash && request.expectedContentHash === source.contentHash, 'expansion_canonical_hash_mismatch');
      checkRead(result.totalLines === lines.length, 'expansion_total_lines_mismatch');
      checkRead(result.requestedStartLine === start && result.requestedEndLine === end, 'expansion_requested_range_mismatch');
      const rangeValid = Number.isSafeInteger(result.startLine) && Number.isSafeInteger(result.endLine)
        && result.startLine === start && result.endLine >= start && result.endLine <= end && end <= lines.length;
      checkRead(rangeValid, 'expansion_returned_range_mismatch');
      if (rangeValid) {
        checkRead(result.text === lines.slice(start - 1, result.endLine).join(''), 'expansion_canonical_text_mismatch');
        const partial = result.endLine < end;
        checkRead(result.partial === partial && result.omittedLines === end - result.endLine, 'expansion_omission_metadata_mismatch');
        checkRead(partial ? result.continuationLine === result.endLine + 1 : !Object.hasOwn(result, 'continuationLine'), 'expansion_continuation_mismatch');
      }
    }
    reads.push({ index, requestedId: request.id, status: 'expansion', integrityPass: failures.length === before });
  }
  return finish();
}

async function auditRunRoot(runRoot, runtimeRoot) {
  const freezeFile = path.join(runRoot, 'FREEZE.json'), freezeBytes = await readFile(freezeFile);
  const freeze = JSON.parse(freezeBytes);
  assert.ok(Array.isArray(freeze.plannedRuns) && freeze.plannedRuns.length > 0, 'No frozen run plan');
  assert.ok(Array.isArray(freeze.generated), 'Missing generated-input freeze');
  const baseline = freeze.runtimes?.baseline;
  assert.ok(Array.isArray(baseline?.files), 'Missing frozen baseline runtime file map');
  for (const entry of baseline.files) await verifyFile(runtimeRoot, entry);
  // These core modules are the exact serializer implementations re-exported by runtime/index.js.
  const { serializeCompactRecall } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/core/retrieval-policy/compact.js')));
  const { serializeExpansion } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/core/canonical/expansion.js')));
  const { parseFrontmatter } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/core/frontmatter.js')));
  const { isValidMemoryDocumentId } = await import(pathToFileURL(path.join(runtimeRoot, 'dist/core/document-id.js')));
  for (const name of ['evals/workspace-retrieval/score.mjs', 'evals/workspace-retrieval/execute.mjs']) {
    const entry = freeze.inputs?.find(file => file.path === name); assert.ok(entry, `Missing executor/helper freeze: ${name}`); await verifyFile(repo, entry);
  }
  const generated = new Map(freeze.generated.map(entry => [entry.path, entry]));
  assert.equal(generated.size, freeze.generated.length, 'Duplicate frozen generated path');
  const queryEntry = generated.get('fixture/queries.json'); await verifyFile(runRoot, queryEntry);
  const queries = JSON.parse(await readFile(path.join(runRoot, queryEntry.path), 'utf8'));
  assert.equal(queries.length, freeze.queryCases, 'Frozen public query count mismatch');
  const queryIds = new Set();
  for (const query of queries) {
    assert.ok(/^[a-zA-Z0-9_-]+$/.test(query.id) && !queryIds.has(query.id), `Unsafe/duplicate public query ID: ${query.id}`); queryIds.add(query.id);
  }
  const corpusPrefix = 'fixture/corpus/', corpusEntries = freeze.generated.filter(entry => entry.path.startsWith(corpusPrefix));
  assert.ok(corpusEntries.length > 0, 'Empty frozen corpus file map');
  assert.deepEqual((await pathsBelow(path.join(runRoot, 'fixture/corpus'))).sort(), corpusEntries.map(entry => entry.path.slice(corpusPrefix.length)).sort(), 'Frozen corpus file membership changed');
  const sources = new Map();
  for (const entry of corpusEntries) {
    await verifyFile(runRoot, entry);
    const bytes = await readFile(path.join(runRoot, entry.path)), content = bytes.toString('utf8');
    assert.equal(sha(bytes), entry.sha256, `Frozen corpus changed while being read: ${entry.path}`);
    assert.ok(Buffer.from(content, 'utf8').equals(bytes), `Invalid UTF-8 canonical fixture: ${entry.path}`);
    const { frontmatter } = parseFrontmatter(content), id = frontmatter.id;
    assert.ok(isValidMemoryDocumentId(id) && !sources.has(id), `Invalid/duplicate canonical fixture ID: ${entry.path}`);
    sources.set(id, { id, file: entry.path.slice(corpusPrefix.length), content, lines: content.split(/(?<=\n)/u), contentHash: `sha256:${entry.sha256}` });
  }
  const runs = [];
  const plannedNames = new Set();
  for (const planned of freeze.plannedRuns) {
    assert.ok(/^[a-zA-Z0-9_-]+$/.test(planned.name) && !plannedNames.has(planned.name), 'Unsafe/duplicate frozen run name'); plannedNames.add(planned.name);
    const directory = path.join(runRoot, planned.name), configPath = `${planned.name}/execute-config.json`;
    const failures = [], records = [];
    let config, execution;
    try {
      await verifyFile(runRoot, generated.get(configPath)); config = JSON.parse(await readFile(path.join(runRoot, configPath), 'utf8'));
      assert.equal(config.arm, 'baseline', 'Audit only supports the fixed first-three baseline read policy');
      assert.equal(config.mode, planned.mode, 'Execution mode differs from frozen plan');
      assert.equal(path.resolve(config.queries), path.join(runRoot, 'fixture/queries.json'), 'Execution public queries changed');
      assert.equal(path.resolve(config.corpus), path.join(runRoot, 'fixture/corpus'), 'Execution corpus changed');
      assert.equal(path.resolve(config.packets), path.join(directory, 'packets'), 'Packet path differs from frozen run');
      assert.equal(path.resolve(config.repo), path.resolve(freeze.runtimes[planned.arm].root), 'Execution runtime differs from frozen plan');
    } catch (error) { failures.push({ code: 'execute_config_invalid_or_missing', message: error.message }); }
    try {
      execution = JSON.parse(await readFile(path.join(directory, 'execution.json'), 'utf8'));
      if (execution.code !== 0) failures.push({ code: 'execution_failed', exitCode: execution.code, signal: execution.signal, message: execution.error });
    } catch (error) { failures.push({ code: 'execution_status_missing_or_invalid', message: error.message }); }
    for (const query of queries) {
      if (!config || failures.some(failure => failure.code === 'execute_config_invalid_or_missing')) {
        records.push({ id: query.id, status: 'failed', integrityPass: false, readErrorCount: 0, failures: [{ code: 'execute_config_unusable' }], reads: [] }); continue;
      }
      let packet, packetBytes;
      try { packetBytes = await readFile(path.join(config.packets, `${query.id}.json`)); packet = JSON.parse(packetBytes); }
      catch (error) {
        records.push({ id: query.id, status: 'failed', integrityPass: false, readErrorCount: 0,
          failures: [{ code: error.code === 'ENOENT' ? 'packet_missing' : 'packet_unreadable_or_invalid_json', message: error.message }], reads: [] }); continue;
      }
      try { records.push({ ...auditPacket(packet, query, sources, { serializeCompactRecall, serializeExpansion }), packetSha256: sha(packetBytes) }); }
      catch (error) { records.push({ id: query.id, status: 'failed', integrityPass: false, readErrorCount: 0, failures: [{ code: 'packet_audit_exception', message: error.message }], reads: [] }); }
    }
    try {
      const unexpected = (await readdir(path.join(directory, 'packets'))).filter(name => !name.endsWith('.json') || !queryIds.has(name.slice(0, -5)));
      if (unexpected.length) failures.push({ code: 'unexpected_packet_files', files: unexpected });
    } catch (error) { failures.push({ code: 'packet_directory_unreadable', message: error.message }); }
    runs.push({ ...planned, plannedCases: queries.length, auditedCases: records.length, status: failures.length || records.some(record => record.status !== 'passed') ? 'failed' : 'passed',
      caseIntegrityFailures: records.filter(record => !record.integrityPass).length, expansionErrorCases: records.filter(record => record.readErrorCount > 0).length,
      readErrorCount: records.reduce((n, record) => n + record.readErrorCount, 0), failures, records });
  }
  return { schemaVersion: 1, audit: 'feedback-packet-wire-and-request-binding', createdAt: new Date().toISOString(), runRoot, runtimeRoot,
    status: runs.every(run => run.status === 'passed') ? 'passed' : 'failed', freezeSha256: sha(freezeBytes), verifierSha256: await hashFile(self),
    plannedCases: queries.length * freeze.plannedRuns.length, auditedCases: runs.reduce((n, run) => n + run.records.length, 0), canonicalSources: sources.size, runs,
    interpretation: 'Additional post-freeze integrity audit; original packets, quality scores, gates, candidates and fixtures are unchanged.',
    limits: ['No gold, models, indexing or retrieval execution is used.', 'Serialized executor errors can be bound by request order and envelope only; this does not prove which underlying exception occurred.',
      'Validly serialized read errors remain failed execution cases with nonzero audit status, separately from integrity violations.',
      'This audit does not replay retrieval, independently judge answer support, or replace source adjudication and quiet operating-cost/transport gates.'] };
}

async function main() {
  const { values } = parseArgs({ options: { help: { type: 'boolean' }, 'run-root': { type: 'string' }, runtime: { type: 'string' }, output: { type: 'string' } } });
  if (values.help) {
    console.log('Usage: node evals/workspace-retrieval/verify-feedback-packets.mjs --run-root <frozen quality output> --runtime <frozen baseline runtime> [--output <new audit JSON>]\nWrites PACKET-AUDIT.json by default, without overwriting files. Nonzero on missing/failed cases or integrity failures. No gold/model execution.'); return;
  }
  assert.ok(values['run-root'] && values.runtime, 'Required --run-root and --runtime');
  const runRoot = await realpath(values['run-root']), runtimeRoot = await realpath(values.runtime);
  const output = values.output ? path.resolve(values.output) : path.join(runRoot, 'PACKET-AUDIT.json');
  let report;
  try { report = await auditRunRoot(runRoot, runtimeRoot); }
  catch (error) { report = { schemaVersion: 1, audit: 'feedback-packet-wire-and-request-binding', createdAt: new Date().toISOString(), runRoot, runtimeRoot,
    status: 'blocked', failures: [{ code: 'frozen_audit_input_invalid_or_missing', message: error.message }], interpretation: 'No passing audit can be claimed; frozen inputs and scores were not modified.' }; }
  await writeFile(output, json(report), { flag: 'wx' });
  console.log(`Packet audit: ${report.status}; ${report.auditedCases ?? 0}/${report.plannedCases ?? 'unknown'} cases. ${output}`);
  if (report.status !== 'passed') process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === self) main().catch(error => { console.error(`Packet audit blocked: ${error.message}`); process.exitCode = 1; });
