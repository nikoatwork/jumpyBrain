import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

export function checkBudgets(summary, budgets) {
  const violations=[];
  for(const key of ['machine','settings','modelHash']) {
    if(budgets.scope?.[key]!==undefined&&!isDeepStrictEqual(summary[key],budgets.scope[key]))violations.push({reason:'unmatched budget scope',field:key});
  }
  const expected=[];
  for(const count of summary.settings.counts) for(let repetition=1;repetition<=summary.settings.repetitions;repetition++) expected.push(`${count}-${repetition}`);
  if(!expected.length) violations.push({reason:'empty suite'});
  for(const name of expected) if(!summary.runs.some(run=>run.run===name)) violations.push({run:name,reason:'missing run'});
  for(const run of summary.runs) {
    if(!expected.includes(run.run)) violations.push({run:run.run,reason:'unexpected run'});
    if(!run.complete){violations.push({run:run.run,reason:'incomplete'});continue;}
    if(!run.descendantsExited) violations.push({run:run.run,reason:'owned processes remain'});
    if(!run.samples || run.rejectedSamples/run.samples > (budgets.maxRejectedSampleFraction??0.01)) violations.push({run:run.run,reason:'insufficient complete samples'});
    const required=['cold-background','home','graph-pan-zoom-resize','graph-exit','minimized','restored','closed-window','reopen','recovery','explicit-quit'];
    if(Number(run.run.split('-')[0])) required.push('note-edit-save');
    if(summary.host!=='wkwebview') {
      required.push('lexical-index','lexical-search');
      if(summary.settings.semantic) required.push('semantic-index','semantic-search');
    }
    if(summary.settings.soakSeconds) required.push('soak');
    for(const name of required) {
      const stage=run.stages.find(stage=>stage.name===name);
      if(!stage || !Number.isFinite(stage.end) || (!['soak','explicit-quit'].includes(name) && !stage.settled.samples)) violations.push({run:run.run,stage:name,reason:'missing completed stage or settled samples'});
    }
    if(summary.host!=='wkwebview')for(const mode of summary.settings.semantic?['lexical','semantic']:['lexical']) {
      const search=run.stages.find(stage=>stage.name===mode+'-search');
      if(search&&(!search.detail?.readiness?.modes?.includes(mode)||search.detail?.retrieval?.status!=='complete'
        ||(Number(run.run.split('-')[0])&&!(search.detail?.results>0))))violations.push({run:run.run,stage:mode+'-search',reason:'retrieval mode unavailable, partial, or missing expected results'});
    }
    for(const stage of run.stages) {
      const budget=budgets.corpora?.[run.run.split('-')[0]]?.stages?.[stage.name]??budgets.stages?.[stage.name];if(!budget)continue;
      for(const [metric,actual,maximum]of [['settled',stage.settled.median,budget.settledBytes],['active',stage.active.max,budget.activeBytes],['latency',stage.latencyMs??null,budget.latencyMs]]) {
        if(maximum!==undefined && (!Number.isFinite(maximum)||maximum<=0)) throw new Error(`Invalid ${metric} budget for ${stage.name}`);
        if(actual!==null&&maximum!==undefined&&actual>maximum)violations.push({run:run.run,stage:stage.name,metric,actual,maximum});
      }
    }
  }
  return {violations};
}

async function main() {
const {values}=parseArgs({options:{input:{type:'string'},output:{type:'string'},budgets:{type:'string'},counts:{type:'string'}}});
if(!values.input||!values.output)throw new Error('Use --input SUITE --output SUMMARY.json [--budgets FILE]');
const suite=path.resolve(values.input),manifest=JSON.parse(await readFile(path.join(suite,'manifest.json'),'utf8'));
const selectedCounts=values.counts?values.counts.split(',').map(Number):manifest.settings.counts;
if(!selectedCounts.length||new Set(selectedCounts).size!==selectedCounts.length||!selectedCounts.every(count=>manifest.settings.counts.includes(count)))throw new Error('Report counts must select distinct recorded corpora');
const quantile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?sorted[Math.min(sorted.length-1,Math.floor(q*(sorted.length-1)))]:null;};
const stats=values=>({samples:values.length,median:quantile(values,.5),p95:quantile(values,.95),max:values.length?Math.max(...values):null});
const runs=[];
for(const name of (await readdir(suite)).filter(name=>/^\d+-\d+$/.test(name)).sort()) {
  if(!selectedCounts.includes(Number(name.split('-')[0])))continue;
  const directory=path.join(suite,name);
  let result;try{result=JSON.parse(await readFile(path.join(directory,'result.json'),'utf8'));}catch{runs.push({run:name,complete:false});continue;}
  const events=(await readFile(path.join(directory,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  const stages=events.filter(e=>e.type==='start').map(e=>{
    const operation=events.find(n=>n.type==='operation-end'&&n.name===e.name&&n.timeMs>=e.timeMs);
    const end=events.find(n=>n.type==='end'&&n.name===e.name&&n.timeMs>=e.timeMs);
    return {name:e.name,start:e.timeMs,operationEnd:operation?.timeMs,end:end?.timeMs??(e.name==='explicit-quit'?Infinity:undefined),latencyMs:operation?.latencyMs,detail:operation?.detail,
      telemetry:end?.telemetry,active:[],settled:[],rss:[],processCounts:[],trend:[],roles:{},activeCpuNs:0,settledCpuNs:0,rejected:0};
  });
  const roles=new Map();
  for(const e of events) for(const p of e.telemetry?.processes??[])roles.set(p.pid,p.type);
  let all=0,rejected=0,last,peak=0,samplingMs=0;const identities=new Map(),previousCpu=new Map();
  for await(const line of createInterface({input:createReadStream(path.join(directory,'samples.jsonl')),crlfDelay:Infinity})) {
    const s=JSON.parse(line);all++;samplingMs+=s.sampleMs;last=s;
    let cpuDelta=0;
    for(const p of s.processes){
      const key=p.pid+':'+p.start;
      if(!identities.has(key))identities.set(key,{pid:p.pid,start:p.start,name:p.name,first:s.timeMs,last:s.timeMs,lifetimePeak:p.lifetimePeak,sampledPhysicalMax:0});
      const entry=identities.get(key);entry.last=s.timeMs;entry.lifetimePeak=Math.max(entry.lifetimePeak||0,p.lifetimePeak||0);
      if(p.physical>entry.sampledPhysicalMax){entry.sampledPhysicalMax=p.physical;entry.sampledPhysicalMaxAt=s.timeMs;}
      if(Number.isFinite(p.cpuNs)){cpuDelta+=Math.max(0,p.cpuNs-(previousCpu.get(key)??0));previousCpu.set(key,p.cpuNs);entry.sampledCpuNs=p.cpuNs;}
    }
    if(!s.complete){rejected++;continue;}peak=Math.max(peak,s.physical);
    for(const stage of stages) if(s.timeMs>=stage.start&&s.timeMs<=(stage.end??stage.operationEnd??stage.start)) {
      const settled=stage.name==='recovery'?s.timeMs>stage.end-60000:s.timeMs>=stage.operationEnd;
      (settled?stage.settled:stage.active).push(s.physical);stage.rss.push(s.rss);
      stage.processCounts.push(s.processes.length);
      if(stage.name==='soak') {
        const bucket=Math.floor((s.timeMs-stage.start)/300000);
        (stage.trend[bucket]??={minute:bucket*5,physical:[],processCounts:[]}).physical.push(s.physical);
        stage.trend[bucket].processCounts.push(s.processes.length);
      }
      stage[settled?'settledCpuNs':'activeCpuNs']+=cpuDelta;
      if(settled) {
        const roleTotals={};
        for(const p of s.processes) {
          const parent=s.processes.find(other=>other.pid===p.ppid);
          const role=roles.get(p.pid)??(p.name==='jumpyBrain'?'native-helper':p.name==='RAMPrototype'?'native-host':p.name==='node'?(parent?.name==='jumpyBrain'?'gateway':'qmd-worker'):p.name);
          roleTotals[role]=(roleTotals[role]??0)+p.physical;
        }
        for(const [role,total]of Object.entries(roleTotals))(stage.roles[role]??=[]).push(total);
      }
    }
  }
  const quit=stages.find(stage=>stage.name==='explicit-quit');
  if(quit){quit.end=last?.timeMs;quit.latencyMs=last?.timeMs-quit.start;quit.detail={metric:'time until last sampled owned process exits; 100ms cadence'};}
  const exit=JSON.parse(await readFile(path.join(directory,'exit.json'),'utf8'));
  runs.push({run:name,complete:result.ok&&exit.code===0&&exit.samplerCode===0&&last?.processes.length===0,
    samples:all,rejectedSamples:rejected,meanSamplerMs:samplingMs/all,sampledPeakBytes:peak,
    descendantsExited:last?.processes.length===0,processes:[...identities.values()],
    stages:stages.map(({active,settled,rss,roles,processCounts,trend,...stage})=>({...stage,active:stats(active),settled:stats(settled),rss:stats(rss),processCounts:stats(processCounts),
      trend:trend.map(bucket=>({minute:bucket.minute,physical:stats(bucket.physical),processCounts:stats(bucket.processCounts)})),
      roles:Object.fromEntries(Object.entries(roles).map(([role,values])=>[role,stats(values)]))})),
    soak:events.filter(e=>e.type==='soak-cycle').map(({timeMs,cycle,telemetry})=>({timeMs,cycle,telemetry})),error:result.error});
}
const summary={schema:1,createdAt:new Date().toISOString(),host:manifest.nativeBundle?'wkwebview':'electron',machine:manifest.machine,settings:{...manifest.settings,counts:selectedCounts},
  selection:{recordedCounts:manifest.settings.counts,selectedCounts},
  sourceSha256:manifest.source.sha256,driverSha256:manifest.driver.sha256,modelHash:manifest.modelHash,
  samplerSha256:manifest.sampler?.sha256,
  engines:{electron:manifest.electron?.sha256,electronVersion:runs.flatMap(run=>run.stages??[]).find(stage=>stage.name==='cold-background')?.detail?.electron,
    node:manifest.node?.sha256,qmdVersion:manifest.qmdPackage?.version,qmd:manifest.qmdPackage?.tree.sha256},
  units:'bytes; physical footprint and RSS separate; independent lifetime peaks never summed',runs};
try {summary.artifactVerified=JSON.parse(await readFile(path.join(suite,'verification.json'),'utf8')).ok===true;}catch(error){if(error.code!=='ENOENT')throw error;summary.artifactVerified=false;}
if(values.budgets) {
  summary.budgetCheck=checkBudgets(summary,JSON.parse(await readFile(values.budgets,'utf8')));
  if(summary.budgetCheck.violations.length)process.exitCode=1;
}
await writeFile(values.output,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({runs:runs.length,complete:runs.filter(r=>r.complete).length,output:values.output,violations:summary.budgetCheck?.violations},null,2));
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
