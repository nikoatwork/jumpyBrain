// Production shared shell/editor over a disposable canonical brain. No external
// requests, installed app changes, credentials or personal notes are involved.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {editorMarkdown,selectEditorText,replaceEditorText,undoEditor} from './editor-smoke-helpers.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-external-links-'));
const key='external-links-fixture';
const source='See [AI-1145](https://example.com/issue/AI-1145) here.\r\n## [**Details**](https://example.com/a_(b) "More details")\r\n- [ ] Review [Issue](https://example.com/?a=1&b=2#part)\r\n`[code](https://example.com/code)`\r\n[unsafe](javascript:alert(1))\r\n![image](https://example.com/never-fetch.png)\r\n\\[escaped](https://example.com/)\r\n```md\r\n[fenced](https://example.com/fenced)\r\n```\r\n[[Internal page]]';
let server,browser;
try{
  await mkdir(path.join(root,'notes'));
  server=await startJumpyBrainHttpServer({root,apiKeys:[key],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]){
    const id=width===1280?'mem_90000000-0000-4000-8000-000000000009':'mem_90000000-0000-4000-8000-000000000010';
    const file=path.join(root,`notes/links-${width}.md`);
    const prefix=`---\r\nid: ${id}\r\ntype: note\r\ntitle: External links fixture ${width}\r\ncustom: keep-me\r\n---\r\n`;
    await writeFile(file,prefix+source);
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});
    page.setDefaultTimeout(8000);
    const errors=[],outside=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',request=>{if(!request.url().startsWith(server.url))outside.push(request.url());});
    await page.addInitScript(()=>{window.openedLinks=[];window.open=(...args)=>{openedLinks.push(args);return null;};});
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);
    await page.waitForFunction(()=>document.querySelector('#note-editor')?.isContentEditable);
    await page.waitForFunction(()=>document.querySelector('#note-save-state')?.textContent==='Saved');
    const links=page.locator('#note-editor a.markdown-external-link');
    assert.equal(await links.count(),3,'Only supported prose/heading/task links become anchors.');
    assert.equal(await links.first().innerText(),'AI-1145');
    assert.equal(await links.nth(1).locator('.editor-bold').innerText(),'Details');
    assert.equal(await links.first().getAttribute('target'),'_blank');
    assert.equal(await links.first().getAttribute('rel'),'noopener noreferrer');
    assert.equal(await editorMarkdown(page),source);
    assert.equal(await readFile(file,'utf8'),prefix+source,'Hydration keeps canonical bytes.');
    if(width===390)await links.first().tap();else await links.first().click();
    assert.equal((await page.evaluate(()=>openedLinks)).length,1);
    assert.equal((await page.evaluate(()=>openedLinks))[0][0],'https://example.com/issue/AI-1145');
    assert.equal(await editorMarkdown(page),source,'Activation leaves the draft intact.');
    await page.locator('#note-editor').focus();
    await page.keyboard.press('Tab');
    assert.equal(await links.first().evaluate(link=>document.activeElement===link),true);
    await page.keyboard.press('Enter');
    assert.equal((await page.evaluate(()=>openedLinks)).length,2,'Tab/Enter activates once.');
    await page.evaluate(()=>richEditor.setReadOnly(true));
    await links.first().click();
    assert.equal((await page.evaluate(()=>openedLinks)).length,3,'Read-only notes retain link navigation.');
    await page.evaluate(()=>richEditor.setReadOnly(false));
    // Actual typing inside the rendered label must publish a source operation
    // at the label, with every other line and destination byte preserved.
    await selectEditorText(page,6);
    await page.keyboard.insertText('X');
    const edited=source.replace('AI-1145]','AIX-1145]');
    await saved(page,edited);
    assert.ok((await readFile(file,'utf8')).endsWith(edited));
    await undoEditor(page);await saved(page,source);
    await links.nth(1).locator('.editor-bold').evaluate(el=>{
      const range=document.createRange();range.setStart(el.firstChild,2);range.collapse(true);
      document.querySelector('#note-editor').focus();const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    });
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    await page.keyboard.insertText('X');
    const editedHeading=source.replace('**Details**','**DeXtails**');
    await saved(page,editedHeading);
    assert.ok((await readFile(file,'utf8')).endsWith(editedHeading),'Editing a formatted label preserves the original parenthesized URL and title bytes.');
    await undoEditor(page);await saved(page,source);
    // The caret inside a link reveals its Markdown source, so typed punctuation
    // is saved verbatim and stays editable on subsequent input.
    await selectEditorText(page,6);await page.keyboard.insertText('*[');
    const punctuated=source.replace('AI-1145]', 'AI*[-1145]');
    await saved(page,punctuated);
    await page.keyboard.insertText('Y');
    const punctuationEdit=source.replace('AI-1145]', 'AI*[Y-1145]');
    await saved(page,punctuationEdit);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#note-editor')?.isContentEditable);
    assert.equal(await links.first().innerText(),'Details','A label no longer valid as a link reopens as literal source.');
    assert.equal(await editorMarkdown(page),punctuationEdit);
    await replaceEditorText(page,source);await saved(page,source);
    // Selection/copy and a drag never navigate.
    await selectEditorText(page,4,11);
    await links.first().evaluate(link=>link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:0})));
    assert.equal((await page.evaluate(()=>openedLinks)).length,0);
    await page.keyboard.press('Backspace');
    await saved(page,source.replace('[AI-1145](https://example.com/issue/AI-1145)',''));
    await undoEditor(page);await saved(page,source);
    // A single paste uses the same grammar and remains one undoable edit.
    const pasted='Paste [New issue](https://example.com/new) and **bold**';
    await replaceEditorText(page,pasted);await saved(page,pasted);
    assert.equal(await links.count(),1);assert.equal(await links.first().innerText(),'New issue');
    await undoEditor(page);await saved(page,source);
    // Complete the shortcut through the native typing path.
    await replaceEditorText(page,'Type ');await saved(page,'Type ');
    await page.keyboard.type('[Typed](https://example.com/typed)',{delay:12});
    await saved(page,'Type [Typed](https://example.com/typed)');
    assert.equal(await links.count(),1);assert.equal(await links.first().innerText(),'Typed');
    await page.reload();await page.waitForFunction(()=>document.querySelector('#note-editor')?.isContentEditable);
    assert.equal(await links.first().innerText(),'Typed','Saved links render after reopening.');
    assert.deepEqual(outside,[],'Rendering and activation do not fetch external content in the app.');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px external link load, activation, source save, undo, paste, typing and reopen`);
    await page.close();
  }
}finally{await browser?.close();await server?.close();await rm(root,{recursive:true,force:true});}
async function saved(page,value){
  try{await page.waitForFunction(expected=>richEditor.getMarkdown()===expected,value);}catch(error){console.error(await page.evaluate(()=>({markdown:richEditor.getMarkdown(),status:document.querySelector('#note-save-state')?.textContent,html:document.querySelector('#note-editor')?.innerHTML})));throw error;}
  await page.waitForFunction(()=>document.querySelector('#note-save-state')?.textContent==='Saved');
  // Saved is the publication acknowledgement; canonical text is checked by callers.
}
