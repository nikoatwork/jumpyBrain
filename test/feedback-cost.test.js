import assert from 'node:assert/strict';
import test from 'node:test';
import { costSchedule, summarizeCosts, REPRESENTATIVE_FREEZE } from '../evals/workspace-retrieval/run-feedback-cost.mjs';

const records = () => costSchedule().map(call => ({ ...call, ok: true, operationMs: call.arm === 'baseline' ? 100 : 109,
  peakTreeKiB: (call.arm === 'baseline' ? 500 : 549) * 1024, rssSampleCount: 3, rssSamplingFailed: false }));

test('fixed operating schedule warms every representative once per arm, then alternates twenty pairs', () => {
  const schedule = costSchedule();
  assert.equal(schedule.length, 52);
  for (const arm of ['baseline', 'candidate']) for (let index = 0; index < 6; index++) assert.equal(schedule.filter(call => call.phase === 'warmup' && call.arm === arm && call.queryIndex === index).length, 1);
  for (let pair = 0; pair < 20; pair++) {
    const calls = schedule.filter(call => call.phase === 'measured' && call.pair === pair);
    assert.deepEqual(calls.map(call => call.arm), pair % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']);
    assert.deepEqual(calls.map(call => call.queryIndex), [pair % 6, pair % 6]);
  }
});

test('each arm has three frozen affected queries and three existing controls with hashes', () => {
  for (const arm of ['eligibility', 'vector-only']) {
    const selected = REPRESENTATIVE_FREEZE[arm];
    assert.equal(new Set(selected.map(row => row[0])).size, 6);
    assert.equal(selected.filter(row => row[2] === 'affected').length, 3);
    assert.equal(selected.filter(row => row[2] === 'control').length, 3);
    assert.ok(selected.every(row => /^[a-f0-9]{64}$/.test(row[1])));
  }
});

test('quiet operating thresholds enforce ten percent latency and fifty MiB sampled RSS', () => {
  const passing = summarizeCosts(records());
  assert.equal(passing.operatingGatesPass, true);
  assert.equal(passing.maximumPairedIncreaseMiB, 49);
  const slow = records().map(row => ({ ...row, operationMs: row.arm === 'candidate' ? 111 : row.operationMs }));
  assert.equal(summarizeCosts(slow).operatingGatesPass, false);
  const memory = records().map(row => ({ ...row, peakTreeKiB: row.arm === 'candidate' ? 551 * 1024 : row.peakTreeKiB }));
  assert.equal(summarizeCosts(memory).operatingGatesPass, false);
});

test('failed, missing, duplicated warmups and insufficient RSS observations block passing', () => {
  const failed = records(); failed[0].ok = false;
  assert.equal(summarizeCosts(failed).operatingGatesPass, false);
  assert.equal(summarizeCosts(records().slice(1)).operatingGatesPass, false);
  const duplicate = records(); duplicate[0].queryIndex = 1;
  assert.equal(summarizeCosts(duplicate).operatingGatesPass, false);
  const sampling = records(); sampling[20].rssSamplingFailed = true;
  assert.equal(summarizeCosts(sampling).operatingGatesPass, false);
  const tooFew = records(); tooFew[20].rssSampleCount = 1;
  assert.equal(summarizeCosts(tooFew).operatingGatesPass, false);
});
