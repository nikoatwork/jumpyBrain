import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readProductionContract,assertIntegrationHead,productionSourceMap,readPinnedLinuxReport,assertDesktopArtifact,assessProductionCheck} from '../scripts/multiplayer-production-verify.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),json=value=>JSON.stringify(value,null,2)+'\n';
const contractFile=new URL('../deep-dives/multiplayer-editing/production-gate-contract.json',import.meta.url);
async function directory(t){const root=await mkdtemp(path.join(os.tmpdir(),'jb-production-gate-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
async function save(root,name,value){const file=path.join(root,name),bytes=json(value);await writeFile(file,bytes);return{file,pin:sha(bytes)};}
test('production contract has an external pin and retains all checks, original M0 and budget floors',async t=>{
  const bytes=await readFile(contractFile),contract=await readProductionContract(contractFile,sha(bytes));assert.equal(contract.checks.length,7);
  await assert.rejects(readProductionContract(contractFile),/externally pinned/);await assert.rejects(readProductionContract(contractFile,'a'.repeat(64)),/digest disagrees/);
  const root=await directory(t);
  for(const mutate of [value=>value.checks.pop(),value=>value.protectedM0.baselineSha256='a'.repeat(64),value=>value.workloadAcceptance.canonicalP95Ms=10000,value=>value.checks.find(item=>item.id==='shared-workload').workload.humans=2]){
    const value=structuredClone(contract);mutate(value);const saved=await save(root,'changed.json',value);await assert.rejects(readProductionContract(saved.file,saved.pin),/weakened/);
  }
});
test('integration must be clean, contain current target and retain exact HEAD and target during verification',async t=>{
  const root=await directory(t),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'}).trim();git(['init','-q','-b','master']);git(['config','user.name','Production Fixture']);git(['config','user.email','gate@example.invalid']);
  const commit=async(value)=>{await writeFile(path.join(root,'source.js'),value);git(['add','.']);git(['-c','user.name=Production Fixture','-c','user.email=gate@example.invalid','-c','commit.gpgsign=false','commit','-qm','Fixture']);};
  await commit('original');git(['checkout','-qb','candidate']);await commit('candidate');const original=await assertIntegrationHead(root,'master');
  await assert.rejects(assertIntegrationHead(root,'master',{expectedHead:'0'.repeat(40)}),/expected HEAD/);
  await writeFile(path.join(root,'source.js'),'dirty');await assert.rejects(assertIntegrationHead(root,'master'),/must be clean/);await writeFile(path.join(root,'source.js'),'candidate');
  git(['checkout','-q','master']);await commit('advanced target');git(['checkout','-q','candidate']);await assert.rejects(assertIntegrationHead(root,'master'),/does not contain/);
  git(['merge','--no-edit','-s','ours','master']);await assert.rejects(assertIntegrationHead(root,'master',{previous:original}),/moved during/);
});
async function linuxFixture(t){
  const root=await directory(t),source={'src/file.js':sha('source')},tap='# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  await mkdir(path.join(root,'runtime'));await writeFile(path.join(root,'runtime/file.js'),'tested runtime');await writeFile(path.join(root,'tests.log'),tap);
  const artifacts={'runtime/file.js':sha('tested runtime'),'tests.log':sha(tap)},report={version:1,status:'passed',sourceStable:true,source,sourceMapSha256:sha(json(source)),artifacts,artifactMapSha256:sha(json(artifacts)),expectedNode:'v22.23.4',container:{status:'passed',platform:'linux',node:'v22.23.4'},execution:{code:0,timedOut:false,overflow:false},image:{digest:'node@sha256:'+'a'.repeat(64)},observation:{tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0}};
  const saved=await save(root,'report.json',report);return{root,source,report,...saved};
}
test('Linux report reuse verifies external pin, current source, full artifact bytes and zero-skip TAP',async t=>{
  const f=await linuxFixture(t);await readPinnedLinuxReport(f.file,f.pin,f.source,{major:22});
  await assert.rejects(readPinnedLinuxReport(f.file,'b'.repeat(64),f.source,{major:22}),/digest disagrees/);
  await assert.rejects(readPinnedLinuxReport(f.file,f.pin,{'src/file.js':sha('new source')},{major:22}),/different current source/);
  await assert.rejects(readPinnedLinuxReport(f.file,f.pin,f.source,{major:26}),/incomplete/);
  await writeFile(path.join(f.root,'runtime/file.js'),'tampered');await assert.rejects(readPinnedLinuxReport(f.file,f.pin,f.source,{major:22}),/Pinned Linux artifact changed/);
});
test('old, skipped or incomplete Linux receipts and unrecorded artifacts cannot pass',async t=>{
  const f=await linuxFixture(t);
  for(const mutate of [value=>value.sourceStable=false,value=>value.observation.skipped=1,value=>value.observation.tests=0,value=>value.container.status='blocked',value=>value.execution.timedOut=true]){const value=structuredClone(f.report);mutate(value);const saved=await save(f.root,'report.json',value);await assert.rejects(readPinnedLinuxReport(saved.file,saved.pin,f.source,{major:22}),/incomplete/);}
  const saved=await save(f.root,'report.json',f.report);await writeFile(path.join(f.root,'unrecorded.js'),'not part of tested inputs');await assert.rejects(readPinnedLinuxReport(saved.file,saved.pin,f.source,{major:22}),/Unrecorded/);
});
test('packaged desktop requires exact current runtime bytes and successful signature verification',async t=>{
  const root=await directory(t),resources=path.join(root,'Fixture.app','Contents','Resources'),dist=path.join(resources,'runtime','dist');await mkdir(dist,{recursive:true});await writeFile(path.join(dist,'file.js'),'current');
  const artifact={'dist/file.js':sha('current')},verifySignature=()=> 'verified fixture signature',verifySource=()=>({'application.mjs':'fixture-source'});
  const result=await assertDesktopArtifact(root,resources,artifact,{verifySignature,verifySource});assert.equal(result.signature,'verified fixture signature');
  await assert.rejects(assertDesktopArtifact(root,resources,artifact,{verifySource,verifySignature(){throw new Error('unsigned');}}),/unsigned/);
  await assert.rejects(assertDesktopArtifact(root,resources,artifact,{verifySignature,verifySource(){throw new Error('stale packaged shell');}}),/stale packaged shell/);
  await writeFile(path.join(dist,'file.js'),'stale');await assert.rejects(assertDesktopArtifact(root,resources,artifact,{verifySignature,verifySource}),/Packaged desktop runtime/);
  await assert.rejects(assertDesktopArtifact(root,resources,{}, {verifySignature}),/nonempty/);
});
test('production workload checks require current HEAD/build, correct actor mix, actual metrics and preserved budgets',async()=>{
  const contract=JSON.parse(await readFile(contractFile)),check=contract.checks.find(value=>value.id==='local-workload');
  const data={version:1,passed:true,actors:3,humans:2,rounds:20,seed:1592594996,canonicalNotes:129,checks:{canonicalP95:true,peakRss:true,history:true,queue:true},acceptance:contract.workloadAcceptance,observations:{canonicalP95Ms:10,maxRssKiB:1024,canonicalRpcCount:20},resources:{peaks:{historyBytes:100,queuedBytes:0}},environment:{head:'current',verifiedBuild:{build:'build'},concurrency:'serial-production-gate'}};
  const assess=value=>assessProductionCheck(check,{code:0,output:json(value)},{head:'current',build:'build'});
  assert.equal(assess(data).status,'passed');
  for(const mutate of [value=>value.environment.head='old',value=>value.environment.verifiedBuild.build='old',value=>value.humans=1,value=>value.checks.history=false,value=>value.acceptance.canonicalP95Ms=10000,value=>delete value.observations,value=>value.observations.canonicalP95Ms=1001]){const value=structuredClone(data);mutate(value);assert.equal(assess(value).status,'failed');}
  assert.equal(assessProductionCheck(check,{code:1,output:json(data)},{head:'current',build:'build'}).status,'failed');
});
test('Linux/current-source inventory is byte-sensitive and excludes only declared derived/dependency trees',async t=>{
  const root=await directory(t);await mkdir(path.join(root,'src'));await mkdir(path.join(root,'src','node_modules'));await writeFile(path.join(root,'src/file.js'),'one');await writeFile(path.join(root,'src/node_modules/dependency.js'),'ignored');
  const contract={linuxSourceRoots:['src'],linuxIgnoredNames:['node_modules']},first=await productionSourceMap(root,contract);assert.deepEqual(Object.keys(first),['src/file.js']);
  await writeFile(path.join(root,'src/file.js'),'two');assert.notDeepEqual(await productionSourceMap(root,contract),first);
});
