import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBudgets } from '../scripts/desktop-ram-report.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function suite() {
  const names=['cold-background','home','note-edit-save','graph-pan-zoom-resize','graph-exit','lexical-index','lexical-search','semantic-index','semantic-search','minimized','restored','closed-window','reopen','recovery','explicit-quit'];
  return {host:'electron',artifactVerified:true,settings:{counts:[100],repetitions:1,semantic:true},runs:[{
    run:'100-1',complete:true,descendantsExited:true,samples:1000,rejectedSamples:1,
    stages:names.map(name=>({name,end:1000,settled:{samples:100,median:100},active:{samples:10,max:200},
      detail:{results:5,readiness:{modes:['lexical','semantic']},retrieval:{status:'complete'}}})),
  }]};
}
const budgets={stages:{home:{settledBytes:120,activeBytes:250}}};

test('RAM budgets check settled and simultaneous active peaks independently',()=>{
  const summary=suite();
  assert.deepEqual(checkBudgets(summary,budgets).violations,[]);
  const home=summary.runs[0].stages.find(stage=>stage.name==='home');
  home.settled.median=121;home.active.max=251;
  assert.deepEqual(checkBudgets(summary,budgets).violations.map(v=>v.metric),['settled','active']);
});

test('RAM budget checks cannot pass a partial or empty measurement suite',()=>{
  const summary=suite();summary.settings.repetitions=3;
  assert.deepEqual(checkBudgets(summary,budgets).violations.map(v=>v.run),['100-2','100-3']);
  summary.settings.counts=[];summary.runs=[];
  assert.equal(checkBudgets(summary,budgets).violations[0].reason,'empty suite');
});

test('RAM checks require semantic stages and valid settled samples',()=>{
  const summary=suite();summary.runs[0].stages=summary.runs[0].stages.filter(stage=>stage.name!=='semantic-search');
  summary.runs[0].stages.find(stage=>stage.name==='home').settled.samples=0;
  assert.deepEqual(checkBudgets(summary,budgets).violations.map(v=>v.stage),['home','semantic-search']);
  summary.settings.semantic=false;
  assert.deepEqual(checkBudgets(summary,budgets).violations.map(v=>v.stage),['home']);
});

test('RAM checks reject surviving processes, raced samples, and failed runs',()=>{
  const summary=suite(),run=summary.runs[0];
  run.descendantsExited=false;run.rejectedSamples=20;
  assert.deepEqual(checkBudgets(summary,budgets).violations.map(v=>v.reason),['owned processes remain','insufficient complete samples']);
  run.complete=false;
  assert.equal(checkBudgets(summary,budgets).violations[0].reason,'incomplete');
});

test('RAM checks reject partial semantic retrieval even when semantic readiness exists',()=>{
  const summary=suite(),search=summary.runs[0].stages.find(stage=>stage.name==='semantic-search');
  search.detail.retrieval.status='partial';
  assert.equal(checkBudgets(summary,budgets).violations[0].stage,'semantic-search');
  search.detail.retrieval.status='complete';search.detail.readiness.modes=['lexical'];
  assert.equal(checkBudgets(summary,budgets).violations[0].stage,'semantic-search');
});

test('RAM budgets require successful post-run artifact verification even below all memory limits',()=>{
  for(const value of [undefined,false]) {
    const summary=suite();summary.artifactVerified=value;
    assert.deepEqual(checkBudgets(summary,budgets).violations,[{reason:'missing or failed post-run artifact verification'}]);
  }
});

test('empty corpora and the unindexed native prototype have explicit applicable stages',()=>{
  const summary=suite();summary.host='wkwebview';summary.settings.counts=[0];summary.settings.semantic=false;
  summary.runs[0].run='0-1';
  summary.runs[0].stages=summary.runs[0].stages.filter(stage=>!/^semantic|^lexical|^note-edit/.test(stage.name));
  assert.deepEqual(checkBudgets(summary,budgets).violations,[]);
  summary.settings.soakSeconds=1800;
  assert.equal(checkBudgets(summary,budgets).violations[0].stage,'soak');
});

test('corpus-specific budgets override shared stages and include reopen latency',()=>{
  const summary=suite(),home=summary.runs[0].stages.find(stage=>stage.name==='home');
  home.latencyMs=500;
  const limits={...budgets,corpora:{100:{stages:{home:{settledBytes:99,activeBytes:199,latencyMs:499}}}}};
  assert.deepEqual(checkBudgets(summary,limits).violations.map(v=>v.metric),['settled','active','latency']);
  assert.deepEqual(checkBudgets(summary,budgets).violations,[]);
});

test('RAM report streams simultaneous counters, excludes raced totals, and measures descendant drain',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-ram-report-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const run=path.join(root,'0-1');
  await import('node:fs/promises').then(fs=>fs.mkdir(run));
  const names=suite().runs[0].stages.map(stage=>stage.name).filter(name=>!['note-edit-save','semantic-index','semantic-search'].includes(name));
  const events=[],samples=[];
  const processes=[{pid:10,ppid:1,start:'1:0',name:'Electron',physical:60,rss:90,lifetimePeak:1000,cpuNs:1000},
    {pid:11,ppid:10,start:'1:1',name:'node',physical:40,rss:70,lifetimePeak:2000,cpuNs:2000}];
  for(const [index,name]of names.entries()) {
    const start=index*1000;
    events.push({type:'start',name,timeMs:start});
    if(name==='explicit-quit') {samples.push({timeMs:start+200,processes:[],complete:true,physical:0,rss:0,sampleMs:1});continue;}
    events.push({type:'operation-end',name,timeMs:start+300,latencyMs:300,
      detail:name==='lexical-search'?{results:0,readiness:{modes:['lexical']},retrieval:{status:'complete'}}:undefined},
      {type:'end',name,timeMs:start+900});
    for(const offset of [100,500])samples.push({timeMs:start+offset,processes,complete:true,physical:100,rss:160,sampleMs:1});
    samples.push({timeMs:start+600,processes,complete:false,physical:9999,rss:9999,sampleMs:1});
  }
  const manifest={source:{sha256:'source'},driver:{sha256:'driver'},settings:{counts:[0],repetitions:1,semantic:false},machine:{cpu:'test'},modelHash:null};
  await Promise.all([
    writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest)),
    writeFile(path.join(root,'verification.json'),'{"ok":true}'),
    writeFile(path.join(run,'events.jsonl'),events.map(JSON.stringify).join('\n')+'\n'),
    writeFile(path.join(run,'samples.jsonl'),samples.map(JSON.stringify).join('\n')+'\n'),
    writeFile(path.join(run,'result.json'),'{"ok":true}'),
    writeFile(path.join(run,'exit.json'),'{"code":0,"samplerCode":0}'),
  ]);
  const output=path.join(root,'summary.json'),report=fileURLToPath(new URL('../scripts/desktop-ram-report.mjs',import.meta.url));
  await promisify(execFile)(process.execPath,[report,'--input',root,'--output',output]);
  const summary=JSON.parse(await readFile(output,'utf8')),result=summary.runs[0];
  assert.equal(result.complete,true);assert.equal(result.sampledPeakBytes,100);
  assert.equal(result.rejectedSamples,names.length-1);
  assert.deepEqual(result.processes.map(p=>p.lifetimePeak),[1000,2000]);
  assert.equal(result.stages.find(stage=>stage.name==='home').rss.median,160);
  assert.equal(result.stages.at(-1).latencyMs,200);
  assert.equal(result.descendantsExited,true);
  const budgetsFile=path.join(root,'budgets.json');
  await writeFile(budgetsFile,JSON.stringify({maxRejectedSampleFraction:0.5,stages:{}}));
  await promisify(execFile)(process.execPath,[report,'--input',root,'--output',output,'--budgets',budgetsFile]);
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')).budgetCheck.violations,[]);
  await writeFile(budgetsFile,JSON.stringify({maxRejectedSampleFraction:0.5,stages:{home:{settledBytes:99}}}));
  await assert.rejects(promisify(execFile)(process.execPath,[report,'--input',root,'--output',output,'--budgets',budgetsFile]),{code:1});
  assert.ok(JSON.parse(await readFile(output,'utf8')).budgetCheck.violations.some(v=>v.stage==='home'&&v.metric==='settled'));
  await writeFile(budgetsFile,JSON.stringify({maxRejectedSampleFraction:0.5,stages:{}}));
  await rm(path.join(root,'verification.json'));
  await assert.rejects(promisify(execFile)(process.execPath,[report,'--input',root,'--output',output,'--budgets',budgetsFile]),{code:1});
  assert.deepEqual(JSON.parse(await readFile(output,'utf8')).budgetCheck.violations,[{reason:'missing or failed post-run artifact verification'}]);
  manifest.settings.counts=[0,10000];
  await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest));
  await promisify(execFile)(process.execPath,[report,'--input',root,'--output',output,'--counts','0']);
  const selected=JSON.parse(await readFile(output,'utf8'));
  assert.deepEqual(selected.settings.counts,[0]);
  assert.deepEqual(selected.selection,{recordedCounts:[0,10000],selectedCounts:[0]});
  await assert.rejects(promisify(execFile)(process.execPath,[report,'--input',root,'--output',output,'--counts','100']),{code:1});
});
