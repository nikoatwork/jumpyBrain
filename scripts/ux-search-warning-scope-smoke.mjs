// Search status stays with its surface; this does not repair an index.
import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
import {appendEditorText} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-search-warning-'));
const id='mem_42222222-2222-4222-8222-222222222222',token='disposable-search-warning-key';
const content=`---\nid: ${id}\ntype: note\ntitle: Search warning scope\n---\nSaved source.\n`;
let server,browser;const results=[];
try{
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'notes/scope.md'),content);
  server=await startJumpyBrainHttpServer({root,apiKeys:[token],port:0,autoIndex:false});browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:844},permissions:['clipboard-write','clipboard-read']}),page=await context.newPage();page.setDefaultTimeout(10000);
    const transport=await installCollaborationSmokeTransport(page);
    await page.route('**/memories/all/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({index:{stale:true},readiness:{freshness:'stale'},maintenance:{enabled:false,indexing:false,failed:false},semanticSetup:{state:'lexical'}})}));
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    await page.locator('#open-search').click();await page.waitForFunction(()=>document.querySelector('#app-toast').dataset.source==='search-maintenance');
    await page.keyboard.press('Escape');await page.locator('#note-search-input').waitFor({state:'hidden'});
    assert.equal(await page.locator('#app-toast').isVisible(),false,'search warning does not outlive Search');
    assert.equal(await page.locator('#graph-index-state').isVisible(),false,'inactive search does not leave a stale recovery action');
    await page.locator('#toggle-page-details').click();await page.locator('#copy-note-draft').click();
    await page.waitForFunction(()=>document.querySelector('#toast-message').textContent==='Draft copied.');results.push(`${width}: closing Search releases copy confirmation`);
    await page.locator('#open-search').click();await page.waitForFunction(()=>document.querySelector('#app-toast').dataset.source==='search-maintenance');
    assert.match(await page.locator('#toast-message').innerText(),/may be out of date/,'freshness uncertainty is not total search failure');
    await page.keyboard.press('Escape');results.push(`${width}: same-state reentry reports the actual uncertainty`);
    const failed=transport.rejectNext('edit',{code:'source_unavailable'});await appendEditorText(page,' Private unsaved text.');await failed.arrived;
    await page.waitForFunction(()=>document.querySelector('#app-toast').dataset.source==='editor-save');
    await page.locator('#open-search').click();await page.locator('#note-search-input').waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('#app-toast').getAttribute('data-source'),'editor-save','closing search cannot hide a genuine save error');
    assert.match(await page.locator('#toast-message').innerText(),/haven't been saved/);assert.equal(await readFile(path.join(root,'notes/scope.md'),'utf8'),content);results.push(`${width}: save-error priority and canonical source preserved`);
    await context.close();
  }
  console.log(JSON.stringify({passed:true,results,limitations:['Browser fault probe; no index repair and no native UX score.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
