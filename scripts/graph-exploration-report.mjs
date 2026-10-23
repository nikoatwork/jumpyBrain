// Scoped diagnostic guard; whole-desktop/model budgets remain separately owned.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function graphReport(baseline, optimized) {
  for(const field of ['driverSha256','node','browser','cpu','totalMemory'])if(!baseline[field]||baseline[field]!==optimized[field])throw new Error('Mismatched measurement identity: '+field);
  if(JSON.stringify(baseline.viewport)!==JSON.stringify(optimized.viewport))throw new Error('Mismatched viewport');
  const med=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const rows=[];
  for(const size of [100,500,1650,10000]){
    const before=baseline.rows.filter(r=>r.size===size),after=optimized.rows.filter(r=>r.size===size);
    if(before.length!==3||after.length!==3||new Set(after.map(r=>r.rep)).size!==3)throw new Error('Missing repetitions at '+size);
    for(const row of after){
      if(row.hiddenChildren!==0||row.dom>1500)throw new Error('Scene retention/DOM budget at '+size);
      const heapLimit=(size<=1650?32:96)*1024*1024;
      if(!Number.isFinite(row.rendererHeap)||row.rendererHeap>heapLimit)throw new Error('Renderer heap budget at '+size);
      if(row.packetBytes>12*1024*1024||row.nodes>10000||row.edges>20000)throw new Error('Packet budget at '+size);
      if(!Array.isArray(row.frames)||row.frames.length!==8||row.frames.some((n,i)=>!Number.isFinite(n)||n<=0||n>(size<=1650?33:i===0?100:40)))throw new Error('Frame budget at '+size);
      if(row.renderMs>50)throw new Error('Synchronous scene-update budget at '+size);
    }
    rows.push({size,nodes:after[0].nodes,edges:after[0].edges,assemblyMedianMs:{before:med(before.map(r=>r.assemblyMs)),after:med(after.map(r=>r.assemblyMs))},dom:{before:before[0].dom,after:after[0].dom},framesMs:{before:[Math.min(...before.flatMap(r=>r.frames)),Math.max(...before.flatMap(r=>r.frames))],after:[Math.min(...after.flatMap(r=>r.frames)),Math.max(...after.flatMap(r=>r.frames))]},rendererHeapMiB:after.map(r=>r.rendererHeap/1024/1024),nodeRssMiB:after.map(r=>r.nodeRss/1024/1024)});
  }
  return {baselineBuild:baseline.build,optimizedBuild:optimized.build,driverSha256:optimized.driverSha256,rows,limitations:'Synthetic browser diagnostics only; no total RAM savings claim. Canvas paint is frame-deferred, so synchronous scene-update timings alone do not compare painting cost. Stress first frames allow100ms, later frames40ms; regular fixtures33ms. Node+Playwright RSS includes allocation/GC churn and is not server-only or desktop physical footprint.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [before,after,output]=process.argv.slice(2);if(!before||!after)throw new Error('Use baseline.json optimized.json [report.json]');const result=graphReport(JSON.parse(await readFile(before)),JSON.parse(await readFile(after)));if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log('Graph diagnostic budgets PASS:100/500/1650/10000 notes, three repetitions, matching driver/machine/browser.');}
