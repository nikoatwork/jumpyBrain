import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeMemoryRoot } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { parseArgs } from '../dist/cli/args.js';
const execute=promisify(execFile), cliPath=path.resolve('dist/cli.js');
const page='mem_00000000-0000-0000-0000-000000000001';
const cli=(args,env={})=>execute(process.execPath,[cliPath,'board',...args],{env:{...process.env,...env},maxBuffer:1024*1024});
test('board parsing requires exactly one ordinary target, strict hashes and fields',async()=>{
  for(const args of [
    ['list'],['list','--root'],['list','--directory','/tmp'],['list','--root','a','--target-url','http://example.test'],
    ['list','--root','a','--json=true'],['list','--root','a','--root','b'],['list','--brain','x'],
    ['delete','--root','a','--board','x','--if-match','1'],['create','--root','a','--name','x','--column','one'],
    ['add','--root','a','--board','x','--page',page,'--column','4','--if-match','sha256:'+'0'.repeat(64)],
    ['status','--root','a','--board','x','--limit','51'],['create','--root','a','--name','x','--file','y'],
  ])assert.throws(()=>parseArgs(['board',...args]),undefined,args.join(' '));
  assert.match((await cli(['--help'])).stdout,/--target-url/);
});
for(const remote of [false,true])test(`complete board CLI workflow ${remote?'through hosted transport':'without a Mac app'}`,async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'jb-board-cli-root-'));await initializeMemoryRoot(root);
  let server;if(remote)server=await startJumpyBrainHttpServer({root,apiKeys:['fixture'],host:'127.0.0.1',port:0,autoIndex:false});
  t.after(async()=>{await server?.close();await rm(root,{recursive:true,force:true});});
  const target=remote?['--target-url',server.url]:['--root',root];
  const run=async(...args)=>JSON.parse((await cli([...args,...target,'--json'],{JUMPYBRAIN_API_KEY:'fixture'})).stdout);
  const content=`---\nid: ${page}\ntitle: Venue shortlist\ntype: note\n---\nNo bookings confirmed.\n`;
  await writeFile(path.join(root,'notes/venue.md'),content);
  const file=path.join(root,'layout.json');await writeFile(file,JSON.stringify({name:'Wedding',columns:['Ideas','Arranging','Confirmed'].map(name=>({name,pages:[]}))}));
  let result=await run('create','--file',file);const id=result.board.id;
  assert.match(result.contentHash,/^sha256:/);assert.equal((await readdir(path.join(root,'boards'))).filter(x=>x.endsWith('.json')).length,1);
  result=await run('add','--board','Wedding','--page',page,'--column','1','--if-match',result.contentHash);
  result=await run('add','--board',id,'--page',page,'--column','2','--if-match',result.contentHash);
  assert.deepEqual(result.board.columns.map(c=>c.pages),[[],[page],[]]);
  const status=await run('status','--board','Wedding');assert.match(status.columns[1].cards[0].excerpt,/No bookings/);assert.equal(status.partial,false);
  assert.equal(JSON.stringify(status).includes(remote?root:'nonexistent marker'),false);
  const old=result.contentHash;
  result=await run('update','--board',id,'--name','Our wedding','--archived','true','--if-match',old);
  await assert.rejects(run('delete','--board',id,'--if-match',old));
  result=await run('update','--board',id,'--archived','false','--if-match',result.contentHash);
  const current=result.contentHash;
  const racing=await Promise.allSettled([run('update','--board',id,'--name','A','--if-match',current),run('update','--board',id,'--name','B','--if-match',current)]);
  assert.equal(racing.filter(r=>r.status==='fulfilled').length,1);
  result=await run('show','--board',id);
  result=await run('remove','--board',id,'--page',page,'--if-match',result.contentHash);
  const deleted=await run('delete','--board',id,'--if-match',result.contentHash);assert.equal(deleted.notesPreserved,true);
  assert.deepEqual((await run('list')).boards,[]);assert.equal(await readFile(path.join(root,'notes/venue.md'),'utf8'),content);
});
test('protected remote board reads work but mutations fail before credentials and input files',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'jb-board-policy-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const config=path.join(directory,'policy.json');await writeFile(config,JSON.stringify({schemaVersion:1,remoteTargets:[{origin:'https://example.test',access:'read-only'}]}));
  await assert.rejects(cli(['create','--target-url','https://example.test','--file','/does/not/exist'],{JUMPYBRAIN_CLI_CONFIG:config,JUMPYBRAIN_API_KEY:''}),error=>/JUMPYBRAIN_REMOTE_TARGET_READ_ONLY/.test(error.stderr)&&!/ENOENT|API_KEY is required/.test(error.stderr));
  await assert.rejects(cli(['list','--target-url','https://example.test'],{JUMPYBRAIN_CLI_CONFIG:config,JUMPYBRAIN_API_KEY:''}),error=>/API_KEY is required/.test(error.stderr));
});
