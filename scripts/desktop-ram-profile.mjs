// Explicit diagnostic process; GC is used only to distinguish retention from churn.
import { Session } from 'node:inspector/promises';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { setImmediate } from 'node:timers/promises';
const {values}=parseArgs({options:{root:{type:'string'},runtime:{type:'string'},output:{type:'string'}}});
if(!values.root||!values.runtime||!values.output||!global.gc) throw new Error('Use node --expose-gc ... --root ROOT --runtime RUNTIME --output PREFIX');
const session=new Session();session.connect();
await session.post('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
await session.post('Profiler.enable');await session.post('Profiler.start');
const stages=[];
async function stage(name,operation) {
  const before=process.memoryUsage(),cpuBefore=process.cpuUsage(),start=performance.now();
  const result=await operation(); const ms=performance.now()-start,after=process.memoryUsage();
  // Drop results before collection; report the operation's result shape separately.
  const shape=result?.notes?.length??result?.nodes?.length??result?.documents??null;
  return {name,ms,cpuMicroseconds:process.cpuUsage(cpuBefore),before,after,shape};
}
async function measure(name,operation) {
  const result=await stage(name,operation);
  // Let completed async frames unwind before diagnosing live object retention.
  await setImmediate();global.gc();result.afterGc=process.memoryUsage();stages.push(result);
}
const load=p=>import(pathToFileURL(path.join(values.runtime,'dist',p)));
let recent,local,canonical;
await measure('imports',async()=>{await load('server/index.js');await load('runtime/index.js');recent=await load('app/server-memory/recent.js');local=await load('app/local-memory/index.js');canonical=await load('core/canonical/index.js');});
for(let pass=1;pass<=3;pass++) {
  await measure('recent-'+pass,()=>recent.recentServerMemory({root:values.root}));
  await measure('overview-'+pass,()=>local.overviewMemory(values.root));
  await measure('id-lookup-'+pass,()=>canonical.readCanonicalMemoryDocumentById(values.root,'mem_a0000000-0000-4000-8000-000000000001'));
  await measure('graph-'+pass,()=>local.graphMemory(values.root,{limit:500,includeOrphans:true,includeUnresolved:true}));
}
const {profile}=await session.post('HeapProfiler.stopSampling');
const cpu=await session.post('Profiler.stop');session.disconnect();
await writeFile(values.output+'.heapprofile',JSON.stringify(profile));
await writeFile(values.output+'.cpuprofile',JSON.stringify(cpu.profile));
await writeFile(values.output+'.json',JSON.stringify({node:process.version,stages,note:'Explicit GC in diagnostic process only; not a production or acceptance workload.'},null,2));
console.log(JSON.stringify(stages.map(s=>({name:s.name,ms:Math.round(s.ms),heapBefore:s.before.heapUsed,heapAfter:s.after.heapUsed,heapRetained:s.afterGc.heapUsed,rss:s.afterGc.rss})),null,2));
