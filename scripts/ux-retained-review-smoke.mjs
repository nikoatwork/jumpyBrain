import { showSidebar } from './editor-smoke-helpers.mjs';
// Optional retained-version access in the production shell; no native UX scoring.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
import {appendEditorText,selectEditorText,editorSelection} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-retained-review-'));
const id='mem_45555555-5555-4555-8555-555555555555',token='disposable-retained-review-key',otherToken='disposable-retained-review-other-key';
const content=body=>`---\nid: ${id}\ntype: note\ntitle: Optional retained versions\n---\n${body}`;
const file=path.join(root,'notes/review.md');let server,browser;const results=[];
async function saved(page){await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');}
async function details(page){if(await page.locator('#toggle-page-details').getAttribute('aria-expanded')!=='true')await page.locator('#toggle-page-details').click();}
async function quiet(page,label){
  await saved(page);
  assert.equal(await page.locator('#note-retained-version').isVisible(),false,label+': no warning requires a review');
  assert.equal(await page.locator('#retained-version-review').evaluate(dialog=>dialog.open),false,label+': no automatic comparison');
  assert.equal(await page.evaluate(()=>state.editor.collaboration.state.dirty),false,label+': clean saved note');
}
async function review(page){await details(page);assert.equal(await page.locator('#review-retained-version').innerText(),'Earlier versions');await page.locator('#review-retained-version').click();await page.waitForFunction(()=>document.querySelector('#retained-version-review').open&&!document.querySelector('#retained-restore').disabled);assert.equal(await page.locator('#retained-options').evaluate(element=>element.open),false,'More options starts collapsed');assert.equal(await page.locator('#retained-changes').isVisible(),true,'changes are the primary comparison');assert.equal(await page.locator('#retained-close').innerText(),'Keep current note');assert.equal(await page.locator('#retained-restore').innerText(),'Use earlier version');}
async function options(page){if(!await page.locator('#retained-options').evaluate(element=>element.open))await page.locator('#retained-options > summary').click();}
async function cli(args,input='',key=token){
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),...args,'--target-url',server.url,'--id',id,'--json'],{env:{...process.env,JUMPYBRAIN_API_KEY:key},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.once('error',reject);child.once('close',code=>code===0?resolve(JSON.parse(stdout)):reject(new Error('CLI '+args[0]+' failed: '+stderr)));child.stdin.end(input);
  });
}
try{
  await mkdir(path.join(root,'notes'));await writeFile(file,content('Original saved passage.\n'));
  server=await startJumpyBrainHttpServer({root,apiKeys:[token,otherToken],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);
    const transport=await installCollaborationSmokeTransport(page);
    await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await saved(page);
    assert.equal(await page.locator('#toggle-page-details').getAttribute('aria-expanded'),'false','More info starts closed');
    const read=await cli(['show']);const agentBody='Agent requested update '+width+'.\n';
    const updated=await cli(['update','--if-match',read.contentHash],content(agentBody));assert.equal(updated.saved??Boolean(updated.newContentHash),true);
    await page.waitForFunction(body=>state.editor.collaboration.body===body,agentBody);await quiet(page,'CLI update');
    assert.equal(await page.locator('#review-retained-version').isVisible(),false,'optional history remains under closed More info');
    assert.equal(await readFile(file,'utf8'),await page.evaluate(()=>state.editor.collaboration.snapshot.prefix+state.editor.collaboration.body),'agent update matches canonical bytes');
    await appendEditorText(page,' Human continuation.');await quiet(page,'typing after CLI update');
    assert.match(await readFile(file,'utf8'),/Human continuation/);results.push(`${width}: guarded CLI update and subsequent typing need no review`);
    const priorRecovery=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery?.recoveryId);
    await writeFile(file,content('External replacement '+width+'.\n'));await page.waitForFunction(prior=>Boolean(state.editor.collaboration.snapshot.recovery)&&state.editor.collaboration.snapshot.recovery.recoveryId!==prior,priorRecovery);
    const recovery=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery.recoveryId);
    await quiet(page,'raw replacement');
    assert.equal(await page.locator('#review-retained-version').isVisible(),false,'raw replacement does not open More info');
    await review(page);
    if(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR){await mkdir(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.JUMPYBRAIN_SMOKE_SCREENSHOT_DIR,`retained-${width}.png`)});}
    await page.keyboard.press('Escape');await quiet(page,'Escape from optional comparison');
    await review(page);const unchanged=await readFile(file,'utf8');await page.locator('#retained-close').click();
    await quiet(page,'Close optional comparison');
    assert.equal(await page.locator('#review-retained-version').isVisible(),true,'retained copies stay accessible');
    assert.equal(await page.locator('#review-retained-version').innerText(),'Earlier versions');
    assert.equal(await readFile(file,'utf8'),unchanged,'closing comparison is not a canonical write');results.push(`${width}: raw replacement stays quiet with optional comparison`);
    await showSidebar(page);await page.locator('#home-link').click();await page.waitForFunction(()=>state.view==='home');await page.goBack();await saved(page);
    await quiet(page,'revisit');assert.equal(await page.locator('#toggle-page-details').getAttribute('aria-expanded'),'false','revisit closes More info');
    await appendEditorText(page,' My later save.');await saved(page);
    await quiet(page,'own later save');
    await review(page);await options(page);assert.match(await page.locator('#retained-current-text').inputValue(),/My later save/);await page.keyboard.press('Escape');results.push(`${width}: revisit, own save and comparison access`);
    await page.reload();await quiet(page,'reload');assert.equal(await page.locator('#review-retained-version').isVisible(),false,'reload keeps optional history collapsed');
    const originalGeneration=await page.evaluate(()=>state.noteToken);
    await showSidebar(page);await page.locator('#open-connection').click();await page.locator('#api-key').fill(otherToken);await page.locator('#connection-submit').click();
    await page.waitForFunction(previous=>state.noteToken>previous&&state.editor?.collaboration?.state.status==='saved',originalGeneration);
    await quiet(page,'credential scope change');assert.equal(await page.locator('#review-retained-version').isVisible(),false,'scope change closes optional history');results.push(`${width}: reload and scope changes stay quiet`);
    await writeFile(file,content('A newer external replacement '+width+'.\n'));
    await page.waitForFunction(old=>state.editor.collaboration.snapshot.recovery?.recoveryId!==old,recovery);
    await quiet(page,'new retained record');await details(page);
    transport.rejectNext('recovery.read',{code:'source_unavailable'});await page.locator('#review-retained-version').click();
    await page.waitForFunction(()=>document.querySelector('#retained-version-message').textContent.includes('Could not load the earlier text'));
    await page.locator('#retained-close').click();await quiet(page,'failed optional comparison');results.push(`${width}: new record and failed comparison do not require review`);
    await review(page);const compared=await page.evaluate(()=>state.editor.collaboration.snapshot.recovery.recoveryId);
    await writeFile(file,content('Changed during comparison '+width+'.\n'));
    await page.waitForFunction(old=>state.editor.collaboration.snapshot.recovery?.recoveryId!==old,compared);
    await page.locator('#retained-close').click();await quiet(page,'replacement during optional comparison');results.push(`${width}: stale comparison leaves current saved content usable`);
    // Repeated source gives the raw observer no provable interior caret mapping.
    // With no private edit, adopt saved source and retire only that caret.
    const repeated=await cli(['show'],'',otherToken);
    await cli(['update','--if-match',repeated.contentHash],content('aaaa'),otherToken);
    await page.waitForFunction(()=>state.editor.collaboration.body==='aaaa'&&richEditor.getMarkdown()==='aaaa');await quiet(page,'repeated clean source');
    if(await page.locator('#toggle-page-details').getAttribute('aria-expanded')==='true')await page.locator('#toggle-page-details').click();
    await selectEditorText(page,2);assert.deepEqual(await editorSelection(page),[2,2]);
    assert.equal(await page.locator('#note-editor').evaluate(element=>element.contains(document.activeElement)),true,'interior caret starts focused');
    await writeFile(file,content('aaaaa'));
    await page.waitForFunction(()=>state.editor.collaboration.body==='aaaaa'&&richEditor.getMarkdown()==='aaaaa');await quiet(page,'ambiguous raw insertion');
    assert.equal(await readFile(file,'utf8'),content('aaaaa'),'ambiguous change preserves authoritative raw bytes');
    assert.equal(await editorSelection(page),null,'unprovable clean caret is cleared');
    assert.equal(await page.locator('#note-editor').evaluate(element=>element.contains(document.activeElement)),false,'retired clean caret leaves editor blurred');
    await page.locator('#note-editor p').first().click();await page.keyboard.press('End');await page.keyboard.insertText(' Human resumed.');
    await page.waitForFunction(()=>state.editor.collaboration.state.status==='saved'&&state.editor.collaboration.body==='aaaaa Human resumed.');await quiet(page,'repositioned typing');
    assert.equal(await readFile(file,'utf8'),await page.evaluate(()=>state.editor.collaboration.snapshot.prefix+'aaaaa Human resumed.'),'freshly positioned input saves exact source');
    results.push(`${width}: ambiguous clean caret retires without draft recovery and fresh typing saves`);
    await page.close();
  }
  console.log(JSON.stringify({passed:true,results,limitations:['Disposable localhost fixture; native UX ratings and live VPS behavior not observed.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
