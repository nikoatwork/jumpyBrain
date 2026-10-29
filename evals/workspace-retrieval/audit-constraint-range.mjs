// Post-run audit only. Policies never import this scoring/source-review module.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { naturalQuestion } from './constraint-policy.mjs';

const [controlDir, output, ...armDirs] = process.argv.slice(2);
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const manifest = await json(path.join(controlDir, 'FREEZE.json'));
const { excerptMatchesSource } = await import(pathToFileURL(path.join(manifest.runtimeRoot, 'dist/core/retrieval-policy/compact.js')));
const queries = await json(path.join(controlDir, 'fixture/queries.json'));
const freezeFields = ['inputDigest', 'productDigest', 'qmd', 'model', 'tokenizer', 'modes'];
const searchWithoutRoot = ({ root, ...search }) => search;
const stable = ({ timing, search, ...packet }) => ({ ...packet, search: searchWithoutRoot(search) });
const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const baseline = new Map(), runs = [], changed = [];
for (const dir of [controlDir, ...armDirs]) {
  const identity = await json(path.join(dir, 'FREEZE.json'));
  for (const key of freezeFields) assert.deepEqual(identity[key], manifest[key], key);
  const scores = await json(path.join(dir, 'REPORT.json'));
  const passes = (await readdir(dir)).filter(name => /^lexical-\d+$/.test(name)).sort();
  for (const pass of passes) {
    const counts = { arm: identity.arm, pass, packets: 0, excerpts: 0, expansions: 0, errors: 0,
      empty: [], lateReads: 0, partialReads: 0, continuations: 0, explicitSyntaxChanged: [] };
    const records = new Map(scores.reports.find(report => `lexical-${report.repeat}` === pass).records.map(row => [row.id, row]));
    for (const query of queries) {
      const packet = await json(path.join(dir, pass, 'packets', `${query.id}.json`));
      counts.packets++;
      assert.equal(packet.search.root, path.resolve(dir, pass, 'memory'), 'Unexpected rich-search root');
      assert.ok(packet.wires.every(wire => Buffer.byteLength(wire) <= 8192));
      assert.ok(packet.wires.reduce((sum, wire) => sum + Buffer.byteLength(wire), 0) <= 32768);
      assert.ok(packet.expansions.length <= 3);
      for (const p of packet.recall.passages) {
        const bytes = await readFile(path.join(controlDir, 'fixture/corpus', p.filePath));
        assert.ok(excerptMatchesSource(p.text, p.startLine, p.endLine, bytes.toString('utf8')), `${query.id} excerpt`);
        if (p.expansion.available) assert.equal(p.expansion.expectedContentHash, sha(bytes));
        counts.excerpts++;
      }
      const requests = packet.requests.slice(1).map(JSON.parse);
      for (const [i, p] of packet.expansions.entries()) {
        if (p.kind !== 'expansion') { counts.errors++; continue; }
        const bytes = await readFile(path.join(controlDir, 'fixture/corpus', p.filePath));
        assert.equal(p.contentHash, sha(bytes));
        assert.equal(requests[i].expectedContentHash, p.contentHash);
        assert.equal(p.text, bytes.toString('utf8').split(/(?<=\n)/u).slice(p.startLine - 1, p.endLine).join(''));
        assert.equal(p.startLine, requests[i].startLine);
        assert.equal(packet.wires[i + 1], JSON.stringify(p) + '\n');
        if (p.partial) { assert.equal(p.continuationLine, p.endLine + 1); counts.partialReads++; }
        if (p.continuationLine) counts.continuations++;
        if (p.startLine > 1) counts.lateReads++;
        counts.expansions++;
      }
      if (!packet.recall.passages.length) counts.empty.push(query.id);
      if (dir === controlDir && pass === 'lexical-1') baseline.set(query.id, packet);
      else {
        const before = baseline.get(query.id);
        if (identity.arm === 'baseline') assert.deepEqual(stable(packet), stable(before), `Control nondeterminism: ${query.id}`);
        const natural = identity.arm.includes('natural-question');
        if (!natural || !naturalQuestion(query.query)) {
          assert.deepEqual(packet.recall, before.recall, `Unexpected recall change: ${query.id}`);
          assert.deepEqual(searchWithoutRoot(packet.search), searchWithoutRoot(before.search), `Unexpected search change: ${query.id}`);
        }
        if (query.id.includes('-explicit-') && JSON.stringify(packet.recall) !== JSON.stringify(before.recall)) counts.explicitSyntaxChanged.push(query.id);
        if (identity.arm !== 'baseline') {
          const record = records.get(query.id);
          if (JSON.stringify(packet.recall) !== JSON.stringify(before.recall) || JSON.stringify(packet.expansions) !== JSON.stringify(before.expansions)) {
            changed.push({ arm: identity.arm, id: query.id, query: query.query,
              requiredUnits: record.final, initialUnits: record.initial,
              recall: packet.recall.passages.map(p => ({ file: p.filePath, start: p.startLine, end: p.endLine, text: p.text })),
              reads: packet.expansions.map(p => ({ file: p.filePath, start: p.startLine, end: p.endLine, partial: p.partial, continuationLine: p.continuationLine })) });
          }
          const beforeIds = [...new Set(packet.recall.passages.filter(p => p.expansion.available).map(p => p.expansion.id))].slice(0, 3);
          assert.deepEqual(requests.map(r => r.id), beforeIds);
        }
      }
    }
    runs.push(counts);
  }
}
await writeFile(output, JSON.stringify({ runs, changed, limits: ['Mechanical exact-byte/range/hash audit; same-author source review remains necessary.'] }, null, 2) + '\n');
console.log(JSON.stringify(runs));
