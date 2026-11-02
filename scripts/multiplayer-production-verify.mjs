#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { runGate, readBaseline, executeCheck, assessCheck, filesBelow, assertFingerprints, assertTreeFingerprints } from './multiplayer-verify.mjs';

const repository=fileURLToPath(new URL('..',import.meta.url));
const contractDefault='deep-dives/multiplayer-editing/production-gate-contract.json';
const baselinePin='739838b444bbe9525c21b895c1ba3ad10c40a3312a6f82789b334c7d3ec0bff2';
const originalContractPin='27603e7296338f633f73a75f39a255ec2b886602ad92d67ac78d7781e45cee5a';
const requiredIds=['production-editor','lexical-structure','hosted-browser-session','retained-version-ui','composed-local','composed-linux','local-workload','shared-workload','native-input-accessibility','signed-desktop','packaged-diagnostics','packaged-upgrade'];
const retainedScenarios=['notification','compare-copy','writer-restore','reader-readonly','stale-comparison','revocation','unique-draft','storage-failure','large-copy-fallback','discovery-incomplete','scope-switch'];
const requiredScenarioTests=['access-control','backend-host','backend-control','backend-maintenance','browser-session','companion-live-gateway','collaboration-advanced-model','collaboration-actor-lifecycle','collaboration-hub-actor-lifecycle','collaboration-provenance','collaboration-batch-hub','collaboration-cli','collaboration-cli-read-base','collaboration-durability','collaboration-editor','collaboration-hub','collaboration-history','collaboration-http-races','collaboration-live','collaboration-model','collaboration-presence-recovery','collaboration-tls','editor-source-map','collaboration-labels','retained-comparison-preview','electron-live-network','electron-history-menu','filesystem-publication','multiplayer-upgrade','multiplayer-production-gate'].map(name=>'test/'+name+'.test.js');
const acceptance={canonicalP95Ms:1000,peakRssBytes:536870912,historyBytes:33554432,queuedBytes:33554432,rpcDeadlineMs:10000};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const relativeFile=value=>typeof value==='string'&&value.length>0&&!path.isAbsolute(value)&&!value.includes('\\')&&!value.split('/').some(part=>!part||part==='.'||part==='..');
const within=(child,parent)=>child===parent||child.startsWith(parent+path.sep);
const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trim();
async function fingerprints(root,files){const result={};for(const file of [...files].sort()){const stat=await lstat(path.join(root,file));if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Unsafe integration input: '+file);result[file]=hash(await readFile(path.join(root,file)));}return result;}
function equalMap(left,right){const keys=Object.keys(left).sort();return keys.length===Object.keys(right).length&&keys.every(key=>left[key]===right[key]);}
async function destination(file){let ancestor=path.resolve(file);const tail=[];for(;;){try{return path.join(await realpath(ancestor),...tail);}catch(error){if(error.code!=='ENOENT'||ancestor===path.dirname(ancestor))throw error;tail.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}}}
async function pinnedJson(file,pin,label){if(!digest(pin))throw new Error('An externally pinned '+label+' SHA-256 is required.');const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw new Error('Unsafe '+label+' file.');const bytes=await readFile(file);if(hash(bytes)!==pin)throw new Error(label+' digest disagrees with external pin.');return {value:JSON.parse(bytes),bytes};}

export async function readProductionContract(file,pin){
  const {value}=await pinnedJson(file,pin,'production contract');
  if(value.version!==1||value.id!=='multiplayer-production-integration'||value.protectedM0?.baselineSha256!==baselinePin||value.protectedM0?.contractSha256!==originalContractPin
    ||!Array.isArray(value.checks)||value.checks.length!==requiredIds.length||value.checks.some((check,index)=>check.id!==requiredIds[index]||!Array.isArray(check.command)||check.command.length<2||check.command[0]!=='node'||!relativeFile(check.command[1])||!Number.isInteger(check.timeoutMs)||check.timeoutMs<1||!Array.isArray(check.markers)||!check.markers.length||check.markers.some(marker=>typeof marker!=='string'||!marker))
    ||![value.assertionRoots,value.linuxSourceRoots,value.linuxIgnoredNames,value.limits].every(items=>Array.isArray(items)&&items.length>0&&items.every(item=>typeof item==='string'&&item.length>0))
    ||!value.assertionRoots.every(relativeFile)||!value.linuxSourceRoots.every(relativeFile)||!equalMap(value.workloadAcceptance??{},acceptance)||!equalMap(value.linuxNodeVersions??{},{22:'v22.12.0',26:'v26.7.0'}))throw new Error('Incomplete or weakened production integration contract.');
  for(const [id,actors,humans,rounds,notes,seed]of [['local-workload',3,2,20,128,1592594996],['shared-workload',8,5,100,256,1592594997]]){const check=value.checks.find(item=>item.id===id),workload=check.workload;if(workload?.actors!==actors||workload?.humans!==humans||workload.rounds<rounds||workload.notes<notes||workload.seed!==seed||![`--actors=${actors}`,`--humans=${humans}`,`--rounds=${workload.rounds}`,`--notes=${workload.notes}`,`--seed=${seed}`].every(flag=>check.command.includes(flag)))throw new Error('Required production workload was weakened.');}
  for(const mode of ['local','linux']){const check=value.checks.find(item=>item.id==='composed-'+mode);if(check.command[1]!=='scripts/collaboration-composed-smoke.mjs'||!check.command.includes('--mode='+mode)||!check.command.includes('--runs=2')||check.command.some(flag=>flag.startsWith('--diagnostic')))throw new Error('Required composed browser/CLI/file scenario was weakened.');}
  const upgrade=value.checks.find(item=>item.id==='packaged-upgrade');if(upgrade.command[1]!=='scripts/multiplayer-packaged-upgrade-smoke.mjs'||!['--package={candidatePackage}','--package-sha256={candidatePackageSha256}','--baseline={baseline}','--baseline-sha256={baselineSha256}'].every(flag=>upgrade.command.includes(flag)))throw new Error('Required packaged upgrade scenario was weakened.');
  const native=value.checks.find(item=>item.id==='native-input-accessibility');if(!native.markers.includes('Native collaborative menu Undo/Redo: PASS')||native.command[1]!=='scripts/native-collaboration-input-smoke.mjs'||!native.command.includes('--resources')||!native.command.includes('{desktopResources}'))throw new Error('Required native input/accessibility scenario was weakened.');
  if(value.checks.find(item=>item.id==='retained-version-ui').command[1]!=='scripts/collaboration-retained-versions-smoke.mjs')throw new Error('Required retained-version UI scenario was weakened.');
  if(!['actual positional intent and authoritative selection history','bounded default CLI actor churn'].every(marker=>value.checks.find(item=>item.id==='production-editor').markers.includes(marker)))throw new Error('Required real editor intent proof was weakened.');
  const assertions=value.scenarioAssertions;
  if(!assertions||typeof assertions!=='object'||Array.isArray(assertions)||Object.entries(assertions).some(([file,pin])=>!relativeFile(file)||!digest(pin))||[...requiredScenarioTests,...value.checks.map(check=>check.command[1]),'scripts/collaboration-cursor-proof.mjs','scripts/collaboration-intent-proof.mjs','scripts/collaboration-actor-churn-proof.mjs','scripts/multiplayer-linux-verify.mjs','scripts/package-budget.mjs','scripts/local-pack-manifest.mjs','scripts/fixtures/native-collaboration-input-electron.mjs','integrations/electron/smoke-unified-app.mjs','scripts/multiplayer-production-verify.mjs'].some(file=>!digest(assertions[file])))throw new Error('Protected production scenario assertions are incomplete or weakened.');
  return value;
}

export async function assertScenarioAssertions(root,contract){await assertFingerprints(root,contract.scenarioAssertions,'Protected production scenario assertion');}

export async function assertIntegrationHead(root,target,{expectedHead,previous}={}){
  if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(target??'')||target.includes('..'))throw new Error('An explicit integration target ref is required.');
  if(git(root,['status','--porcelain=v1','--untracked-files=all']))throw new Error('Integration HEAD must be clean, including new assertions and harness files.');
  const head=git(root,['rev-parse','HEAD']),tree=git(root,['rev-parse','HEAD^{tree}']),targetSha=git(root,['rev-parse','--verify',target+'^{commit}']);
  if(expectedHead&&head!==expectedHead)throw new Error('Integration HEAD differs from the externally expected HEAD.');
  try{execFileSync('git',['merge-base','--is-ancestor',targetSha,head],{cwd:root,stdio:'ignore'});}catch{throw new Error('Current integration HEAD does not contain the current target.');}
  const snapshot={head,tree,target,targetSha};if(previous&&JSON.stringify(previous)!==JSON.stringify(snapshot))throw new Error('Integration HEAD, tree or target moved during verification.');return snapshot;
}

export async function productionSourceMap(root,contract){
  const result={},ignored=new Set(contract.linuxIgnoredNames);
  async function visit(relative){const file=path.join(root,relative),stat=await lstat(file);if(stat.isSymbolicLink())throw new Error('Linked Linux source input.');if(stat.isDirectory()){for(const name of(await readdir(file)).sort())if(!ignored.has(name))await visit(path.posix.join(relative,name));}else if(stat.isFile())result[relative]=hash(await readFile(file));else throw new Error('Special Linux source input.');}
  for(const relative of contract.linuxSourceRoots)await visit(relative);return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));
}

export async function readPinnedLinuxReport(file,pin,currentSource,{major,version}={}){
  const {value}=await pinnedJson(file,pin,'Linux report'),directory=await realpath(path.dirname(file)),observation=value.observation;
  if(value.version!==1||value.status!=='passed'||value.sourceStable!==true||value.container?.status!=='passed'||value.container.platform!=='linux'||!new RegExp('^v'+major+'\\.\\d+\\.\\d+$').test(value.container.node??'')||value.expectedNode!==value.container.node||version&&value.container.node!==version
    ||!/^node@sha256:[a-f0-9]{64}$/.test(value.image?.digest??'')||value.execution?.code!==0||value.execution.timedOut||value.execution.overflow
    ||!observation||!Number.isInteger(observation.tests)||observation.tests<1||observation.tests!==observation.pass||['fail','cancelled','skipped','todo'].some(key=>observation[key]!==0)
    ||!value.source||!equalMap(value.source,currentSource)||hash(json(value.source))!==value.sourceMapSha256
    ||!value.artifacts||!Object.keys(value.artifacts).length||Object.entries(value.artifacts).some(([name,digest])=>!relativeFile(name)||!/^([a-f0-9]{64})$/.test(digest))||hash(json(value.artifacts))!==value.artifactMapSha256)
    throw new Error('Linux report is incomplete, has skips/failures, or describes a different current source.');
  await assertFingerprints(directory,value.artifacts,'Pinned Linux artifact');
  const actual=await filesBelow(directory,['.']);
  if(actual.length!==Object.keys(value.artifacts).length+1||actual.some(name=>name!==path.basename(file)&&!Object.hasOwn(value.artifacts,name)))throw new Error('Unrecorded Linux artifact additions.');
  const tested=assessCheck({tap:true},{code:0,output:await readFile(path.join(directory,'tests.log'),'utf8')});
  if(tested.status!=='passed'||JSON.stringify(tested.observation)!==JSON.stringify(observation))throw new Error('Linux TAP evidence disagrees with its report.');
  return {directory,report:value,pin,file};
}

export async function assertDesktopArtifact(root,resources,artifact,{verifySignature,verifySource}={}){
  if(!artifact||!Object.keys(artifact).length||Object.keys(artifact).some(file=>!file.startsWith('dist/')))throw new Error('A nonempty current tested runtime inventory is required.');
  resources=await realpath(resources);const app=path.resolve(resources,'../..');
  if(!app.endsWith('.app')||resources!==path.join(app,'Contents','Resources'))throw new Error('Supply the signed app Contents/Resources directory.');
  const expected=Object.fromEntries(Object.entries(artifact).map(([file,value])=>[file.slice('dist/'.length),value]));
  await assertTreeFingerprints(path.join(resources,'runtime','dist'),['.'],Object.fromEntries(Object.entries(expected).map(([file,value])=>[file,value])),'Packaged desktop runtime');
  const sourceCheck=verifySource??(async()=>{
    const source=path.join(root,'integrations','electron'),archive=path.join(resources,'app.asar'),require=createRequire(path.join(source,'package.json')),{extractFile}=require('@electron/asar'),files={};
    for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isFile()&&/\.(?:mjs|cjs|js|html|css)$/.test(entry.name)&&entry.name!=='install.mjs'&&!entry.name.startsWith('smoke')){
      const current=hash(await readFile(path.join(source,entry.name)));if(hash(extractFile(archive,entry.name))!==current)throw new Error('Packaged desktop shell differs from current tested source: '+entry.name);files[entry.name]=current;
    }
    if(!files['application.mjs']||!files['diagnostics.mjs'])throw new Error('Packaged desktop shell inventory is incomplete.');return files;
  });
  const shell=await sourceCheck();
  const verify=verifySignature??((app)=>{if(process.platform!=='darwin')throw new Error('Signed desktop verification requires macOS.');execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'pipe'});const details=spawnSync('/usr/bin/codesign',['--display','--verbose=4',app],{encoding:'utf8'});if(details.status!==0)throw new Error('Desktop signature identity could not be recorded.');return details.stderr.trim();});
  const signature=await verify(app);return {resources,app,shell,signature:typeof signature==='string'?signature:'codesign verified'};
}

export function assessProductionCheck(check,execution,{head,build,scriptSha256,packageSha256,runtimeArtifactSha256}={}){
  const assessed=assessCheck(check,execution);if(assessed.status!=='passed')return assessed;
  if(check.id==='retained-version-ui'){
    try{const data=JSON.parse(execution.output);
      if(data.version!==1||data.passed!==true||data.realBrowser!==true||data.authenticatedAPI!==true||data.head!==head||data.build!==build||!digest(scriptSha256)||data.scriptSha256!==scriptSha256||!Array.isArray(data.scenarios)||data.scenarios.length!==retainedScenarios.length||data.scenarios.some(scenario=>scenario.passed!==true)||new Set(data.scenarios.map(scenario=>scenario.id)).size!==retainedScenarios.length||retainedScenarios.some(id=>!data.scenarios.some(scenario=>scenario.id===id)))throw new Error();
      return {...assessed,observation:data};
    }catch{return {status:'failed',reason:'Retained-version UI proof is incomplete, stale or omits a required real-browser recovery scenario.'};}
  }
  if(check.id==='composed-local'||check.id==='composed-linux'){
    try{const data=JSON.parse(execution.output),mode=check.id.slice('composed-'.length);
      if(data.version!==1||data.passed!==true||data.diagnostic!==false||data.mode!==mode||data.runs!==2||data.browserContexts!==2||data.shippedCLI!==true||data.rawWriter!==true||data.head!==head||data.build!==build||!digest(scriptSha256)||data.scriptSha256!==scriptSha256||!digest(runtimeArtifactSha256)||data.runtimeArtifactSha256!==runtimeArtifactSha256||!Array.isArray(data.trials)||data.trials.length!==2||data.trials.some(trial=>trial.passed!==true||!digest(trial.canonicalSha256)||trial.runtimeArtifactSha256!==runtimeArtifactSha256||mode==='linux'&&trial.runtimeCopyVerified!==true||['actorIdsDistinct','cliStreamBeforeEOF','rawReconciled','allContextsConverged'].some(key=>trial[key]!==true))||mode==='linux'&&(!/^node@sha256:[a-f0-9]{64}$/.test(data.image?.digest??'')||data.image?.platform!=='linux'||data.image?.node!=='v26.7.0'))throw new Error();
      return {...assessed,observation:data};
    }catch{return {status:'failed',reason:'Composed browser/CLI/file evidence is incomplete, stale or lacks both real repeated scenarios.'};}
  }
  if(check.id==='packaged-upgrade'){
    try{const data=JSON.parse(execution.output);
      if(data.version!==1||data.passed!==true||data.head!==head||data.build!==build||!digest(scriptSha256)||data.scriptSha256!==scriptSha256||!digest(packageSha256)||data.packageSha256!==packageSha256||!digest(runtimeArtifactSha256)||data.runtimeArtifactSha256!==runtimeArtifactSha256||data.old?.sourceCommit!=='be5493ba9a3c5aa796d371043e56d6539d6dabf4'||!data.old?.build||data.target?.build!==build||data.roots!==2||data.upgradeMode!=='disposable-runtime-replacement'||['sameIdRoots','canonicalPreserved','recoveryPreserved','searchBeforeAfter','interruptedRetry','rollbackRecovered'].some(key=>data[key]!==true))throw new Error();
      return {...assessed,observation:data};
    }catch{return {status:'failed',reason:'Packaged upgrade evidence is incomplete, stale or does not preserve both roots and recovery data.'};}
  }
  if(!check.workload)return assessed;
  try{const data=JSON.parse(execution.output),expected=check.workload;
    const numbers=[data.observations?.canonicalP95Ms,data.observations?.maxRssKiB,data.observations?.canonicalRpcCount,data.resources?.peaks?.historyBytes,data.resources?.peaks?.queuedBytes];
    if(numbers.some(value=>!Number.isFinite(value)||value<0)||data.observations.maxRssKiB===0||data.observations.canonicalRpcCount===0)throw new Error();
    if(data.version!==1||data.passed!==true||data.actors!==expected.actors||data.humans!==expected.humans||data.rounds!==expected.rounds||data.seed!==expected.seed||data.canonicalNotes!==expected.notes+1||!data.checks||Object.values(data.checks).some(value=>value!==true)||!['canonicalP95','peakRss','history','queue'].every(key=>data.checks[key]===true)||!equalMap(data.acceptance??{},acceptance)||data.observations?.canonicalP95Ms>acceptance.canonicalP95Ms||data.observations?.maxRssKiB*1024>acceptance.peakRssBytes||data.resources?.peaks?.historyBytes>acceptance.historyBytes||data.resources?.peaks?.queuedBytes>acceptance.queuedBytes||data.environment?.head!==head||data.environment?.verifiedBuild?.build!==build||data.environment?.concurrency!=='serial-production-gate')throw new Error();
    return {...assessed,observation:data};
  }catch{return {status:'failed',reason:'Production workload JSON is incomplete, stale or outside its declared scenario/budgets.'};}
}

export async function runProductionGate(options){
  const root=await realpath(options.root??repository),out=await destination(options.out),contractFile=path.resolve(root,options.contract??contractDefault);
  for(const entry of ['src','test','scripts','integrations','.git','dist'])if(within(out,path.join(root,entry)))throw new Error('Production evidence must be outside source/assertion/runtime inputs.');
  const protectedDirectories=[await realpath(options.baseline),await realpath(path.dirname(options.linuxNode22Report)),await realpath(path.dirname(options.linuxNode26Report))];
  if(protectedDirectories.some(directory=>within(out,directory)))throw new Error('Production output cannot modify pinned input evidence.');
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
  const report={version:1,status:'blocked',startedAt:new Date().toISOString(),checks:[],pins:{baseline:options.baselineSha256,delta:options.deltaSha256,productionContract:options.contractSha256,linuxNode22:options.linuxNode22Sha256,linuxNode26:options.linuxNode26Sha256}};
  const finish=async()=>{report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),json(report));};
  try{
    for(const name of ['JUMPYBRAIN_EDITOR_ISOLATED_ONLY','JUMPYBRAIN_SMOKE_PACKAGE_DIR'])if(process.env[name])throw new Error('Remove smoke subset/package overrides before production verification: '+name);
    const contract=await readProductionContract(contractFile,options.contractSha256);report.limits=contract.limits;
    if(options.baselineSha256!==contract.protectedM0.baselineSha256)throw new Error('Production verification must retain the pinned original M0 baseline.');
    const frozen=await readBaseline(options.baseline,options.baselineSha256);if(frozen.contractHash!==contract.protectedM0.contractSha256)throw new Error('The original M0 contract differs.');
    const integration=await assertIntegrationHead(root,options.target,{expectedHead:options.expectedHead});report.integration=integration;await assertScenarioAssertions(root,contract);
    const trackedFiles=git(root,['ls-files','-z']).split('\0').filter(Boolean),tracked=await fingerprints(root,trackedFiles),source=await productionSourceMap(root,contract),assertions=await fingerprints(root,await filesBelow(root,contract.assertionRoots));
    report.source={tracked,linuxInputs:source,assertions};
    const linux=[];
    for(const [major,file,pin]of [[22,options.linuxNode22Report,options.linuxNode22Sha256],[26,options.linuxNode26Report,options.linuxNode26Sha256]])linux.push(await readPinnedLinuxReport(file,pin,source,{major,version:contract.linuxNodeVersions[major]}));
    const stable=async artifact=>{await assertIntegrationHead(root,options.target,{expectedHead:options.expectedHead,previous:integration});await assertFingerprints(root,tracked,'Integration source');await assertTreeFingerprints(root,contract.assertionRoots,assertions,'Production assertion inputs');if(!equalMap(await productionSourceMap(root,contract),source))throw new Error('Production runtime/harness source changed during verification.');if(artifact)await assertTreeFingerprints(root,['dist'],artifact,'Production tested runtime');};
    await mkdir(path.join(out,'logs'));const contractBytes=await readFile(contractFile);if(hash(contractBytes)!==options.contractSha256)throw new Error('Production contract changed during admission.');await writeFile(path.join(out,'production-contract.json'),contractBytes);
    const reviewedDelta=await pinnedJson(options.delta,options.deltaSha256,'reviewed delta');await writeFile(path.join(out,'reviewed-delta.json'),reviewedDelta.bytes);
    const candidatePackage=await realpath(options.candidatePackage);
    const stablePackage=async()=>{const stat=await lstat(options.candidatePackage);if(!digest(options.candidatePackageSha256)||!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024||hash(await readFile(candidatePackage))!==options.candidatePackageSha256)throw new Error('Candidate package differs from its externally pinned digest.');};
    await stablePackage();await cp(candidatePackage,path.join(out,'candidate-package.tgz'),{force:false,errorOnExist:true});report.package={file:candidatePackage,sha256:options.candidatePackageSha256};
    const m0=await runGate({mode:'verify',root,out:path.join(out,'protected-M0'),baseline:options.baseline,baselineSha256:options.baselineSha256,deltaFile:options.delta,deltaSha256:options.deltaSha256});
    report.protectedM0={status:m0.status,manifestSha256:m0.manifestSha256,checks:m0.checks,environment:m0.environment};
    if(m0.status!=='passed')throw Object.assign(new Error('Protected original M0 verification did not pass.'),{gateStatus:m0.status});
    const artifact=await fingerprints(root,await filesBelow(root,['dist']));report.artifact=artifact;report.build=JSON.parse(await readFile(path.join(root,'dist/adapters/diagnostics/build-info.json'),'utf8'));
    await stable(artifact);
    report.desktop=await assertDesktopArtifact(root,options.desktopResources,artifact);
    const stableDesktop=async()=>{if(JSON.stringify(await assertDesktopArtifact(root,report.desktop.resources,artifact))!==JSON.stringify(report.desktop))throw new Error('Signed packaged desktop identity changed during verification.');};
    for(const [index,evidence]of linux.entries()){
      const runtime=Object.fromEntries(Object.entries(evidence.report.artifacts).filter(([file])=>file.startsWith('runtime/')).map(([file,value])=>['dist/'+file.slice('runtime/'.length),value]));
      if(!equalMap(runtime,artifact))throw new Error('Pinned Linux runtime does not match the current M0-tested runtime.');
      await cp(evidence.directory,path.join(out,'linux-node'+(index?26:22)),{recursive:true,force:false,errorOnExist:true});
    }
    for(const check of contract.checks){
      await stable(artifact);await stablePackage();if(['native-input-accessibility','signed-desktop','packaged-diagnostics'].includes(check.id))await stableDesktop();
      const replacements={desktopResources:report.desktop.resources,candidatePackage,candidatePackageSha256:options.candidatePackageSha256,baseline:await realpath(options.baseline),baselineSha256:options.baselineSha256};
      const actual={...check,command:check.command.map(argument=>argument.replace(/\{(\w+)\}/g,(match,key)=>replacements[key]??match))};
      const execution=await executeCheck(root,actual);await writeFile(path.join(out,'logs',check.id+'.log'),execution.output);
      const assessed=assessProductionCheck(check,execution,{head:integration.head,build:report.build.build,scriptSha256:tracked[check.command[1]],packageSha256:options.candidatePackageSha256,runtimeArtifactSha256:hash(json(artifact))});report.checks.push({id:check.id,command:actual.command,...assessed});
      await stable(artifact);if(assessed.status!=='passed')throw Object.assign(new Error('Required production check did not pass: '+check.id),{gateStatus:assessed.status});
    }
    await stableDesktop();await stable(artifact);await stablePackage();if(hash(await readFile(path.join(out,'candidate-package.tgz')))!==options.candidatePackageSha256)throw new Error('Retained candidate package changed during verification.');
    for(const [index,evidence]of linux.entries()){const major=index?26:22;await readPinnedLinuxReport(path.join(out,'linux-node'+major,path.basename(evidence.file)),evidence.pin,source,{major,version:contract.linuxNodeVersions[major]});}
    await readBaseline(options.baseline,options.baselineSha256);await readBaseline(path.join(out,'protected-M0'),m0.manifestSha256);await readProductionContract(contractFile,options.contractSha256);await pinnedJson(options.delta,options.deltaSha256,'reviewed delta');
    const evidenceFiles=await filesBelow(out,['logs','production-contract.json','reviewed-delta.json','candidate-package.tgz']);report.evidence=await fingerprints(out,evidenceFiles);
    report.status='passed';await finish();report.reportSha256=hash(await readFile(path.join(out,'report.json')));return report;
  }catch(error){report.status=error.gateStatus??'blocked';report.error=error.message;await finish();return report;}
}

async function main(){
  const names=['target','expected-head','baseline','baseline-sha256','delta','delta-sha256','contract','contract-sha256','linux-node22-report','linux-node22-sha256','linux-node26-report','linux-node26-sha256','desktop-resources','candidate-package','candidate-package-sha256','out'];
  const {values}=parseArgs({options:Object.fromEntries([...names.map(name=>[name,{type:'string'}]),['help',{type:'boolean'}]]),strict:true,allowPositionals:false});
  if(values.help){console.log('Usage: node scripts/multiplayer-production-verify.mjs --target master --expected-head COMMIT --baseline DIR --baseline-sha256 SHA --delta FILE --delta-sha256 SHA --contract-sha256 SHA --linux-node22-report FILE --linux-node22-sha256 SHA --linux-node26-report FILE --linux-node26-sha256 SHA --desktop-resources APP/Contents/Resources --candidate-package FILE.tgz --candidate-package-sha256 SHA --out NEW_DIR');return;}
  for(const name of names.filter(name=>name!=='contract'))if(!values[name])throw new Error('Missing --'+name+'. Use --help for the complete protected integration command.');
  const camel=name=>name.replace(/-([a-z0-9])/g,(_,letter)=>letter.toUpperCase());const options=Object.fromEntries(Object.entries(values).map(([name,value])=>[camel(name),value]));
  const report=await runProductionGate(options);console.log(json({status:report.status,integration:report.integration,build:report.build,checks:report.checks.map(({id,status,reason})=>({id,status,...(reason?{reason}:{})})),...(report.reportSha256?{reportSha256:report.reportSha256}:{}),...(report.error?{error:report.error}:{})}));process.exitCode=report.status==='passed'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{console.error(error.message);process.exitCode=1;});
