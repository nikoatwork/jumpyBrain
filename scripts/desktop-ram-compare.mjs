// Publish only reviewed aggregate evidence; raw manifests/events stay local.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { checkBudgets } from './desktop-ram-report.mjs';

const statistics=values=>{
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return sorted.length?{median:sorted[Math.floor((sorted.length-1)/2)],min:sorted[0],max:sorted.at(-1)}:null;
};
export function compareSuites(before,after) {
  for(const [label,suite]of [['baseline',before],['optimized',after]]) {
    if(suite.host!=='electron')throw new Error(label+' must be an Electron acceptance suite');
    if(suite.artifactVerified!==true)throw new Error(label+' needs post-run artifact verification');
    if(suite.settings.repetitions<3)throw new Error(label+' needs at least three repetitions');
    if(![suite.sourceSha256,suite.driverSha256,suite.samplerSha256,suite.engines?.electron,suite.engines?.node,suite.engines?.qmd].every(value=>typeof value==='string'&&value.length>0)
      ||(suite.settings.semantic&&typeof suite.modelHash!=='string'))throw new Error(label+' has incomplete artifact identities');
    if(checkBudgets(suite,{stages:{}}).violations.length)throw new Error(label+' has incomplete workload coverage');
  }
  for(const key of ['settings','machine','driverSha256','samplerSha256','modelHash','engines']) {
    if(!isDeepStrictEqual(before[key],after[key]))throw new Error('Unmatched '+key);
  }
  const summarize=(suite,count,name)=>{
    const runs=suite.runs.filter(run=>Number(run.run.split('-')[0])===count);
    const stages=runs.map(run=>run.stages.find(stage=>stage.name===name)).filter(Boolean);
    const roles=[...new Set(stages.flatMap(stage=>Object.keys(stage.roles??{})))];
    return {repetitions:stages.length,settledBytes:statistics(stages.map(stage=>stage.settled.median)),
      activePeakBytes:statistics(stages.map(stage=>stage.active.max)),latencyMs:statistics(stages.map(stage=>stage.latencyMs)),
      activeCpuMs:statistics(stages.map(stage=>stage.activeCpuNs/1e6)),
      roles:Object.fromEntries(roles.map(role=>[role,statistics(stages.map(stage=>stage.roles[role]?.median))])),
      graphDom:statistics(stages.map(stage=>stage.telemetry?.renderer?.graphDom)),
      rendererHeap:statistics(stages.map(stage=>stage.telemetry?.renderer?.heap))};
  };
  const controls=(suite,count,name)=>suite.runs.filter(run=>Number(run.run.split('-')[0])===count).map(run=>{
    const telemetry=run.stages.find(stage=>stage.name===name)?.telemetry;
    return JSON.stringify({windows:telemetry?.windows??null,view:telemetry?.renderer?.view??null,
      scale:telemetry?.renderer?.scale??null,viewport:telemetry?.renderer?.viewport??null});
  }).sort();
  const comparisons=[];
  for(const count of before.settings.counts) {
    const names=before.runs.find(run=>Number(run.run.split('-')[0])===count).stages.map(stage=>stage.name);
    for(const name of names) {
      if(!isDeepStrictEqual(controls(before,count,name),controls(after,count,name)))throw new Error(`Unmatched window/view/device-scale/viewport controls for ${count} ${name}`);
      const baseline=summarize(before,count,name),optimized=summarize(after,count,name);
      comparisons.push({notes:count,stage:name,baseline,optimized,
        settledChangeBytes:baseline.settledBytes&&optimized.settledBytes?optimized.settledBytes.median-baseline.settledBytes.median:null});
    }
  }
  return {schema:1,machine:before.machine,settings:before.settings,driverSha256:before.driverSha256,
    samplerSha256:before.samplerSha256,engines:before.engines,modelHash:before.modelHash,
    sources:{baseline:before.sourceSha256,optimized:after.sourceSha256},
    units:'decimal bytes and milliseconds; medians/ranges across repetitions; simultaneous sampled physical footprint',comparisons};
}

// A machine-specific starting guard. Review the generated thresholds with the evidence.
export function proposeBudgets(comparison) {
  const rounded=(value,step)=>Math.ceil(value/step)*step;
  const allowance=stats=>stats?rounded(stats.max*1.2+Math.max(25_000_000,stats.max-stats.min),25_000_000):undefined;
  const corpora={};
  for(const cell of comparison.comparisons) {
    const budget={settledBytes:allowance(cell.optimized.settledBytes),activeBytes:allowance(cell.optimized.activePeakBytes)};
    if(!['recovery','soak'].includes(cell.stage)&&cell.optimized.latencyMs)budget.latencyMs=rounded(cell.optimized.latencyMs.max*1.5+250,250);
    (corpora[cell.notes]??={stages:{}}).stages[cell.stage]=budget;
  }
  return {schema:1,scope:structuredClone({machine:comparison.machine,settings:comparison.settings,modelHash:comparison.modelHash}),
    policy:'Provisional manual macOS guard: memory maximum × 1.2 plus at least 25 MB or one observed replicate range, rounded up to 25 MB; latency maximum × 1.5 + 250 ms. Three repetitions do not prove universal bounds.',
    maxRejectedSampleFraction:0.01,corpora};
}

async function main() {
  const {values}=parseArgs({options:{baseline:{type:'string'},optimized:{type:'string'},output:{type:'string'},budgets:{type:'string'}}});
  if(!values.baseline||!values.optimized||!values.output)throw new Error('Use --baseline SUMMARY --optimized SUMMARY --output COMPARISON [--budgets PROPOSED_BUDGETS]');
  const before=JSON.parse(await readFile(values.baseline,'utf8')),after=JSON.parse(await readFile(values.optimized,'utf8'));
  const comparison=compareSuites(before,after);
  await writeFile(values.output,JSON.stringify(comparison,null,2)+'\n');
  if(values.budgets)await writeFile(values.budgets,JSON.stringify(proposeBudgets(comparison),null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
