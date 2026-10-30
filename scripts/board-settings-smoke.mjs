// Real disposable gateway/store; never touches an installed app or personal brain.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot, listBoards } from '../dist/runtime/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium, launchPlaywrightChromium } from './playwright-runtime.mjs';

const repo=fileURLToPath(new URL('..',import.meta.url));
const temp=await mkdtemp(path.join(os.tmpdir(),'jb-board-settings-'));
const root=path.join(temp,'memory'),support=path.join(temp,'support');
const captures='/tmp/jumpybrain-board-settings-qa';
let gateway,browser;
try {
  await initializeMemoryRoot(root);await mkdir(support,{mode:0o700});await mkdir(captures,{recursive:true});
  const noteId='mem_12345678-1234-1234-1234-123456789012';
  const original='---\nid: '+noteId+'\ntitle: Keep this note\ntype: note\n---\n\n# Keep this note\n\nCanonical content survives board deletion.\n';
  const file=path.join(root,'notes/keep.md');await writeFile(file,original);
  gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey:'b'.repeat(64),credentials:{get:async()=>null,set:async()=>{},delete:async()=>{}}});
  browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(gateway.url+'/#companion='+'b'.repeat(64));await page.locator('#new-board').waitFor({state:'visible'});
  await page.locator('#new-board').click();await page.locator('.board-column').first().waitFor();
  const initialName=await page.locator('#board-title').innerText();assert.ok(initialName&&!initialName.includes('Untitled'));
  const boardUrl=page.url(), boardId=new URL(boardUrl).searchParams.get('board');
  // Seed memberships and another board through the authenticated canonical board store.
  await page.evaluate(async noteId=>{
    const p=await graphJson('/memories/all/boards');
    p.boards[0].columns[1].pages.push(noteId);
    const other={schemaVersion:1,id:crypto.randomUUID(),name:'A long board title that should truncate without pushing its actions out of the settings panel',archived:false,columns:['To do','Doing','Done'].map(name=>({name,pages:[]}))};
    await graphJson('/memories/all/boards/'+p.boards[0].id,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':p.hashes[p.boards[0].id]},body:JSON.stringify(p.boards[0])});
    await graphJson('/memories/all/boards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(other)});
    await boardsUI.refresh();
  },noteId);
  await page.getByRole('button',{name:'Settle '+initialName,exact:true}).click();
  await page.locator('#board-notice').getByRole('button',{name:'Settings → Boards'}).click();
  await page.locator('#settings-section-title').filter({hasText:'Boards'}).waitFor();
  const list=page.locator('#settings-boards-list');
  const row=list.locator('[data-board-id="'+boardId+'"]');
  const input=list.getByRole('textbox',{name:'Board name',exact:true});
  assert.equal(await list.locator('.board-settings-row').count(),2);
  assert.equal(await row.getByRole('button',{name:'Restore '+initialName,exact:true}).getAttribute('aria-pressed'),'true');
  // Rename a settled board without restoring it. Refresh keeps text, caret and focus.
  await row.getByRole('button',{name:'Rename '+initialName,exact:true}).click();await input.fill('Parked project');
  await input.evaluate(el=>{window.settingsInput=el;el.setSelectionRange(2,5);});await page.evaluate(()=>boardsUI.refresh());
  assert.equal(await input.evaluate(el=>el===window.settingsInput&&el===document.activeElement&&el.selectionStart===2&&el.selectionEnd===5),true);
  // A hash conflict retains the user's draft and allows an explicit retry.
  let rejected=false;
  await page.route('**/memories/all/boards**',async route=>{
    if(route.request().method()==='PUT'&&!rejected){rejected=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture conflict'}})});}else await route.continue();
  });
  await input.press('Enter');await page.waitForFunction(()=>!boardsUI.pending());
  assert.equal(await input.inputValue(),'Parked project');assert.equal(await input.isEditable(),true);
  await page.unroute('**/memories/all/boards**');await input.press('Enter');
  await row.getByRole('button',{name:'Restore Parked project',exact:true}).waitFor();
  assert.equal(await row.locator('.board-settings-status').innerText(),'Settled');
  await row.getByRole('button',{name:'Rename Parked project',exact:true}).click();await input.fill('Discard this');await input.press('Escape');
  await row.getByRole('button',{name:'Rename Parked project',exact:true}).click();await input.fill('   ');await input.press('Enter');
  assert.equal(await input.evaluate(el=>el.validity.valid),false);await input.press('Escape');
  // Toggle settles/restores in place and preserves every column and note membership.
  await row.getByRole('button',{name:'Restore Parked project',exact:true}).click();
  await row.getByRole('button',{name:'Settle Parked project',exact:true}).waitFor();
  assert.equal(await row.getByRole('button',{name:'Settle Parked project',exact:true}).getAttribute('aria-pressed'),'false');
  await row.getByRole('button',{name:'Rename Parked project',exact:true}).click();await input.fill('Active project');
  await row.getByRole('button',{name:'Save board name',exact:true}).click();await row.getByRole('button',{name:'Settle Active project',exact:true}).waitFor();
  for(const width of [1280,390,320])for(const theme of ['light','dark']){
    await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await page.screenshot({path:captures+'/'+width+'-'+theme+'.png',animations:'disabled',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const geometry=await row.evaluate(el=>{const box=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.left>=box.left&&r.right<=box.right+1&&r.width>=32;});});
    assert.equal(geometry,true,'row buttons remain reachable');
  }
  await page.reload();await list.getByRole('button',{name:'Active project',exact:true}).waitFor();
  const stored=await listBoards(root);
  assert.deepEqual(stored.boards.find(b=>b.id===boardId).columns.map(c=>c.pages),[[],[noteId],[]]);
  // Destructive action is an explicit second step; cancellation leaves organization intact.
  await row.getByRole('button',{name:'Delete Active project',exact:true}).click();
  await row.getByText('Delete “Active project”? Notes are kept.',{exact:true}).waitFor();
  await page.screenshot({path:captures+'/delete-320-dark.png',animations:'disabled',fullPage:true});
  await row.getByRole('button',{name:'Cancel',exact:true}).click();
  await row.getByRole('button',{name:'Delete Active project',exact:true}).click();
  // A failed deletion remains reviewable and retryable.
  let failed=false;await page.route('**/memories/all/boards**',async route=>{
    if(route.request().method()==='DELETE'&&!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture unavailable'}})});}else await route.continue();
  });
  await row.getByRole('button',{name:'Delete board',exact:true}).click();await page.waitForFunction(()=>!boardsUI.pending());
  assert.equal(await list.locator('.board-settings-row').count(),2);await row.getByRole('button',{name:'Delete board',exact:true}).waitFor();
  await page.unroute('**/memories/all/boards**');await row.getByRole('button',{name:'Delete board',exact:true}).click();
  await list.getByRole('button',{name:'Active project',exact:true}).waitFor({state:'detached'});
  await page.waitForFunction(()=>!boardsUI.pending());assert.equal(await list.locator('.board-settings-row').count(),1);
  assert.equal(await readFile(file,'utf8'),original,'board deletion never changes canonical notes');
  await page.goto(boardUrl);await page.locator('#board-notice').filter({hasText:'Board unavailable'}).waitFor();
  await page.locator('#board-notice').getByRole('button',{name:'Settings → Boards'}).click();
  // Delete a settled board too, then verify empty state after reload.
  await list.locator('[aria-pressed]').click();await list.locator('[aria-pressed="true"]').waitFor();
  await list.getByRole('button',{name:/^Delete A long/}).click();await list.getByRole('button',{name:'Delete board',exact:true}).click();
  await list.getByText('Your boards will live here.',{exact:true}).waitFor();
  await page.reload();await list.getByText('Your boards will live here.',{exact:true}).waitFor();
  assert.equal(await page.locator('#settings-new-board').isEnabled(),true);assert.equal(await readFile(file,'utf8'),original);
  assert.deepEqual(errors,[]);
  console.log('PASS board settings: settled recovery, rename/cancel/validation, conflict retention, toggle, confirmed deletion, note preservation, reload and responsive geometry. Captures: '+captures);
}finally{await browser?.close();await gateway?.close();await rm(temp,{recursive:true,force:true});}
