// Diagnostic UX regressions in the production shell, using disposable notes.
// This is browser evidence, not the native Mac experience judge.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {appendEditorText,undoEditor} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-update-feedback-'));
const id='mem_47777777-7777-4777-8777-777777777777',token='disposable-ux-feedback-key';
const prefix=`---\nid: ${id}\ntype: note\ntitle: Original title\n---\n`;
let browser,server;const results=[],errors=[];
async function saved(page){await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');}
async function open(page){await page.goto(`${server.url}/?note=${id}#apiKey=${token}`);await saved(page);}
async function quiet(page,label){assert.equal(await page.locator('#note-external-state').textContent(),'',label);results.push(label);}
try{
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'notes/feedback.md'),prefix+'Starting body.\n');
  server=await startJumpyBrainHttpServer({root,apiKeys:[token],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));await open(page);
    await quiet(page,`${width}: initial hydration`);
    await page.locator('#note-name').fill('My own title '+width);await page.locator('#note-editor').click();await saved(page);
    await quiet(page,`${width}: own title acknowledgement`);
    await appendEditorText(page,' My own addition.');await saved(page);
    await quiet(page,`${width}: own body acknowledgement`);
    await undoEditor(page);await saved(page);
    await quiet(page,`${width}: own Undo acknowledgement`);
    // Real separate editor context. Matching principal does not mean same actor.
    const otherContext=await browser.newContext(),other=await otherContext.newPage();await open(other);
    await other.locator('#note-name').fill('Another editor title '+width);await other.locator('#note-editor').click();await saved(other);
    await page.waitForFunction(title=>document.querySelector('#note-name').value===title,'Another editor title '+width);
    assert.equal(await page.locator('#note-external-state').textContent(),'Updated elsewhere');results.push(`${width}: other editor title notification`);
    await page.reload();await saved(page);await quiet(page,`${width}: reopen after external edit`);
    await appendEditorText(other,' Another editor addition.');await saved(other);
    await page.waitForFunction(()=>document.querySelector('#note-external-state').textContent==='Updated elsewhere');results.push(`${width}: other editor body notification`);
    const snapshot=await page.evaluate(()=>state.editor.collaboration.snapshot);
    assert.equal(await readFile(path.join(root,snapshot.file),'utf8'),snapshot.prefix+snapshot.body);
    await otherContext.close();await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,limitations:['Browser diagnostic; native Mac UX ratings not observed.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
