// Real production-shell draft choices over a disposable authenticated brain.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {initializeMemoryRoot} from '../dist/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
import {selectEditorText} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-simple-recovery-')),results=[],errors=[];
let server,browser,access;
const initial='Meeting Monday.\n\nOwner Alice.\n';
const content=(id,body)=>`---\nid: ${id}\ntype: note\ntitle: Draft choices\n---\n${body}`;
const readBody=async file=>(await readFile(file,'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,'');
async function saved(page){await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');}
async function review(page){await page.locator('#note-recover').click();await page.waitForFunction(()=>document.getElementById('document-recovery').open&&!document.getElementById('recovery-publish').disabled);}
async function failEdit(page,wire,from,to){
  const before=await page.evaluate(()=>state.editor.collaboration.body),at=before.indexOf(from);assert.ok(at>=0);
  wire.rejectNext('edit',{code:'overlapping_edit',message:'Injected overlap keeps this actual keyboard edit private.'});
  await selectEditorText(page,at,at+from.length);await page.keyboard.insertText(to);
  await page.waitForFunction(()=>state.editor.collaboration.state.status==='conflict');
  assert.equal(await page.evaluate(()=>state.editor.collaboration.state.durableDraft),true);
}
try{
  await mkdir('/tmp/jb-simple-recovery-qa',{recursive:true});
  await initializeMemoryRoot(root);await mkdir(path.join(root,'notes'),{recursive:true});access=new AccessStore(root);
  const writer=await access.issue({name:'Disposable writer',role:'writer'}),reader=await access.issue({name:'Disposable reader',role:'reader'});
  server=await startJumpyBrainHttpServer({root,apiKeys:[],accessStore:access,port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const id='mem_'+randomUUID(),file=path.join(root,'notes',id+'.md');await writeFile(file,content(id,initial));
    const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
    const wire=await installCollaborationSmokeTransport(page);await page.goto(`${server.url}/?note=${id}#apiKey=${writer.token}`);await saved(page);
    await failEdit(page,wire,'Monday','Tuesday');await review(page);
    assert.deepEqual(await page.locator('#document-recovery > .dialog-actions button:visible').allTextContents(),['Keep my changes','Use saved version']);
    assert.equal(await page.locator('#recovery-close').getAttribute('aria-label'),'Close');
    assert.equal(await page.locator('#recovery-options').evaluate(element=>element.open),false);assert.equal(await page.locator('#recovery-draft').isVisible(),false);
    assert.match(await page.locator('#recovery-changes').innerText(),/Removed/);assert.match(await page.locator('#recovery-changes').innerText(),/Added/);
    assert.match(await page.locator('#recovery-changes').innerText(),/Monday/);assert.match(await page.locator('#recovery-changes').innerText(),/Tuesday/);
    assert.doesNotMatch(await page.locator('#document-recovery').innerText(),/Keep editing|Publish reviewed draft/);
    for(const colorScheme of ['light','dark']){
      await page.emulateMedia({colorScheme});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const bounds=await page.locator('#document-recovery').evaluate(element=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,overflow:element.scrollWidth-element.clientWidth}});
      assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=900,JSON.stringify({width,colorScheme,bounds}));assert.ok(bounds.overflow<=1,'the dialog has no horizontal overflow');
      assert.equal(await page.locator('#recovery-changes').evaluate(element=>element.scrollWidth<=element.clientWidth+1),true);
      await page.screenshot({path:`/tmp/jb-simple-recovery-qa/${width}-${colorScheme}.png`});
    }
    const held=wire.holdNextRequest('edit');await page.locator('#recovery-publish').click();await held.arrived;
    for(const selector of ['#recovery-publish','#recovery-reload','#recovery-close'])assert.equal(await page.locator(selector).isDisabled(),true,selector+' stays disabled during save');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#document-recovery').evaluate(element=>element.open),true,'busy Escape cannot orphan publication');
    held.release();await page.waitForFunction(()=>!document.getElementById('document-recovery').open&&state.editor.collaboration.state.status==='saved');
    assert.equal(await readBody(file),initial.replace('Monday','Tuesday'));results.push(`${width}: two choices, readable changes and guarded busy save`);
    await failEdit(page,wire,'Tuesday','Thursday');await review(page);const draft=await page.evaluate(()=>state.editor.collaboration.body);
    await page.locator('#recovery-close').click();assert.equal(await page.evaluate(()=>state.editor.collaboration.body),draft,'Close preserves private text');
    await review(page);await page.locator('#recovery-reload').click();await page.waitForFunction(()=>!document.getElementById('document-recovery').open&&state.editor.collaboration.state.status==='saved');
    assert.equal(await page.evaluate(()=>state.editor.collaboration.body),initial.replace('Monday','Tuesday'));results.push(`${width}: close keeps draft; Use saved version returns to editor`);
    await failEdit(page,wire,'Tuesday','Wednesday');await review(page);const peer=initial.replace('Monday','Friday');await writeFile(file,content(id,peer));
    await page.waitForFunction(()=>state.editor.collaboration.snapshot.body.includes('Friday'));await page.locator('#recovery-publish').click();
    await page.waitForFunction(()=>document.getElementById('recovery-message').textContent.includes('saved version changed'));
    assert.equal(await readFile(file,'utf8'),content(id,peer));assert.match(await page.evaluate(()=>state.editor.collaboration.body),/Wednesday/);assert.equal(await page.locator('#recovery-publish').isDisabled(),true);
    await page.locator('#recovery-close').click();await review(page);assert.match(await page.locator('#recovery-changes').innerText(),/Friday/);await page.locator('#recovery-reload').click();await saved(page);results.push(`${width}: stale comparison cannot overwrite newer saved text`);
    await failEdit(page,wire,'Friday','Saturday');let releaseRead,markRead;const readHeld=new Promise(resolve=>markRead=resolve),gate=new Promise(resolve=>releaseRead=resolve);
    await page.route('**/memories/all/documents/'+id,async route=>{markRead();await gate;await route.continue()},{times:1});
    await page.locator('#note-recover').click();await readHeld;
    assert.match(await page.locator('#recovery-message').innerText(),/Loading/);assert.equal(await page.locator('#recovery-publish').isDisabled(),true);assert.equal(await page.locator('#recovery-reload').isDisabled(),true);assert.equal(await page.locator('#recovery-changes').innerText(),'');
    releaseRead();await page.waitForFunction(()=>!document.getElementById('recovery-publish').disabled);
    // The modal's comparison follows a draft change without requiring a new GET.
    await page.evaluate(()=>{const editor=state.editor,before=editor.collaboration.body,after=before.replace('Saturday','Sunday');richEditor.setMarkdown(after);editor.input(after,{before,after,operations:[{start:before.indexOf('Saturday'),deleteCount:8,insert:'Sunday'}]});});
    await page.waitForFunction(()=>document.getElementById('recovery-changes').textContent.includes('Sunday'));assert.doesNotMatch(await page.locator('#recovery-changes').innerText(),/Saturday/);
    await page.locator('#recovery-close').click();await page.route('**/memories/all/documents/'+id,route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'}),{times:1});
    await page.locator('#note-recover').click();await page.waitForFunction(()=>document.getElementById('recovery-message').textContent.includes('Could not load'));
    assert.equal(await page.locator('#recovery-changes').innerText(),'');assert.equal(await page.locator('#recovery-publish').isDisabled(),true);assert.equal(await page.locator('#recovery-reload').isDisabled(),true);
    await page.locator('#recovery-options > summary').click();await page.locator('#recovery-copy').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/Sunday/);
    await page.locator('#recovery-close').click();await review(page);await page.locator('#recovery-reload').click();await saved(page);results.push(`${width}: loading/failure stay honest, changed draft updates diff, full copy stays available`);
    const readonly=await browser.newPage({viewport:{width,height:900}});readonly.setDefaultTimeout(12000);await readonly.goto(`${server.url}/?note=${id}#apiKey=${reader.token}`);await readonly.waitForFunction(()=>state.editor?.collaboration?.state.status==='readonly');
    await readonly.evaluate(()=>lifecycleActions.openRecovery());await readonly.waitForFunction(()=>document.getElementById('recovery-saved').value.length>0);
    assert.equal(await readonly.locator('#recovery-publish').isVisible(),false);assert.equal(await readonly.locator('#recovery-reload').isDisabled(),true);await readonly.locator('#recovery-close').click();await readonly.close();results.push(`${width}: reader comparison cannot choose a writable version`);
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,productionShell:true,results,limits:['Disposable localhost Chromium fixtures; no installed app, personal brain, native accessibility or VPS claim.']}));
}finally{await browser?.close();await server?.close();access?.close();await rm(root,{recursive:true,force:true});}
