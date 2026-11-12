// Disposable production gateway and actual sandboxed Electron window. The system
// opener is injected so no browser, installed app or user data is touched.
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {randomBytes} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {startCompanionGateway} from '../integrations/macos-companion/gateway.mjs';
import {createServerMemoryRuntime} from '../dist/server/index.js';
const repo=fileURLToPath(new URL('..',import.meta.url));
const electron=createRequire(new URL('../integrations/electron/package.json',import.meta.url))('electron');
const temporary=await realpath(await mkdtemp(path.join(os.tmpdir(),'jumpybrain-links-electron-')));
const root=path.join(temporary,'memory'),support=path.join(temporary,'support');
let gateway;
try{
  await mkdir(support,{mode:0o700});
  await createServerMemoryRuntime({root}).initializeMemoryRoot();
  const id='mem_a0000000-0000-4000-8000-000000000009';
  const note=path.join(root,'notes/links.md');
  const source=`---\nid: ${id}\ntype: note\ntitle: External links fixture\n---\nSee [Issue](https://example.com/issue/1145).\n\n- **Decision** Keep ordinary Markdown.\n- **Evidence** [Earlier](../decisions/example.md) and [Reference](https://example.com/reference).\n`;
  await writeFile(note,source);
  const controlKey=randomBytes(32).toString('hex');
  gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey,
    credentials:{get:async()=>null,set:async()=>{},delete:async()=>{},selectFolder:async()=>null}});
  const fixture=path.join(temporary,'fixture.json'),result=path.join(temporary,'result.json');
  await writeFile(fixture,JSON.stringify({origin:gateway.url,key:controlKey,id,note,result,userData:path.join(temporary,'electron')}),{mode:0o600});
  const entry=path.join(temporary,'app');await mkdir(entry);
  await writeFile(path.join(entry,'package.json'),JSON.stringify({name:'jumpybrain-links-smoke',type:'module',main:path.join(repo,'integrations/electron/smoke-external-links.mjs')}));
  const env={...process.env,JUMPYBRAIN_EXTERNAL_LINK_FIXTURE:fixture};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[entry],{env,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',()=>{});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
  const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timeout);
  const report=JSON.parse(await readFile(result,'utf8'));
  assert.equal(code,0,report.error);assert.equal(report.ok,true,report.error);
  const body=text=>text.replace(/^---\n[\s\S]*?\n---\n/,'');
  assert.equal(body(await readFile(note,'utf8')),body(source),'Activation and preview never rewrite canonical Markdown; the reverted path edit restores the exact body.');
  process.stdout.write(output.split(controlKey).join('[redacted]'));
}finally{await gateway?.close();await rm(temporary,{recursive:true,force:true});}
