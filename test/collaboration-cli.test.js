import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {ensureRootBackend,stopRootBackend} from '../dist/app/backend-host/index.js';

const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url));
const id='mem_48888888-8888-4888-8888-888888888888';
function command(args,options={}) {
  const process=spawn(globalThis.process.execPath,[cli,...args],{env:{...globalThis.process.env,...options.env},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';process.stdout.on('data',data=>{stdout+=data;});process.stderr.on('data',data=>{stderr+=data;});
  const result=new Promise(resolve=>process.once('close',code=>resolve({code,stdout,stderr})));
  if(options.input!==undefined)process.stdin.end(options.input);
  return {process,result};
}
async function until(predicate) {const deadline=Date.now()+10000;while(!await predicate()){if(Date.now()>deadline)throw new Error('Canonical streaming state did not arrive');await new Promise(resolve=>setTimeout(resolve,15));}}
async function fixture(t) {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jb-live-cli-')));await initializeMemoryRoot(root);
  const file=path.join(root,'notes/live.md');await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: CLI stream\n---\nHuman baseline\n`);
  t.after(async()=>{await stopRootBackend(root).catch(()=>{});await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});});
  return {root,file};
}
test('shipped CLI streams before EOF, preserves a concurrent human save, and finishes explicitly', {timeout:30000}, async t=>{
  const {root,file}=await fixture(t),backend=await ensureRootBackend(root);
  const child=command(['collaborate','stream','--root',root,'--id',id,'--client-id','agent-one','--stream-id','generated-test','--json']);
  t.after(()=>child.process.kill());
  child.process.stdin.write('Agent first');
  await until(async()=>(await readFile(file,'utf8')).includes('Agent first'));
  assert.equal(child.process.exitCode,null,'generated chunks reach Markdown while the producer is still running');
  const status=await command(['collaborate','status','--root',root,'--id',id,'--client-id','agent-one','--stream-id','generated-test','--json'],{input:''}).result;
  assert.equal(status.code,0,status.stderr);assert.equal(JSON.parse(status.stdout).stream.state,'active');
  const headers={Authorization:'Bearer '+backend.token,'content-type':'application/json'};
  const document=await (await fetch(backend.url+'/memories/all/documents/'+id,{headers})).json();
  const update=await fetch(backend.url+'/memories/all/documents/'+id,{method:'PUT',headers:{...headers,'If-Match':document.contentHash},body:JSON.stringify({content:document.content.replace('Human baseline','Human concurrent edit')})});
  assert.equal(update.status,200);
  await new Promise(resolve=>setTimeout(resolve,500));
  const emoji=Buffer.from(' 🧠');child.process.stdin.write(emoji.subarray(0,3));
  await new Promise(resolve=>setTimeout(resolve,20));child.process.stdin.end(emoji.subarray(3));
  const result=await child.result;assert.equal(result.code,0,result.stderr);
  const packet=JSON.parse(result.stdout);assert.equal(packet.saved,true);assert.equal(packet.clientId,'agent-one');assert.equal(packet.stream.state,'finished');
  const canonical=await readFile(file,'utf8');assert.match(canonical,/Human concurrent edit\nAgent first 🧠$/);
  const undo=command(['collaborate','undo','--root',root,'--id',id,'--client-id','agent-one','--json'],{input:''});
  const undone=await undo.result;assert.equal(undone.code,0,undone.stderr);
  assert.match(await readFile(file,'utf8'),/Human concurrent edit/,'agent undo retains human content');
});
test('malformed collaboration flags fail before a backend is started',async t=>{
  const {root}=await fixture(t);
  const result=await command(['collaborate','stream','--root',root,'--id',id,'--start','invalid'],{input:''}).result;
  assert.equal(result.code,1);assert.match(result.stderr,/nonnegative integer/);
  await assert.rejects(readFile(path.join(root,'.jumpybrain/backend/owner.json')),{code:'ENOENT'});
});
