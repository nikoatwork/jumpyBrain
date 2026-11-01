import assert from 'node:assert/strict';
import test from 'node:test';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {ensureRootBackend,stopRootBackend} from '../dist/app/backend-host/index.js';

const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url)),id='mem_48888888-8888-4888-8888-888888888888';
function run(args,input='') {return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[cli,...args],{stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));child.stdin.end(input);});}
const bodyOf=content=>content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
async function fixture(t) {
  const root=await realpath(await mkdtemp(path.join(os.tmpdir(),'jb-cli-read-base-')));await initializeMemoryRoot(root);
  const file=path.join(root,'notes/read.md');await writeFile(file,`---\nid: ${id}\ntype: note\ntitle: Read basis\n---\nalpha bravo`);
  t.after(async()=>{await stopRootBackend(root).catch(()=>{});await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});});
  const args=['--root',root,'--id',id,'--client-id','read-basis-agent','--json'];
  const result=await run(['collaborate','open',...args]);assert.equal(result.code,0,result.stderr);const read=JSON.parse(result.stdout);
  return {root,file,args,read,version:['--epoch',read.epoch,'--base-revision',String(read.revision)]};
}
async function humanUpdate(root,replace) {
  const backend=await ensureRootBackend(root),url=backend.url+'/memories/all/documents/'+id,headers={Authorization:'Bearer '+backend.token,'content-type':'application/json'};
  const response=await fetch(url,{headers});assert.equal(response.status,200);const before=await response.json();
  const update=await fetch(url,{method:'PUT',headers:{...headers,'If-Match':before.contentHash},body:JSON.stringify({content:replace(before.content)})});assert.equal(update.status,200,await update.text());
}
test('CLI edits retain their actual read revision across a human prefix insertion', {timeout:30000},async t=>{
  const f=await fixture(t);assert.equal(f.read.body,'alpha bravo');await humanUpdate(f.root,content=>content.replace('alpha bravo','NEW alpha bravo'));
  const result=await run(['collaborate','edit',...f.args,'--start','6','--delete','5',...f.version],'BRAVO');
  assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).saved,true);
  assert.equal(bodyOf(await readFile(f.file,'utf8')),'NEW alpha BRAVO','old offsets must be transformed from their read base, never relabeled with a new open revision');
});
test('CLI rejects a real overlapping stale replacement instead of overwriting the newer human text', {timeout:30000},async t=>{
  const f=await fixture(t);await humanUpdate(f.root,content=>content.replace('bravo','human'));
  const result=await run(['collaborate','edit',...f.args,'--start','6','--delete','5',...f.version],'BRAVO');
  assert.notEqual(result.code,0);assert.match(result.stderr,/same source range|overlap|conflict|review|reconcile/i);assert.equal(bodyOf(await readFile(f.file,'utf8')),'alpha human');
});
test('positioned streams use their read revision and append after transformed independent insertions', {timeout:30000},async t=>{
  const f=await fixture(t);await humanUpdate(f.root,content=>content.replace('alpha bravo','NEW alpha bravo'));
  const result=await run(['collaborate','stream',...f.args,'--start','6',...f.version],'AGENT ');
  assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).stream.state,'finished');
  assert.equal(bodyOf(await readFile(f.file,'utf8')),'NEW alpha AGENT bravo');
});
test('an old CLI read epoch cannot publish after backend restart', {timeout:30000},async t=>{
  const f=await fixture(t);await stopRootBackend(f.root);
  const result=await run(['collaborate','edit',...f.args,'--start','6','--delete','5',...f.version],'BRAVO');
  assert.notEqual(result.code,0);assert.match(result.stderr,/resynchron|epoch|retained/i);assert.equal(bodyOf(await readFile(f.file,'utf8')),'alpha bravo');
});
test('CLI positioned writes require a complete read version and reject silently ignored stream deletion',async()=>{
  for(const args of [
    ['edit','--start','6','--delete','5'],
    ['edit','--epoch','read-epoch'],
    ['edit','--epoch','read-epoch','--base-revision','-1'],
    ['stream','--start','6'],
    ['stream','--delete','5'],
    ['stream','--epoch','read-epoch','--base-revision','0'],
    ['open','--epoch','read-epoch','--base-revision','0'],
  ]) {const result=await run(['collaborate',...args,'--id',id,'--json'],'BRAVO');assert.notEqual(result.code,0);assert.match(result.stderr,/read|revision|epoch|delete/i);}
});
