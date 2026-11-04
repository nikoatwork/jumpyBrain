// Production-shell fault probes with disposable localhost Markdown only.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-availability-'));
const id='mem_46666666-6666-4666-8666-666666666666',token='disposable-availability-key';
const content=`---\nid: ${id}\ntype: note\ntitle: A note that exists\n---\nThis saved content remains available.\n`;
let server,browser;const results=[];
try{
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'notes/available.md'),content);
  server=await startJumpyBrainHttpServer({root,apiKeys:[token],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390])for(const failure of ['missing-capabilities','invalid-protocol','server-error']){
    const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);const writes=[];
    page.on('request',request=>{if(['PUT','PATCH','DELETE'].includes(request.method()))writes.push(request.method());});
    await page.route('**/capabilities',route=>route.fulfill({status:failure==='missing-capabilities'?404:failure==='server-error'?503:200,contentType:'application/json',body:JSON.stringify(failure==='invalid-protocol'?{protocol:1}:{error:{code:'not_found',message:'/private/technical-details'}})}));
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);
    await page.waitForFunction(()=>state.editor?.state.loaded&&document.querySelector('#note-load-retry').hidden===false);
    assert.equal(await page.locator('#note-save-state').innerText(),'Editing unavailable',`${failure}: do not claim missing content or a failed save`);
    assert.match(await page.locator('#note-save-state').getAttribute('aria-label'),/^Editing unavailable/);
    assert.equal(await page.locator('#note-name').inputValue(),'A note that exists');
    assert.equal(await page.locator('#note-editor').isVisible(),true);
    assert.match(await page.locator('#note-editor').innerText(),/This saved content remains available/);
    assert.equal(await page.locator('#note-editor').getAttribute('contenteditable'),'false');
    assert.equal(await page.locator('#note-name').getAttribute('readonly'),'');
    assert.equal(await page.locator('#note-retry').isVisible(),false,'there was no failed save to retry');
    assert.equal(await page.locator('#note-recover').isVisible(),false,'no private draft exists');
    assert.equal(await page.locator('#note-load-retry').innerText(),'Retry editing');
    assert.doesNotMatch(await page.locator('body').innerText(),/no longer available|Save failed|\/private\/technical-details/);
    assert.equal(await readFile(path.join(root,'notes/available.md'),'utf8'),content);assert.deepEqual(writes,[]);
    await page.locator('#home-link').click();await page.waitForFunction(()=>state.view==='home');
    await page.goBack();await page.waitForFunction(()=>state.editor?.state.loaded&&document.querySelector('#note-load-retry').hidden===false);
    await page.unroute('**/capabilities');await page.locator('#note-load-retry').click();
    await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    assert.equal(await page.locator('#note-load-retry').isVisible(),false);assert.equal(await page.locator('#note-editor').getAttribute('contenteditable'),'true');
    assert.equal(await page.locator('#note-save-state').getAttribute('aria-label'),'Saved');
    results.push(`${width}/${failure}: saved content, honest state, read-only protection and retry`);await page.close();
  }
  const missing=await browser.newPage();await missing.goto(`${server.url}/?note=mem_40000000-0000-4000-8000-000000000000#apiKey=${token}`);
  await missing.waitForFunction(()=>document.querySelector('#note-message').textContent.includes('no longer available'));
  assert.equal(await missing.locator('#note-editor').isVisible(),false);results.push('actual missing document retains missing-note guidance');
  console.log(JSON.stringify({passed:true,results,limitations:['Fault-injected browser evidence; no claim to diagnose a live VPS proxy.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
