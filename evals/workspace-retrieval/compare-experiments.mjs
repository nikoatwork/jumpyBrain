import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { summarize } from './score.mjs';
const [baselineDir, output, ...armDirs] = process.argv.slice(2);
const read = async dir => JSON.parse(await readFile(path.join(dir, 'lexical-1/scores.json'), 'utf8'));
const baseline = await read(baselineDir), byId = new Map(baseline.records.map(r => [r.id, r]));
const baselineManifest = JSON.parse(await readFile(path.join(baselineDir, 'FREEZE.json'), 'utf8'));
const complete = row => row.final.every(u => u.covered);
const fresh = row => /^(meridian|estuary|vellum|bracken|saffron|quartz)-/u.test(row.id);
const affected = (arm, row) => ['discovery', 'discovery-identity'].includes(arm) ? ['orientation', 'current', 'multi-source', 'rationale'].includes(row.journey) : arm === 'identity' ? ['current', 'orientation', 'multi-source', 'ranking'].includes(row.journey) : arm === 'evidence' ? (fresh(row) ? row.journey === 'scope' : ['orientation', 'current'].includes(row.journey))
  : arm === 'rerank' ? (fresh(row) ? ['ranking', 'multi-source'].includes(row.journey) : ['discovery', 'orientation', 'current', 'multi-source'].includes(row.journey))
    : ['multi-source', 'orientation'].includes(row.journey);
const protectedCase = row => row.protected === true || ['navigation', 'historical', 'limits', 'protected', 'scope'].includes(row.journey);
const arms = [];
for (const dir of armDirs) {
  const scores = await read(dir), manifest = JSON.parse(await readFile(path.join(dir, 'FREEZE.json'), 'utf8')), arm = manifest.arm;
  assert.equal(manifest.inputDigest, baselineManifest.inputDigest, 'Comparison input snapshots differ');
  assert.equal(manifest.productDigest, baselineManifest.productDigest, 'Comparison product snapshots differ');
  for (const field of ['qmd', 'model', 'tokenizer', 'modes']) {
    // A rerank arm intentionally adds its provisioned model; all retrieval and
    // accounting identities must otherwise match the unchanged control.
    assert.deepEqual(manifest[field], baselineManifest[field], `Comparison ${field} identities differ`);
  }
  assert.equal(scores.records.length, baseline.records.length);
  const freshForArm = row => ['discovery', 'discovery-identity'].includes(arm) ? row.fresh === true : arm === 'identity' ? (manifest.protocol === 'workspace-v4' ? /^(belltower|copperfin|mothlight)-/u.test(row.id) : /^(selkie|tamar)-/u.test(row.id)) : fresh(row);
  const deltas = scores.records.map(row => {
    const before = byId.get(row.id);
    assert.ok(before, `Missing paired case: ${row.id}`);
    return { id: row.id, journey: row.journey, split: row.split, fresh: freshForArm(row), protected: protectedCase(row), affected: affected(arm, row), before: complete(before), after: complete(row), beforeUnits: before.final.filter(u => u.covered).length, afterUnits: row.final.filter(u => u.covered).length, units: row.final.length, tokensBefore: before.cost.tokens, tokensAfter: row.cost.tokens, filesBefore: before.recallFiles, filesAfter: row.recallFiles,
      lostUnits: before.final.filter(unit => unit.covered && !row.final.find(after => after.label === unit.label)?.covered).map(unit => unit.label),
      candidatesBefore: before.candidateCoverage ?? null, candidatesAfter: row.candidateCoverage ?? null };
  });
  const affectedRows = deltas.filter(r => r.affected);
  arms.push({ arm, inputDigest: manifest.inputDigest, productDigest: manifest.productDigest, overall: scores.overall,
    affected: { cases: affectedRows.length, completeBefore: affectedRows.filter(r => r.before).length, completeAfter: affectedRows.filter(r => r.after).length, gainPoints: 100 * affectedRows.reduce((s,r) => s + Number(r.after) - Number(r.before), 0) / affectedRows.length },
    improved: deltas.filter(r => !r.before && r.after).map(r => r.id), regressed: deltas.filter(r => r.before && !r.after).map(r => r.id),
    unitRegressions: deltas.filter(r => r.afterUnits < r.beforeUnits).map(r => r.id),
    lostRequiredUnits: deltas.filter(r => r.lostUnits.length).map(r => ({ id: r.id, labels: r.lostUnits })),
    protectedRegressions: deltas.filter(r => r.protected && r.lostUnits.length).map(r => r.id),
    freshReservedImprovements: deltas.filter(r => r.fresh && r.split === 'reserved' && !r.before && r.after).map(r => r.id),
    tokenChangePercent: 100 * (scores.overall.interactionTokens / baseline.overall.interactionTokens - 1),
    provenancePass: baseline.overall.provenanceFailures === 0 && scores.overall.provenanceFailures === 0,
    byJourney: Object.fromEntries([...new Set(scores.records.map(r => r.journey))].map(journey => [journey, { baseline: summarize(baseline.records.filter(r => r.journey === journey)), arm: summarize(scores.records.filter(r => r.journey === journey)) }])), deltas });
}
await writeFile(output, JSON.stringify({ baseline: baseline.overall, arms, interpretation: 'Mechanical canonical required-span diagnostic. Same-author query-bound judgment must be recorded separately. No answer accuracy measured.' }, null, 2) + '\n');
for (const arm of arms) console.log(JSON.stringify({ arm: arm.arm, complete: arm.overall.finalAllRequiredSpans, affected: arm.affected, improved: arm.improved, regressed: arm.regressed, unitRegressions: arm.unitRegressions, freshReservedImprovements: arm.freshReservedImprovements, tokenChangePercent: arm.tokenChangePercent }));
