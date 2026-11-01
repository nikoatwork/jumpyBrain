import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runGate, readBaseline } from '../scripts/multiplayer-verify.mjs';
import { readContractDelta, validateContractDelta, proposeContractDelta, discoverAssertionHelpers, assertExtraAssertionDeclarations } from '../scripts/multiplayer-verification/contract-delta.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const baselineSha='a'.repeat(64), before='b'.repeat(64), after='c'.repeat(64);
const entry=(kind='assertion',file='test/source.test.js',oldSha256=before,newSha256=after)=>({kind,file,oldSha256,newSha256,reason:'Preserve the original behavior while adapting its transport fixture.',scenarioIds:['P01'],evidence:['test/source.test.js retains its canonical-content assertions.']});
const declaration=entries=>({version:1,status:'reviewed',baselineSha256:baselineSha,entries});
const frozen={assertions:{'test/source.test.js':before},harness:{'scripts/multiplayer-verify.mjs':before},checks:[{scenarioIds:['P01']}]};
async function temporary(t) {const directory=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-contract-delta-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
async function saveDelta(directory,value,name='delta.json'){const file=path.join(directory,name),bytes=JSON.stringify(value,null,2)+'\n';await writeFile(file,bytes);return {file,sha256:sha(bytes)};}
test('delta requires an external pin and a reviewed declaration bound to the original baseline', async t=>{
  const directory=await temporary(t),value=declaration([entry()]),saved=await saveDelta(directory,value);
  await assert.rejects(readContractDelta(saved.file,undefined,{baselineSha256:baselineSha}),/externally pinned/);
  await assert.rejects(readContractDelta(saved.file,'d'.repeat(64),{baselineSha256:baselineSha}),/pinned digest/);
  await assert.rejects(readContractDelta(saved.file,saved.sha256,{baselineSha256:'e'.repeat(64)}),/pinned original baseline/);
  const loaded=await readContractDelta(saved.file,saved.sha256,{baselineSha256:baselineSha});assert.deepEqual(loaded.declaration,value);
  const draft=await saveDelta(directory,{...value,status:'draft'},'draft.json');
  await assert.rejects(readContractDelta(draft.file,draft.sha256,{baselineSha256:baselineSha}),/reviewed/);
  await writeFile(saved.file,JSON.stringify({...value,entries:[{...entry(),reason:'Changed after pinning.'}]}));
  await assert.rejects(readContractDelta(saved.file,saved.sha256,{baselineSha256:baselineSha}),/pinned digest/);
});
test('every changed old/new assertion and harness hash is exact, with unused and missing entries rejected',()=>{
  const assertions={'test/source.test.js':after},harness={'scripts/multiplayer-verify.mjs':after};
  const valid={declaration:declaration([entry(),entry('harness','scripts/multiplayer-verify.mjs')])};
  assert.equal(validateContractDelta({frozen,assertions,harness,delta:valid}).changed.length,2);
  assert.throws(()=>validateContractDelta({frozen,assertions,harness}),/without an explicitly pinned/);
  for(const key of ['oldSha256','newSha256']) {
    const wrong=structuredClone(valid);wrong.declaration.entries[0][key]='f'.repeat(64);
    assert.throws(()=>validateContractDelta({frozen,assertions,harness,delta:wrong}),/old\/new fingerprints/);
  }
  assert.throws(()=>validateContractDelta({frozen,assertions:{},harness,delta:valid}),/cannot remove/);
  assert.throws(()=>validateContractDelta({frozen,assertions:frozen.assertions,harness:frozen.harness,delta:valid}),/Unused/);
  const unknown=structuredClone(valid);unknown.declaration.entries[0].scenarioIds=['P99'];
  assert.throws(()=>validateContractDelta({frozen,assertions,harness,delta:unknown}),/unknown original scenario/);
});
test('new assertions are additive but new executable harness helpers require explicitly pinned null-old entries',()=>{
  const assertions={...frozen.assertions,'test/new-source.test.js':after},helper='scripts/multiplayer-verification/new-helper.mjs',harness={...frozen.harness,[helper]:after};
  const additive=validateContractDelta({frozen,assertions,harness:frozen.harness});assert.deepEqual(additive.additions.assertions,['test/new-source.test.js']);
  assert.throws(()=>validateContractDelta({frozen,assertions,harness}),/Frozen harness changed/);
  const result=validateContractDelta({frozen,assertions,harness,delta:{declaration:declaration([entry('harness',helper,null)])}});
  assert.equal(result.changed[0].oldSha256,null);assert.deepEqual(result.additions.harness,[helper]);
});
test('duplicate paths, missing reasons/mappings and traversal declarations fail validation',async t=>{
  const directory=await temporary(t);
  for(const entries of [[entry(),entry()],[{...entry(),reason:''}],[{...entry(),scenarioIds:[]}],[{...entry(),evidence:[]}],[{...entry(),file:'../escape.js'}],[{...entry(),oldSha256:'invalid'}]]) {
    const saved=await saveDelta(directory,declaration(entries));await assert.rejects(readContractDelta(saved.file,saved.sha256,{baselineSha256:baselineSha}),/entries require/);
  }
});
test('proposal generation never fills approval, reasons or coverage and cannot authorize removals',()=>{
  const helper='scripts/multiplayer-verification/new-helper.mjs';
  const draft=proposeContractDelta({frozen,baselineSha256:baselineSha,assertions:{'test/source.test.js':after},harness:{...frozen.harness,[helper]:after}});
  assert.equal(draft.status,'draft');assert.equal(draft.entries.length,2);assert.ok(draft.entries.every(item=>item.reason===''&&!item.scenarioIds.length&&!item.evidence.length));
  assert.throws(()=>proposeContractDelta({frozen,baselineSha256:baselineSha,assertions:{},harness:frozen.harness}),/removed frozen/);
});

async function gateFixture(t,{scriptOracle=false}={}) {
  const directory=await temporary(t),root=path.join(directory,'source'),baseline=path.join(directory,'baseline');
  await mkdir(path.join(root,'src'),{recursive:true});await mkdir(path.join(root,'scripts'));await mkdir(path.join(root,'test'));
  await writeFile(path.join(root,'src/index.mjs'),"export const body='canonical';\n");
  await writeFile(path.join(root,'scripts/multiplayer-verify.mjs'),'// original fixture harness\n');
  const testSource=(scriptOracle?"import {marker} from '../scripts/smoke.mjs';\n":"")+"import assert from 'node:assert/strict';import fs from 'node:fs';fs.mkdirSync('dist',{recursive:true});fs.copyFileSync('src/index.mjs','dist/index.mjs');assert.equal((await import('../dist/index.mjs')).body,'canonical');"+(scriptOracle?"assert.equal(marker,'same');":"")+"console.log('# tests 2\\n# pass 2\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0');\n";
  await writeFile(path.join(root,'test/assertion.mjs'),testSource);
  await writeFile(path.join(root,'package.json'),JSON.stringify({scripts:{test:'preserved original test command'}}));
  if(scriptOracle)await writeFile(path.join(root,'scripts/smoke.mjs'),"export const marker='same';\n");
  const contract={version:1,assertionRoots:['test',...(scriptOracle?['scripts/smoke.mjs']:[])],checks:[{id:'semantic-fixture',scenarioIds:['P01'],command:['node','test/assertion.mjs'],timeoutMs:10000,tap:true}]};
  await writeFile(path.join(root,'contract.json'),JSON.stringify(contract));
  const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});git(['init','-q']);
  const commit=()=>{git(['add','.']);git(['-c','user.name=Delta Fixture','-c','user.email=delta@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture checkpoint']);};commit();
  const environment={node:process.version,npm:'fixture',platform:'fixture',arch:'fixture',qmd:{version:'fixture'},browser:'fixture',browserChannel:'fixture',semanticModelHash:null};
  const invoke=(mode,extra={})=>runGate({mode,root,...(mode==='verify'?{baseline}:{}),contractFile:'contract.json',out:path.join(directory,'run-'+Math.random().toString(16).slice(2)),probe:async()=>environment,log(){},...extra});
  const captured=await invoke('capture',{out:baseline});assert.equal(captured.status,'passed',JSON.stringify(captured));
  return {directory,root,baseline,baselineSha256:captured.manifestSha256,invoke,commit,testSource,environment};
}
test('gate records the reviewed delta without rewriting M0, preserves behavior checks, environment and command identity',async t=>{
  const f=await gateFixture(t),original=await readBaseline(f.baseline,f.baselineSha256),originalBytes=await readFile(path.join(f.baseline,'manifest.json'));
  await writeFile(path.join(f.root,'test/assertion.mjs'),'// equivalent fixture adaptation\n'+f.testSource);
  await writeFile(path.join(f.root,'scripts/multiplayer-verify.mjs'),'// reviewed new harness shape\n');
  const assertions={'test/assertion.mjs':sha(await readFile(path.join(f.root,'test/assertion.mjs')))},harness={'scripts/multiplayer-verify.mjs':sha(await readFile(path.join(f.root,'scripts/multiplayer-verify.mjs')))};
  const reviewed=proposeContractDelta({frozen:original,baselineSha256:f.baselineSha256,assertions,harness});reviewed.status='reviewed';
  for(const value of reviewed.entries)Object.assign(value,{reason:'Preserve the exact canonical-content assertion while adapting this fixture boundary.',scenarioIds:['P01'],evidence:['test/assertion.mjs asserts identical canonical body and executes the preserved TAP checks.']});
  const saved=await saveDelta(f.directory,reviewed),opts={baselineSha256:f.baselineSha256,deltaFile:saved.file,deltaSha256:saved.sha256};
  let result=await f.invoke('verify',{baselineSha256:f.baselineSha256});assert.equal(result.status,'blocked');
  result=await f.invoke('verify',opts);assert.equal(result.status,'passed',JSON.stringify(result));assert.equal(result.contractDelta.sha256,saved.sha256);assert.equal(result.contractDelta.changed.length,2);assert.deepEqual(result.contractDelta.declaration,reviewed);
  assert.equal(sha(await readFile(path.join(f.baseline,'manifest.json'))),sha(originalBytes));
  result=await f.invoke('verify',{...opts,probe:async()=>({...f.environment,browser:'different'})});assert.equal(result.status,'blocked');assert.match(result.error,/Controlled environment/);
  const pkgFile=path.join(f.root,'package.json');await writeFile(pkgFile,JSON.stringify({scripts:{test:'weakened replacement command'}}));
  result=await f.invoke('verify',opts);assert.equal(result.status,'blocked');assert.match(result.error,/npm test script changed/);
  await writeFile(pkgFile,JSON.stringify({scripts:{test:'preserved original test command'}}));
  await writeFile(path.join(f.root,'src/index.mjs'),"export const body='regression';\n");f.commit();
  result=await f.invoke('verify',opts);assert.equal(result.status,'failed',JSON.stringify(result));assert.equal(result.checks[0].status,'failed');
});
test('extra script helpers require reachable explicit null-old pins, retain exact hashes, and are copied into candidate evidence',async t=>{
  const f=await gateFixture(t,{scriptOracle:true}),original=await readBaseline(f.baseline,f.baselineSha256),smoke='scripts/smoke.mjs',helper='scripts/transport-helper.mjs';
  await writeFile(path.join(f.root,smoke),"export {marker} from './transport-helper.mjs';\n");await writeFile(path.join(f.root,helper),"export const marker='same';\n");f.commit();
  const helpers=await discoverAssertionHelpers(f.root,Object.keys(original.assertions));assert.deepEqual(helpers,[helper]);
  const assertions={...original.assertions,[smoke]:sha(await readFile(path.join(f.root,smoke))),[helper]:sha(await readFile(path.join(f.root,helper)))};
  const value=proposeContractDelta({frozen:original,baselineSha256:f.baselineSha256,assertions,harness:original.harness,extraAssertions:helpers});value.status='reviewed';
  for(const item of value.entries)Object.assign(item,{reason:'Preserve the original smoke oracle while explicitly pinning its newly extracted transport fixture.',scenarioIds:['P01'],evidence:['scripts/smoke.mjs retains marker equality through scripts/transport-helper.mjs.']});
  assert.equal(value.entries.find(item=>item.file===helper).oldSha256,null);
  let saved=await saveDelta(f.directory,{...value,entries:value.entries.filter(item=>item.file!==helper)},'omitted.json');
  let result=await f.invoke('verify',{baselineSha256:f.baselineSha256,deltaFile:saved.file,deltaSha256:saved.sha256});assert.equal(result.status,'blocked');assert.match(result.error,/helper requires.*null-old/);
  saved=await saveDelta(f.directory,value,'complete.json');const opts={baselineSha256:f.baselineSha256,deltaFile:saved.file,deltaSha256:saved.sha256};
  const out=path.join(f.directory,'approved-candidate');result=await f.invoke('verify',{...opts,out});assert.equal(result.status,'passed',JSON.stringify(result));
  const candidate=await readBaseline(out,result.manifestSha256);assert.equal(candidate.assertions[helper],assertions[helper]);assert.equal(await readFile(path.join(out,'assertions',helper),'utf8'),"export const marker='same';\n");
  await writeFile(path.join(f.root,helper),"export const marker='changed';\n");f.commit();result=await f.invoke('verify',opts);assert.equal(result.status,'blocked');assert.match(result.error,/old\/new fingerprints/);
  await rm(path.join(f.root,helper));result=await f.invoke('verify',opts);assert.equal(result.status,'blocked');assert.match(result.error,/ENOENT|missing/);
  assert.throws(()=>assertExtraAssertionDeclarations({frozen:original,assertionFiles:Object.keys(original.assertions),extraAssertions:[],delta:{declaration:value}}),/Unused or invalid/);
  assert.throws(()=>assertExtraAssertionDeclarations({frozen:original,assertionFiles:[...Object.keys(original.assertions),helper],extraAssertions:[helper],delta:{declaration:value}}),/outside original roots/);
});
test('extra helper changes during execution cannot be frozen as the tested oracle',async t=>{
  const f=await gateFixture(t,{scriptOracle:true}),original=await readBaseline(f.baseline,f.baselineSha256),smoke='scripts/smoke.mjs',helper='scripts/transport-helper.mjs';
  await writeFile(path.join(f.root,smoke),"export {marker} from './transport-helper.mjs';\n");
  await writeFile(path.join(f.root,helper),"import fs from 'node:fs';fs.writeFileSync(new URL(import.meta.url),'// changed while check executed');export const marker='same';\n");f.commit();
  const assertions={...original.assertions,[smoke]:sha(await readFile(path.join(f.root,smoke))),[helper]:sha(await readFile(path.join(f.root,helper)))};
  const value=proposeContractDelta({frozen:original,baselineSha256:f.baselineSha256,assertions,harness:original.harness,extraAssertions:[helper]});value.status='reviewed';
  for(const item of value.entries)Object.assign(item,{reason:'Exercise oracle stability while the extracted helper intentionally changes during execution.',scenarioIds:['P01'],evidence:['This negative test requires the gate to reject changed helper bytes.']});
  const saved=await saveDelta(f.directory,value),result=await f.invoke('verify',{baselineSha256:f.baselineSha256,deltaFile:saved.file,deltaSha256:saved.sha256});
  assert.equal(result.status,'blocked');assert.match(result.error,/Assertion input during run/);
});
