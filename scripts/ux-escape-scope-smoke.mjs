import { showSidebar } from './editor-smoke-helpers.mjs';
// Keyboard ownership in the production shell. Disposable Markdown, no indexing.
import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {selectEditorText,editorMarkdown} from './editor-smoke-helpers.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-ux-escape-'));
const id='mem_43333333-3333-4333-8333-333333333333',key='disposable-escape-key',body='A selected passage for keyboard navigation.\n';
const content=`---\nid: ${id}\ntype: note\ntitle: Keyboard scope\n---\n${body}`;
let server,browser;const results=[];
try{
  await mkdir(path.join(root,'notes'));await writeFile(path.join(root,'notes/escape.md'),content);
  server=await startJumpyBrainHttpServer({root,apiKeys:[key],port:0,autoIndex:false});browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
    await selectEditorText(page,2,12);await page.locator('#note-attribution').waitFor({state:'visible'});
    await page.locator('#toggle-note-format').click();await page.getByRole('button',{name:'Bold',exact:true}).focus();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#format-controls').isHidden(),true,'toolbar Escape owns its close despite a preserved editor selection');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'toggle-note-format');results.push(`${width}: toolbar closes and returns focus`);
    await selectEditorText(page,3,13);await page.locator('#note-attribution').waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('#note-attribution').isHidden(),true,'editor Escape still dismisses attribution');results.push(`${width}: editor hint dismissal`);
    await selectEditorText(page,4,14);await page.locator('#note-attribution').waitFor({state:'visible'});
    await page.locator('#toggle-note-format').click();
    await page.getByRole('button',{name:'Bold',exact:true}).focus();
    await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,isComposing:true})));
    assert.equal(await page.locator('#format-controls').isVisible(),true,'IME composition owns Escape');
    const modifier=await page.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform)?'Meta':'Control');
    await page.locator('#note-editor').focus();await page.keyboard.press(`${modifier}+f`);await page.locator('#note-find-input').waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('#note-find').isHidden(),true,'find owns its Escape');
    await showSidebar(page);await page.locator('#open-search').click();await page.locator('#note-search-input').waitFor({state:'visible'});await page.keyboard.press('Escape');
    assert.equal(await page.locator('#note-search-input').isVisible(),false,'search owns its Escape');results.push(`${width}: composition/find/search ownership`);
    assert.equal(await editorMarkdown(page),body);assert.equal(await readFile(path.join(root,'notes/escape.md'),'utf8'),content);await page.close();
  }
  console.log(JSON.stringify({passed:true,results,limitations:['Browser keyboard evidence; physical IME/native accessibility not tested.']}));
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
