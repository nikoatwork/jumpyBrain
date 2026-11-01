import assert from 'node:assert/strict';
import {readFile}from'node:fs/promises';
import {assessReports,assertReviewedContract}from'./verify.mjs';
const contract=JSON.parse(await readFile(new URL('./design-contract.json',import.meta.url)));
const digest='test-corpus-hash';
const reports=Object.fromEntries(contract.comparisons.map(item=>[item.key,{
  version:1,candidate:item.candidate,status:item.expectedStatus,corpusSha256:digest,
  cases:item.requiredIds.map(id=>({id,status:item.counterexamples.includes(id)?'counterexample':'passed',
    ...(id.includes('exhaustive-independent')?{arrivalOrders:2304}:{})})),
  metrics:{sourceModelDependencies:0,historyLimit:128,maxDocumentBytes:65536,maxActors:32,maxStreams:16},
}]));
let checks=0;
assert.throws(()=>assertReviewedContract(Buffer.from('changed contract')),/independently reviewed/);checks++;
assert.throws(()=>assertReviewedContract(Buffer.from('changed contract'),'0'.repeat(64)),/independently reviewed/);checks++;
assert.equal(assessReports(contract,reports,digest).length,4);checks++;
for(const key of ['native','source','durability','integration']) {
  const missing=structuredClone(reports);delete missing[key];
  assert.throws(()=>assessReports(contract,missing,digest),/evidence/);checks++;
}
for(const status of ['error','skipped','todo','failed']) {
  const failed=structuredClone(reports);failed.source.cases[0].status=status;
  assert.throws(()=>assessReports(contract,failed,digest),/Unexpected/);checks++;
}
const casesMissing=structuredClone(reports);casesMissing.source.cases.pop();
assert.throws(()=>assessReports(contract,casesMissing,digest),/Required scenario missing/);checks++;
const duplicates=structuredClone(reports);duplicates.durability.cases.push(duplicates.durability.cases[0]);
assert.throws(()=>assessReports(contract,duplicates,digest),/Duplicate/);checks++;
const stale=structuredClone(reports);stale.source.corpusSha256='different';
assert.throws(()=>assessReports(contract,stale,digest),/stale/);checks++;
const property=structuredClone(reports);property.source.cases.find(c=>c.id.includes('exhaustive-independent')).arrivalOrders=0;
assert.throws(()=>assessReports(contract,property,digest),/property coverage/);checks++;
delete property.source.cases.find(c=>c.id.includes('exhaustive-independent')).arrivalOrders;
assert.throws(()=>assessReports(contract,property,digest),/property coverage/);checks++;
const unbounded=structuredClone(reports);unbounded.source.metrics.maxStreams=1000000;
assert.throws(()=>assessReports(contract,unbounded,digest),/resource/);checks++;
delete unbounded.source.metrics.maxStreams;
assert.throws(()=>assessReports(contract,unbounded,digest),/resource/);checks++;
const negative=structuredClone(reports);
negative.native.cases.find(c=>c.status==='counterexample').status='passed';
assert.throws(()=>assessReports(contract,negative,digest),/Unexpected|negative control/);checks++;
const empty=structuredClone(reports);empty.source.cases=[];
assert.throws(()=>assessReports(contract,empty,digest),/Empty scenario/);checks++;
console.log(JSON.stringify({version:1,status:'passed',negativeAndContractChecks:checks}));
