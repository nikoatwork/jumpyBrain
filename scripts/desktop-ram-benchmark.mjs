// Isolated whole-desktop workload. Run after npm run build, on macOS.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, cp, readdir, open, realpath } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { createCorpus, fingerprintTree, hashFile, resolveOutputOutside } from './desktop-ram-fixtures.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url));
const {values}=parseArgs({options:{ output:{type:'string'}, counts:{type:'string',default:'0,100,1000,10000'},
  repetitions:{type:'string',default:'3'}, settle:{type:'string',default:'15'}, recovery:{type:'string',default:'300'},
  soak:{type:'string',default:'0'}, 'no-semantic':{type:'boolean'}, source:{type:'string'},driver:{type:'string'},
  model:{type:'string',default:path.join(os.homedir(),'.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf')} }});
if(process.platform!=='darwin'||!values.output) throw new Error('Requires macOS and --output NEW_DIRECTORY');
const built=path.join(repo,'.local-pack/desktop/jumpyBrain.app/Contents/Resources');
const output=await resolveOutputOutside(values.source?path.resolve(values.source):path.resolve(built,'../..'),values.output);await mkdir(output);
const counts=values.counts.split(',').map(Number), repetitions=Number(values.repetitions);
const settleSeconds=Number(values.settle),recoverySeconds=Number(values.recovery),soakSeconds=Number(values.soak);
if(!counts.every(n=>[0,100,1000,10000].includes(n))||!Number.isSafeInteger(repetitions)||repetitions<1||
  ![settleSeconds,recoverySeconds,soakSeconds].every(n=>Number.isFinite(n)&&n>=0)) throw new Error('Invalid workload settings');
const snapshot=path.join(output,'snapshot');
const driver=path.join(output,'driver.mjs');
await cp(values.driver?path.resolve(values.driver):fileURLToPath(new URL('./desktop-ram-app.mjs',import.meta.url)),driver);
if(values.source) await cp(path.resolve(values.source),snapshot,{recursive:true});
else {
  await mkdir(snapshot); await mkdir(path.join(snapshot,'Resources/native'),{recursive:true});
  await cp(path.join(built,'native/jumpyBrain Host.app'),path.join(snapshot,'Resources/native/jumpyBrain Host.app'),{recursive:true});
  await cp(path.join(built,'MenuBarBrain.png'),path.join(snapshot,'Resources/MenuBarBrain.png'));
  const runtime=path.join(snapshot,'Resources/runtime');await mkdir(runtime);
  for(const name of ['dist','package.json']) await cp(path.join(repo,name),path.join(runtime,name),{recursive:true});
  await mkdir(path.join(runtime,'integrations'));
  await cp(path.join(repo,'integrations/macos-companion'),path.join(runtime,'integrations/macos-companion'),{recursive:true});
  const shell=path.join(snapshot,'electron');await mkdir(shell);
  for(const file of await readdir(path.join(repo,'integrations/electron'))) if(file.endsWith('.mjs'))
    await cp(path.join(repo,'integrations/electron',file),path.join(shell,file));
}
const native=JSON.parse(await readFile(path.join(snapshot,'Resources/native/jumpyBrain Host.app/Contents/Resources/Configuration.json'),'utf8'));
const electron=createRequire(new URL('../integrations/electron/package.json',import.meta.url))('electron');
const sampler=path.join(output,'sample-tree');
execFileSync('clang',['-O2','-Wall','-Wextra',path.join(repo,'deep-dives/desktop-ram/sample-tree.c'),'-o',sampler]);
const modelHash=values['no-semantic']?null:(await hashFile(values.model)).sha256;
let qmdRoot=path.dirname(await realpath(native.qmd));
while(true) {
  try {if(JSON.parse(await readFile(path.join(qmdRoot,'package.json'),'utf8')).name==='@tobilu/qmd')break;}catch{}
  const parent=path.dirname(qmdRoot);if(parent===qmdRoot)throw new Error('Cannot identify external QMD package');qmdRoot=parent;
}
const identity={schema:1,createdAt:new Date().toISOString(),source:await fingerprintTree(snapshot),
  driver:await hashFile(driver),sampler:await hashFile(sampler),
  electron:await hashFile(electron),node:await hashFile(await import('node:fs/promises').then(fs=>fs.realpath(native.node))),
  qmdLauncher:await hashFile(await import('node:fs/promises').then(fs=>fs.realpath(native.qmd))),
  qmdPackage:{version:JSON.parse(await readFile(path.join(qmdRoot,'package.json'),'utf8')).version,tree:await fingerprintTree(qmdRoot)},
  modelHash,model:values['no-semantic']?null:values.model,
  machine:{os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),arch:os.arch(),cpu:os.cpus()[0].model,ram:os.totalmem()},
  settings:{counts,repetitions,settleSeconds,recoverySeconds,soakSeconds,semantic:!values['no-semantic']},
  artifact:'Source snapshot of built checkout runtime + Electron shell; native helper from packed app. This is not the unmodified installed bundle.',
  caveats:'100ms libproc samples are not atomic; children shorter than cadence may be missed. Per-process lifetime peaks are recorded but never summed. RSS is separate. OS filesystem cache is warm/uncontrolled.'};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(identity,null,2));
let active,monitor;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function port() {const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
try {
for(const count of counts) for(let repetition=1;repetition<=repetitions;repetition++) {
  const label=`${count}-${repetition}`,run=path.join(output,label);await mkdir(run);
  const resources=path.join(run,'Resources');await cp(path.join(snapshot,'Resources'),resources,{recursive:true});
  const root=path.join(run,'memory');await createCorpus(root,count);
  const support=path.join(run,'support');await mkdir(support,{mode:0o700});
  await writeFile(path.join(support,'api-key'),randomBytes(32).toString('hex'),{mode:0o600});
  const runPort=await port();
  await writeFile(path.join(resources,'native/jumpyBrain Host.app/Contents/Resources/Configuration.json'),JSON.stringify({...native,supportDirectory:support,memoryRoot:root,port:runPort}));
  execFileSync('/usr/bin/codesign',['--force','--sign','-',path.join(resources,'native/jumpyBrain Host.app')],{stdio:'pipe'});
  await writeFile(path.join(resources,'desktop.json'),JSON.stringify({schema:1,supportDirectory:support,port:runPort,launchAgent:path.join(run,'unused-login.plist')}));
  const userData=path.join(run,'user-data');await mkdir(userData);await writeFile(path.join(userData,'desktop-setup.json'),'{"version":1}');
  const config={label,resources,root,userData,count,application:path.join(snapshot,'electron/application.mjs'),
    result:path.join(run,'result.json'),events:path.join(run,'events.jsonl'),settleSeconds,recoverySeconds,soakSeconds,
    semantic:!values['no-semantic'],model:values.model,modelHash};
  const configFile=path.join(run,'config.json');await writeFile(configFile,JSON.stringify(config));
  await writeFile(path.join(run,'resource-identity.json'),JSON.stringify(await fingerprintTree(resources)));
  const entry=path.join(run,'entry');await mkdir(entry);
  await writeFile(path.join(entry,'package.json'),JSON.stringify({name:'jumpybrain-ram-benchmark',version:'0.3.3',type:'module',main:driver}));
  const env={...process.env,JUMPYBRAIN_RAM_RUN:configFile};delete env.ELECTRON_RUN_AS_NODE;
  const errorLog=await open(path.join(run,'stderr.log'),'wx',0o600);
  active=spawn(electron,[entry],{env,stdio:['ignore','pipe',errorLog.fd]});
  active.stdout.on('data',chunk=>process.stdout.write(label+' '+chunk));
  const exited=new Promise((resolve,reject)=>{active.once('error',reject);active.once('exit',(code,signal)=>resolve({code,signal}));});
  monitor=spawn(sampler,[String(active.pid),'100'],{stdio:['ignore','pipe','pipe']});
  const raw=createWriteStream(path.join(run,'samples.jsonl'),{flags:'wx',mode:0o600});monitor.stdout.pipe(raw);
  monitor.stderr.on('data',chunk=>process.stderr.write(chunk));
  const sampled=new Promise((resolve,reject)=>{monitor.once('error',reject);monitor.once('exit',code=>resolve(code));});
  const timeout=setTimeout(()=>active.kill('SIGTERM'),7200000);
  const result=await exited;clearTimeout(timeout);await errorLog.close();
  const monitorResult=await Promise.race([sampled,pause(16000).then(()=>null)]);
  if(monitorResult===null) {monitor.kill('SIGTERM');await sampled;throw new Error('Owned descendants survived quit: '+label);}
  await new Promise(resolve=>raw.closed?resolve():raw.once('close',resolve));
  await writeFile(path.join(run,'exit.json'),JSON.stringify({...result,samplerCode:monitorResult}));
  if(result.code!==0||monitorResult!==0) throw new Error('Workload failed: '+label+'; inspect result/events');
  if(JSON.parse(await readFile(config.result,'utf8')).ok!==true) throw new Error('Incomplete workload: '+label);
  console.log(label+': tree exited, fixture saved');
}
const verification={checkedAt:new Date().toISOString(),
  source:(await fingerprintTree(snapshot)).sha256===identity.source.sha256,
  driver:(await hashFile(driver)).sha256===identity.driver.sha256,
  sampler:(await hashFile(sampler)).sha256===identity.sampler.sha256,
  electron:(await hashFile(electron)).sha256===identity.electron.sha256,
  node:(await hashFile(await realpath(native.node))).sha256===identity.node.sha256,
  qmdLauncher:(await hashFile(await realpath(native.qmd))).sha256===identity.qmdLauncher.sha256,
  qmdPackage:(await fingerprintTree(qmdRoot)).sha256===identity.qmdPackage.tree.sha256,
  model:values['no-semantic']||(await hashFile(values.model)).sha256===identity.modelHash};
verification.ok=Object.entries(verification).filter(([key])=>key!=='checkedAt').every(([,value])=>value===true);
await writeFile(path.join(output,'verification.json'),JSON.stringify(verification,null,2)+'\n');
if(!verification.ok)throw new Error('Benchmark artifact/dependency identity changed during the suite');
} finally {
  if(active?.exitCode===null&&active?.signalCode===null)active.kill('SIGTERM');
  if(monitor?.exitCode===null&&monitor?.signalCode===null)monitor.kill('SIGTERM');
}
