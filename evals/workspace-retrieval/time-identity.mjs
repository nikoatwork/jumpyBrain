// Quiet-window acceptance probe: do not run concurrently with quality/test/model jobs.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installExperiment } from './experiment-hooks.mjs';
import { percentile } from './score.mjs';
const [configPath, output] = process.argv.slice(2);
const config = JSON.parse(await readFile(configPath,'utf8'));
config.arm = 'baseline';
const experiment = await installExperiment(config);
const runtime = await import(pathToFileURL(`${config.repo}/dist/runtime/index.js`));
const queries = JSON.parse(await readFile(config.queries,'utf8'));
const ids = ['harbor-current','orbit-multi-source','meridian-ranking','vellum-multi-source','selkie-current','tamar-multi-source'];
const selected = ids.map(id => { const q=queries.find(q=>q.id===id);assert.ok(q);return q; });
async function call(arm,q,observe=false) {
  config.arm=arm;
  let peakTreeKiB=0, samples=0;
  const sample=()=>{
    const ps=spawnSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'});
    if(ps.status!==0)return;
    const rows=ps.stdout.trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
    const pids=new Set([process.pid]);
    for(let n=0;n<12;n++)for(const [pid,ppid] of rows)if(pids.has(ppid))pids.add(pid);
    peakTreeKiB=Math.max(peakTreeKiB,rows.filter(([pid])=>pids.has(pid)).reduce((s,r)=>s+r[2],0));samples++;
  };
  const timer=observe?setInterval(sample,100):undefined;
  const start=performance.now();
  try { await runtime.compactSearchMemory(config.root,q.query,5,{depth:q.depth,refresh:false,maxBytes:8192}); }
  finally { if(timer)clearInterval(timer); }
  return {arm,id:q.id,ms:performance.now()-start,peakTreeKiB,samples};
}
for(const q of selected)for(const arm of ['baseline','identity'])await call(arm,q);
const records=[];
for(let i=0;i<20;i++) {
  const q=selected[i%selected.length];
  for(const arm of i%2?['identity','baseline']:['baseline','identity'])records.push(await call(arm,q,true));
  if((i+1)%5===0)console.log(`Timing ${i+1}/20 pairs`);
}
const summary=Object.fromEntries(['baseline','identity'].map(arm=>{
 const rows=records.filter(r=>r.arm===arm);return [arm,{calls:rows.length,p50Ms:percentile(rows.map(r=>r.ms),.5),p95Ms:percentile(rows.map(r=>r.ms),.95),peakTreeKiB:Math.max(...rows.map(r=>r.peakTreeKiB))}];
}));
const p95ChangePercent=100*(summary.identity.p95Ms/summary.baseline.p95Ms-1),extraPeakMiB=(summary.identity.peakTreeKiB-summary.baseline.peakTreeKiB)/1024;
await writeFile(output,JSON.stringify({summary,p95ChangePercent,extraPeakMiB,passes:p95ChangePercent<=10&&extraPeakMiB<=50,records,scriptSha256:createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),limits:['macOS CPU process-tree RSS sampled at 100ms; GPU excluded.','Warm model-free local runtime; OS file cache not flushed; no VPS or contention claim.']},null,2)+'\n');
await experiment.dispose();
console.log(JSON.stringify({summary,p95ChangePercent,extraPeakMiB}));
