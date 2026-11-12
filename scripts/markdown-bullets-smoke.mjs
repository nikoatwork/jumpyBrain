// Real CLI -> production shell -> live source publication, on fictional disposable data.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {editorMarkdown,selectEditorText,editorSelection,undoEditor,replaceEditorText} from './editor-smoke-helpers.mjs';

const root=await mkdtemp(path.join(os.tmpdir(),'jumpybrain-markdown-bullets-'));
const key='fictional-bullet-key',config=path.join(root,'device.json');
const body=[
  'Fictional project summary','', 'Source: fictional workshop; event date uncertain.','',
  '- **Decision** Keep this scoped to the sample.',
  '- **Evidence** Read [Decision](../decisions/example_note.md) and [**Reference**](https://example.invalid/a_(b) "Details").',
  '+ _Another_ ordinary item.', '* Unicode café 日本語 🐐 and `code`.',
  '- [External](https://example.invalid/standalone)', '',
  '  - nested **literal**', '1. ordered **literal**', '- [y] ambiguous **literal**',
  '- **Unsafe** [x](javascript:alert(1))', '- **Image** ![x](https://example.invalid/never-fetch.png)',
  '- **HTML** <img src=x onerror=alert(1)>', '- - -', '- **Unclosed', '',
  '- [ ] Existing **task**', '```md','- **Code stays literal**','```','',
].join('\n');
let server,browser;
async function cli(args,input='') {
  const child=spawn(process.execPath,[path.resolve('dist/cli.js'),...args,'--target-url',server.url,'--json'],{env:{...process.env,JUMPYBRAIN_API_KEY:key,JUMPYBRAIN_CLI_CONFIG:config},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.stdin.end(input);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
  assert.equal(code,0,stderr);return JSON.parse(stdout);
}
const withoutFrontmatter=source=>source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
async function saved(page) { await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved'); }
async function insertAt(page,needle,insert) {
  const visible=await page.locator('#note-editor').textContent(),offset=visible.indexOf(needle);
  assert.ok(offset>=0,needle);await selectEditorText(page,offset+needle.length);await page.keyboard.insertText(insert);await saved(page);
}
try {
  await initializeMemoryRoot(root);await writeFile(config,JSON.stringify({schemaVersion:1,remoteTargets:[]}));
  server=await startJumpyBrainHttpServer({root,apiKeys:[key],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  for(const width of [1280,390]) {
    const created=await cli(['remember','--title',`Fictional bullet fixture ${width}`],body);
    assert.equal(created.saved,true);const id=created.id,file=path.join(root,created.file);
    // Exercise CLI whole-document update with CRLF before opening; no fixture file edits.
    let packet=await cli(['show','--id',id]);
    await cli(['update','--id',id,'--if-match',packet.contentHash],packet.content.replace(/\r?\n/g,'\r\n'));
    const original=await readFile(file,'utf8'),initial=withoutFrontmatter(original);
    const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===390});page.setDefaultTimeout(15000);
    const errors=[],external=[],puts=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(!request.url().startsWith(server.url))external.push(request.url());if(request.method()==='PUT')puts.push(request.url());});
    await page.goto(`${server.url}/?note=${id}#apiKey=${key}`);await saved(page);
    assert.equal(await page.locator('#note-editor .markdown-bullet').count(),5);
    assert.equal(await page.locator('#note-editor .markdown-bullet .editor-bold').count(),3);
    assert.equal(await page.locator('#note-editor a[href]').count(),2);
    assert.equal(await page.locator('#note-editor .markdown-task').count(),1);
    assert.equal(await page.locator('#note-editor img, #note-editor script').count(),0);
    for(const line of body.split('\n').filter(line=>/nested|ordered|ambiguous|Unsafe|Image|HTML|Unclosed|^- - -$/.test(line))) {
      assert.ok((await page.locator('#note-editor .markdown-literal').allTextContents()).includes(line),line);
    }
    assert.deepEqual(await page.locator('#note-editor a[href]').evaluateAll(links=>links.map(link=>({protocol:new URL(link.href).protocol,rel:link.rel}))),Array(2).fill({protocol:'https:',rel:'noopener noreferrer'}));
    // Relative .md links render as their label (path on hover), not literal source.
    assert.deepEqual(await page.locator('#note-editor [data-note-link="true"]').evaluateAll(links=>links.map(link=>[link.textContent,link.title,link.hasAttribute('href')])),[['Decision','../decisions/example_note.md',false]]);
    assert.ok(!(await page.locator('#note-editor').textContent()).includes('](../decisions/example_note.md)'));
    assert.equal(await editorMarkdown(page),initial);
    assert.equal(await readFile(file,'utf8'),original,'hydration must not write canonical bytes');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    // Editable label source positions must stay outside delimiters/URLs and other rows.
    await insertAt(page,'Decis','X');
    let expected=initial.replace('**Decision**','**DecisXion**');
    assert.equal(await editorMarkdown(page),expected);assert.equal(withoutFrontmatter(await readFile(file,'utf8')),expected);
    await undoEditor(page);await saved(page);assert.equal(await editorMarkdown(page),initial);
    await insertAt(page,'Refer','X');expected=initial.replace('**Reference**','**ReferXence**');
    assert.equal(await editorMarkdown(page),expected);assert.equal(withoutFrontmatter(await readFile(file,'utf8')),expected);
    await undoEditor(page);await saved(page);assert.equal(await editorMarkdown(page),initial);
    await insertAt(page,'Read Deci','X');expected=initial.replace('[Decision](../','[DeciXsion](../');
    assert.equal(await editorMarkdown(page),expected);assert.equal(withoutFrontmatter(await readFile(file,'utf8')),expected);
    await undoEditor(page);await saved(page);assert.equal(await editorMarkdown(page),initial);
    // Keep a live caret inside bold while a real CLI update hydrates an earlier paragraph.
    const visible=await page.locator('#note-editor').textContent(),caret=visible.indexOf('Decision')+4;
    await selectEditorText(page,caret);const beforeCaret=await editorSelection(page);
    packet=await cli(['show','--id',id]);const remote=packet.content.replace('Fictional project summary','Updated fictional summary');
    await cli(['update','--id',id,'--if-match',packet.contentHash],remote);
    await page.waitForFunction(()=>richEditor.getMarkdown().includes('Updated fictional summary'));await saved(page);
    const shift='Updated fictional summary'.length-'Fictional project summary'.length;
    assert.deepEqual(await editorSelection(page),beforeCaret.map(x=>x+shift));
    await page.keyboard.insertText('R');await saved(page);
    expected=initial.replace('Fictional project summary','Updated fictional summary').replace('**Decision**','**DeciRsion**');
    assert.equal(await editorMarkdown(page),expected);assert.equal(withoutFrontmatter(await readFile(file,'utf8')),expected);
    await page.reload();await saved(page);assert.equal(await editorMarkdown(page),expected);
    // Plain-text Markdown paste shares the importer; history restores exact source.
    await replaceEditorText(page,'- **Pasted** [Relative](./notes/sample.md) and [Safe](https://example.invalid)');await saved(page);
    assert.equal(await page.locator('#note-editor .markdown-bullet').count(),1);
    assert.equal(await page.locator('#note-editor .editor-bold').count(),1);
    await undoEditor(page);await saved(page);assert.equal(await editorMarkdown(page),expected);
    // Native paragraph commands continue bullets and remove their marker at start.
    await replaceEditorText(page,'- **Entry** item');await saved(page);
    await selectEditorText(page,'Entry item'.length);await page.keyboard.press('Enter');await page.keyboard.insertText('Next');await saved(page);
    assert.equal((await editorMarkdown(page)).replace(/\r\n/g,'\n'),'- **Entry** item\n- Next');
    await page.locator('#note-editor .markdown-bullet').nth(1).evaluate(row=>{
      const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT),text=walker.nextNode(),range=document.createRange();
      range.setStart(text,0);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    });
    await page.waitForFunction(()=>richEditor.captureSelection()?.anchor.offset===0);
    await page.keyboard.press('Backspace');await saved(page);
    assert.equal((await editorMarkdown(page)).replace(/\r\n/g,'\n'),'- **Entry** item\nNext');
    await undoEditor(page);await saved(page);
    assert.equal((await editorMarkdown(page)).replace(/\r\n/g,'\n'),'- **Entry** item\n- Next');
    await selectEditorText(page,'Entry itemNext'.length);await page.keyboard.press('Enter');await saved(page);
    await page.keyboard.press('Enter');await saved(page);
    assert.equal((await editorMarkdown(page)).replace(/\r\n/g,'\n'),'- **Entry** item\n- Next\n');
    assert.equal(await page.locator('#note-editor .markdown-bullet').count(),2,'empty Enter exits the new bullet');
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(puts,[]);
    await page.close();console.log(`PASS ${width}px CLI creation/update, bullets, inline/security fallback, exact CRLF edits/undo/reopen, live caret hydration and paste`);
  }
} finally {await browser?.close();await server?.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:30});}
