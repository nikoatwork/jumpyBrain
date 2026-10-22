// Build/run the disposable native experiment; never installs or changes login items.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { parseArgs } from 'node:util';
import { createCorpus, fingerprintTree, hashFile, resolveOutputOutside } from './desktop-ram-fixtures.mjs';
const {values}=parseArgs({options:{output:{type:'string'},source:{type:'string'},count:{type:'string',default:'1000'},
  repetitions:{type:'string',default:'3'},settle:{type:'string',default:'15'},recovery:{type:'string',default:'300'}}});
if(process.platform!=='darwin'||!values.output||!values.source)throw new Error('Use --source ELECTRON_SUITE/snapshot --output NEW_DIRECTORY');
const repo=fileURLToPath(new URL('..',import.meta.url)),output=await resolveOutputOutside(values.source,values.output),count=Number(values.count),repetitions=Number(values.repetitions);
if(![0,100,1000,10000].includes(count)||!Number.isSafeInteger(repetitions)||repetitions<1||
  ![Number(values.settle),Number(values.recovery)].every(n=>Number.isFinite(n)&&n>=0))throw new Error('Invalid native workload settings');
await mkdir(output);
const snapshot=path.join(output,'snapshot');await cp(path.resolve(values.source),snapshot,{recursive:true});
const compiler=execFileSync('xcrun',['--find','swiftc'],{encoding:'utf8'}).trim();
const sdk=execFileSync('xcrun',['--sdk','macosx','--show-sdk-path'],{encoding:'utf8'}).trim();
const headers=path.resolve(compiler,'../../include/swift'),overlay=path.join(output,'swift-overlay.json'),empty=path.join(output,'empty.modulemap');
const compilerOptions=[];
try {
  if((await readFile(path.join(headers,'module.modulemap'),'utf8')).includes('module SwiftBridging')&&
     (await readFile(path.join(headers,'bridging.modulemap'),'utf8')).includes('module SwiftBridging')) {
    await writeFile(empty,'// Build-local duplicate CLT module-map workaround.\n');
    await writeFile(overlay,JSON.stringify({version:0,'case-sensitive':'false',roots:[{type:'file',name:path.join(headers,'module.modulemap'),'external-contents':empty}]}));
    compilerOptions.push('-vfsoverlay',overlay);
  }
}catch{}
const bundle=path.join(output,'RAM Native Prototype.app');await mkdir(path.join(bundle,'Contents/MacOS'),{recursive:true});
const executable=path.join(bundle,'Contents/MacOS/RAMPrototype');
execFileSync(compiler,['-swift-version','5','-O','-sdk',sdk,'-target',os.arch()+'-apple-macos13.0','-module-cache-path',path.join(output,'module-cache'),
  ...compilerOptions,path.join(repo,'deep-dives/desktop-ram/NativePrototype.swift'),'-o',executable,'-framework','Cocoa','-framework','WebKit'],{stdio:'pipe'});
await writeFile(path.join(bundle,'Contents/Info.plist'),`<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>RAMPrototype</string><key>CFBundleIdentifier</key><string>local.jumpybrain.ram-prototype.${Date.now()}</string><key>CFBundleName</key><string>RAM Native Prototype</string><key>NSHighResolutionCapable</key><true/><key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict></dict></plist>`);
execFileSync('/usr/bin/codesign',['--force','--sign','-',bundle],{stdio:'pipe'});
const sampler=path.join(output,'sample-tree');execFileSync('clang',['-O2',path.join(repo,'deep-dives/desktop-ram/sample-tree.c'),'-o',sampler]);
const manifest={schema:1,source:await fingerprintTree(snapshot),driver:await hashFile(executable),nativeBundle:await fingerprintTree(bundle),modelHash:null,
  settings:{counts:[count],repetitions,settleSeconds:Number(values.settle),recoverySeconds:Number(values.recovery),semantic:false},
  machine:{os:execFileSync('sw_vers',['-productVersion'],{encoding:'utf8'}).trim(),arch:os.arch(),cpu:os.cpus()[0].model,ram:os.totalmem()},
  caveats:'Disposable unsandboxed WKWebView host with production native helper/gateway/editor. No login/update/tray implementation; not migration-ready. Pan uses in-page map APIs. WebKit XPCs counted by OS responsibility using a private diagnostic symbol, plus descendants.'};
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(let repetition=1;repetition<=repetitions;repetition++) {
  const run=path.join(output,`${count}-${repetition}`);await mkdir(run);
  const resources=path.join(run,'Resources');await cp(path.join(snapshot,'Resources'),resources,{recursive:true});
  const root=path.join(run,'memory');await createCorpus(root,count);
  const support=path.join(run,'support');await mkdir(support,{mode:0o700});await writeFile(path.join(support,'api-key'),randomBytes(32).toString('hex'),{mode:0o600});
  const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
  const nativeFile=path.join(resources,'native/jumpyBrain Host.app/Contents/Resources/Configuration.json');
  const native=JSON.parse(await readFile(nativeFile,'utf8'));await writeFile(nativeFile,JSON.stringify({...native,supportDirectory:support,memoryRoot:root,port}));
  execFileSync('/usr/bin/codesign',['--force','--sign','-',path.join(resources,'native/jumpyBrain Host.app')],{stdio:'pipe'});
  const config={resources,support,root,port,count,events:path.join(run,'events.jsonl'),result:path.join(run,'result.json'),settleSeconds:Number(values.settle),recoverySeconds:Number(values.recovery)};
  const file=path.join(run,'config.json');await writeFile(file,JSON.stringify(config));
  const launcher=spawn('/usr/bin/open',['-n','-W',bundle,'--args',file],{stdio:'ignore'});
  const exited=new Promise(resolve=>launcher.once('exit',resolve));let pid;
  for(let attempt=0;attempt<300&&!pid;attempt++) {try{pid=JSON.parse((await readFile(config.events,'utf8')).split('\n')[0]).pid;}catch{}if(!pid)await pause(100);}
  if(!pid)throw new Error('Native prototype did not launch');
  const monitor=spawn(sampler,[String(pid),'100','--responsible'],{stdio:['ignore','pipe','pipe']});
  const raw=createWriteStream(path.join(run,'samples.jsonl'),{mode:0o600});monitor.stdout.pipe(raw);monitor.stderr.pipe(process.stderr);
  const sampled=new Promise(resolve=>monitor.once('exit',resolve));
  const code=await exited;
  let timer;const samplerCode=await Promise.race([sampled,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),60000);})]);clearTimeout(timer);
  if(samplerCode===null){monitor.kill('SIGTERM');await sampled;}
  await new Promise(resolve=>raw.closed?resolve():raw.once('close',resolve));
  await writeFile(path.join(run,'exit.json'),JSON.stringify({code,samplerCode}));
  const result=JSON.parse(await readFile(config.result,'utf8'));if(!result.ok||samplerCode!==0)throw new Error('Native run incomplete');
  console.log(`Native ${count}-${repetition}: complete, responsibility tree exited`);
}
