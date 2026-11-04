import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { auditPacket } from '../evals/workspace-retrieval/verify-feedback-packets.mjs';
import { chooseExpansions } from '../evals/workspace-retrieval/score.mjs';

const serialize = value => JSON.stringify(value) + '\n';
const serializers = { serializeCompactRecall: serialize, serializeExpansion: serialize };
function fixture(count = 1) {
  const query = { id: 'synthetic-case', query: 'Which decision is current?', depth: 'normal' };
  const sources = new Map(Array.from({ length: count }, (_, index) => {
    const id = `mem_00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const content = `---\nid: ${id}\n---\nSynthetic source ${index + 1} remains qualified.\n`;
    return [id, { id, file: `notes/source-${index + 1}.md`, content, lines: content.split(/(?<=\n)/u), contentHash: `sha256:${createHash('sha256').update(content).digest('hex')}` }];
  }));
  const recall = { version: 1, kind: 'recall', query: query.query, depth: query.depth, maxBytes: 8192, passages: [...sources.values()].map(source => ({
    documentId: source.id, filePath: source.file, pathBasis: 'canonical_root', startLine: 1, endLine: source.lines.length, text: source.content,
    expansion: { available: true, id: source.id, expectedContentHash: source.contentHash, startLine: 1, endLine: source.lines.length },
  })) };
  const expansions = [...sources.values()].map(source => ({ version: 1, kind: 'expansion', id: source.id, filePath: source.file, contentHash: source.contentHash,
    scope: 'lines', requestedStartLine: 1, requestedEndLine: source.lines.length, startLine: 1, endLine: source.lines.length, totalLines: source.lines.length,
    text: source.content, partial: false, omittedLines: 0, maxBytes: 8192 }));
  const packet = { id: query.id, recall, expansions,
    requests: [serialize({ operation: 'recall', query: query.query, limit: 5, depth: query.depth, refresh: false, maxBytes: 8192 }),
      ...chooseExpansions(recall).map(request => serialize({ operation: 'expand', ...request }))],
    wires: [serialize(recall), ...expansions.map(serialize)] };
  return { query, sources, packet, audit: () => auditPacket(packet, query, sources, serializers), rewire: () => { packet.wires = [serialize(packet.recall), ...packet.expansions.map(serialize)]; } };
}
const has = (result, code) => result.failures.some(failure => failure.code === code);

test('valid full packet binds exact requests, wires and canonical source', () => {
  const result = fixture(2).audit();
  assert.equal(result.status, 'passed'); assert.equal(result.integrityPass, true); assert.equal(result.reads.length, 2);
});

test('swapping two valid source expansions fails their positional request bindings', () => {
  const f = fixture(2); f.packet.expansions.reverse(); f.rewire();
  const result = f.audit();
  assert.equal(result.integrityPass, false);
  assert.equal(has(result, 'expansion_requested_id_mismatch'), true);
  assert.equal(has(result, 'expansion_canonical_file_mismatch'), true);
  assert.equal(has(result, 'expansion_canonical_hash_mismatch'), true);
});

test('self-consistent wire cannot hide wrong requested ID, hash, range or source file', () => {
  for (const [change, expected] of [
    [result => { result.id = 'mem_other'; }, 'expansion_requested_id_mismatch'],
    [result => { result.contentHash = `sha256:${'0'.repeat(64)}`; }, 'expansion_requested_hash_mismatch'],
    [result => { result.filePath = 'notes/other.md'; }, 'expansion_canonical_file_mismatch'],
    [result => { result.startLine = 2; }, 'expansion_returned_range_mismatch'],
    [result => { result.requestedStartLine = 2; }, 'expansion_requested_range_mismatch'],
    [result => { result.text = 'Fabricated evidence.\n'; }, 'expansion_canonical_text_mismatch'],
    [result => { result.totalLines++; }, 'expansion_total_lines_mismatch'],
    [result => { result.partial = true; }, 'expansion_omission_metadata_mismatch'],
  ]) {
    const f = fixture(); change(f.packet.expansions[0]); f.rewire();
    assert.equal(has(f.audit(), expected), true, expected);
  }
});

test('charged recall/expansion wires must match the scored objects byte for byte', () => {
  const recall = fixture(); recall.packet.wires[0] = serialize({ ...recall.packet.recall, query: 'Another query' });
  assert.equal(has(recall.audit(), 'recall_wire_mismatch'), true);
  const expansion = fixture(); expansion.packet.wires[1] = serialize({ ...expansion.packet.expansions[0], text: 'Different evidence.\n' });
  assert.equal(has(expansion.audit(), 'expansion_wire_mismatch'), true);
});

test('wrong selected request, extra result and excessive serialized bytes fail', () => {
  const request = fixture(); request.packet.requests[1] = serialize({ operation: 'expand', id: 'wrong' });
  assert.equal(has(request.audit(), 'charged_request_sequence_mismatch'), true);
  const extra = fixture(); extra.packet.expansions.push(extra.packet.expansions[0]); extra.rewire();
  assert.equal(has(extra.audit(), 'selected_read_count_mismatch'), true);
  const huge = fixture(); huge.packet.expansions[0].padding = 'x'.repeat(8192); huge.rewire();
  assert.equal(has(huge.audit(), 'expansion_requested_byte_bound_exceeded'), true);
  assert.equal(has(huge.audit(), 'response_byte_bound_exceeded'), true);
});

test('executor errors preserve failed-case status separately from envelope integrity', () => {
  const f = fixture(); f.packet.expansions[0] = { error: 'line_too_large', message: 'Synthetic read failure.' }; f.rewire();
  const result = f.audit(); assert.equal(result.status, 'failed'); assert.equal(result.integrityPass, true); assert.equal(result.readErrorCount, 1);
  f.packet.wires[1] = serialize({ error: 'precondition_failed', message: 'Other error.' });
  assert.equal(has(f.audit(), 'error_wire_mismatch'), true);
});

test('invalid packet and selected recall identity are rejected without dropping the case', () => {
  const f = fixture(); const invalid = auditPacket({}, f.query, f.sources, serializers);
  assert.equal(invalid.id, f.query.id); assert.equal(invalid.status, 'failed');
  f.packet.recall.passages[0].documentId = 'wrong'; f.rewire();
  assert.equal(has(f.audit(), 'recall_document_id_mismatch'), true);
});
