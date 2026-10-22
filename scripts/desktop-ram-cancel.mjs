// Real provisioned-model cancellation probe; only a disposable canonical root is written.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createCorpus, hashFile, resolveOutputOutside } from './desktop-ram-fixtures.mjs';

const {values}=parseArgs({options:{source:{type:'string'},sampler:{type:'string'},model:{type:'string'},output:{type:'string'}}});
if(process.platform!=='darwin'||!values.source||!values.sampler||!values.model||!values.output)throw new Error('Use --source SNAPSHOT --sampler BIN --model GGUF --output NEW_DIRECTORY');
const output=await resolveOutputOutside(values.source,values.output);await mkdir(output);
const root=path.join(output,'memory');await createCorpus(root,1000);
const configFile=path.join(root,'jumpybrain.json'),config=JSON.parse(await readFile(configFile,'utf8'));
const modelHash=(await hashFile(values.model)).sha256;
config.indexing={mode:'semantic',model:path.resolve(values.model),modelHash};
await writeFile(configFile,JSON.stringify(config,null,2)+'\n');
const native=JSON.parse(await readFile(path.join(values.source,'Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json'),'utf8'));
const cli=path.resolve(values.source,'Resources/runtime/dist/cli.js');
const child=spawn(native.node,[cli,'index','--root',root,'--json'],{
  env:{...process.env,JUMPYBRAIN_QMD_BIN:native.qmd,JUMPYBRAIN_INDEX_TIMEOUT_MS:'120000'},stdio:['ignore','pipe','pipe']});
let stderr='',stdout='',abortedAt=null,trigger=null,last=null,raw='';
child.stderr.on('data',chunk=>{stderr+=chunk;});child.stdout.on('data',chunk=>{stdout+=chunk;});
const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
const monitor=spawn(path.resolve(values.sampler),[String(child.pid),'100'],{stdio:['ignore','pipe','pipe']});
const sampled=new Promise((resolve,reject)=>{monitor.once('error',reject);monitor.once('close',resolve);});
let pending='';
monitor.stdout.on('data',chunk=>{
  raw+=chunk;pending+=chunk;
  while(pending.includes('\n')) {
    const end=pending.indexOf('\n'),line=pending.slice(0,end);pending=pending.slice(end+1);
    const sample=JSON.parse(line);last=sample;
    const worker=sample.processes.find(p=>p.pid!==child.pid&&p.physical>400_000_000);
    if(!abortedAt&&worker){abortedAt=Date.now();trigger={pid:worker.pid,physicalBytes:worker.physical};child.kill('SIGTERM');}
  }
});
let monitorError='';monitor.stderr.on('data',chunk=>{monitorError+=chunk;});
const watchdog=setTimeout(()=>child.kill('SIGTERM'),90000);
try {
  const exit=await closed;
  let timer;
  const samplerCode=await Promise.race([sampled,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),16000);})]);
  clearTimeout(timer);
  if(samplerCode===null){monitor.kill('SIGTERM');await sampled;}
  await writeFile(path.join(output,'samples.jsonl'),raw,{mode:0o600});
  await writeFile(path.join(output,'stderr.log'),stderr,{mode:0o600});
  assert.ok(abortedAt,'model worker must reach the observed allocation threshold before cancellation');
  assert.equal(exit.code,1);assert.match(stderr,/Memory operation canceled/);
  assert.equal(samplerCode,0,monitorError);assert.equal(last?.processes.length,0,'all observed descendants must exit');
  for(const file of ['index.lock','index.json']) {
    await assert.rejects(readFile(path.join(root,'.jumpybrain',file)),{code:'ENOENT'},file+' must not survive canceled first indexing');
  }
  await writeFile(path.join(output,'result.json'),JSON.stringify({ok:true,modelHash,trigger,
    cancellationToTreeExitMs:last.timeMs-abortedAt,descendantsExited:true,unpublishedGeneration:true,exit,stdoutBytes:Buffer.byteLength(stdout)},null,2)+'\n');
  console.log('Real semantic index canceled; observed model worker and descendants exited, lock released, no generation published.');
} finally {
  clearTimeout(watchdog);
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  if(monitor.exitCode===null&&monitor.signalCode===null)monitor.kill('SIGTERM');
}
