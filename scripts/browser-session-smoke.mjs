// Real hosted shell identity transitions and recoverable drafts, disposable data.
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {initializeMemoryRoot} from '../dist/runtime/index.js';
import {AccessStore} from '../dist/adapters/access-control/index.js';
import {startJumpyBrainHttpServer} from '../dist/server/index.js';
import {loadPlaywrightChromium,launchPlaywrightChromium} from './playwright-runtime.mjs';
import {appendEditorText} from './editor-smoke-helpers.mjs';
import {installCollaborationSmokeTransport} from './collaboration-smoke-transport.mjs';
const root=await mkdtemp(path.join(os.tmpdir(),'jb-browser-identity-'));
const id='mem_46666666-6666-4666-8666-666666666666';
let server,browser;
const access=new AccessStore(root),errors=[];
try {
  await initializeMemoryRoot(root);
  const file=path.join(root,'notes/identity.md');
  await writeFile(file,`---\nid: ${id}\ntitle: Identity fixture\ntype: note\n---\nConfirmed source\n`);
  const writer=await access.issue({name:'Human writer',role:'writer'}),reader=await access.issue({name:'Human reader',role:'reader'});
  server=await startJumpyBrainHttpServer({root,apiKeys:['disposable-operator'],port:0,autoIndex:false});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const context=await browser.newContext();const pages=[await context.newPage(),await context.newPage()];
  const controls=[];
  for(const page of pages) {
    page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
    controls.push(await installCollaborationSmokeTransport(page));
    await page.goto(`${server.url}/?note=${id}#apiKey=${writer.token}`);
    await page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
  }
  async function changeKey(page,key) {
    await page.locator('#open-connection').click();await page.locator('#api-key').fill(key);
    await page.locator('#connection-submit').click();
  }
  // A shared cookie change must retire each old writer socket, not just HTTP auth.
  await changeKey(pages[0],reader.token);
  await Promise.all(pages.map(page=>page.waitForFunction(()=>state.editor?.collaboration?.state.status==='readonly')));
  for(const page of pages) assert.equal(await page.locator('#note-editor').getAttribute('contenteditable'),'false');
  const denied=await pages[0].evaluate(async()=>{
    const response=await fetch('/memories/all/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'note',body:'must not publish'})});return response.status;
  });assert.equal(denied,403);
  await changeKey(pages[0],writer.token);
  await Promise.all(pages.map(page=>page.waitForFunction(()=>state.editor?.collaboration?.state.status==='saved')));
  // An unsent draft in another tab is retained and fenced during identity change.
  const held=controls[1].holdNextRequest('edit');
  await appendEditorText(pages[1],'Private unsent draft');await held.arrived;
  await changeKey(pages[0],reader.token);
  await pages[0].waitForFunction(()=>state.editor?.collaboration?.state.status==='readonly');
  await pages[1].waitForFunction(()=>state.editor?.state.liveStatus==='blocked');
  assert.match(await pages[1].locator('#note-editor').innerText(),/Private unsent draft/);
  assert.doesNotMatch(await readFile(file,'utf8'),/Private unsent draft/);
  held.release();
  await pages[1].locator('#note-recover').click();await pages[1].locator('#recovery-reload').click();
  await pages[1].waitForFunction(()=>state.editor?.collaboration?.state.status==='readonly');
  assert.doesNotMatch(await readFile(file,'utf8'),/Private unsent draft/,'retiring the old socket cannot dispatch a held write');
  // Return to the original identity and explicitly recover its older private draft.
  await changeKey(pages[0],writer.token);
  await pages[1].waitForFunction(()=>state.editor?.collaboration?.state.status==='conflict');
  pages[1].once('dialog',dialog=>dialog.accept());
  await pages[1].reload();
  await pages[1].waitForFunction(()=>state.editor?.collaboration?.state.status==='saved'&&state.editor.collaboration.state.recoveryDrafts.length>0);
  await pages[1].locator('#note-recover').click();
  if(!await pages[1].locator('#recovery-options').evaluate(element=>element.open))await pages[1].locator('#recovery-options > summary').click();
  await pages[1].locator('#recovery-versions').selectOption('0');
  assert.match(await pages[1].locator('#recovery-draft').inputValue(),/Private unsent draft/);
  await pages[1].locator('#recovery-publish').click();
  await pages[1].waitForFunction(()=>state.editor?.collaboration?.state.status==='saved'&&richEditor.getMarkdown().includes('Private unsent draft'));
  assert.match(await readFile(file,'utf8'),/Private unsent draft/);
  await pages[1].reload();
  await pages[1].waitForFunction(()=>state.editor?.collaboration?.state.status==='saved');
  const exposed=await pages[1].evaluate(()=>JSON.stringify({cookie:document.cookie,local:{...localStorage},session:{...sessionStorage},values:[...document.querySelectorAll('input')].map(input=>input.value),url:location.href}));
  assert.ok(!exposed.includes(writer.token)&&!exposed.includes(reader.token),'keys stay outside DOM, URL and JavaScript storage');
  assert.deepEqual(errors,[]);
  console.log('Hosted browser session smoke: PASS (reload, writer/reader socket replacement, cross-tab identity fences, retained private draft, explicit reviewed recovery, no JS-storage credentials).');
} finally {
  await browser?.close();await server?.close();access.close();await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:50});
}
