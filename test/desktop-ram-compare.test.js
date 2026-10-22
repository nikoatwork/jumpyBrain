import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSuites, proposeBudgets } from '../scripts/desktop-ram-compare.mjs';
import { checkBudgets } from '../scripts/desktop-ram-report.mjs';

function suite() {
  const names=['cold-background','home','graph-pan-zoom-resize','graph-exit','lexical-index','lexical-search','minimized','restored','closed-window','reopen','recovery','explicit-quit'];
  return {host:'electron',artifactVerified:true,machine:{cpu:'test'},settings:{counts:[0],repetitions:3,semantic:false},
    driverSha256:'same-driver',samplerSha256:'same-sampler',modelHash:null,engines:{qmd:'same-package',electron:'same-electron',node:'same-node'},sourceSha256:'source',
    runs:[1,2,3].map(repetition=>({run:`0-${repetition}`,complete:true,descendantsExited:true,samples:1000,rejectedSamples:0,
      stages:names.map(name=>({name,end:1000,latencyMs:100,activeCpuNs:1000000,roles:{gateway:{median:20}},detail:{results:0,readiness:{modes:['lexical']},retrieval:{status:'complete'}},
        settled:{samples:100,median:100+repetition},active:{samples:10,max:200+repetition}}))}))};
}

test('comparison uses replicate medians/ranges and rejects unmatched execution inputs',()=>{
  const before=suite(),after=suite();after.sourceSha256='changed-source';
  after.runs[1].stages.find(s=>s.name==='home').settled.median=90;
  const result=compareSuites(before,after),home=result.comparisons.find(s=>s.stage==='home');
  assert.deepEqual(home.baseline.settledBytes,{median:102,min:101,max:103});
  assert.deepEqual(home.optimized.settledBytes,{median:101,min:90,max:103});
  assert.equal(home.settledChangeBytes,-1);
  for(const key of ['driverSha256','samplerSha256','modelHash','engines','machine']) {
    const changed=suite();changed[key]='different';
    assert.throws(()=>compareSuites(before,changed),/Unmatched|incomplete artifact identities/);
  }
});

test('comparison refuses missing repetitions and failed lifecycle coverage',()=>{
  const before=suite(),after=suite();after.runs.pop();
  assert.throws(()=>compareSuites(before,after),/incomplete workload coverage/);
  after.runs=structuredClone(before.runs);after.runs[0].stages.find(s=>s.name==='home').telemetry={windows:1,renderer:{scale:1,viewport:[1280,820]}};
  assert.throws(()=>compareSuites(before,after),/Unmatched window/);
  after.runs=structuredClone(before.runs);after.artifactVerified=false;
  assert.throws(()=>compareSuites(before,after),/post-run artifact verification/);
  after.artifactVerified=true;after.runs=structuredClone(before.runs);after.runs[0].stages.pop();
  assert.throws(()=>compareSuites(before,after),/incomplete workload coverage/);
});

test('proposed budgets cover all corpora and enforce the measured machine/workload scope',()=>{
  const summary=suite(),comparison=compareSuites(summary,summary),budgets=proposeBudgets(comparison);
  assert.ok(budgets.corpora[0].stages.home.settledBytes>103);
  assert.deepEqual(checkBudgets(summary,budgets).violations,[]);
  summary.settings.repetitions=1;
  assert.ok(checkBudgets(summary,budgets).violations.some(v=>v.reason==='unmatched budget scope'));
});
