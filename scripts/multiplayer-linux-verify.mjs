#!/usr/bin/env node
// Isolated representative Linux/TLS evidence. Never a substitute for the frozen
// M0 oracle, a real public VPS deployment, browser QA or signed Mac installation.
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { tapSummary } from './multiplayer-verify.mjs';

const repository=fileURLToPath(new URL('..',import.meta.url));
const defaultImage='node:26.7.0-bookworm-slim',defaultNode='v26.7.0';
const tests=['test/backend-host.test.js','test/backend-control.test.js','test/backend-maintenance.test.js','test/access-control.test.js','test/browser-session.test.js','test/companion-live-gateway.test.js','test/collaboration-editor.test.js','test/collaboration-cli.test.js','test/collaboration-cli-read-base.test.js','test/electron-live-network.test.js','test/collaboration-actor-lifecycle.test.js','test/collaboration-hub-actor-lifecycle.test.js','test/collaboration-model.test.js','test/collaboration-advanced-model.test.js','test/collaboration-provenance.test.js','test/editor-source-map.test.js','test/collaboration-labels.test.js','test/retained-comparison-preview.test.js','test/collaboration-hub.test.js','test/collaboration-history.test.js','test/collaboration-batch-hub.test.js','test/collaboration-presence-recovery.test.js','test/collaboration-live.test.js','test/collaboration-durability.test.js','test/filesystem-publication.test.js','test/multiplayer-upgrade.test.js','test/collaboration-tls.test.js'];
const roots=['src','scripts','test','integrations','package.json','package-lock.json','tsconfig.json','extensions.js','extensions.d.ts'];
const ignored=new Set(['node_modules','dist','.git','.local-pack','.jumpybrain','__pycache__']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=value=>JSON.stringify(value,null,2)+'\n';
async function destination(file) {let ancestor=path.resolve(file);const tail=[];for(;;){try{return path.join(await realpath(ancestor),...tail);}catch(error){if(error.code!=='ENOENT'||ancestor===path.dirname(ancestor))throw error;tail.unshift(path.basename(ancestor));ancestor=path.dirname(ancestor);}}}
async function inputs(root) {
  const files={};
  async function visit(relative){const file=path.join(root,relative),stat=await lstat(file);if(stat.isSymbolicLink())throw new Error('Linked source inputs are unsupported: '+relative);if(stat.isDirectory()){for(const name of(await readdir(file)).sort())if(!ignored.has(name))await visit(path.posix.join(relative,name));}else if(stat.isFile())files[relative]=hash(await readFile(file));else throw new Error('Special source input: '+relative);}
  for(const relative of roots)await visit(relative);return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
}
async function artifactFiles(root) {
  const files={};
  async function visit(relative){const file=path.join(root,relative),stat=await lstat(file);if(stat.isSymbolicLink())throw new Error('Linked Linux evidence artifact.');if(stat.isDirectory()){for(const name of(await readdir(file)).sort())await visit(path.posix.join(relative,name));}else if(stat.isFile())files[relative]=hash(await readFile(file));else throw new Error('Special Linux evidence artifact.');}
  for(const name of(await readdir(root)).sort())if(name!=='report.json')await visit(name);return Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
}
async function command(binary,args,{timeoutMs=600000,input}={}) {
  return new Promise(resolve=>{let output='',overflow=false,timedOut=false;const child=spawn(binary,args,{stdio:['pipe','pipe','pipe']});
    const stop=()=>{try{child.kill('SIGKILL');}catch{}};
    const collect=chunk=>{if(Buffer.byteLength(output)+chunk.length>16*1024*1024){overflow=true;stop();return;}output+=chunk.toString();process.stdout.write(chunk);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);const timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
    child.on('error',error=>{clearTimeout(timer);resolve({code:null,error:error.code??error.message,output,timedOut,overflow});});child.on('close',code=>{clearTimeout(timer);resolve({code,output,timedOut,overflow});});child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
function containerProgram(expectedNode){return `
import {cp,readFile,writeFile,readdir} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
const tests=${JSON.stringify(tests)},expectedNode=${JSON.stringify(expectedNode)},metadata={version:1,status:'blocked',node:process.version,platform:process.platform,arch:process.arch,osRelease:os.release(),tests,steps:[]};
const ignored=new Set(${JSON.stringify([...ignored])});
async function run(id,command,args){let output='';const code=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:'/workspace',stdio:['ignore','pipe','pipe']});const collect=chunk=>{output+=chunk;process.stdout.write(chunk);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.on('error',reject);child.on('close',resolve);});await writeFile('/evidence/'+id+'.log',output);metadata.steps.push({id,command:[command,...args],code});if(code!==0)throw new Error('Required Linux step failed: '+id);return output;}
let built=false;
try{if(process.platform!=='linux'||process.version!==expectedNode)throw new Error('The exact required Linux Node version is unavailable.');await cp('/input','/workspace',{recursive:true,filter:file=>!path.relative('/input',file).split(path.sep).some(part=>ignored.has(part))});metadata.lockSha256=createHash('sha256').update(await readFile('/workspace/package-lock.json')).digest('hex');
metadata.npm=(await run('toolchain','npm',['--version'])).trim();await run('install','npm',['ci','--ignore-scripts','--no-audit','--no-fund']);await run('build','npm',['run','build']);built=true;metadata.build=JSON.parse(await readFile('/workspace/dist/adapters/diagnostics/build-info.json','utf8'));await run('tests',process.execPath,['--test','--test-reporter=tap','--test-concurrency=2',...tests]);metadata.status='passed';}
catch(error){metadata.status='failed';metadata.error=error.message;process.exitCode=1;}
finally{if(built)await cp('/workspace/dist','/evidence/runtime',{recursive:true});await writeFile('/evidence/container.json',JSON.stringify(metadata,null,2)+'\\n');}
`;}
async function main() {
  const {values}=parseArgs({options:{out:{type:'string'},image:{type:'string',default:defaultImage},'expected-node':{type:'string',default:defaultNode},'docker-host':{type:'string'},help:{type:'boolean',default:false}},strict:true,allowPositionals:false});
  if(values.help){console.log('Usage: node scripts/multiplayer-linux-verify.mjs --out NEW_EVIDENCE_DIR [--image node:26.7.0-bookworm-slim|node@sha256:...] [--expected-node v26.7.0] [--docker-host ENDPOINT]. The exact declared Node version is required; no silent fallback. Docker mounts source read-only and installs/builds/tests in a temporary Linux workspace.');return;}
  if(!values.out)throw new Error('--out NEW_EVIDENCE_DIR is required.');
  if(values.image!==defaultImage&&!/^node@sha256:[a-f0-9]{64}$/.test(values.image))throw new Error('Use the exact named Node image or an explicitly pinned Node image digest.');
  const expectedNode=values['expected-node'];if(!/^v\d+\.\d+\.\d+$/.test(expectedNode)||Number(expectedNode.split('.')[0].slice(1))<22)throw new Error('--expected-node must pin an exact supported Node version >=22.');
  const out=await destination(values.out),root=await realpath(repository);
  if(roots.some(entry=>out===path.join(root,entry)||out.startsWith(path.join(root,entry)+path.sep)))throw new Error('Evidence must be outside source, test and script inputs.');
  await mkdir(path.dirname(out),{recursive:true});await mkdir(out);
  const report={version:1,status:'blocked',startedAt:new Date().toISOString(),imageRequested:values.image,expectedNode,tests,limits:['Representative Linux/arm64 Docker environment with a real local HTTPS/WSS reverse proxy and explicit ephemeral CA; no public VPS, real DNS, production proxy, multi-host network, browser or physical machine claim.','Selected deterministic tests only; no QMD/model downloads or semantic retrieval-quality claim.','Source is copied read-only into an isolated container; concurrent host input changes block acceptance.']};
  const config=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-docker-anonymous-')),name='jumpybrain-linux-'+randomUUID();
  const writeReport=async()=>{report.finishedAt=new Date().toISOString();await writeFile(path.join(out,'report.json'),json(report));};
  let dockerArgs;
  try{
    await writeFile(path.join(config,'config.json'),'{}',{mode:0o600});
    const host=values['docker-host']??execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim();
    dockerArgs=['--config',config,'--host',host];report.source=await inputs(root);report.sourceMapSha256=hash(json(report.source));
    let inspect;try{inspect=JSON.parse(execFileSync('docker',[...dockerArgs,'image','inspect',values.image],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))[0];}catch{
      const pull=await command('docker',[...dockerArgs,'pull',values.image],{timeoutMs:300000});await writeFile(path.join(out,'pull.log'),pull.output);if(pull.code!==0||pull.timedOut||pull.overflow)throw new Error('Exact Docker image could not be provisioned.');inspect=JSON.parse(execFileSync('docker',[...dockerArgs,'image','inspect',values.image],{encoding:'utf8'}))[0];
    }
    const digest=inspect.RepoDigests?.find(value=>value.startsWith('node@sha256:'))??inspect.RepoDigests?.[0];
    if(!digest||inspect.Os!=='linux')throw new Error('The image has no immutable Linux registry digest.');
    report.image={digest,id:inspect.Id,platform:inspect.Os+'/'+inspect.Architecture};
    const args=[...dockerArgs,'run','--rm','--name',name,'--label','jumpybrain.verification=multiplayer-linux','--memory','2g','--cpus','3','--pids-limit','256','--mount',`type=bind,source=${root},target=/input,readonly`,'--mount',`type=bind,source=${out},target=/evidence`,'--tmpfs','/workspace:rw,exec,size=1073741824','-i',digest,'node','--input-type=module','-'];
    const execution=await command('docker',args,{timeoutMs:600000,input:containerProgram(expectedNode)});await writeFile(path.join(out,'docker.log'),execution.output);
    report.execution={code:execution.code,timedOut:execution.timedOut,overflow:execution.overflow,...(execution.error?{error:execution.error}:{})};
    report.container=JSON.parse(await readFile(path.join(out,'container.json'),'utf8'));
    report.sourceStable=JSON.stringify(report.source)===JSON.stringify(await inputs(root));
    if(!report.sourceStable)throw new Error('Source inputs changed during Linux verification; rerun the final candidate.');
    if(report.container.status!=='passed')throw new Error(report.container.error??'A required Linux step failed.');
    const summary=tapSummary(await readFile(path.join(out,'tests.log'),'utf8'));report.observation=summary;
    if(execution.code!==0||execution.timedOut||execution.overflow||report.container.status!=='passed'||summary.fail||summary.cancelled||summary.skipped||summary.todo||summary.tests!==summary.pass)throw new Error('The selected Linux/TLS suite did not fully pass.');
    report.artifacts=await artifactFiles(out);report.artifactMapSha256=hash(json(report.artifacts));
    report.status='passed';await writeReport();console.log(JSON.stringify({status:report.status,image:report.image,tests:summary.tests,sourceMapSha256:report.sourceMapSha256,artifactMapSha256:report.artifactMapSha256,reportSha256:hash(await readFile(path.join(out,'report.json'))),out}));
  }catch(error){report.status='blocked';report.error=error.message;await writeReport();console.error(JSON.stringify({status:report.status,error:report.error,out}));process.exitCode=1;}
  finally{if(dockerArgs)try{execFileSync('docker',[...dockerArgs,'rm','-f',name],{stdio:'ignore'});}catch{}await rm(config,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{console.error(error.message);process.exitCode=1;});
