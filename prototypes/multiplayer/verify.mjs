#!/usr/bin/env node
import { readFile, writeFile, readdir, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeCheck, installedDependencyIdentity } from '../../scripts/multiplayer-verify.mjs';
import { newEvidenceDirectory } from './premerge.mjs';

const repository=fileURLToPath(new URL('../../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}).trim();
export function assertReviewedContract(bytes,pinned) {
  if(!/^[a-f0-9]{64}$/.test(pinned??'')||hash(bytes)!==pinned)throw new Error('An independently reviewed --contract-sha256 is required; candidate expectations cannot authorize themselves.');
}

async function inputIdentity(root) {
  const files=[];
  async function visit(relative) {
    const full=path.join(root,relative),stat=await lstat(full);
    if(stat.isSymbolicLink())throw new Error('Symlink in design-gate input: '+relative);
    if(stat.isDirectory()) {
      for(const name of (await readdir(full)).sort())if(name!=='node_modules')await visit(path.join(relative,name));
    } else if(stat.isFile())files.push(relative);
  }
  for(const entry of ['prototypes/multiplayer','src','dist','package.json','package-lock.json','scripts/playwright-runtime.mjs'])await visit(entry);
  const result={};
  for(const file of files.sort())result[file.split(path.sep).join('/')]=hash(await readFile(path.join(root,file)));
  return result;
}

export function assessReports(contract,reports,corpusSha256) {
  if(contract.version!==1||!Array.isArray(contract.comparisons)||contract.comparisons.length!==4
    ||new Set(contract.comparisons.map(c=>c.key)).size!==4)throw new Error('Incomplete reviewed design contract.');
  const assessments=[];
  for(const expected of contract.comparisons) {
    const observed=reports[expected.key];
    if(!observed||observed.version!==1||observed.candidate!==expected.candidate
      ||observed.status!==expected.expectedStatus||observed.corpusSha256!==corpusSha256)throw new Error('Missing, wrong or stale candidate evidence: '+expected.key);
    if(!Array.isArray(expected.requiredIds)||expected.requiredIds.length===0||!Array.isArray(observed.cases)||observed.cases.length===0)throw new Error('Empty scenario inventory: '+expected.key);
    const cases=new Map();
    for(const item of observed.cases) {
      if(!item.id||cases.has(item.id))throw new Error('Duplicate/missing scenario id: '+expected.key);
      cases.set(item.id,item.status);
      const wanted=expected.counterexamples.includes(item.id)?'counterexample':'passed';
      if(item.status!==wanted)throw new Error('Unexpected failed/skipped/error scenario: '+item.id);
    }
    for(const id of expected.requiredIds)if(!cases.has(id))throw new Error('Required scenario missing: '+id);
    for(const id of expected.counterexamples)if(cases.get(id)!=='counterexample')throw new Error('Required negative control disappeared: '+id);
    assessments.push({candidate:observed.candidate,outcome:observed.status,scenarios:cases.size,
      passed:observed.cases.filter(c=>c.status==='passed').length,counterexamples:expected.counterexamples.length});
  }
  const selected=reports.source;
  const exhaustive=selected.cases.find(c=>c.id==='source-exhaustive-independent-splices-preserve-both-arrival-orders');
  if(!exhaustive||!Number.isSafeInteger(exhaustive.arrivalOrders)||exhaustive.arrivalOrders<2000)throw new Error('Independent-operation property coverage is missing.');
  if(!selected.metrics||selected.metrics.sourceModelDependencies!==0
    ||[['historyLimit',128],['maxDocumentBytes',65536],['maxActors',32],['maxStreams',16]].some(([key,max])=>
      !Number.isSafeInteger(selected.metrics[key])||selected.metrics[key]<1||selected.metrics[key]>max))throw new Error('Selected prototype exceeds the reviewed resource/dependency envelope.');
  return assessments;
}

export async function runDesignGate({root=repository,out,development=false,contractSha256}) {
  root=await realpath(root);
  const source={head:git(root,['rev-parse','HEAD']),tree:git(root,['rev-parse','HEAD^{tree}']),
    dirty:git(root,['status','--porcelain=v1','--untracked-files=normal'])};
  if(source.dirty&&!development)throw new Error('Commit the reviewed prototype inputs before an authoritative design run; use --development only for diagnostics.');
  const output=await newEvidenceDirectory(root,out);
  const report={version:1,status:'blocked',source,development,mergeApproval:false,checks:[],limits:[
    'Design fit only. Shared backend ownership, authorization, transport and full structural editor binding are not delivered.',
    'A passed prototype is not integration approval; premerge.mjs separately verifies target ancestry, M0 parity and this design gate.',
  ]};
  try {
    const before=await inputIdentity(root);
    const dependencies={root:await installedDependencyIdentity(root),native:await installedDependencyIdentity(path.join(root,'prototypes/multiplayer/lexical-native'))};
    const contractBytes=await readFile(path.join(root,'prototypes/multiplayer/design-contract.json'));
    if(!development)assertReviewedContract(contractBytes,contractSha256);
    const contract=JSON.parse(contractBytes);
    const corpusSha256=hash(await readFile(path.join(root,'prototypes/multiplayer/corpus.json')));
    const reports={};
    for(const comparison of contract.comparisons) {
      const file=path.join(output,comparison.key+'.json');
      const execution=await executeCheck(root,{command:comparison.command,timeoutMs:120000},{
        environment:{...process.env,[comparison.outputEnvironment]:file}});
      await writeFile(path.join(output,comparison.key+'.log'),execution.output);
      if(execution.error||execution.timedOut||execution.overflow||execution.code!==comparison.expectedExit)throw new Error('Candidate execution failed: '+comparison.key);
      reports[comparison.key]=JSON.parse(await readFile(file));
      report.checks.push({id:comparison.key,executionExit:execution.code,reportSha256:hash(await readFile(file))});
    }
    report.assessments=assessReports(contract,reports,corpusSha256);
    const editorHash=hash(await readFile(path.join(root,'src/adapters/http-server/lexical-editor.ts')));
    if(reports.native.metrics.sourceSha256!==editorHash||reports.source.metrics.productionEditorSha256!==editorHash)throw new Error('Prototypes did not exercise the current production editor.');
    for(const [file,value]of Object.entries(reports.durability.runtimeHashes))if(hash(await readFile(path.join(root,file)))!==value)throw new Error('Durability tested a different runtime artifact.');
    const after=await inputIdentity(root);
    if(JSON.stringify(before)!==JSON.stringify(after))throw new Error('Code, corpus or tested runtime changed during the design run.');
    const dependenciesAfter={root:await installedDependencyIdentity(root),native:await installedDependencyIdentity(path.join(root,'prototypes/multiplayer/lexical-native'))};
    if(JSON.stringify(dependencies)!==JSON.stringify(dependenciesAfter))throw new Error('Installed dependencies changed during the design run.');
    if(source.head!==git(root,['rev-parse','HEAD'])||source.tree!==git(root,['rev-parse','HEAD^{tree}'])
      ||source.dirty!==git(root,['status','--porcelain=v1','--untracked-files=normal']))throw new Error('Source snapshot changed during the design run.');
    report.status='passed';report.selection=contract.selection;report.corpusSha256=corpusSha256;
    report.inputHashes=before;report.dependencyIdentity=dependencies;
    report.environment={node:process.version,platform:process.platform,arch:process.arch,chromium:reports.source.metrics.chromium};
    report.contractSha256=hash(await readFile(path.join(root,'prototypes/multiplayer/design-contract.json')));
    report.resourceMetrics={native:reports.native.metrics,source:reports.source.metrics};
  } catch(error){report.error=error.message;}
  await writeFile(path.join(output,'report.json'),json(report),{flag:'wx'});
  console.log(json({status:report.status,selection:report.selection,assessments:report.assessments,error:report.error,source}));
  return report;
}
async function main() {
  const args=process.argv.slice(2),development=args.includes('--development');
  const filtered=args.filter(a=>a!=='--development');
  const flags={};
  for(let i=0;i<filtered.length;i+=2) {
    const key={'--out':'out','--contract-sha256':'contractSha256'}[filtered[i]];
    if(!key||flags[key]||!filtered[i+1]||filtered[i+1].startsWith('--'))throw new Error('Use --out NEW_DIRECTORY --contract-sha256 REVIEWED_DIGEST [--development].');
    flags[key]=filtered[i+1];
  }
  if(!flags.out)throw new Error('Choose a new --out directory.');
  const report=await runDesignGate({...flags,development});process.exitCode=report.status==='passed'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
