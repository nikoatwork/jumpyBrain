import assert from 'node:assert/strict';
import { checkPageActions } from './page-action-smoke-helpers.mjs';
import { appendEditorText, editorMarkdown } from './editor-smoke-helpers.mjs';
import { mkdtemp,mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { initializeMemoryRoot, indexMemory } from '../dist/runtime/index.js';
import { startJumpyBrainHttpServer } from '../dist/server/index.js';
import { startCompanionGateway } from '../integrations/macos-companion/gateway.mjs';
import { loadPlaywrightChromium,launchPlaywrightChromium } from './playwright-runtime.mjs';
const repo=fileURLToPath(new URL('..',import.meta.url)),temp=await mkdtemp(path.join(os.tmpdir(),'jb-boards-ui-')),root=path.join(temp,'memory'),support=path.join(temp,'support');
let gateway,browser,remote;const keys=new Map();
try{
 await initializeMemoryRoot(root);
 const existingId='mem_12345678-1234-1234-1234-123456789012', original='---\nid: '+existingId+'\ntitle: Launch checklist\ntype: note\n---\n\nKeep the release small.\n';
 await writeFile(path.join(root,'notes/checklist.md'),original);await indexMemory(root,{indexing:{mode:'lexical'}});await mkdir(support,{mode:0o700});await mkdir('/tmp/jumpybrain-boards-qa',{recursive:true});
 gateway=await startCompanionGateway({runtimeRoot:repo,directory:support,initialRoot:root,port:0,controlKey:'b'.repeat(64),credentials:{get:async ref=>keys.get(ref),set:async(ref,value)=>keys.set(ref,value),delete:async ref=>keys.delete(ref)}});
 browser=await launchPlaywrightChromium({chromium:await loadPlaywrightChromium()});
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(gateway.url+'/#companion='+'b'.repeat(64));await page.locator('#new-board').waitFor({state:'visible'});
 await page.locator('#new-board').click();await page.locator('#board-title').filter({hasText:'Untitled board'}).waitFor();
 assert.equal(await page.locator('.board-rename-input').count(),0,'creation does not require a rename');
 await page.getByRole('button',{name:'Rename board',exact:true}).click();await page.getByRole('textbox',{name:'Board name',exact:true}).fill('A quieter launch');await page.getByRole('textbox',{name:'Board name',exact:true}).press('Enter');
 await page.locator('#board-title').filter({hasText:'A quieter launch'}).waitFor();
 const composer=page.getByRole('combobox',{name:'Search or create note',exact:true});
 await page.getByRole('button',{name:'Add note to To do',exact:true}).click();await composer.fill('Write the first chapter');
 await page.getByRole('option',{name:'Create “Write the first chapter”',exact:true}).click();
 await page.locator('.board-card').filter({hasText:'Write the first chapter'}).waitFor();
 assert.equal(await composer.inputValue(),'','successful creation leaves an empty composer');
 assert.equal(await composer.evaluate(el=>el===document.activeElement),true);
 // Rename inputs and composer nodes survive background loads without claiming outside focus.
 await page.getByRole('button',{name:'Rename board',exact:true}).click();
 const boardName=page.getByRole('textbox',{name:'Board name',exact:true});await boardName.fill('Cancelled name');
 await page.evaluate(()=>boardsUI.refresh());assert.equal(await boardName.inputValue(),'Cancelled name');await boardName.press('Escape');
 assert.equal(await page.locator('#board-title').innerText(),'A quieter launch');
 await page.getByRole('button',{name:'Rename board',exact:true}).click();await boardName.fill('   ');await boardName.press('Enter');
 assert.equal(await page.locator('#board-title').innerText(),'A quieter launch');
 await page.locator('.board-column').first().getByRole('button',{name:'Rename column',exact:true}).click();
 const columnName=page.getByRole('textbox',{name:'Column name',exact:true});await columnName.fill('Ideas');await composer.click();
 await page.getByRole('button',{name:'Add note to Ideas',exact:true}).waitFor();
 await page.locator('.board-column').first().getByRole('button',{name:'Rename column',exact:true}).click();await columnName.fill('Discard');await columnName.press('Escape');
 await page.getByRole('button',{name:'Add note to Ideas',exact:true}).waitFor();
 await page.locator('.board-column').first().getByRole('button',{name:'Rename column',exact:true}).click();await columnName.fill('To do');await columnName.press('Enter');
 await page.getByRole('button',{name:'Add note to To do',exact:true}).waitFor();
 await composer.fill('unfinished query');await composer.evaluate(el=>{window.boardComposerNode=el;el.setSelectionRange(3,7);});
 await page.evaluate(()=>boardsUI.refresh());
 assert.equal(await composer.evaluate(el=>el===window.boardComposerNode&&el===document.activeElement&&el.selectionStart===3&&el.selectionEnd===7),true);
 await page.getByRole('button',{name:'Rename board',exact:true}).focus();await page.evaluate(()=>boardsUI.refresh());
 assert.equal(await composer.evaluate(el=>el===document.activeElement),false,'refresh does not steal focus');
 await composer.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),'Add note to To do');
 await page.getByRole('button',{name:'Add note to To do',exact:true}).click();
 // Pending search never turns bare Enter into note creation; stale replies cannot win.
 let releaseSearch,searchStarted;const searchGate=new Promise(r=>releaseSearch=r),started=new Promise(r=>searchStarted=r);
 await page.route('**/memories/all/search',async route=>{searchStarted();await searchGate;try{await route.continue();}catch{}});
 await composer.fill('Launch checklist');await started;await composer.press('Enter');
 assert.equal(await page.locator('.board-card').count(),1);assert.equal(await page.getByRole('option',{name:'Create “Launch checklist”',exact:true}).isDisabled(),true);
 await composer.fill('different query');releaseSearch();await page.unroute('**/memories/all/search');
 await composer.fill('Launch checklist');await page.getByRole('option',{name:'Launch checklist',exact:true}).waitFor();
 await composer.press('ArrowDown');assert.equal(await page.getByRole('option',{name:'Create “Launch checklist”',exact:true}).getAttribute('aria-selected'),'true');
 await composer.press('ArrowUp');assert.equal(await page.getByRole('option',{name:'Launch checklist',exact:true}).getAttribute('aria-selected'),'true');
 await composer.fill('');
 await page.locator('.board-card select').selectOption('1');await page.locator('.board-column').nth(1).locator('.board-card').waitFor();
 await composer.fill('Launch checklist');await page.getByRole('option',{name:'Launch checklist',exact:true}).waitFor();
 await composer.press('Enter');await page.locator('.board-card').filter({hasText:'Launch checklist'}).waitFor();
 await page.locator('.board-card').filter({hasText:'Launch checklist'}).dragTo(page.locator('.board-column').nth(2));await page.locator('.board-column').nth(2).locator('.board-card').waitFor();
 await composer.fill('Launch checklist');await page.getByRole('option',{name:'Launch checklist · Added',exact:true}).waitFor();
 assert.equal(await page.getByRole('option',{name:'Launch checklist · Added',exact:true}).isDisabled(),true);
 for(const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light'],[390,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({animations:'disabled',path:`/tmp/jumpybrain-boards-qa/${width}-${theme}.png`,fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 const boardTargets = await page.locator('.board-card-actions button, .board-card-actions select').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
 assert.ok(boardTargets.every(height => height >= 40), 'board controls keep touch-sized targets');
 const boardLink = page.locator('#sidebar-boards .sidebar-page-link').first();
 await boardLink.hover();
 assert.deepEqual(await boardLink.evaluate(el => { const s=getComputedStyle(el); return [s.whiteSpace,s.backgroundColor]; }), ['nowrap','rgba(0, 0, 0, 0)'], 'board labels stay single-line and share the row hover surface');
 await page.setViewportSize({width:1280,height:900});
 const cardId=await page.locator('.board-column').nth(1).locator('.board-card').getAttribute('data-board-page');
 await page.locator('.board-column').nth(1).locator('.board-card > button').click();await page.locator('#note-editor').waitFor({state:'visible'});
 await page.locator('#navigate-back').click();await page.locator('#board-title').filter({hasText:'A quieter launch'}).waitFor();await page.locator('.board-card').first().waitFor();
 await page.getByRole('button',{name:'Settle A quieter launch',exact:true}).first().click();await page.locator('#sidebar-boards li').waitFor({state:'hidden'});
 await page.locator('#open-connection').click();await page.locator('[data-settings-section="boards"]').click();await page.getByRole('button',{name:'Restore A quieter launch',exact:true}).click();await page.locator('#settings-boards-list').getByRole('button',{name:'A quieter launch',exact:true}).click();await page.locator('.board-card').first().waitFor();assert.equal(await page.locator('.board-column').nth(1).locator('.board-card').getAttribute('data-board-page'),cardId);
 await page.reload();await page.locator('.board-card').first().waitFor();
 const saved=JSON.parse(await readFile(path.join(support,'collections.json'),'utf8'));assert.equal(Object.values(saved.scopes)[0].boards[0].columns[1].pages[0],cardId);
 // A second board receives an existing note through the note action card.
 await page.locator('#new-board').click();await page.locator('#board-title').filter({hasText:'Untitled board'}).waitFor();
 await page.getByRole('button',{name:'Rename board',exact:true}).click();await page.getByRole('textbox',{name:'Board name',exact:true}).fill('Next chapter');await page.getByRole('textbox',{name:'Board name',exact:true}).press('Enter');
 await page.locator('#board-title').filter({hasText:'Next chapter'}).waitFor();
 await page.locator('[data-page-link="'+existingId+'"]').click();await page.locator('#note-editor').waitFor({state:'visible'});
 const noteUrl=page.url();
 for (const width of [1820, 1280, 1180, 900, 390, 320]) for (const theme of ['light', 'dark']) {
  await page.setViewportSize({width,height:900});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.palette='ocean';document.getElementById('note-panel').scrollTop=0;},theme);
  await checkPageActions(page,{companion:true});
  await page.locator('#toggle-page-details').hover();
  await page.screenshot({animations:'disabled',path:`/tmp/jumpybrain-boards-qa/page-actions-${width}-${theme}.png`});
 }
 await page.setViewportSize({width:1820,height:900});
 await page.locator('#toggle-sidebar').click();
 await checkPageActions(page,{companion:true});
 await page.locator('#toggle-page-details').hover();
 await page.screenshot({animations:'disabled',path:'/tmp/jumpybrain-boards-qa/page-actions-collapsed-dark.png'});
 await page.locator('#toggle-sidebar').click();
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-select').locator('option').filter({hasText:'Next chapter'}).waitFor({state:'attached'});
 await page.waitForFunction(()=>!document.getElementById('note-board-add').disabled);
 assert.equal(await page.locator('#note-board-select option').filter({hasText:'A quieter launch'}).evaluate(o=>o.disabled),true);
 await page.locator('#note-board-column').selectOption('2');
 for(const [width,theme] of [[1280,'light'],[390,'dark']]){await page.setViewportSize({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.screenshot({animations:'disabled',path:'/tmp/jumpybrain-boards-qa/add-to-board-'+width+'.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:1280,height:900});
 // A rejected save must leave the chooser open; retry adds exactly once.
 let rejected=false;
 await page.route('**/companion/collections',async route=>{if(route.request().method()==='POST'&&!rejected){rejected=true;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture conflict'}})});}else await route.continue();});
 await page.locator('#note-board-add').click();await page.locator('#note-board-message').filter({hasText:'Not added'}).waitFor();assert.equal(await page.locator('#note-board-dialog').isVisible(),true);
 await page.locator('#note-board-column').selectOption('2');await page.locator('#note-board-add').click();await page.locator('#note-board-dialog').waitFor({state:'hidden'});await page.unroute('**/companion/collections');
 assert.equal(page.url(),noteUrl);
 assert.equal(await page.evaluate(()=>document.activeElement.id),'note-add-to-board');
 const after=JSON.parse(await readFile(path.join(support,'collections.json'),'utf8'));const second=Object.values(after.scopes)[0].boards.find(b=>b.name==='Next chapter');assert.deepEqual(second.columns.map(c=>c.pages),[[],[],[existingId]]);
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-message').filter({hasText:'already on your boards'}).waitFor();assert.equal(await page.locator('#note-board-add').isDisabled(),true);await page.locator('#note-board-cancel').click();
 await page.locator('#sidebar-boards').getByRole('button',{name:'Settle A quieter launch',exact:true}).click();await page.locator('#sidebar-boards').getByRole('button',{name:'A quieter launch',exact:true}).waitFor({state:'hidden'});
 await page.locator('#note-add-to-board').click();await page.locator('#note-board-message').filter({hasText:'already on your boards'}).waitFor();assert.equal(await page.locator('#note-board-select option').count(),1);await page.locator('#note-board-cancel').click();
 await page.screenshot({animations:'disabled',path:'/tmp/jumpybrain-boards-qa/note-action-card.png',fullPage:true});
 assert.equal(await readFile(path.join(root,'notes/checklist.md'),'utf8'),original);
 // Adding membership does not flush or discard an unsaved note draft.
 await page.locator('[data-page-link="'+cardId+'"]').press('Enter');await page.locator('#note-editor').waitFor({state:'visible'});
 await page.route('**/memories/all/documents/**',async route=>{if(route.request().method()==='PUT')await route.abort();else await route.continue();});
 await appendEditorText(page,'Keep this unsaved thought.');const draft=await editorMarkdown(page);
 await page.locator('#note-add-to-board').click();await page.waitForFunction(()=>!document.getElementById('note-board-add').disabled);await page.locator('#note-board-add').click();await page.locator('#note-board-dialog').waitFor({state:'hidden'});
 assert.equal(await editorMarkdown(page),draft);assert.equal(await page.evaluate(()=>state.editor.hasPending()),true);
 await page.unroute('**/memories/all/documents/**');await page.waitForFunction(()=>!state.editor.state.saveInFlight);assert.equal(await page.evaluate(()=>state.editor.retry()),true);
 await page.waitForFunction(()=>!document.getElementById('new-board').disabled);
 // Default suffixes and repeated activation are independent of optional naming.
 const beforeBoards=await page.locator('#sidebar-boards li').count();
 await page.evaluate(()=>{document.getElementById('new-board').click();document.getElementById('new-board').click();});
 await page.locator('#board-title').filter({hasText:'Untitled board'}).waitFor();
 assert.equal(await page.locator('#sidebar-boards li').count(),beforeBoards+1);
 await page.locator('#new-board').click();await page.getByRole('heading',{name:'Untitled board 2',exact:true}).waitFor();
 await page.getByRole('button',{name:'Rename board',exact:true}).click();await boardName.fill('Renamed default');await boardName.press('Enter');
 await page.getByRole('heading',{name:'Renamed default',exact:true}).waitFor();
 // A committed board whose response is lost is confirmed by the recovery read.
 let boardLost=false;
 await page.route('**/companion/collections',async route=>{if(route.request().method()==='POST'&&!boardLost){boardLost=true;await route.fetch();await route.abort();}else await route.continue();});
 await page.locator('#new-board').click();await page.getByRole('heading',{name:'Untitled board 2',exact:true}).waitFor();await page.unroute('**/companion/collections');
 await page.getByRole('button',{name:'Add note to To do',exact:true}).click();
 // Frozen request/body/key survive an accepted creation with a lost response.
 const attempts=[];let loseCreation=true;
 await page.route('**/memories/all/notes',async route=>{
   attempts.push({body:route.request().postData(),key:route.request().headers()['idempotency-key']});
   if(loseCreation){loseCreation=false;await route.fetch();await route.abort();}else await route.continue();
 });
 await composer.fill('One durable retry note');await page.getByRole('option',{name:'Create “One durable retry note”',exact:true}).click();
 await page.locator('.board-composer-status').filter({hasText:'Could not confirm creation'}).waitFor();
 assert.equal(await composer.getAttribute('readonly'),'');assert.equal(await composer.inputValue(),'One durable retry note');
 await page.getByRole('option',{name:'Retry creation',exact:true}).click();
 await page.locator('.board-card').filter({hasText:'One durable retry note'}).waitFor();
 assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
 // Canonical creation followed by a membership conflict retries only membership.
 let membershipConflict=true;
 await page.route('**/companion/collections',async route=>{if(route.request().method()==='POST'&&membershipConflict){membershipConflict=false;await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture conflict'}})});}else await route.continue();});
 await composer.fill('Created before membership conflict');await page.getByRole('option',{name:'Create “Created before membership conflict”',exact:true}).click();
 await page.locator('.board-composer-status').filter({hasText:'Note created, but not added'}).waitFor();
 const creationCount=attempts.length;await page.getByRole('option',{name:'Retry adding created note',exact:true}).click();
 await page.locator('.board-card').filter({hasText:'Created before membership conflict'}).waitFor();assert.equal(attempts.length,creationCount);
 await page.unroute('**/companion/collections');await page.unroute('**/memories/all/notes');
 // Search errors preserve text and offer an explicit retry.
 let failSearch=true;
 await page.route('**/memories/all/search',async route=>{if(failSearch){failSearch=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Fixture unavailable'}})});}else await route.continue();});
 await composer.fill('Launch checklist');await page.getByRole('option',{name:'Retry search',exact:true}).waitFor();assert.equal(await composer.inputValue(),'Launch checklist');
 await page.getByRole('option',{name:'Retry search',exact:true}).click();await page.getByRole('option',{name:'Launch checklist',exact:true}).waitFor();await page.unroute('**/memories/all/search');
 // A real scope switch cancels search; read-only targets allow organization only.
 const localId=gateway.state().activeId;
 remote=await startJumpyBrainHttpServer({root,apiKeys:['board-fixture-key'],port:0,autoIndex:false});
 await gateway.store.save({kind:'remote',name:'Read-only board brain',url:remote.url,allowWrites:false,key:'board-fixture-key'},gateway.store.snapshot().revision);
 const remoteId=gateway.store.snapshot().profiles.find(p=>p.kind==='remote').id;
 let releaseScopeSearch,scopeSearchStarted;const scopeGate=new Promise(r=>releaseScopeSearch=r),scopeStarted=new Promise(r=>scopeSearchStarted=r);
 await page.route('**/memories/all/search',async route=>{scopeSearchStarted();await scopeGate;try{await route.continue();}catch{}});
 await composer.fill('Scope pending');await scopeStarted;
 const switchBrain=async id=>{const response=await fetch(gateway.url+'/companion/switch',{method:'POST',headers:{Authorization:'Bearer '+'b'.repeat(64),'Content-Type':'application/json'},body:JSON.stringify({id})});assert.equal(response.status,200);};
 await switchBrain(remoteId);releaseScopeSearch();await page.unroute('**/memories/all/search');
 await page.waitForFunction(id=>typeof companionState!=='undefined'&&companionState?.activeId===id&&companionRegistered&&!companionFrozen,remoteId);
 assert.equal(await page.locator('.board-composer').count(),0);assert.equal(await page.locator('#sidebar-boards li').count(),0);
 await page.locator('#new-board').click();await page.getByRole('heading',{name:'Untitled board',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add note to To do',exact:true}).click();await composer.fill('Launch checklist');
 await page.getByRole('option',{name:'Launch checklist',exact:true}).waitFor();assert.equal(await page.getByRole('option',{name:'Create “Launch checklist”',exact:true}).isDisabled(),true);
 await composer.press('Enter');await page.locator('.board-card').filter({hasText:'Launch checklist'}).waitFor();
 await switchBrain(localId);await page.waitForFunction(id=>typeof companionState!=='undefined'&&companionState?.activeId===id&&companionRegistered&&!companionFrozen,localId);
 assert.equal(await page.locator('.board-composer').count(),0);
 assert.deepEqual(errors,[]);console.log('Boards smoke PASS: note action/column/conflict retry/duplicates/archive filtering, create page, move, editor/back, settle, settings restore, reload, 1280/390 light/dark');
}finally{await browser?.close();await gateway?.close();await remote?.close();await rm(temp,{recursive:true,force:true});}
