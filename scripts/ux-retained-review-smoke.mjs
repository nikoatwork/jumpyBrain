// Explicit review acknowledgment in the production shell; no native UX scoring.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
import {appendEditorText} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-retained-review-'));
const id='mem_45555555-5555-4555-8555-555555555555',token='disposable-retained-review-key',otherToken='disposable-retained-review-other-key';
const content=body=>`---\nid: ${id}\ntype: note\ntitle: Review acknowledgment\n---\n${body}`;
const file=path.join(root,'notes/review.md');let server,browser;const results=[];
async function saved(page){await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');}
async function review(page){await page.locator('#review-retained-version').click();await page.waitForFunction(()=>document.querySelector('#retained-version-review').open&&!document.querySelector('#retained-restore').disabled);}
try{
  await mkdir(path.join(root,'notes'));await writeFile(file,content('Original saved passage.\n'));
  server=await startJumpyBrainHttpServer({root,apiKeys:[token,otherToken],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);
    const transport=await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await saved(page);
    const priorRecovery=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery?.recoveryId);
    await writeFile(file,content('External replacement '+width+'.\n'));await page.waitForFunction(prior=>Boolean(state.editor.collaboration.snapshot.recovery)&&state.editor.collaboration.snapshot.recovery.recoveryId!==prior,priorRecovery);
    const recovery=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery.recoveryId);
    await review(page);await page.keyboard.press('Escape');
    assert.match(await page.locator('#note-retained-version').innerText(),/An external edit was retained/,'Escape is not acknowledgement');
    await review(page);const unchanged=await readFile(file,'utf8');await page.locator('#retained-close').click();
    assert.equal(await page.locator('#note-retained-version > span').isVisible(),false,'Keep current quiets the reviewed notice');
    assert.equal(await page.locator('#review-retained-version').isVisible(),true,'retained copies stay accessible');
    assert.equal(await page.locator('#review-retained-version').innerText(),'Retained versions');
    assert.equal(await readFile(file,'utf8'),unchanged,'acknowledgment is not a canonical write');results.push(`${width}: explicit keep quiets only the notice`);
    await page.locator('#home-link').click();await page.waitForFunction(()=>state.view==='home');await page.goBack();await saved(page);
    assert.equal(await page.locator('#note-retained-version > span').isVisible(),false,'same-tab revisit remembers this exact record');
    await appendEditorText(page,' My later save.');await saved(page);
    assert.equal(await page.locator('#note-retained-version > span').isVisible(),false,'own later save does not replay old notice');
    await review(page);assert.match(await page.locator('#retained-current-text').inputValue(),/My later save/);await page.keyboard.press('Escape');results.push(`${width}: revisit, own save and comparison access`);
    const originalGeneration=await page.evaluate(()=>state.noteToken);
    await page.locator('#open-connection').click();await page.locator('#api-key').fill(otherToken);await page.locator('#connection-submit').click();
    await page.waitForFunction(previous=>state.noteToken>previous&&state.editor?.collaboration?.state.status==='saved',originalGeneration);
    assert.equal(await page.locator('#note-retained-version > span').isVisible(),true,'credential-scope change clears acknowledgement');results.push(`${width}: scope change clears acknowledgement`);
    await writeFile(file,content('A newer external replacement '+width+'.\n'));
    await page.waitForFunction(old=>state.editor.collaboration.snapshot.recovery?.recoveryId!==old,recovery);
    assert.equal(await page.locator('#note-retained-version > span').isVisible(),true,'new retained record needs its own review');
    transport.rejectNext('recovery.read',{code:'source_unavailable'});await page.locator('#review-retained-version').click();
    await page.waitForFunction(()=>document.querySelector('#retained-version-message').textContent.includes('Could not verify retained text'));
    await page.locator('#retained-close').click();assert.equal(await page.locator('#note-retained-version > span').isVisible(),true,'failed comparison cannot acknowledge');results.push(`${width}: new record and failed comparison remain visible`);
    await review(page);const compared=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery.recoveryId);
    await writeFile(file,content('Changed during comparison '+width+'.\n'));
    await page.waitForFunction(old=>state.editor.collaboration.snapshot.recovery?.recoveryId!==old,compared);
    await page.locator('#retained-close').click();assert.equal(await page.locator('#note-retained-version > span').isVisible(),true,'old comparison cannot quiet a newer record');results.push(`${width}: stale comparison leaves newer record visible`);
    await page.close();
  }
  console.log(JSON.stringify({passed:true,results,limitations:['Tab-local acknowledgement only; reload resets it; native UX ratings not observed.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
