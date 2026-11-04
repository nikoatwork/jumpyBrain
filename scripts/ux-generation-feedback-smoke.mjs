// Real production shell + supported CLI stream against a disposable localhost root.
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
import {appendEditorText} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-generation-'));
const id='mem_44444444-4444-4444-8444-444444444444',otherId='mem_44444444-4444-4444-8444-444444444445',token='disposable-generation-key';
const content=(noteId,body)=>`---\nid: ${noteId}\ntype: note\ntitle: Generation ${noteId===id?'draft':'other'}\n---\n${body}`;
const cli=fileURLToPath(new URL('../dist/cli.js',import.meta.url)),config=path.join(root,'device.json');
let server,browser;const producers=[],results=[];
function command(args,clientId='ux-producer'){
  const child=spawn(process.execPath,[cli,'collaborate',...args,'--target-url',server.url,'--id',id,'--client-id',clientId,'--json'],{env:{...process.env,JUMPYBRAIN_API_KEY:token,JUMPYBRAIN_CLI_CONFIG:config},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  const result=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));});return{child,result};
}
async function until(operation,label){const deadline=Date.now()+15000;while(!await operation()){if(Date.now()>deadline)throw new Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,30));}}
try{
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'notes/draft.md'),content(id,'Human draft.\n'));await writeFile(path.join(root,'notes/other.md'),content(otherId,'Other note.\n'));await writeFile(config,JSON.stringify({schemaVersion:1,remoteTargets:[]}));
  server=await startJumpyBrainHttpServer({root,apiKeys:[token],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390,320]){
    const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);
    const transport=await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    for(const outcome of ['finish','cancel']){
      const streamId=`ux-${width}-${outcome}`,marker=` ${width}-${outcome}-confirmed`;
      const producer=command(['stream','--stream-id',streamId]);producers.push(producer);producer.child.stdin.write(marker);
      await page.waitForFunction(marker=>richEditor.getMarkdown().includes(marker),marker);
      await page.waitForFunction(()=>document.querySelector('#note-presence').textContent.includes('generating'));
      assert.equal(await page.locator('#note-generation-state').count(),1,'completion feedback has a visible accessible destination');
      assert.equal(await page.locator('#note-generation-state').isVisible(),false,'running output is not complete');
      const focused=await page.evaluate(()=>document.activeElement?.id);
      const held=outcome==='finish'?transport.holdNextReply('edit'):undefined;
      if(held){await appendEditorText(page,' Concurrent human text.');await held.arrived;}
      if(outcome==='finish')producer.child.stdin.end();
      else{const cancel=command(['cancel','--stream-id',streamId]);cancel.child.stdin.end();const cancelled=await cancel.result;assert.equal(cancelled.code,0,cancelled.stderr);producer.child.stdin.end();}
      const receipt=await producer.result;assert.equal(receipt.code,0,receipt.stderr);assert.equal(JSON.parse(receipt.stdout).stream.state,outcome==='finish'?'finished':'cancelled','CLI receipt, not exit code alone, establishes the terminal outcome');
      await page.waitForFunction(text=>document.querySelector('#note-generation-state').textContent===text,outcome==='finish'?'Generation finished':'Generation stopped');
      if(held){assert.equal(await page.evaluate(()=>state.editor.collaboration.state.status),'saving','terminal event survives a held own-edit acknowledgement');held.release();await page.waitForFunction(()=>state.editor.collaboration.state.status==='saved');}
      assert.equal(await page.evaluate(()=>document.activeElement?.id),focused,'generation feedback never steals focus');
      assert.equal(await page.locator('#note-generation-state').getAttribute('role'),'status');
      assert.equal(await page.locator('#note-generation-state').getAttribute('aria-live'),'polite');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'confirmed feedback fits the viewport');
      assert.ok((await readFile(path.join(root,'notes/draft.md'),'utf8')).includes(marker));
      assert.equal(await page.evaluate(()=>state.editor.state.documentId),id);results.push(`${width}/${outcome}: confirmed terminal cue and saved partial text`);
      await page.locator('#home-link').click();await page.waitForFunction(()=>state.view==='home');
      assert.equal(await page.locator('#note-generation-state').isVisible(),false,'terminal cue is note-scoped');
      await page.goBack();await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
      assert.equal(await page.locator('#note-generation-state').isVisible(),false,'opening does not replay historical completion');
    }
    if(width===1280){
      const shared='same-stream-id',a=command(['stream','--stream-id',shared],'producer-a'),b=command(['stream','--stream-id',shared],'producer-b');producers.push(a,b);a.child.stdin.write(' Concurrent A.');b.child.stdin.write(' Concurrent B.');
      await page.waitForFunction(()=>richEditor.getMarkdown().includes('Concurrent A.')&&richEditor.getMarkdown().includes('Concurrent B.'));
      b.child.stdin.end();assert.equal((await b.result).code,0);await page.waitForFunction(()=>document.querySelector('#note-generation-state').textContent==='Generation finished');
      assert.match(await page.locator('#note-presence').innerText(),/generating/,'another producer can still be running');
      const stopA=command(['cancel','--stream-id',shared],'producer-a');stopA.child.stdin.end();assert.equal((await stopA.result).code,0);a.child.stdin.end();assert.equal((await a.result).code,0);
      await page.waitForFunction(()=>document.querySelector('#note-generation-state').textContent==='Generation stopped');results.push('same stream ID across two actors: distinct terminal outcomes');
    }
    if(width===1280){
      const unseen=command(['stream','--stream-id','finish-during-reconnect']);producers.push(unseen);unseen.child.stdin.write(' Saved before disconnect.');
      await page.waitForFunction(()=>richEditor.getMarkdown().includes('Saved before disconnect.'));
      const opening=transport.holdNextReply('open');transport.disconnect();await opening.arrived;
      assert.equal(await page.locator('#note-generation-state').isVisible(),false,'disconnect is not completion');
      unseen.child.stdin.end();const unseenReceipt=await unseen.result;assert.equal(unseenReceipt.code,0);assert.equal(JSON.parse(unseenReceipt.stdout).stream.state,'finished');
      opening.release();await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
      assert.equal(await page.locator('#note-generation-state').isVisible(),false,'missed finish is not inferred after reconnect');results.push('disconnect/reconnect: no fabricated or historical completion');
    }
    await page.close();
  }
  console.log(JSON.stringify({passed:true,results,limitations:['Localhost browser and real CLI evidence; native Mac judging not observed.']}));
}finally{for(const producer of producers)if(producer.child.exitCode===null){producer.child.stdin.end();producer.child.kill('SIGTERM');}await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
